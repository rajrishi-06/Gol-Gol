import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { reverseGeocode } from "../hooks/useGeocode";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;
mapboxgl.accessToken = MAPBOX_TOKEN;

const RightMapPanel = ({ fromLocation, toLocation, setFromLocation, setToLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const fromMarkerRef = useRef(null);
  const toMarkerRef = useRef(null);
  const clickCountRef = useRef(0);

  useEffect(() => {
    mapInstanceRef.current = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [88.3639, 22.5726],
      zoom: 5.5,
    });

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      mapInstanceRef.current.setCenter([longitude, latitude]);
      mapInstanceRef.current.setZoom(14);
      const location = await reverseGeocode(latitude, longitude);
      setFromLocation(location);
      fromMarkerRef.current = new mapboxgl.Marker({ color: "green" })
        .setLngLat([longitude, latitude])
        .addTo(mapInstanceRef.current);
    });

    mapInstanceRef.current.on("click", async (e) => {
      const { lng, lat } = e.lngLat;
      const location = await reverseGeocode(lat, lng);

      if (clickCountRef.current % 2 === 0) {
        setFromLocation(location);
        if (fromMarkerRef.current) fromMarkerRef.current.remove();
        fromMarkerRef.current = new mapboxgl.Marker({ color: "green" })
          .setLngLat([lng, lat])
          .addTo(mapInstanceRef.current);
      } else {
        setToLocation(location);
        if (toMarkerRef.current) toMarkerRef.current.remove();
        toMarkerRef.current = new mapboxgl.Marker({ color: "red" })
          .setLngLat([lng, lat])
          .addTo(mapInstanceRef.current);
      }
      clickCountRef.current++;
    });

    return () => {
      mapInstanceRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (fromLocation && mapInstanceRef.current) {
      if (fromMarkerRef.current) fromMarkerRef.current.remove();
      fromMarkerRef.current = new mapboxgl.Marker({ color: "green" })
        .setLngLat([fromLocation.lng, fromLocation.lat])
        .addTo(mapInstanceRef.current);
    }
  }, [fromLocation]);

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

