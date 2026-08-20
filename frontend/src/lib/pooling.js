import { supabase } from "./supabase";
import { RIDE_TYPE_MAP } from "./vehicles";

/**
 * Shared rides — capacity, matching and the headcount that decides the fare.
 *
 * Every gate here is enforced in the database (migration 0007); these helpers
 * exist so the UI can *show* the same numbers before the server rules on them.
 * Nothing in this file is authoritative — `accept_pooled_ride` recomputes the
 * seats, the corridor and the detour under a row lock, because the read that
 * produced an offer is stale the moment another driver acts on it.
 */

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  return error ? { data: null, error } : { data, error: null };
};

/** Pending requests that fit the route the driver is already on. */
export const poolableRides = (limit = 5) => rpc("poolable_rides", { p_limit: limit });

/**
 * Reserve the seat *and* the request while the driver decides.
 *
 * Without this an offer was only ever a snapshot: correct — the row lock meant
 * the vehicle could never be oversold — but a driver could tap a card and be
 * told no. A hold re-runs every check the accept will run, then locks the
 * request against other dispatchers for `seconds`.
 *
 * Resolves to `null` when the request was already taken or held by someone
 * else, which is the normal way to lose a race, not an error.
 */
export const holdPoolSeat = async (rideId) => {
  const { data, error } = await rpc("hold_pool_seat", { p_ride_id: rideId });
  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    data: row ? { holdId: row.hold_id, expiresAt: row.expires_at, seconds: row.seconds } : null,
    error: null,
  };
};

/** Give a held seat back — the driver dismissed the offer or navigated away. */
export const releaseSeatHold = (rideId) => rpc("release_seat_hold", { p_ride_id: rideId });

/** Take another booking onto the current trip. Null means it was taken first. */
export const acceptPooledRide = (rideId) => rpc("accept_pooled_ride", { p_ride_id: rideId });

/** The driver's trip: seat state plus the stop list in the order to drive it. */
export const driverTripState = () => rpc("driver_trip_state", {});

/** What a rider may know about a trip they are sharing. */
export const ridePoolContext = (rideId) => rpc("ride_pool_context", { p_ride_id: rideId });

/** Rider adds a passenger mid-trip; the charge is applied on confirmation. */
export const confirmExtraOccupant = (rideId, seats) =>
  rpc("confirm_extra_occupant", { p_ride_id: rideId, p_seats: seats });

// ── sequential chaining ─────────────────────────────────────────────────────

/**
 * Requests the driver could take *next*, offered while they finish the current
 * one. Not the pooling funnel: nothing here overlaps the rider already aboard,
 * so there is no corridor, no detour cap and no consent gate — and a bike,
 * which can never pool, can do this.
 */
export const chainableRides = (limit = 5) => rpc("chainable_rides", { p_limit: limit });

/** Queue the next fare onto the end of the current trip. */
export const acceptChainedRide = (rideId) => rpc("accept_chained_ride", { p_ride_id: rideId });

/** Hold a chained offer, same as a pooled one. */
export const holdChainSeat = async (rideId) => {
  const { data, error } = await rpc("hold_chain_seat", { p_ride_id: rideId });
  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    data: row ? { holdId: row.hold_id, expiresAt: row.expires_at, seconds: row.seconds } : null,
    error: null,
  };
};

// ── mode ────────────────────────────────────────────────────────────────────

/**
 * Switch between riding and driving.
 *
 * A real transition, not navigation: the server refuses when the invariant says
 * no — you cannot go on duty while you are someone's passenger, and you cannot
 * book a ride while you are driving one.
 */
export const setUserMode = (mode, dest = null) =>
  rpc("set_user_mode", {
    p_mode: mode,
    p_dest_lat: dest?.lat ?? null,
    p_dest_lng: dest?.lng ?? null,
  });

export const currentMode = () => rpc("current_mode", {});

/** Modes in which the app should be showing the driving side of the house. */
export const DRIVING_MODES = ["available", "on_trip", "heading_home"];

/** Never match me with this person again. */
export const blockCoPassenger = (userId) => rpc("block_co_passenger", { p_user_id: userId });

/** Seat capacities and pooling rules, straight from the database. */
export const vehicleSeatCapacities = () => rpc("vehicle_seat_capacities", {});

// ── local previews of server-side arithmetic ────────────────────────────────

/**
 * Mirrors `pool_config.extra_seat_pct` (default 40). Kept in sync by
 * `useSeatPricing`, which reads the real value once per session — this
 * constant only covers the first render.
 */
export const EXTRA_SEAT_PCT = 40;

/**
 * What N seats cost, given the one-seat fare.
 *
 * Seats past the first add a fraction rather than a multiple, so a solo
 * booking prices exactly as it did before pooling existed and a rider who
 * brings a friend pays more without paying double.
 */
export function fareForSeats(oneSeatFare, seats, extraPct = EXTRA_SEAT_PCT) {
  const n = Math.max(1, Number(seats) || 1);
  return Math.ceil(oneSeatFare * (1 + (n - 1) * (extraPct / 100)));
}

/** Seats a rider may book in a given class. */
export function maxSeatsFor(vehicleType) {
  return RIDE_TYPE_MAP[vehicleType]?.seats ?? 1;
}

/** Bikes carry one passenger — a property of the class, not a computed limit. */
export function canShare(vehicleType) {
  return maxSeatsFor(vehicleType) > 1;
}

/**
 * Seats a further booking could take.
 *
 * Summed per booking as `max(booked, occupied)` rather than derived from the
 * trip's two counters: with one rider aboard occupying two seats and another
 * merely booked for one, the counter form reads 2 where the true commitment
 * is 3, and the vehicle looks like it has a seat it does not have.
 */
export function seatsAvailable(trip, rides = []) {
  if (!trip) return 0;
  const committed = rides
    .filter((r) => ["accepted", "arrived", "ongoing"].includes(r.status))
    .reduce((sum, r) => sum + Math.max(r.seats ?? 1, r.seats_occupied ?? r.seats ?? 1), 0);
  return Math.max(0, (trip.seat_capacity ?? 0) - committed);
}
