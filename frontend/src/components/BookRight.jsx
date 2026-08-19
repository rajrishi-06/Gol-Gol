import { useEffect, useRef, useState } from "react";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  drawRoutePolyline,
  boundsFrom,
  toPath,
  minZoomForRadius,
  restrictionAround,
} from "../lib/googlemaps";
import { fetchRoute } from "../lib/geocoding";
import MapFallback from "./MapFallback";

/** Route preview map for the booking screen. */
export default function BookRight({ fromCords, toCords }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const routeRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!fromCords) return;
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        if (!cancelled) setMapFailed(true);
        return;
      }
      if (cancelled || !mapContainer.current) return;

      if (!mapRef.current) {
        mapRef.current = createMap(mapContainer.current, {
          center: { lat: fromCords.lat, lng: fromCords.lng },
          zoom: 12,
          restriction: restrictionAround(fromCords.lat, fromCords.lng, 100),
          minZoom: minZoomForRadius(fromCords.lat, 100),
        });
      }
      const map = mapRef.current;

      createImageMarker({ iconPath: "/icons/pickup.svg", position: { lat: fromCords.lat, lng: fromCords.lng }, map, size: 48, title: "Pickup" });
      if (!toCords) return;
      createImageMarker({ iconPath: "/icons/destination.svg", position: { lat: toCords.lat, lng: toCords.lng }, map, size: 48, title: "Drop" });

      try {
        const route = await fetchRoute([
          [fromCords.lng, fromCords.lat],
          [toCords.lng, toCords.lat],
        ]);
        if (!route?.geometry || cancelled) return;
        routeRef.current?.setMap(null);
        routeRef.current = drawRoutePolyline(map, route.geometry.coordinates, { width: 5, animate: true });
        map.fitBounds(boundsFrom(toPath(route.geometry.coordinates)), 64);
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
      {mapFailed ? <MapFallback /> : <div ref={mapContainer} className="h-full w-full" />}
    </div>
  );
}
