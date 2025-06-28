// import React, { useEffect, useRef, useState } from "react";
// import mapboxgl from "mapbox-gl";
// import { io } from "socket.io-client";
// import "mapbox-gl/dist/mapbox-gl.css";

// mapboxgl.accessToken =import.meta.env.VITE_MAPBOX_GL_API;
// const socket = io("http://localhost:3001");

// const LiveMap = ({ userType, userId }) => {
//   const mapContainerRef = useRef(null);
//   const mapRef = useRef(null);
//   const driverMarkerRef = useRef(null);
//   const riderMarkerRef = useRef(null);
// const hasCenteredRef = useRef(false);
//   const [driverLoc, setDriverLoc] = useState(null);
//   const [riderLoc, setRiderLoc] = useState(null);

//   useEffect(() => {
//     const interval = setInterval(() => {
//       navigator.geolocation.getCurrentPosition((pos) => {
//         const location = {
//           userId,
//           lat: pos.coords.latitude,
//           lng: pos.coords.longitude,
//         };

//         if (userType === "driver") {
//           socket.emit("driverLocation", location);
//         } else {
//           socket.emit("riderLocation", location);
//         }
//       });
//     }, 5000);

//     return () => clearInterval(interval);
//   }, [userType, userId]);

//   useEffect(() => {
//     socket.on("updateDriverLocation", (data) => setDriverLoc(data));
//     socket.on("updateRiderLocation", (data) => setRiderLoc(data));

//     return () => {
//       socket.off("updateDriverLocation");
//       socket.off("updateRiderLocation");
//     };
//   }, []);

//   useEffect(() => {
//     mapRef.current = new mapboxgl.Map({
//       container: mapContainerRef.current,
//       style: "mapbox://styles/mapbox/streets-v11",
//       center: [82.24, 17.0],
//       zoom: 13,
//     });
//   }, []);
// useEffect(() => {
//   if (mapRef.current && driverLoc) {
//     if (!driverMarkerRef.current) {
//       driverMarkerRef.current = new mapboxgl.Marker({ color: "red" })
//         .setLngLat([driverLoc.lng, driverLoc.lat])
//         .addTo(mapRef.current);
//     } else {
//       driverMarkerRef.current.setLngLat([driverLoc.lng, driverLoc.lat]);
//     }
//   }

//   if (mapRef.current && riderLoc) {
//     if (!riderMarkerRef.current) {
//       riderMarkerRef.current = new mapboxgl.Marker({ color: "blue" })
//         .setLngLat([riderLoc.lng, riderLoc.lat])
//         .addTo(mapRef.current);
//     } else {
//       riderMarkerRef.current.setLngLat([riderLoc.lng, riderLoc.lat]);
//     }
//   }

//   if (driverLoc && riderLoc && !hasCenteredRef.current) {
//     const bounds = new mapboxgl.LngLatBounds();
//     bounds.extend([driverLoc.lng, driverLoc.lat]);
//     bounds.extend([riderLoc.lng, riderLoc.lat]);
//     mapRef.current.fitBounds(bounds, { padding: 100 });
//     hasCenteredRef.current = true;
//   }
// }, [driverLoc, riderLoc]);

//   return (
//     <div className="w-full h-screen">
//       <div ref={mapContainerRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default LiveMap;



import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { io } from "socket.io-client";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
const socket = io("http://localhost:3001");

const LiveMap = ({ userType, userId }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const hasCenteredRef = useRef(false);

  const [driverLoc, setDriverLoc] = useState(null);
  const [riderLoc, setRiderLoc] = useState(null);
  const [distanceText, setDistanceText] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        const location = {
          userId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        if (userType === "driver") {
          socket.emit("driverLocation", location);
        } else {
          socket.emit("riderLocation", location);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [userType, userId]);

  useEffect(() => {
    socket.on("updateDriverLocation", (data) => setDriverLoc(data));
    socket.on("updateRiderLocation", (data) => setRiderLoc(data));

    return () => {
      socket.off("updateDriverLocation");
      socket.off("updateRiderLocation");
    };
  }, []);

  useEffect(() => {
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [82.24, 17.0],
      zoom: 13,
    });
  }, []);

  const getRoute = async (from, to) => {
    const query = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    const response = await fetch(query);
    const data = await response.json();

    const route = data.routes[0].geometry;
    const distance = data.routes[0].distance / 1000; // meters to km
    setDistanceText(`${distance.toFixed(2)} km`);

    if (mapRef.current.getSource("route")) {
      mapRef.current.removeLayer("route");
      mapRef.current.removeSource("route");
    }

    mapRef.current.addSource("route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: route,
      },
    });

    mapRef.current.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#3b82f6",
        "line-width": 5,
      },
    });
  };

  useEffect(() => {
    if (mapRef.current && driverLoc) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new mapboxgl.Marker({ color: "red" })
          .setLngLat([driverLoc.lng, driverLoc.lat])
          .addTo(mapRef.current);
      } else {
        driverMarkerRef.current.setLngLat([driverLoc.lng, driverLoc.lat]);
      }
    }

    if (mapRef.current && riderLoc) {
      if (!riderMarkerRef.current) {
        riderMarkerRef.current = new mapboxgl.Marker({ color: "blue" })
          .setLngLat([riderLoc.lng, riderLoc.lat])
          .addTo(mapRef.current);
      } else {
        riderMarkerRef.current.setLngLat([riderLoc.lng, riderLoc.lat]);
      }
    }

    if (driverLoc && riderLoc) {
      getRoute(driverLoc, riderLoc);

      if (!hasCenteredRef.current) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([driverLoc.lng, driverLoc.lat]);
        bounds.extend([riderLoc.lng, riderLoc.lat]);
        mapRef.current.fitBounds(bounds, { padding: 100 });
        hasCenteredRef.current = true;
      }
    }
  }, [driverLoc, riderLoc]);

  return (
    <div className="w-full h-screen relative">
      <div ref={mapContainerRef} className="w-full h-full" />
      {distanceText && (
        <div className="absolute top-4 left-4 bg-white shadow-md px-4 py-2 rounded-md text-gray-800">
          Distance: {distanceText}
        </div>
      )}
    </div>
  );
};

export default LiveMap;
