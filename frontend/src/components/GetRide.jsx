import { lazy, Suspense, useState } from "react";
import { ArrowLeft } from "lucide-react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import PageLoader from "./PageLoader";

// Defer the Mapbox GL bundle (~1.8 MB) until the user actually opens the
// picker or previews a route — the landing view loads without it.
const MapPicker = lazy(() => import("./MapPicker"));
const DriverRoute = lazy(() => import("./DriverRoute"));

export default function Getride(props) {
  const [clickedLocFrom, setClickedLocFrom] = useState(false);
  const [clickedLocTo, setClickedLocTo] = useState(false);
  const [mode, setMode] = useState("from");
  const [selectedRide, setSelectedRide] = useState(null);

  const isPicking = clickedLocFrom || clickedLocTo;
  const initialCenter = mode === "from" ? props.fromCords : props.toCords;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <LeftPanel
        logIn={props.logIn}
        setMode={setMode}
        setClickedFrom={setClickedLocFrom}
        setClickedTo={setClickedLocTo}
        from={props.from}
        to={props.to}
        fromCords={props.fromCords}
        toCords={props.toCords}
        setSelectedRide={setSelectedRide}
      />

      {isPicking ? (
        // Full-screen overlay on mobile (previously hidden → picking was
        // impossible on phones); inline on tablet/desktop.
        <Suspense fallback={<div className="fixed inset-0 z-50 sm:relative sm:flex-1"><PageLoader /></div>}>
          <MapPicker
            mode={mode}
            initialCenter={initialCenter}
            setLoc={clickedLocFrom ? props.setFrom : props.setTo}
            setCords={clickedLocFrom ? props.setFromCords : props.setToCords}
            setClickedLoc={clickedLocFrom ? setClickedLocFrom : setClickedLocTo}
          />
        </Suspense>
      ) : selectedRide ? (
        <div className="relative hidden flex-1 sm:block">
          <Suspense fallback={<PageLoader />}>
            <DriverRoute ride={selectedRide} />
          </Suspense>
          <button
            onClick={() => setSelectedRide(null)}
            className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-xl bg-surface/90 px-3 py-2 text-sm font-medium text-foreground shadow-elevated backdrop-blur transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      ) : (
        <RightPanel />
      )}
    </div>
  );
}
