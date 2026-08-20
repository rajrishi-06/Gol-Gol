import {
  Car,
  Clock,
  Wallet,
  User,
  Navigation,
  IndianRupee,
  ShieldCheck,
  MapPinned,
  Settings,
  LifeBuoy,
  UserCheck,
} from "lucide-react";

/**
 * The app's information architecture in one place.
 *
 * Two tab sets, because riding and driving are genuinely different jobs: a
 * driver on shift wants dispatch and earnings, a rider wants a map and their
 * trips.
 *
 * The route decides, with mode as the tiebreak: `/driver/*` is unambiguous, and
 * everywhere else a driver who is on duty or mid-trip still gets the driving
 * set. Route alone put a driver on a job into rider tabs the moment they tapped
 * through to their account.
 */

export const RIDER_TABS = [
  { to: "/", label: "Ride", icon: Car, end: true },
  { to: "/activity", label: "Activity", icon: Clock },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/account", label: "Account", icon: User },
];

export const DRIVER_TABS = [
  { to: "/driver/dashboard", label: "Drive", icon: Navigation },
  { to: "/driver/trips", label: "Trips", icon: Clock },
  { to: "/driver/earnings", label: "Earnings", icon: IndianRupee },
  { to: "/account", label: "Account", icon: User },
];

/**
 * Secondary destinations — side rail, account page.
 * `short` is what the 84px rail shows, so labels never wrap to two lines.
 */
export const SECONDARY_LINKS = [
  { to: "/account/places", label: "Saved places", short: "Places", icon: MapPinned },
  { to: "/account/safety", label: "Safety", icon: ShieldCheck },
  { to: "/account/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help & support", short: "Help", icon: LifeBuoy },
];

export const ADMIN_LINK = {
  to: "/admin/drivers",
  label: "Driver verification",
  short: "Verify",
  icon: UserCheck,
};

/**
 * Routes that own the whole viewport — a full-screen map with its own controls.
 * The shell hides its chrome here so nothing overlaps the navigation view or
 * the draggable ride sheet.
 */
const IMMERSIVE = [/^\/rider\/ride\//, /^\/driver\/ride\//, /^\/t\//, /^\/login$/, /^\/book$/];

export function isImmersiveRoute(pathname) {
  return IMMERSIVE.some((re) => re.test(pathname));
}

export function isDriverRoute(pathname) {
  return pathname.startsWith("/driver");
}

/**
 * Which tab set to show.
 *
 * The route wins where it is unambiguous; mode is the tiebreak everywhere else,
 * so a driver who is on duty or mid-trip keeps the driving tabs when they tap
 * through to their account instead of being dropped back into rider navigation.
 */
export function tabsFor(pathname, { isApprovedDriver, isDriving = false }) {
  if (!isApprovedDriver) return RIDER_TABS;
  return isDriverRoute(pathname) || isDriving ? DRIVER_TABS : RIDER_TABS;
}
