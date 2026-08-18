import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import { useUnratedRides } from "../../lib/useUnratedRides";
import SideNav from "./SideNav";
import BottomNav from "./BottomNav";
import ActiveRideBar from "./ActiveRideBar";
import ConnectionBanner from "./ConnectionBanner";
import { isImmersiveRoute, tabsFor } from "./navItems";

/**
 * The app shell.
 *
 * Every screen used to be a standalone `h-[100dvh]` page with its own header
 * and no way to reach anything else, so the app had no information
 * architecture at all. Now there is exactly one chrome: a side rail on desktop,
 * a tab bar on phones, a live connection banner, and a persistent in-ride strip
 * — and screens just render into `<main>`.
 *
 * Full-screen map routes (live tracking, navigation, the shared-trip page) opt
 * out entirely so nothing overlays their controls.
 */
export default function AppLayout() {
  const { pathname } = useLocation();
  const { isAuthenticated, isApprovedDriver, isAdmin } = useAuth();
  const { count: unrated } = useUnratedRides();

  const immersive = isImmersiveRoute(pathname);
  const tabs = tabsFor(pathname, { isApprovedDriver });
  const badges = {
    "/activity": unrated,
    "/driver/trips": unrated,
  };

  if (immersive) {
    return (
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
        <ConnectionBanner />
        <main className="relative min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {isAuthenticated && <SideNav tabs={tabs} badges={badges} isAdmin={isAdmin} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        {isAuthenticated && (
          <>
            <ActiveRideBar />
            <BottomNav tabs={tabs} badges={badges} />
          </>
        )}
      </div>
    </div>
  );
}
