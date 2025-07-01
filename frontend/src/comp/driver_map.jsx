import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "../server/supabase";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

const DriverMap = () => {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Step 1: Get user's current location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      (err) => {
        console.error("Geolocation error:", err);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  // Step 2: Fetch all pending_req from Supabase
  useEffect(() => {
    const fetchRequests = async () => {
      const { data, error } = await supabase.from("pending_req").select("*");
      if (error) {
        console.error("Error fetching requests:", error.message);
      } else {
        setPendingRequests(data);
      }
    };

    fetchRequests();
  }, []);

  // Step 3: Initialize map after userLocation is available
  useEffect(() => {
    if (!userLocation || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [userLocation.lng, userLocation.lat],
      zoom: 13,
    });

    mapRef.current = map;

    // 🚗 Marker for current user
    const carMarker = document.createElement("div");
    carMarker.innerHTML = "🚗"; // You can use a car SVG here
    carMarker.style.fontSize = "24px";

    new mapboxgl.Marker(carMarker)
      .setLngLat([userLocation.lng, userLocation.lat])
      .setPopup(new mapboxgl.Popup().setText("You are here 🚗"))
      .addTo(map);

    // 📍Markers for each pending ride
    pendingRequests.forEach((req) => {
      const markerEl = document.createElement("div");
      markerEl.style.backgroundColor = "#f87171"; // red-ish
      markerEl.style.width = "12px";
      markerEl.style.height = "12px";
      markerEl.style.borderRadius = "50%";

      new mapboxgl.Marker(markerEl)
        .setLngLat([req.pick_lng, req.pick_lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(`
            <strong>Pending Request</strong><br/>
            User ID: ${req.user_id}<br/>
            Ride ID: ${req.ride_id}
          `)
        )
        .addTo(map);
    });

    return () => map.remove(); // Cleanup on unmount
  }, [userLocation, pendingRequests]);

  return (
    <div className="w-full h-[500px] " ref={mapContainer} />
  );
};

export default DriverMap;
