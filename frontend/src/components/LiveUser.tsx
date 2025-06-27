import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../server/supabase";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

interface LiveUserProps {
  UserId: string;
}

const LiveUser: React.FC<LiveUserProps> = ({ UserId }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch all drivers' locations
  const fetchDriverLocations = async (): Promise<{ lat: number; lng: number }[]> => {
    const { data, error } = await supabase
      .from("driver_loc")
      .select("latitude, longitude");

    if (error) {
      console.error("Error fetching driver locations:", error);
      return [];
    }

    return data.map((d) => ({
      lat: d.latitude,
      lng: d.longitude,
    }));
  };

  // Show car icons for drivers
  const updateDriverMarkers = async () => {
    if (!mapRef.current) return;

    // Remove old markers
    driverMarkersRef.current.forEach((marker) => marker.remove());
    driverMarkersRef.current = [];

    const drivers = await fetchDriverLocations();

    drivers.forEach(({ lat, lng }) => {
      const carIcon = document.createElement("img");
      carIcon.src = "/car_icon.png";
      carIcon.style.width = "32px";
      carIcon.style.height = "32px";

      const marker = new mapboxgl.Marker(carIcon)
        .setLngLat([lng, lat])
        .addTo(mapRef.current!);

      driverMarkersRef.current.push(marker);
    });
  };

  // Show red marker for this user only
  const updateUserMarker = (lat: number, lng: number) => {
    if (!mapRef.current) return;

    const el = document.createElement("div");
    el.style.width = "12px";
    el.style.height = "12px";
    el.style.borderRadius = "50%";
    el.style.backgroundColor = "red";

    // remove old one if exists
    userMarkerRef.current?.remove();

    userMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .addTo(mapRef.current!);
  };

  // Track user's own live location and update DB
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude, longitude } }) => {
        const newCoords = { lat: latitude, lng: longitude };
        setCoords(newCoords);

        // Upsert own location to userlive_loc
        const upsertLocation = async () => {
          if (!UserId) return;
          const { error } = await supabase.from("userlive_loc").upsert(
            {
              user_id: UserId,
              latitude,
              longitude,
              time: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

          if (error) {
            console.error("Supabase upsert error:", error);
          }
        };
        upsertLocation();

        // Initialize map once
        if (!mapRef.current && mapContainerRef.current) {
          const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center: [longitude, latitude],
            zoom: 13,
          });
          mapRef.current = map;

          // After map loads, show other markers
          map.on("load", () => {
            updateDriverMarkers();
            updateUserMarker(latitude, longitude);
          });
        } else {
          // Update own red marker
          updateUserMarker(latitude, longitude);
        }
      },
      (err) => {
        console.error("Location error:", err);
        alert("Failed to get your live location.");
      },
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [UserId]);

  // Periodically update all drivers' car icons
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const initializeMarkers = async () => {
      if (!mapRef.current) return;

      await updateDriverMarkers(); // initial
      interval = setInterval(updateDriverMarkers, 10000); // every 10 sec
    };

    initializeMarkers();

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full">
      <div ref={mapContainerRef} className="w-full h-screen" />
    </div>
  );
};

export default LiveUser;
