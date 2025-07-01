import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { io } from "socket.io-client";
import { supabase } from "../server/supabase";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
const socket = io("http://localhost:3001");

const RideTrackingMap = ({ userId, userType }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarker = useRef(null);
  const pickupMarker = useRef(null);

  const [pickup, setPickup] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  // Fetch pickup location from supabase
  useEffect(() => {
    const fetchPickup = async () => {
      const { data, error } = await supabase
        .from("pending_req")
        .select("pick_lat, pick_lng")
        .eq("user_id", userId)
        .single();

      if (data) {
        setPickup({ lat: data.pick_lat, lng: data.pick_lng });
      } else {
        console.log("No pickup data found");
      }
    };

    fetchPickup();
  }, [userId]);

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [78.4867, 17.3850],
      zoom: 13,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapReady(true);
    });

    return () => {
      map.remove();
    };
  }, []);

  // DRIVER: Emit location to socket and show on map
  useEffect(() => {
    if (!mapReady || userType !== "driver") return;

    const watchId = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;

      socket.emit("driverLocation", {
        passengerId: userId,
        lat: latitude,
        lng: longitude,
      });

      if (!mapRef.current) return;

      const lngLat = [longitude, latitude];
      if (!driverMarker.current) {
        driverMarker.current = new mapboxgl.Marker({ color: "blue" })
          .setLngLat(lngLat)
          .addTo(mapRef.current);
      } else {
        driverMarker.current.setLngLat(lngLat);
      }
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [mapReady, userType, userId]);

  // USER: Listen for driver's location
  useEffect(() => {
    if (!mapReady || userType !== "user") return;

    const eventKey = `driverLocation:${userId}`;
    socket.on(eventKey, ({ lat, lng }) => {
      setDriverLocation({ lat, lng });

      if (!mapRef.current) return;

      const lngLat = [lng, lat];
      if (!driverMarker.current) {
        driverMarker.current = new mapboxgl.Marker({ color: "blue" })
          .setLngLat(lngLat)
          .addTo(mapRef.current);
      } else {
        driverMarker.current.setLngLat(lngLat);
      }
    });

    return () => {
      socket.off(eventKey);
    };
  }, [mapReady, userType, userId]);

  // Show pickup marker
  useEffect(() => {
    if (!mapReady || !pickup || !mapRef.current) return;

    const lngLat = [pickup.lng, pickup.lat];

    if (!pickupMarker.current) {
      pickupMarker.current = new mapboxgl.Marker({ color: "green" })
        .setLngLat(lngLat)
        .addTo(mapRef.current);
    } else {
      pickupMarker.current.setLngLat(lngLat);
    }

    // Center on pickup
    mapRef.current.flyTo({ center: lngLat, zoom: 13 });
  }, [mapReady, pickup]);

  console.log("Driver Location:", driverLocation);
  if (userType === "user" && !driverLocation) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center text-lg text-gray-600">
        🚕 Searching for drivers...
      </div>
    );
  }else{

  return <div ref={mapContainerRef} className="w-full h-[500px] rounded-xl shadow-lg" />;}
};

export default RideTrackingMap;
