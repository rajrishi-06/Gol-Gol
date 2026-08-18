import { lazy, Suspense, useState } from "react";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useBooking } from "../lib/booking.jsx";
import { useActiveRide } from "../lib/activeRide.jsx";
import { hasValidCoords } from "../lib/geo";
import TopBar from "./layout/TopBar";
import LeftPanel from "./LeftPanel";
import HomeMap from "./HomeMap";
import IdleGlobe from "./IdleGlobe";
import ActiveRideAside from "./ActiveRideAside";
import PageLoader from "./PageLoader";

// Defer the map bundle until the user actually opens the picker.
const MapPicker = lazy(() => import("./MapPicker"));

/**
 * Home: book a ride.
 *
 * The persistent shell handles navigation and the in-ride strip now, so this
 * screen only owns the booking panel and the map beside it.
 */
export default function Home() {
  useDocumentTitle(null);
  const trip = useBooking();
  const { ride: activeRide, role } = useActiveRide();
  const [picking, setPicking] = useState(null); // "from" | "to" | null

  const isFrom = picking === "from";
  const initialCenter = isFrom ? trip.fromCords : trip.toCords;

  const commitPick = (address, coords) => {
    if (isFrom) trip.setPickup(address, coords);
    else trip.setDrop(address, coords);
  };

  const showRoute = hasValidCoords(trip.fromCords) || hasValidCoords(trip.toCords);

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Book a ride" subtitle="Instant cabs, autos and shared commutes" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        <LeftPanel onPickFrom={() => setPicking("from")} onPickTo={() => setPicking("to")} />

        {picking ? (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 sm:relative sm:inset-auto sm:flex-1">
                <PageLoader />
              </div>
            }
          >
            <MapPicker
              mode={picking}
              initialCenter={initialCenter}
              onConfirm={commitPick}
              onClose={() => setPicking(null)}
            />
          </Suspense>
        ) : activeRide ? (
          <ActiveRideAside ride={activeRide} role={role} />
        ) : showRoute ? (
          <HomeMap fromCords={trip.fromCords} toCords={trip.toCords} />
        ) : (
          <IdleGlobe />
        )}
      </div>
    </div>
  );
}
