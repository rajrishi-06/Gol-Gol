import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  drawRoutePolyline,
  boundsFrom,
  toPath,
  restrictionAround,
  minZoomForRadius,
} from "../lib/googlemaps";
import { fetchRoute } from "../lib/geocoding";

const DEFAULT_CENTER = { lat: 17.4239, lng: 78.4738 }; // Hyderabad

/**
 * The home-screen map. Calm and clean when idle (just a themed map of the
 * user's area); once a pickup + drop are set it draws the real route with an
 * ETA chip — so the "route preview" is real, not decorative.
 */
export default function HomeMap({ fromCords, toCords }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeRef = useRef(null);
  const markersRef = useRef([]);
  const [trip, setTrip] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadGoogleMaps();
      if (cancelled || !containerRef.current || mapRef.current) return;
      let center = fromCords?.lat ? fromCords : DEFAULT_CENTER;
      if (!fromCords?.lat) {
        try {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          );
          center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {
          /* keep default */
        }
      }
      if (cancelled || !containerRef.current) return;
      mapRef.current = createMap(containerRef.current, {
        center,
        zoom: 13,
        restriction: restrictionAround(center.lat, center.lng, 100),
        minZoom: minZoomForRadius(center.lat, 100),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    routeRef.current?.setMap(null);
    routeRef.current = null;
    setTrip(null);

    if (!fromCords?.lat) return;
    markersRef.current.push(createImageMarker({ iconPath: "/icons/pickup.svg", position: fromCords, map, size: 44, title: "Pickup" }));
    if (!toCords?.lat) {
      map.panTo(fromCords);
      map.setZoom(14);
      return;
    }
    markersRef.current.push(createImageMarker({ iconPath: "/icons/destination.svg", position: toCords, map, size: 44, title: "Drop" }));

    let cancelled = false;
    (async () => {
      try {
        const route = await fetchRoute([
          [fromCords.lng, fromCords.lat],
          [toCords.lng, toCords.lat],
        ]);
        if (cancelled || !route?.geometry) return;
        routeRef.current = drawRoutePolyline(map, route.geometry.coordinates, { width: 5, animate: true });
        map.fitBounds(boundsFrom(toPath(route.geometry.coordinates)), 90);
        setTrip({ min: Math.max(1, Math.round(route.duration / 60)), km: (route.distance / 1000).toFixed(1) });
      } catch {
        /* route preview is non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromCords, toCords]);

  return (
    <div className="relative hidden flex-1 sm:block">
      <div ref={containerRef} className="h-full w-full" />

      <div className="animate-fade-in glass pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground shadow-soft">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        City mobility, reimagined
      </div>

      {trip && (
        <div className="animate-fade-up glass absolute bottom-5 left-5 rounded-2xl border border-border px-4 py-3 shadow-floating">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">Estimated trip</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {trip.min} min <span className="text-muted">· {trip.km} km</span>
          </p>
        </div>
      )}
    </div>
  );
}
