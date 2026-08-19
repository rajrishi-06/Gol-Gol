import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  RotateCw,
  Merge,
  Flag,
  LocateFixed,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  createVehicleMarker,
  drawRoutePolyline,
  restrictionAround,
  minZoomForRadius,
} from "../../lib/googlemaps";
import { fetchRoute } from "../../lib/geocoding";
import { distanceMeters } from "../../lib/geo";
import { formatDistance, formatDuration, formatTime } from "../../lib/format";
import { cn } from "../../lib/cn";
import MapFallback from "../MapFallback";

/** Pick a maneuver arrow from the instruction text (Google gives us prose). */
function maneuverIcon(instruction = "") {
  const s = instruction.toLowerCase();
  if (s.includes("roundabout") || s.includes("rotary")) return RotateCw;
  if (s.includes("merge")) return Merge;
  if (s.includes("destination") || s.includes("arrive")) return Flag;
  if (s.includes("left")) return CornerUpLeft;
  if (s.includes("right")) return CornerUpRight;
  return ArrowUp;
}

function short(distanceM) {
  if (distanceM == null) return "";
  if (distanceM < 1000) return `${Math.max(0, Math.round(distanceM / 10) * 10)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

/**
 * Full-screen turn-by-turn navigation, styled like Google Maps: a bold top
 * maneuver banner, a bottom trip bar (ETA · distance · arrival + exit), a
 * follow/recenter control and spoken guidance. Handles both the drive-to-pickup
 * and drive-to-destination phases.
 *
 * `origin`/`destination` are `[lng, lat]`. `onExit` renders the exit action.
 */
export default function NavigationView({
  origin,
  destination,
  vehicleType,
  phase = "pickup", // "pickup" | "dropoff"
  destinationLabel = "destination",
  voiceEnabled = true,
  onEta,
  onExit,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const vehicleMarkerRef = useRef(null);
  const routeRef = useRef(null);
  const followRef = useRef(true);
  const lastRouteOriginRef = useRef(null);
  const spokenRef = useRef(new Set());

  const [steps, setSteps] = useState([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [eta, setEta] = useState(null); // { min, km }
  const [following, setFollowing] = useState(true);
  // Seeded from the driver's saved preference instead of a module-level global
  // that reset on every reload.
  const [muted, setMuted] = useState(!voiceEnabled);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const onEtaRef = useRef(onEta);
  useEffect(() => {
    onEtaRef.current = onEta;
  }, [onEta]);

  const speak = useCallback((text) => {
    if (muted) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.98;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* unsupported */
    }
  }, [muted]);

  // Fetch/refresh the route (also used as a reroute when the driver strays).
  const refreshRoute = useCallback(async () => {
    if (!origin || !destination || !mapRef.current) return;
    try {
      const route = await fetchRoute([origin, destination], { steps: true });
      if (!route) return;
      lastRouteOriginRef.current = origin;
      const minutes = Math.max(1, Math.round(route.duration / 60));
      const km = route.distance / 1000;
      setEta({ min: minutes, km });
      // Publish the ETA so the rider (and any shared-trip viewer) quotes the
      // same number the driver is looking at.
      onEtaRef.current?.(minutes, Number(km.toFixed(2)));
      setSteps(route.legs[0]?.steps ?? []);
      setStepIdx(0);
      spokenRef.current = new Set();
      if (route.geometry) {
        routeRef.current?.setMap(null);
        routeRef.current = drawRoutePolyline(mapRef.current, route.geometry.coordinates, { width: 7, opacity: 0.9 });
      }
    } catch {
      /* keep last route */
    }
  }, [origin, destination]);

  // Init map once.
  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        if (!cancelled) setMapFailed(true);
        return;
      }
      if (cancelled || !containerRef.current || mapRef.current) return;
      const [oLng, oLat] = origin;
      const map = createMap(containerRef.current, {
        center: { lat: oLat, lng: oLng },
        zoom: 17,
        restriction: restrictionAround(oLat, oLng, 120),
        minZoom: minZoomForRadius(oLat, 120),
        zoomControl: false,
      });
      mapRef.current = map;
      vehicleMarkerRef.current = createVehicleMarker({ vehicleType, position: { lat: oLat, lng: oLng }, map, title: "You" });
      createImageMarker({
        iconPath: phase === "pickup" ? "/icons/pickup.svg" : "/icons/destination.svg",
        position: { lat: destination[1], lng: destination[0] },
        map,
        title: destinationLabel,
      });
      // Break follow-mode when the user drags the map.
      map.addListener("dragstart", () => {
        followRef.current = false;
        setFollowing(false);
      });
      setReady(true);
      refreshRoute();
    })();
    return () => {
      cancelled = true;
    };
    // Mount-once; the parent remounts via `key` when the phase/destination changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the vehicle + advance the active step + speak guidance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;
    const [lng, lat] = origin;
    vehicleMarkerRef.current?.setPosition({ lat, lng });
    if (followRef.current) map.panTo({ lat, lng });

    // Reroute if the driver has moved a long way from the last computed origin.
    if (lastRouteOriginRef.current) {
      const drift = distanceMeters({ lat, lng }, { lat: lastRouteOriginRef.current[1], lng: lastRouteOriginRef.current[0] });
      if (drift > 120) refreshRoute();
    }

    if (!steps.length) return;
    // Advance past maneuvers we've reached; announce the upcoming one.
    let idx = stepIdx;
    while (idx < steps.length - 1 && steps[idx].maneuver.location) {
      const [sLng, sLat] = steps[idx].maneuver.location;
      if (distanceMeters({ lat, lng }, { lat: sLat, lng: sLng }) < 25) idx += 1;
      else break;
    }
    if (idx !== stepIdx) setStepIdx(idx);

    const step = steps[idx];
    if (step?.maneuver.location) {
      const [sLng, sLat] = step.maneuver.location;
      const d = distanceMeters({ lat, lng }, { lat: sLat, lng: sLng });
      const key = `${idx}:${d < 60 ? "now" : "soon"}`;
      if (d < 220 && !spokenRef.current.has(key)) {
        spokenRef.current.add(key);
        speak(d < 60 ? step.maneuver.instruction : `In ${short(d)}, ${step.maneuver.instruction}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, steps]);

  // Traffic changes even when the vehicle doesn't, so refresh on a timer too.
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => refreshRoute(), 90000);
    return () => clearInterval(timer);
  }, [ready, refreshRoute]);

  const recenter = () => {
    followRef.current = true;
    setFollowing(true);
    if (origin && mapRef.current) {
      mapRef.current.panTo({ lat: origin[1], lng: origin[0] });
      mapRef.current.setZoom(17);
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      if (!m) {
        try {
          speechSynthesis.cancel();
        } catch {
          /* unsupported */
        }
      }
      return !m;
    });
  };

  const activeStep = steps[stepIdx];
  const nextDistance = activeStep?.maneuver.location && origin
    ? distanceMeters(
        { lat: origin[1], lng: origin[0] },
        { lat: activeStep.maneuver.location[1], lng: activeStep.maneuver.location[0] }
      )
    : null;
  const Icon = maneuverIcon(activeStep?.maneuver.instruction);
  const arrival = eta ? formatTime(Date.now() + eta.min * 60000) : "—";

  return (
    <div className="relative h-full w-full">
      {mapFailed ? (
        <MapFallback message="Navigation can't draw the map right now. Turn-by-turn directions are unavailable — use your own maps app." />
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}

      {/* Top maneuver banner */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
        <div className="mx-auto flex max-w-2xl items-center gap-4 rounded-2xl bg-brand-700 px-4 py-3.5 text-white shadow-floating dark:bg-brand-800">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15">
            <Icon className="h-7 w-7" strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            {nextDistance != null && (
              <p className="text-lg font-bold leading-tight">{short(nextDistance)}</p>
            )}
            <p className="truncate text-sm text-white/90">
              {activeStep?.maneuver.instruction || (ready ? `Head to the ${destinationLabel}` : "Starting navigation…")}
            </p>
          </div>
        </div>
      </div>

      {/* Follow / mute controls — kept above the mobile bottom-sheet peek. */}
      <div className="absolute right-4 bottom-[calc(42dvh+0.75rem)] z-10 flex flex-col gap-2 sm:bottom-28">
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute voice guidance" : "Mute voice guidance"}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-foreground shadow-elevated transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button
          onClick={recenter}
          aria-label="Re-center map"
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full border shadow-elevated transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            following ? "border-border bg-surface text-muted" : "border-primary bg-primary text-primary-fg"
          )}
        >
          <LocateFixed className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom trip bar — desktop only; mobile shows this in the ride sheet. */}
      <div className="absolute inset-x-0 bottom-0 hidden p-3 sm:block sm:p-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-floating backdrop-blur">
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground">
              {eta ? formatDuration(eta.min) : "—"}
            </p>
            <p className="truncate text-xs text-muted">
              {eta ? `${formatDistance(eta.km)} · arrive ${arrival}` : "Calculating route…"}
            </p>
          </div>
          {onExit}
        </div>
      </div>
    </div>
  );
}
