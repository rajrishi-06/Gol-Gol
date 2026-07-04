/**
 * Single source of truth for vehicle data. Previously the ride catalogue,
 * fare table and driver vehicle list were redeclared (and drifting) across
 * `AvailableRides`, `BookLeft`, `DriverLeftPanel` and `FindMatch`.
 */

/** Instant-hail ride options shown to riders, with fare model + iconography. */
export const RIDE_TYPES = [
  {
    id: "auto",
    name: "Auto",
    tagline: "Get an auto at your doorstep",
    icon: "/icons/auto.svg",
    baseFare: 25,
    perKmRate: 12,
    mileage: "25 km/l",
    seats: 3,
  },
  {
    id: "mini",
    name: "Mini",
    tagline: "Comfy hatchbacks at pocket-friendly fares",
    icon: "/icons/car.svg",
    baseFare: 40,
    perKmRate: 15,
    mileage: "20 km/l",
    seats: 4,
  },
  {
    id: "bike",
    name: "Bike",
    tagline: "Zip through traffic at affordable fares",
    icon: "/icons/bike.svg",
    baseFare: 15,
    perKmRate: 8,
    mileage: "45 km/l",
    seats: 1,
  },
  {
    id: "sedan",
    name: "Prime Sedan",
    tagline: "Sedans with free wifi and top drivers",
    icon: "/icons/car.svg",
    baseFare: 60,
    perKmRate: 18,
    mileage: "15 km/l",
    seats: 4,
  },
  {
    id: "suv",
    name: "Prime SUV",
    tagline: "Spacious SUVs with free wifi and top drivers",
    icon: "/icons/van.svg",
    baseFare: 80,
    perKmRate: 22,
    mileage: "12 km/l",
    seats: 6,
  },
];

/** Map of ride id → ride definition for O(1) lookups. */
export const RIDE_TYPE_MAP = Object.fromEntries(RIDE_TYPES.map((r) => [r.id, r]));

export function getRideType(id) {
  return RIDE_TYPE_MAP[id] ?? null;
}

/**
 * Estimate a fare for a ride type over a distance.
 * Returns `{ base, perKm, distanceCharge, total }`.
 */
export function estimateFare(rideId, distance) {
  const ride = getRideType(rideId);
  if (!ride) return null;
  const distanceCharge = distance * ride.perKmRate;
  return {
    base: ride.baseFare,
    perKm: ride.perKmRate,
    distanceCharge,
    total: Math.ceil(ride.baseFare + distanceCharge),
  };
}

/** Vehicle categories a driver can register (registration ≠ hail catalogue). */
export const DRIVER_VEHICLE_TYPES = ["car", "bike", "auto", "van", "truck"];

/** Icon path for any vehicle type, with a safe fallback. */
export function vehicleIcon(type) {
  const known = ["auto", "bike", "car", "van", "truck"];
  return `/icons/${known.includes(type) ? type : "car"}.svg`;
}
