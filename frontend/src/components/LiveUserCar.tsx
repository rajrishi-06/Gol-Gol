

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../server/supabase";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

const LiveUserCar: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const passengerMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch data from Supabase live_locations table
  const fetchPassengerLocations = async (): Promise<{ lat: number; lng: number }[]> => {
    const { data, error } = await supabase
      .from("userlive_loc")
      .select("latitude, longitude");

    if (error) {
      console.error("Error fetching passenger locations:", error);
      return [];
    }

    return data.map((d) => ({
      lat: d.latitude,
      lng: d.longitude,
    }));
  };

  //  Update blue circle markers on map
  const updatePassengerMarkers = async () => {
    if (!mapRef.current) return;

    // Remove previous markers
    passengerMarkersRef.current.forEach((marker) => marker.remove());
    passengerMarkersRef.current = [];

    const passengers = await fetchPassengerLocations();

    passengers.forEach(({ lat, lng }) => {
      const el = document.createElement("div");
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = "red"; 

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(mapRef.current!);

      passengerMarkersRef.current.push(marker);
    });
  };

  //  Handle user's (car) live location
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude, longitude } }) => {
        const newCoords = { lat: latitude, lng: longitude };
        setCoords(newCoords);

        if (!mapRef.current && mapContainerRef.current) {
          const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center: [longitude, latitude],
            zoom: 13,
          });

          mapRef.current = map;

          const carIcon = document.createElement("img");
          carIcon.src = "/car_icon.png";
          carIcon.style.width = "32px";
          carIcon.style.height = "32px";

          carMarkerRef.current = new mapboxgl.Marker(carIcon)
            .setLngLat([longitude, latitude])
            .addTo(map);
        } else {
          carMarkerRef.current?.setLngLat([longitude, latitude]);
        }
      },
      (err) => {
        console.error("Error getting location:", err);
        alert("Failed to get live location.");
      },
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  //  Periodically refresh passenger locations
 useEffect(() => {
  let interval: NodeJS.Timeout;

  const initializeMarkersAfterMapReady = async () => {
    // Wait for map to be ready before adding markers
    if (!mapRef.current) {
      await new Promise((resolve) => {
        const checkMapReady = setInterval(() => {
          if (mapRef.current?.loaded()) {
            clearInterval(checkMapReady);
            resolve(true);
          }
        }, 200);
      });
    }

    await updatePassengerMarkers(); //  Show markers immediately after map is ready

    interval = setInterval(updatePassengerMarkers, 10000); // then every 10 sec
  };

  initializeMarkersAfterMapReady();

  return () => clearInterval(interval);
}, []);


  return (
    <div className="w-full h-full">
      <div ref={mapContainerRef} className="w-full h-screen" />
    </div>
  );
};

export default LiveUserCar;

