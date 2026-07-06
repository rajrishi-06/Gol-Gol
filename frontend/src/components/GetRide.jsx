import { lazy, Suspense } from "react";
import { Navigation } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LeftPanel from "./LeftPanel";
import HomeMap from "./HomeMap";
import IdleGlobe from "./IdleGlobe";
import ActiveRideAside from "./ActiveRideAside";
import PageLoader from "./PageLoader";
import { useActiveRide } from "../lib/useActiveRide";
import { hasValidCoords } from "../lib/geo";

// Defer the map bundle until the user actually opens the picker.
const MapPicker = lazy(() => import("./MapPicker"));

export default function Getride(props) {
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState("from");
  const { ride: activeRide, role } = useActiveRide();
  const navigate = useNavigate();

  const isFrom = mode === "from";
  const initialCenter = isFrom ? props.fromCords : props.toCords;

  const openPicker = (nextMode) => {
    setMode(nextMode);
    setPicking(true);
  };

  const returnToRide = () =>
    navigate(role === "driver" ? `/driver/ride/${activeRide.id}` : `/rider/ride/${activeRide.id}`);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <LeftPanel
        logIn={props.logIn}
        setMode={setMode}
        setClickedFrom={() => openPicker("from")}
        setClickedTo={() => openPicker("to")}
        from={props.from}
        to={props.to}
        fromCords={props.fromCords}
        toCords={props.toCords}
      />

      {picking ? (
        <Suspense fallback={<div className="fixed inset-0 z-50 sm:relative sm:flex-1"><PageLoader /></div>}>
          <MapPicker
            mode={mode}
            initialCenter={initialCenter}
            setLoc={isFrom ? props.setFrom : props.setTo}
            setCords={isFrom ? props.setFromCords : props.setToCords}
            setClickedLoc={setPicking}
          />
        </Suspense>
      ) : activeRide ? (
        <ActiveRideAside ride={activeRide} role={role} />
      ) : (hasValidCoords(props.fromCords) || hasValidCoords(props.toCords)) ? (
        <HomeMap fromCords={props.fromCords} toCords={props.toCords} />
      ) : (
        <IdleGlobe />
      )}

      {/* Mobile: the aside is hidden, so surface a persistent return-to-ride bar. */}
      {activeRide && !picking && (
        <button
          onClick={returnToRide}
          className="animate-fade-up fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-fg shadow-floating sm:hidden"
        >
          <span className="flex items-center gap-2.5 text-left">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Ride in progress</span>
              <span className="block text-xs text-primary-fg/80">
                {role === "driver" ? "Tap to resume navigation" : "Tap to return to live map"}
              </span>
            </span>
          </span>
          <Navigation className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
