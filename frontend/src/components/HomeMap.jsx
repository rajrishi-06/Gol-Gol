import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  drawRoutePolyline,
  boundsFrom,
  toPath,
} from "../lib/googlemaps";
import { fetchRoute } from "../lib/geocoding";
import { distanceKm, hasValidCoords } from "../lib/geo";

const DEFAULT_CENTER = { lat: 17.4239, lng: 78.4738 }; // Hyderabad

/**
 * Home-screen map. Calm when idle; as soon as pickup and/or drop coordinates
 * exist, it renders pickup/drop markers and draws the route polyline with an ETA.
 */
export default function HomeMap({ fromCords, toCords }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [trip, setTrip] = useState(null);

  // Initialize Google Maps instance
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadGoogleMaps();
      if (cancelled || !containerRef.current || mapRef.current) return;

      const center = hasValidCoords(fromCords)
        ? fromCords
        : hasValidCoords(toCords)
        ? toCords
        : DEFAULT_CENTER;

      mapRef.current = createMap(containerRef.current, {
        center,
        zoom: 13,
      });

      if (!cancelled) setMapLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Render markers and route whenever map is ready or coordinates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear previous markers and route
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (routeRef.current) {
      routeRef.current.setMap(null);
      routeRef.current = null;
    }
    setTrip(null);

    const hasFrom = hasValidCoords(fromCords);
    const hasTo = hasValidCoords(toCords);

    if (!hasFrom && !hasTo) return;

    if (hasFrom) {
      markersRef.current.push(
        createImageMarker({
          iconPath: "/icons/pickup.svg",
          position: fromCords,
          map,
          size: 44,
          title: "Pickup",
        })
      );
    }

    if (hasTo) {
      markersRef.current.push(
        createImageMarker({
          iconPath: "/icons/destination.svg",
          position: toCords,
          map,
          size: 44,
          title: "Drop",
        })
      );
    }

    // Only pickup set: pan to pickup
    if (hasFrom && !hasTo) {
      map.panTo(fromCords);
      map.setZoom(14);
      return;
    }

    // Only drop set: pan to drop
    if (!hasFrom && hasTo) {
      map.panTo(toCords);
      map.setZoom(14);
      return;
    }

    // Both pickup and drop set: calculate route and draw path
    let cancelled = false;
    (async () => {
      try {
        const route = await fetchRoute([
          [fromCords.lng, fromCords.lat],
          [toCords.lng, toCords.lat],
        ]);

        if (cancelled) return;

        if (route?.geometry?.coordinates?.length) {
          routeRef.current = drawRoutePolyline(map, route.geometry.coordinates, {
            width: 5,
            animate: true,
          });
          map.fitBounds(boundsFrom(toPath(route.geometry.coordinates)), 90);
          setTrip({
            min: Math.max(1, Math.round(route.duration / 60)),
            km: (route.distance / 1000).toFixed(1),
          });
        } else {
          // Fallback straight line if driving route fails
          const straightCoords = [
            [fromCords.lng, fromCords.lat],
            [toCords.lng, toCords.lat],
          ];
          routeRef.current = drawRoutePolyline(map, straightCoords, { width: 4, animate: false });
          map.fitBounds(boundsFrom(toPath(straightCoords)), 90);
          const dist = distanceKm(fromCords, toCords).toFixed(1);
          setTrip({ min: Math.max(1, Math.round((parseFloat(dist) / 30) * 60)), km: dist });
        }
      } catch {
        if (cancelled) return;
        // Fallback straight line on API error
        const straightCoords = [
          [fromCords.lng, fromCords.lat],
          [toCords.lng, toCords.lat],
        ];
        routeRef.current = drawRoutePolyline(map, straightCoords, { width: 4, animate: false });
        map.fitBounds(boundsFrom(toPath(straightCoords)), 90);
        const dist = distanceKm(fromCords, toCords).toFixed(1);
        setTrip({ min: Math.max(1, Math.round((parseFloat(dist) / 30) * 60)), km: dist });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapLoaded, fromCords, toCords]);

  return (
    <div className="relative hidden flex-1 sm:block">
      <div ref={containerRef} className="h-full w-full" />

      <div className="animate-fade-in glass pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground shadow-soft">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        City mobility, reimagined
      </div>

      {trip && (
        <div className="animate-fade-up glass absolute bottom-5 left-5 rounded-2xl border border-border px-4 py-3 shadow-floating">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
            Estimated trip
          </p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {trip.min} min <span className="text-muted">· {trip.km} km</span>
          </p>
        </div>
      )}
    </div>
  );
}
