import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { mapboxgl, MAP_STYLE, createImageMarker } from "../lib/mapbox";
import { fetchRoute } from "../lib/geocoding";

/** Route preview map for the booking screen. */
export default function BookRight({ fromCords, toCords }) {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (map.current || !fromCords) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE.streets,
      center: [fromCords.lng, fromCords.lat],
      zoom: 12,
      attributionControl: false,
    });

    map.current.on("load", async () => {
      if (!fromCords || !toCords) return;
      createImageMarker({ iconPath: "/icons/pickup.svg", coords: [fromCords.lng, fromCords.lat], map: map.current, size: 48 });
      createImageMarker({ iconPath: "/icons/destination.svg", coords: [toCords.lng, toCords.lat], map: map.current, size: 48 });

      try {
        const route = await fetchRoute([
          [fromCords.lng, fromCords.lat],
          [toCords.lng, toCords.lat],
        ]);
        if (!route) return;
        const geojson = { type: "Feature", properties: {}, geometry: route.geometry };
        if (map.current.getSource("route")) {
          map.current.getSource("route").setData(geojson);
        } else {
          map.current.addLayer({
            id: "route",
            type: "line",
            source: { type: "geojson", data: geojson },
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#0f9b7f", "line-width": 5, "line-opacity": 0.85 },
          });
        }
        const bounds = new mapboxgl.LngLatBounds();
        route.geometry.coordinates.forEach((c) => bounds.extend(c));
        map.current.fitBounds(bounds, { padding: 64 });
      } catch {
        /* route preview is non-critical */
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [fromCords, toCords]);

  return (
    <div className="relative hidden flex-1 sm:block">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
