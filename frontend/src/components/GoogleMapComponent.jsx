import React, { useEffect, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "100%", // 🔥 This makes it fill the parent div
};

const GoogleMapComponent = () => {
  const [userLocation, setUserLocation] = useState(null);
  const [error, setError] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setError("Permission denied or unable to get location.");
      }
    );
  }, []);

  if (!isLoaded) return null;
  if (error) return null;
  if (!userLocation) return null;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={userLocation}
      zoom={16}
    >
      <Marker position={userLocation} />
    </GoogleMap>
  );
};

export default GoogleMapComponent;
