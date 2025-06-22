// import React, { useEffect, useState } from "react";
// import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

// const containerStyle = {
//   width: "100%",
//   height: "100%", 
// };

// const GoogleMapComponent = () => {
//   const [userLocation, setUserLocation] = useState(null);
//   const [address, setAddress] = useState("Fetching your address...");
//   const [error, setError] = useState(null);

//   const { isLoaded } = useJsApiLoader({
//     googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
//   });

//  useEffect(() => {
//   if (!navigator.geolocation) {
//     setError("Geolocation not supported.");
//     return;
//   }

//   const watchId = navigator.geolocation.watchPosition(
//     (position) => {
//       const coords = {
//         lat: position.coords.latitude,
//         lng: position.coords.longitude,
//       };
//       console.log("📍 GPS Location:", coords, "Accuracy:", position.coords.accuracy);
//       setUserLocation(coords);
//       getAddress(coords);
//     },
//     (err) => {
//       console.error("❌ Error:", err);
//       setError("Location fetch failed.");
//     },
//     {
//       enableHighAccuracy: true,
//       timeout: 15000,
//       maximumAge: 0,
//     }
//   );

//   return () => navigator.geolocation.clearWatch(watchId);
// }, []);


//   const getAddress = async ({ lat, lng }) => {
//     try {
//       const response = await fetch(
//         `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
//       );
//       const data = await response.json();
//       const formatted = data.results?.[0]?.formatted_address;
//       setAddress(formatted || "Unknown address");
//     } catch (err) {
//       console.error("Geocoding failed:", err);
//       setAddress("Unable to fetch address");
//     }
//   };

//   if (!isLoaded || !userLocation) return <div>Loading map...</div>;
//   if (error) return <div>{error}</div>;

//   return (
//     <div style={{ width: "100%", height: "100%" }}>
//       <GoogleMap
//         mapContainerStyle={containerStyle}
//         center={userLocation}
//         zoom={16}
//       >
//         <Marker position={userLocation} />
//       </GoogleMap>
//       <div style={{ padding: "1rem", textAlign: "center", fontWeight: "bold" }}>
//         📍 Your current address:<br />{address}
//       </div>
//     </div>
//   );
// };

// export default GoogleMapComponent;




import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '8px', // Added some style
  boxShadow: '0 4px 8px rgba(0,0,0,0.1)' // Added some style
};

const defaultCenter = {
  lat: 17.0000, // Example: Latitude for Kakinada
  lng: 81.0000  // Example: Longitude for Kakinada
};

function MyLocationMap() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey:import.meta.env.VITE_GOOGLE_MAPS_API_KEY // <<< REPLACE WITH YOUR API KEY
  });

  const [map, setMap] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [geolocationError, setGeolocationError] = useState(null);
  const [mapMessage, setMapMessage] = useState('Loading map...'); // For user feedback

  const mapRef = useRef(null);

  const onLoad = useCallback(function callback(mapInstance) {
    mapRef.current = mapInstance;
    setMap(mapInstance);
    setMapMessage('Map loaded. Attempting to get your location...');

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentLocation(pos);
          mapInstance.setCenter(pos);
          mapInstance.setZoom(14);
          setGeolocationError(null); // Clear any previous error
          setMapMessage('Your current location found!');
        },
        (error) => {
          // Geolocation error handler
          let errorMessage = 'Geolocation service failed.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied by the user. Please enable location permissions for this site.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage = 'The request to get user location timed out.';
              break;
            case error.UNKNOWN_ERROR:
              errorMessage = 'An unknown error occurred during geolocation.';
              break;
          }
          setGeolocationError(errorMessage);
          setCurrentLocation(defaultCenter);
          mapInstance.setCenter(defaultCenter);
          mapInstance.setZoom(10);
          setMapMessage('Displaying default location.');
          console.error('Geolocation Error:', errorMessage, error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options for getCurrentPosition
      );
    } else {
      // Browser doesn't support Geolocation
      const errorMessage = 'Your browser doesn\'t support Geolocation.';
      setGeolocationError(errorMessage);
      setCurrentLocation(defaultCenter);
      mapInstance.setCenter(defaultCenter);
      mapInstance.setZoom(10);
      setMapMessage('Displaying default location.');
      console.error('Geolocation Error:', errorMessage);
    }
  }, []); // Empty dependency array means this callback is created once

  const onUnmount = useCallback(function callback(mapInstance) {
    setMap(null);
    mapRef.current = null;
    setMapMessage('Map unmounted.');
  }, []);

  // Effect to handle loading errors for the Google Maps API script itself
  useEffect(() => {
    if (loadError) {
      setMapMessage(`Error loading Google Maps: ${loadError.message}`);
      console.error('Google Maps API Load Error:', loadError);
    } else if (isLoaded) {
      setMapMessage('Google Maps API loaded. Awaiting map instance...');
    }
  }, [isLoaded, loadError]);


  if (loadError) return <div>Error loading maps: {loadError.message}</div>;
  if (!isLoaded) return <div>{mapMessage}</div>; // Show loading message during API script load

  return (
    <div>
     

      <GoogleMap
        mapContainerStyle={containerStyle}
        center={currentLocation || defaultCenter}
        zoom={currentLocation ? 14 : 10}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {currentLocation && (
          <Marker
            position={currentLocation}
            
          />
        )}
      </GoogleMap>
    </div>
  );
}

export default MyLocationMap;