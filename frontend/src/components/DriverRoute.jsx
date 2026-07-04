import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { mapboxgl, MAP_STYLE } from "../lib/mapbox";
import { fetchRoute } from "../lib/geocoding";

// Deterministic palette for per-rider legs.
const RIDER_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
const colorFor = (i) => RIDER_COLORS[i % RIDER_COLORS.length];

/** Route geometry for a set of coordinates (safe wrapper around Directions). */
async function routeGeometry(coords) {
  if (coords.length < 2) return null;
  const route = await fetchRoute(coords);
  return route?.geometry ?? null;
}

/** Preview of a driver's full multi-rider route. Desktop-only enhancement. */
export default function DriverRoute({ ride }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!ride?.driver || !mapContainerRef.current) return;

    if (mapRef.current) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current.remove();
    }

    const driverStart = ride.driver?.driver_start;
    const driverEnd = ride.driver?.driver_end;
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE.streets,
      center: [driverStart?.lng || 77.209, driverStart?.lat || 28.6139],
      zoom: 11,
      attributionControl: false,
    });
    const map = mapRef.current;

    const addMarker = (color, coords, text) => {
      // setText (never setHTML) keeps user-supplied names from injecting markup.
      const marker = new mapboxgl.Marker({ color })
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(text))
        .addTo(map);
      markersRef.current.push(marker);
    };

    const draw = async () => {
      if (!driverStart?.lng || !driverEnd?.lng) return;
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([driverStart.lng, driverStart.lat]);
      bounds.extend([driverEnd.lng, driverEnd.lat]);
      addMarker("#2563eb", [driverStart.lng, driverStart.lat], "Driver start");
      addMarker("#7c3aed", [driverEnd.lng, driverEnd.lat], "Driver end");

      const pickups = [];
      const drops = [];
      (ride.riders || []).forEach((rider, i) => {
        const { pickup, drop } = rider;
        const name = rider.name && rider.name !== "undefined" ? rider.name : "Rider";
        if (pickup?.lng) {
          pickups.push([pickup.lng, pickup.lat]);
          bounds.extend([pickup.lng, pickup.lat]);
          addMarker("#16a34a", [pickup.lng, pickup.lat], `Pickup ${i + 1} · ${name}`);
        }
        if (drop?.lng) {
          drops.push([drop.lng, drop.lat]);
          bounds.extend([drop.lng, drop.lat]);
          addMarker("#dc2626", [drop.lng, drop.lat], `Drop ${i + 1} · ${name}`);
        }
        if (pickup?.lng && drop?.lng) {
          routeGeometry([[pickup.lng, pickup.lat], [drop.lng, drop.lat]]).then((geom) => {
            if (!geom || !map.getCanvas()) return;
            const id = `route-rider-${i}`;
            map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: geom } });
            map.addLayer({
              id,
              type: "line",
              source: id,
              paint: { "line-color": colorFor(i), "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.7 },
            });
          });
        }
      });

      const main = [[driverStart.lng, driverStart.lat], ...pickups, ...drops, [driverEnd.lng, driverEnd.lat]];
      const geom = await routeGeometry(main);
      if (map.getCanvas()) {
        const data = geom
          ? { type: "Feature", geometry: geom }
          : { type: "Feature", geometry: { type: "LineString", coordinates: main } };
        map.addSource("route-driver", { type: "geojson", data });
        map.addLayer({
          id: "route-driver",
          type: "line",
          source: "route-driver",
          paint: { "line-color": "#0f9b7f", "line-width": 6, "line-opacity": 0.85 },
        });
        if (geom?.coordinates) geom.coordinates.forEach((c) => bounds.extend(c));
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
    };

    map.on("load", draw);
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
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
