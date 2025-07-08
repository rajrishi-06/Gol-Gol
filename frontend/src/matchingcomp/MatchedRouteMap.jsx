import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "../server/supabase";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

function MatchedRouteMap({ routeId }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [driverRoute, setDriverRoute] = useState(null);
  const [riderRoute, setRiderRoute] = useState(null);

  // Fetch route coordinates from Supabase
  useEffect(() => {
    const fetchRouteData = async () => {
      const { data, error } = await supabase
        .from("matched_routes")
        .select("*")
        .eq("id", routeId)
        .single();

      if (error) {
        console.error("Error fetching route:", error);
        return;
      }

      const driverStart = [data.driver_start_lng, data.driver_start_lat];
      const driverEnd = [data.driver_end_lng, data.driver_end_lat];
      const riderStart = [data.user_start_lng, data.user_start_lat];
      const riderEnd = [data.user_end_lng, data.user_end_lat];

      // Fetch routes
      const fetchRoute = async (start, end) => {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.join(",")};${end.join(",")}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
        const response = await fetch(url);
        const json = await response.json();
        return json.routes[0].geometry.coordinates;
      };

      const driverPath = await fetchRoute(driverStart, driverEnd);
      const riderPath = await fetchRoute(riderStart, riderEnd);

      setDriverRoute(driverPath);
      setRiderRoute(riderPath);
    };

    fetchRouteData();
  }, [routeId]);

  // Render map with paths
  useEffect(() => {
    if (!driverRoute || !riderRoute) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: driverRoute[0],
      zoom: 14,
    });

    const map = mapRef.current;

    map.on("load", () => {
      // Add both routes as sources
      map.addSource("driver-route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: driverRoute,
          },
        },
      });

      map.addLayer({
        id: "driver-route-line",
        type: "line",
        source: "driver-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#1E90FF",
          "line-width": 4,
        },
      });

      map.addSource("rider-route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: riderRoute,
          },
        },
      });

      map.addLayer({
        id: "rider-route-line",
        type: "line",
        source: "rider-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#FF4500",
          "line-width": 4,
        },
      });

      // Add markers at start and end points
     // Add colored markers
const markers = [
  { coords: driverRoute[0], color: "#1E90FF", label: "Driver Start" },
  { coords: driverRoute.at(-1), color: "#1E90FF", label: "Driver End" },
  { coords: riderRoute[0], color: "#FF4500", label: "Rider Start" },
  { coords: riderRoute.at(-1), color: "#FF4500", label: "Rider End" },
];

markers.forEach(({ coords, color, label }) => {
  const el = document.createElement("div");
  el.style.backgroundColor = color;
  el.style.width = "15px";
  el.style.height = "15px";
  el.style.borderRadius = "50%";
  el.style.border = "2px solid white";
  el.title = label;

  new mapboxgl.Marker(el).setLngLat(coords).addTo(map);
});

    });

    return () => map.remove();
  }, [driverRoute, riderRoute]);

  return (
 <div>
    <h3 className="text-lg font-bold mb-2">Matched Route Map</h3>
    <div className="h-[500px] w-full rounded-lg overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  </div>
  );
}

export default MatchedRouteMap;
