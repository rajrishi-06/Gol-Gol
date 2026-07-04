/** Presentation helpers so formatting is consistent across the app. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹1,240 — Indian-locale currency without noisy decimals. */
export function formatCurrency(value) {
  const n = Number(value);
  return Number.isFinite(n) ? inr.format(n) : "—";
}

/** "12.4 km" / "850 m" depending on magnitude. */
export function formatDistance(km) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
}

/** "24 min" from a minute count. */
export function formatDuration(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" });

export function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : timeFmt.format(d);
}

/** Two-letter initials for avatar fallbacks. */
export function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
