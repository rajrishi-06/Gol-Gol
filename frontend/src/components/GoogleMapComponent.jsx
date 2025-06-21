import React, { useEffect, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "100%",
};

const GoogleMapComponent = () => {
  const [userLocation, setUserLocation] = useState(null);
  const [address, setAddress] = useState("Fetching address...");
  const [error, setError] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, // <-- for Vite
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(coords);
        getAddress(coords);
        console.log("Latitude:", position.coords.latitude);
console.log("Longitude:", position.coords.longitude);
      },
      (err) => {
        console.error(err);
        setError("Permission denied or unable to get location.");
      }
    );
  }, []);

  const getAddress = async ({ lat, lng }) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      const result = data.results?.[0]?.formatted_address || "Unknown Location";
      setAddress(result);
    } catch (e) {
      console.error("Failed to fetch address:", e);
      setAddress("Unable to fetch address");
    }
  };

  if (!isLoaded) return <div>Loading Map...</div>;
  if (error) return <div>{error}</div>;
  if (!userLocation) return <div>Getting your location...</div>;

  return (
    <div style={{ width: "60vw", height: "400px", margin: "auto" }}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={userLocation}
        zoom={16}
      >
        <Marker position={userLocation} />
      </GoogleMap>
      <div style={{ padding: "1rem", textAlign: "center" }}>
        <strong>Your Location:</strong><br />
        {address}
      </div>
    </div>
  );
};

export default GoogleMapComponent;
