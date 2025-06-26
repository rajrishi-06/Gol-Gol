import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../server/supabase";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

interface LiveUserCarProps {
  UserId: string;
}

const LiveUserCar: React.FC<LiveUserCarProps> = ({ UserId }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const passengerMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  //  Fetch all passengers' live locations
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

  //  Update red passenger markers
  const updatePassengerMarkers = async () => {
    if (!mapRef.current) return;

    // Remove old markers
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

  //  Handle user's (driver's) own live location
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude, longitude } }) => {
        const newCoords = { lat: latitude, lng: longitude };
        setCoords(newCoords);

        //  Insert/update driver's live location
        const upsertDriverLocation = async () => {
          if (!UserId) return;

          const { error } = await supabase.from("driver_lis").upsert(
  {
    user_id: UserId,
    latitude,
    longitude,
     time: new Date().toISOString()
  },
  { onConflict: "user_id" }
);

          if (error) {
            console.error("Supabase driver location error:", error);
          }
        };
        upsertDriverLocation();

      
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
  }, [UserId]); // important: re-run if userId changes

  //  Periodically update passenger markers
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const initializeMarkersAfterMapReady = async () => {
      // wait for map to load first
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

      await updatePassengerMarkers(); // initial fetch

      interval = setInterval(updatePassengerMarkers, 10000); // update every 10 sec
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
