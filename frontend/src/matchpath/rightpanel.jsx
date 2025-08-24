
import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { reverseGeocode } from "./useGeocode";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;
mapboxgl.accessToken = MAPBOX_TOKEN;

const RightMapPanel = ({
  fromLocation,
  toLocation,
  setFromLocation,
  setToLocation,
  activeInput,
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const fromMarkerRef = useRef(null);
  const toMarkerRef = useRef(null);
  const activeInputRef = useRef(activeInput);

  // Keep track of latest active input
  useEffect(() => {
    activeInputRef.current = activeInput;
  }, [activeInput]);

  // Initialize map once DOM is ready
  useEffect(() => {
    if (!mapRef.current) return; // Prevent null container error

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [88.3639, 22.5726], // Initial center
      zoom: 5.5,
    });

    mapInstanceRef.current = map;

    // Get user's location and set marker
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setCenter([longitude, latitude]);
      map.setZoom(14);

      const location = await reverseGeocode(latitude, longitude);
      setFromLocation(location);

      fromMarkerRef.current = new mapboxgl.Marker({ color: "green" })
        .setLngLat([longitude, latitude])
        .addTo(map);
    });

    // Click handler to place markers
    const handleMapClick = async (e) => {
      const { lng, lat } = e.lngLat;
      const location = await reverseGeocode(lat, lng);
      const inputType = activeInputRef.current;

      console.log("Map clicked:", inputType, location);

      if (inputType === "from") {
        setFromLocation(location);
        if (fromMarkerRef.current) fromMarkerRef.current.remove();
        fromMarkerRef.current = new mapboxgl.Marker({ color: "green" })
          .setLngLat([lng, lat])
          .addTo(map);
      } else if (inputType === "to") {
        setToLocation(location);
        if (toMarkerRef.current) toMarkerRef.current.remove();
        toMarkerRef.current = new mapboxgl.Marker({ color: "red" })
          .setLngLat([lng, lat])
          .addTo(map);
      }
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
      map.remove();
    };
  }, []); // run once after mount

  // Re-render FROM marker when fromLocation changes
  useEffect(() => {
    if (fromLocation && mapInstanceRef.current) {
      if (fromMarkerRef.current) fromMarkerRef.current.remove();
      fromMarkerRef.current = new mapboxgl.Marker({ color: "green" })
        .setLngLat([fromLocation.lng, fromLocation.lat])
        .addTo(mapInstanceRef.current);
    }
  }, [fromLocation]);

  // Re-render TO marker when toLocation changes
  useEffect(() => {
    if (toLocation && mapInstanceRef.current) {
      if (toMarkerRef.current) toMarkerRef.current.remove();
      toMarkerRef.current = new mapboxgl.Marker({ color: "red" })
        .setLngLat([toLocation.lng, toLocation.lat])
        .addTo(mapInstanceRef.current);
    }
  }, [toLocation]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
};

export default RightMapPanel;
