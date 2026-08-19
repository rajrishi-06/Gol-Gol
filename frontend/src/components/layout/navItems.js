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
 * trips. The active set is chosen by route (`/driver/*` → driving), so the
 * shell never disagrees with the screen you're looking at.
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

/** Which tab set to show for the current route + role. */
export function tabsFor(pathname, { isApprovedDriver }) {
  return isDriverRoute(pathname) && isApprovedDriver ? DRIVER_TABS : RIDER_TABS;
}
