import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { io } from "socket.io-client";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
const socket = io("http://localhost:3001");

const DeliveryApp = ({ deliveryId, pickupLocation }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const markerRef = useRef(null);
  const [location, setLocation] = useState(null);
  const routeId = "delivery-route";

  // ✅ drawRoute ONLY after map is fully loaded
  const drawRoute = async (start, end, mapInstance) => {
    const query = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
    );
    const data = await query.json();
    const route = data.routes[0].geometry;

    if (mapInstance.getSource(routeId)) {
      mapInstance.getSource(routeId).setData(route);
    } else {
      mapInstance.addSource(routeId, {
        type: "geojson",
        data: route,
      });

      mapInstance.addLayer({
        id: routeId,
        type: "line",
        source: routeId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ff3300",
          "line-width": 5,
        },
      });
    }
  };

  // Watch and update delivery location
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setLocation(coords);
        
        setInterval(() => {
 socket.emit("location-update", { deliveryId, coords });
}, 9000); 

      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Initialize Map only when location is available
  useEffect(() => {
    if (!location) return;

    const mapInstance = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [location.lng, location.lat],
      zoom: 14,
    });

    mapInstance.on("load", () => {
      setMap(mapInstance);

      // 🟥 Add delivery boy marker
      markerRef.current = new mapboxgl.Marker({ color: "red" })
        .setLngLat([location.lng, location.lat])
        .setPopup(new mapboxgl.Popup().setText("You (Delivery Boy)"))
        .addTo(mapInstance);

      // 🟩 Add pickup marker
      new mapboxgl.Marker({ color: "green" })
        .setLngLat([pickupLocation.lng, pickupLocation.lat])
        .setPopup(new mapboxgl.Popup().setText("Pickup Location"))
        .addTo(mapInstance);

      // 🚗 Draw route
      drawRoute(location, pickupLocation, mapInstance);
    });

    return () => mapInstance.remove();
  }, [location]);

  // Update location + redraw route
  useEffect(() => {
    if (!map || !location || !map.isStyleLoaded()) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([location.lng, location.lat]);
      map.panTo([location.lng, location.lat]);
    }

    drawRoute(location, pickupLocation, map);
  }, [location, map]);

  return (
   <div className="flex flex-col w-full h-full">
  <h3 className="text-center text-lg font-semibold py-2">📦 Navigate to Pickup</h3>
  <div ref={mapRef} className="flex-1 w-full h-500px" />
</div>
  );
};

export default DeliveryApp;



// import React, { useEffect, useRef, useState } from "react";
// import mapboxgl from "mapbox-gl";
// import { io } from "socket.io-client";

// mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
// const socket = io("http://localhost:3001");

// const DeliveryApp = ({ deliveryId, pickupLocation }) => {
//   const mapRef = useRef(null);
//   const [map, setMap] = useState(null);
//   const markerRef = useRef(null);

//   const [location, setLocation] = useState(null);
//   const [destination, setDestination] = useState(pickupLocation); 
//   const [rideStarted, setRideStarted] = useState(false);
//   const routeId = "delivery-route";

//   const drawRoute = async (start, end, mapInstance) => {
//     if (!start || !end) return;
//     const query = await fetch(
//       `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
//     );
//     const data = await query.json();
//     const route = data.routes[0]?.geometry;
//     if (!route) return;

//     if (mapInstance.getSource(routeId)) {
//       mapInstance.getSource(routeId).setData(route);
//     } else {
//       mapInstance.addSource(routeId, {
//         type: "geojson",
//         data: route,
//       });

//       mapInstance.addLayer({
//         id: routeId,
//         type: "line",
//         source: routeId,
//         layout: {
//           "line-join": "round",
//           "line-cap": "round",
//         },
//         paint: {
//           "line-color": "#ff3300",
//           "line-width": 5,
//         },
//       });
//     }
//   };

//   // 🔄 Watch driver location
//  useEffect(() => {
//   const watchId = navigator.geolocation.watchPosition(
//     (pos) => {
//       const coords = {
//         lat: pos.coords.latitude,
//         lng: pos.coords.longitude,
//       };

//       setLocation(coords);

//       // ✅ Emit socket message every time location updates
//       socket.emit("location-update", { deliveryId, coords });

//       // ✅ Optional: log for confirmation
//       console.log("📡 Sent location to server:", coords);
//     },
//     (err) => {
//       console.error("❌ Geolocation error:", err);
//     },
//     {
//       enableHighAccuracy: true,
//       maximumAge: 0,
//       timeout: 10000,
//     }
//   );

//   return () => {
//     navigator.geolocation.clearWatch(watchId);
//   };
// }, []);


//   // 🗺️ Initialize map on first location
//   useEffect(() => {
//     if (!location) return;

//     const mapInstance = new mapboxgl.Map({
//       container: mapRef.current,
//       style: "mapbox://styles/mapbox/streets-v12",
//       center: [location.lng, location.lat],
//       zoom: 14,
//     });

//     mapInstance.on("load", () => {
//       setMap(mapInstance);

//       // Red marker for driver
//       markerRef.current = new mapboxgl.Marker({ color: "red" })
//         .setLngLat([location.lng, location.lat])
//         .setPopup(new mapboxgl.Popup().setText("You (Delivery Boy)"))
//         .addTo(mapInstance);

//       // Green/Blue marker for destination
//       new mapboxgl.Marker({ color: "green" })
//         .setLngLat([pickupLocation.lng, pickupLocation.lat])
//         .setPopup(new mapboxgl.Popup().setText("Pickup Location"))
//         .addTo(mapInstance);

//       drawRoute(location, pickupLocation, mapInstance);
//     });

//     return () => mapInstance.remove();
//   }, [location]);

//   // 🔄 Update route whenever location or destination changes
//   useEffect(() => {
//     if (!map || !location || !destination || !map.isStyleLoaded()) return;

//     if (markerRef.current) {
//       markerRef.current.setLngLat([location.lng, location.lat]);
//       map.panTo([location.lng, location.lat]);
//     }

//     drawRoute(location, destination, map);
//   }, [location, destination, map]);

//   // ✅ Listen for "ride_started" signal and fetch drop
//   useEffect(() => {
//     socket.on("ride_started", async () => {
//       console.log("✅ Ride started signal received by driver");

//       const res = await fetch(`https://your-api-endpoint.com/get-drop-location?userId=${deliveryId}`);
//       const data = await res.json();

//       if (data?.drop_lat && data?.drop_lng) {
//         setDestination({ lat: data.drop_lat, lng: data.drop_lng });
//         setRideStarted(true);
//       }
//     });

//     return () => socket.off("ride_started");
//   }, [deliveryId]);

//   return (
//     <div className="flex flex-col w-full h-full">
//       <h3 className="text-center text-lg font-semibold py-2">
//         {rideStarted ? "📍 Navigate to Drop" : "🚕 Navigate to Pickup"}
//       </h3>
//       <div ref={mapRef} className="flex-1 w-full h-full" />
//     </div>
//   );
// };

// export default DeliveryApp;
