/**
 * The one place that knows what a ride status *means*.
 *
 * Both sides of the app (and the notifications, the activity list, the home
 * screen strip and the shared-trip page) render from this table, so a rider and
 * a driver never see two different descriptions of the same moment.
 */

/** Ordered happy path. Terminal states live outside it. */
export const RIDE_FLOW = ["pending", "accepted", "arrived", "ongoing", "completed"];

export const TERMINAL = ["completed", "cancelled", "expired"];

/** Statuses where a live map / tracking screen makes sense. */
export const LIVE_STATUSES = ["accepted", "arrived", "ongoing"];

const STATUS = {
  scheduled: {
    label: "Scheduled",
    tone: "brand",
    rider: { title: "Ride scheduled", detail: "We'll find you a driver shortly before pickup." },
    driver: { title: "Scheduled ride", detail: "This booking is waiting for its dispatch window." },
  },
  pending: {
    label: "Finding a driver",
    tone: "warning",
    rider: { title: "Finding you a driver", detail: "Contacting nearby drivers — this usually takes under a minute." },
    driver: { title: "New request", detail: "A rider nearby is waiting for a driver." },
  },
  accepted: {
    label: "Driver on the way",
    tone: "brand",
    rider: { title: "Driver is on the way", detail: "Track them live on the map." },
    driver: { title: "Head to pickup", detail: "Navigate to the rider and tap Arrived when you're there." },
  },
  arrived: {
    label: "Driver has arrived",
    tone: "success",
    rider: { title: "Your driver is here", detail: "Share your 4-digit OTP to start the trip." },
    driver: { title: "Waiting at pickup", detail: "Ask the rider for their 4-digit OTP to start." },
  },
  ongoing: {
    label: "On trip",
    tone: "brand",
    rider: { title: "You're on your way", detail: "Sit back — we're tracking your route." },
    driver: { title: "Trip in progress", detail: "Follow navigation to the destination." },
  },
  completed: {
    label: "Completed",
    tone: "success",
    rider: { title: "Trip completed", detail: "Hope it was smooth. Rate your driver below." },
    driver: { title: "Trip completed", detail: "Nice work. Rate your rider below." },
  },
  cancelled: {
    label: "Cancelled",
    tone: "danger",
    rider: { title: "Ride cancelled", detail: "This ride was cancelled." },
    driver: { title: "Ride cancelled", detail: "This ride was cancelled." },
  },
  expired: {
    label: "No drivers found",
    tone: "neutral",
    rider: { title: "No drivers available", detail: "Nobody accepted in time. Try again or pick another ride type." },
    driver: { title: "Request expired", detail: "This request timed out." },
  },
};

const FALLBACK = {
  label: "Unknown",
  tone: "neutral",
  rider: { title: "Ride", detail: "" },
  driver: { title: "Ride", detail: "" },
};

export function statusMeta(status) {
  return STATUS[status] ?? FALLBACK;
}

/** Short pill label — "On trip", "Cancelled", … */
export function statusLabel(status) {
  return statusMeta(status).label;
}

/** Badge tone for the `Badge` primitive. */
export function statusTone(status) {
  return statusMeta(status).tone;
}

/** Headline + supporting line, phrased for the reader's role. */
export function statusCopy(status, role = "rider") {
  const meta = statusMeta(status);
  return meta[role === "driver" ? "driver" : "rider"] ?? meta.rider;
}

/** 0–1 progress along the happy path; terminal failures return 0. */
export function statusProgress(status) {
  if (status === "completed") return 1;
  if (status === "cancelled" || status === "expired") return 0;
  const i = RIDE_FLOW.indexOf(status);
  return i < 0 ? 0 : i / (RIDE_FLOW.length - 1);
}

export function isLive(status) {
  return LIVE_STATUSES.includes(status);
}

export function isTerminal(status) {
  return TERMINAL.includes(status);
}

/** Can this ride still be called off by `role`? */
export function canCancel(status, role) {
  if (role === "driver") return ["accepted", "arrived"].includes(status);
  return ["scheduled", "pending", "accepted", "arrived"].includes(status);
}

/** Reasons offered in the cancellation sheet, per role. */
export const CANCEL_REASONS = {
  rider: [
    "Driver is taking too long",
    "Booked by mistake",
    "Found another ride",
    "Plans changed",
    "Wrong pickup location",
    "Driver asked me to cancel",
  ],
  driver: [
    "Rider isn't at the pickup point",
    "Rider asked me to cancel",
    "Vehicle trouble",
    "Pickup is unreachable",
    "Too far from pickup",
  ],
};

/** Compliment tags shown alongside a 4–5 star rating. */
export const RATING_TAGS = {
  rider: ["Safe driving", "Clean vehicle", "Great conversation", "On time", "Knows the route", "Helped with luggage"],
  driver: ["Ready on time", "Polite", "Clear directions", "Kept it clean", "Easy pickup"],
};
