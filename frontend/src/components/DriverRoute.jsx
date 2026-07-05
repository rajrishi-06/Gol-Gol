import { useEffect, useRef } from "react";
import {
  loadGoogleMaps,
  createMap,
  drawRoutePolyline,
  boundsFrom,
} from "../lib/googlemaps";
import { fetchRoute } from "../lib/geocoding";

// Deterministic palette for per-rider legs.
const RIDER_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
const colorFor = (i) => RIDER_COLORS[i % RIDER_COLORS.length];

/** A small colored dot marker (XSS-safe: name goes in the native `title` tooltip). */
function dotMarker(map, color, position, title) {
  const g = window.google.maps;
  return new g.Marker({
    position,
    map,
    title,
    icon: {
      path: g.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    },
  });
}

/** Route geometry (GeoJSON coordinates) for a set of `[lng,lat]` points. */
async function routeCoords(coords) {
  if (coords.length < 2) return null;
  const route = await fetchRoute(coords);
  return route?.geometry?.coordinates ?? null;
}

/** Preview of a driver's full multi-rider route. Desktop-only enhancement. */
export default function DriverRoute({ ride }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  useEffect(() => {
    if (!ride?.driver || !mapContainerRef.current) return;
    let cancelled = false;

    const clearOverlays = () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
    };

    (async () => {
      await loadGoogleMaps();
      if (cancelled || !mapContainerRef.current) return;

      const driverStart = ride.driver?.driver_start;
      const driverEnd = ride.driver?.driver_end;

      if (!mapRef.current) {
        mapRef.current = createMap(mapContainerRef.current, {
          center: { lat: driverStart?.lat || 28.6139, lng: driverStart?.lng || 77.209 },
          zoom: 11,
        });
      }
      const map = mapRef.current;
      clearOverlays();

      if (!driverStart?.lng || !driverEnd?.lng) return;
      const boundsPts = [
        { lat: driverStart.lat, lng: driverStart.lng },
        { lat: driverEnd.lat, lng: driverEnd.lng },
      ];
      overlaysRef.current.push(dotMarker(map, "#2563eb", boundsPts[0], "Driver start"));
      overlaysRef.current.push(dotMarker(map, "#7c3aed", boundsPts[1], "Driver end"));

      const pickups = [];
      const drops = [];
      (ride.riders || []).forEach((rider, i) => {
        const { pickup, drop } = rider;
        const name = rider.name && rider.name !== "undefined" ? rider.name : "Rider";
        if (pickup?.lng) {
          pickups.push([pickup.lng, pickup.lat]);
          boundsPts.push({ lat: pickup.lat, lng: pickup.lng });
          overlaysRef.current.push(dotMarker(map, "#16a34a", { lat: pickup.lat, lng: pickup.lng }, `Pickup ${i + 1} · ${name}`));
        }
        if (drop?.lng) {
          drops.push([drop.lng, drop.lat]);
          boundsPts.push({ lat: drop.lat, lng: drop.lng });
          overlaysRef.current.push(dotMarker(map, "#dc2626", { lat: drop.lat, lng: drop.lng }, `Drop ${i + 1} · ${name}`));
        }
        if (pickup?.lng && drop?.lng) {
          routeCoords([[pickup.lng, pickup.lat], [drop.lng, drop.lat]]).then((coordsArr) => {
            if (!coordsArr || cancelled) return;
            overlaysRef.current.push(
              drawRoutePolyline(map, coordsArr, { color: colorFor(i), width: 3, opacity: 0.7 })
            );
          });
        }
      });

      const main = [
        [driverStart.lng, driverStart.lat],
        ...pickups,
        ...drops,
        [driverEnd.lng, driverEnd.lat],
      ];
      const coordsArr = await routeCoords(main);
      if (cancelled) return;
      const line = coordsArr || main;
      overlaysRef.current.push(drawRoutePolyline(map, line, { color: "#0f9b7f", width: 6, opacity: 0.85 }));
      line.forEach(([lng, lat]) => boundsPts.push({ lat, lng }));

      if (boundsPts.length) map.fitBounds(boundsFrom(boundsPts), 60);
    })();

    return () => {
      cancelled = true;
      clearOverlays();
    };
  }, [ride]);

  if (!ride?.driver) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-2 text-muted">
        No ride selected
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      <div className="glass absolute left-4 top-4 rounded-2xl border border-border px-4 py-3 shadow-floating">
        <p className="text-sm font-semibold text-foreground">Shared route</p>
        <p className="text-xs text-muted">{ride.riders?.length || 0} rider(s) on this trip</p>
      </div>
    </div>
  );
}
