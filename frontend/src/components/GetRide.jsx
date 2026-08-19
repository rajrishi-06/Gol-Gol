import { lazy, Suspense, useCallback, useRef, useState } from "react";
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

// Defer the map bundles until they're actually opened.
const MapPicker = lazy(() => import("./MapPicker"));
const DriverRoute = lazy(() => import("./DriverRoute"));

/**
 * Home: book a ride.
 *
 * The persistent shell handles navigation and the in-ride strip now, so this
 * screen only owns the booking panel and the map beside it.
 */
/**
 * Where the globe descends to when the rider has not told us anything yet.
 * India, because that is the market — an unset pickup should still land
 * somewhere the app can actually serve.
 */
const DEFAULT_TARGET = { lat: 12.9716, lng: 77.5946 };

export default function Home() {
  useDocumentTitle(null);
  const trip = useBooking();
  const { ride: activeRide, role } = useActiveRide();
  const [picking, setPicking] = useState(null); // "from" | "to" | null
  const [diving, setDiving] = useState(false);
  // Where the globe descended to. The picker has to open on the same spot the
  // camera just landed on, or the dive lands somewhere and the map opens
  // somewhere else — which on an unset pickup meant opening at 0°, 0°.
  const [divedTo, setDivedTo] = useState(null);
  const globeRef = useRef(null);

  const isFrom = picking === "from";
  const initialCenter = (isFrom ? trip.fromCords : trip.toCords) ?? divedTo;

  /**
   * Choosing a location descends the globe to it first, then swaps in the
   * picker. The map only mounts once the camera has arrived, so the two never
   * fight over the same space and the descent reads as one continuous move
   * from orbit to street rather than a cut.
   *
   * If the globe is not on screen — WebGL missing, or the aside is showing a
   * route or an active ride — this is just `setPicking`, as it always was.
   */
  const choose = useCallback(
    async (which) => {
      const target =
        (which === "from" ? trip.fromCords : trip.toCords) ?? trip.fromCords ?? DEFAULT_TARGET;
      setDivedTo(target);
      const globe = globeRef.current;
      if (!globe?.available) {
        setPicking(which);
        return;
      }
      setDiving(true);
      await globe.diveTo(target);
      setPicking(which);
      setDiving(false);
    },
    [trip.fromCords, trip.toCords]
  );

  const closePicker = useCallback(() => {
    setPicking(null);
    globeRef.current?.ascend();
  }, []);

  const commitPick = (address, coords) => {
    if (isFrom) trip.setPickup(address, coords);
    else trip.setDrop(address, coords);
  };

  const showRoute = hasValidCoords(trip.fromCords) || hasValidCoords(trip.toCords);

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Book a ride" subtitle="Instant cabs, autos and shared commutes" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        <LeftPanel onPickFrom={() => choose("from")} onPickTo={() => choose("to")} />

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
              onClose={closePicker}
            />
          </Suspense>
        ) : trip.previewRide ? (
          <Suspense fallback={<div className="relative flex-1"><PageLoader /></div>}>
            <div className="relative hidden flex-1 sm:block">
              <DriverRoute ride={trip.previewRide} onClose={() => trip.setPreviewRide(null)} />
            </div>
          </Suspense>
        ) : activeRide && !diving ? (
          <ActiveRideAside ride={activeRide} role={role} />
        ) : showRoute && !diving ? (
          <HomeMap fromCords={trip.fromCords} toCords={trip.toCords} />
        ) : (
          <IdleGlobe ref={globeRef} />
        )}
      </div>
    </div>
  );
}
