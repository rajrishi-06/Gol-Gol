import { supabase } from "./supabase";

/**
 * Ride API. Every state transition is a server-side RPC (migration 0005) rather
 * than a raw `update`, so transitions are atomic, authorised against the
 * caller's role on the ride, and recorded in `ride_events`.
 */

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error };
  return { data, error: null };
};

// ── creating ────────────────────────────────────────────────────────────────

/**
 * Book a ride. Distance, fare and the start-OTP are computed by DB triggers —
 * we only send trip inputs, so the client can't invent a price.
 */
export async function createRide({
  riderId,
  from,
  to,
  fromAddress,
  toAddress,
  vehicleType,
  paymentMethod = "cash",
  pickupNotes = null,
  scheduledFor = null,
}) {
  return supabase
    .from("rides")
    .insert({
      rider_id: riderId,
      from_lat: from.lat,
      from_lng: from.lng,
      to_lat: to.lat,
      to_lng: to.lng,
      from_address: fromAddress,
      to_address: toAddress,
      vehicle_type: vehicleType,
      payment_method: paymentMethod,
      pickup_notes: pickupNotes,
      scheduled_for: scheduledFor,
      status: "pending",
    })
    .select()
    .single();
}

// ── transitions ─────────────────────────────────────────────────────────────

/** Atomic claim. `data` is null when another driver got there first. */
export const acceptRide = (rideId) => rpc("accept_ride", { p_ride_id: rideId });

export const markArrived = (rideId) => rpc("mark_driver_arrived", { p_ride_id: rideId });

export const startRide = (rideId, otp) => rpc("start_ride", { p_ride_id: rideId, p_otp: otp });

export const completeRide = (rideId, waitingMinutes = 0) =>
  rpc("complete_ride", { p_ride_id: rideId, p_waiting_minutes: Math.max(0, Math.round(waitingMinutes)) });

export const cancelRide = (rideId, reason) => rpc("cancel_ride", { p_ride_id: rideId, p_reason: reason ?? null });

export const expireStaleRides = (olderThan = "5 minutes") => rpc("expire_stale_rides", { p_older_than: olderThan });

export const releaseScheduledRides = () => rpc("release_scheduled_rides", {});

/** Publish the ETA both sides should quote. Throttled by the caller. */
export const updateRideEta = (rideId, minutes, distanceKm) =>
  rpc("update_ride_eta", {
    p_ride_id: rideId,
    p_minutes: Math.max(0, Math.round(minutes)),
    p_distance_km: distanceKm ?? null,
  });

// ── dispatch ────────────────────────────────────────────────────────────────

export const nearbyPendingRides = ({ lat, lng, vehicleClass = null, radiusKm = 5 }) =>
  rpc("nearby_pending_rides", {
    p_lat: lat,
    p_lng: lng,
    p_vehicle: vehicleClass,
    p_radius_km: radiusKm,
  });

/** Per-class supply summary — driver count + nearest distance, no positions. */
export const nearbyDriverSummary = ({ lat, lng, radiusKm = 8 }) =>
  rpc("nearby_driver_summary", { p_lat: lat, p_lng: lng, p_radius_km: radiusKm });

export const setDriverDuty = (online) => rpc("set_driver_duty", { p_online: online });

export const sendDriverHeartbeat = ({ lat, lng, heading, speed, accuracy } = {}) =>
  rpc("driver_heartbeat", {
    p_lat: lat ?? null,
    p_lng: lng ?? null,
    p_heading: Number.isFinite(heading) ? heading : null,
    p_speed: Number.isFinite(speed) ? speed : null,
    p_accuracy: Number.isFinite(accuracy) ? accuracy : null,
  });

// ── history, ratings, receipts ──────────────────────────────────────────────

export const myRides = ({ role = "all", status = "all", limit = 20, offset = 0 } = {}) =>
  rpc("my_rides", { p_role: role, p_status: status, p_limit: limit, p_offset: offset });

export const submitRating = ({ rideId, stars, comment = null, tags = [], tip = 0 }) =>
  rpc("submit_rating", {
    p_ride_id: rideId,
    p_stars: stars,
    p_comment: comment,
    p_tags: tags,
    p_tip: tip,
  });

export async function fetchRideDetail(rideId) {
  const [ride, payment, events, ratings] = await Promise.all([
    supabase.from("rides").select("*").eq("id", rideId).maybeSingle(),
    supabase.from("payments").select("*").eq("ride_id", rideId).maybeSingle(),
    supabase.from("ride_events").select("*").eq("ride_id", rideId).order("created_at"),
    supabase.from("ratings").select("*").eq("ride_id", rideId),
  ]);
  return {
    ride: ride.data ?? null,
    payment: payment.data ?? null,
    events: events.data ?? [],
    ratings: ratings.data ?? [],
    error: ride.error ?? null,
  };
}

// ── earnings ────────────────────────────────────────────────────────────────

export const earningsSummary = ({ from, to } = {}) =>
  rpc("driver_earnings_summary", {
    p_from: from ?? new Date(Date.now() - 30 * 864e5).toISOString(),
    p_to: to ?? new Date().toISOString(),
  });

export const earningsDaily = (days = 14) => rpc("driver_earnings_daily", { p_days: days });

// ── carpool ─────────────────────────────────────────────────────────────────

export const acceptRideRequest = (requestId) => rpc("accept_ride_request", { p_request_id: requestId });

export const rejectRideRequest = (requestId, reason = null) =>
  rpc("reject_ride_request", { p_request_id: requestId, p_reason: reason });

export const removeCarpoolRider = (publishedRideId, riderId) =>
  rpc("remove_carpool_rider", { p_published_ride_id: publishedRideId, p_rider_id: riderId });

// ── admin ───────────────────────────────────────────────────────────────────

export const adminPendingDrivers = () => rpc("admin_pending_drivers", {});

export const setDriverVerification = (driverId, status, reason = null) =>
  rpc("set_driver_verification", { p_driver_id: driverId, p_status: status, p_reason: reason });
