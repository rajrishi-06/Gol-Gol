// import React, { useState } from 'react';
// import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

// const containerStyle = {
//   width: '100%',
//   height: '400px',
// };

// function MyMap() {
//   const [location, setLocation] = useState({ lat: 28.6139, lng: 77.2090 }); // default Delhi

//   // Get user location
//   navigator.geolocation.getCurrentPosition((pos) => {
//     const { latitude, longitude } = pos.coords;
//     setLocation({ lat: latitude, lng: longitude });
//   });

//   return (
//     <LoadScript googleMapsApiKey="AIzaSyBV6FqeZZSkYLLB7-tshLTF9qg4QCsPls4">
//       <GoogleMap
//         mapContainerStyle={containerStyle}
//         center={location}
//         zoom={14}
//       >
//         <Marker position={location} />
//       </GoogleMap>
//     </LoadScript>
//   );
// }

// export default MyMap;


import React, { useState, useCallback } from 'react';
import {
  GoogleMap,
  LoadScript,
  Marker,
  DirectionsRenderer,
  Autocomplete
} from '@react-google-maps/api';

const containerStyle = { width: '100%', height: '500px' };

const center = { lat: 28.6139, lng: 77.2090 }; // Delhi default


const Map = () => {
  const [map, setMap] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [directions, setDirections] = useState(null);
  const [autocomplete, setAutocomplete] = useState(null);

  const onLoad = useCallback((mapInstance) => setMap(mapInstance), []);
  const onAutoCompleteLoad = (autoC) => setAutocomplete(autoC);

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      const location = place.geometry.location;
      setDestination({ lat: location.lat(), lng: location.lng() });
    }
  };

  // get user location
  React.useEffect(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setPickup({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    });
  }, []);

  // Calculate directions
  React.useEffect(() => {
    if (pickup && destination) {
      const service = new window.google.maps.DirectionsService();
      service.route(
        {
          origin: pickup,
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK") setDirections(result);
        }
      );
    }
  }, [pickup, destination]);

  return (
    <LoadScript
      googleMapsApiKey="AIzaSyBV6FqeZZSkYLLB7-tshLTF9qg4QCsPls4"
      libraries={['places']}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={pickup || center}
        zoom={14}
        onLoad={onLoad}
      >
        {pickup && <Marker position={pickup} />}
        {destination && <Marker position={destination} />}
        {directions && <DirectionsRenderer directions={directions} />}

        <Autocomplete onLoad={onAutoCompleteLoad} onPlaceChanged={onPlaceChanged}>
          <input
            type="text"
            placeholder="Enter destination"
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              padding: '8px',
              width: '300px'
            }}
          />
        </Autocomplete>
      </GoogleMap>
    </LoadScript>
  );
};

export default Map;
