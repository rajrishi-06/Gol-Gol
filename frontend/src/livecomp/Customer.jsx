// import React, { useEffect, useRef, useState } from "react";
// import mapboxgl from "mapbox-gl";
// import { io } from "socket.io-client";

// mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
// const socket = io("http://localhost:3001");

// const CustomerApp = ({ deliveryId, dropLocation }) => {
//   const mapRef = useRef(null);
//   const [map, setMap] = useState(null);
//   const deliveryMarkerRef = useRef(null);
//   const routeId = "route-to-drop";

//   const drawRoute = async (start, end) => {
//     const query = await fetch(
//       `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
//     );
//     const data = await query.json();
//     const route = data.routes[0].geometry;

//     if (map.getSource(routeId)) {
//       map.getSource(routeId).setData(route);
//     } else {
//       map.addSource(routeId, {
//         type: "geojson",
//         data: route,
//       });

//       map.addLayer({
//         id: routeId,
//         type: "line",
//         source: routeId,
//         layout: {
//           "line-join": "round",
//           "line-cap": "round",
//         },
//         paint: {
//           "line-color": "#32CD32",
//           "line-width": 4,
//         },
//       });
//     }
//   };

//   useEffect(() => {
//     const mapInstance = new mapboxgl.Map({
//       container: mapRef.current,
//       style: "mapbox://styles/mapbox/streets-v12",
//       center: [dropLocation.lng, dropLocation.lat],
//       zoom: 13,
//     });

//     new mapboxgl.Marker({ color: "green" })
//       .setLngLat([dropLocation.lng, dropLocation.lat])
//       .setPopup(new mapboxgl.Popup().setText("Your Address"))
//       .addTo(mapInstance);

//     setMap(mapInstance);
//     return () => mapInstance.remove();
//   }, [dropLocation]);

//   useEffect(() => {
//     if (!map) return;

//     socket.emit("join-room", deliveryId);

//     socket.on("location-update", ({ coords }) => {
//       if (!deliveryMarkerRef.current) {
//         deliveryMarkerRef.current = new mapboxgl.Marker({ color: "red" })
//           .setLngLat([coords.lng, coords.lat])
//           .setPopup(new mapboxgl.Popup().setText("Delivery Boy"))
//           .addTo(map);
//       } else {
//         deliveryMarkerRef.current.setLngLat([coords.lng, coords.lat]);
//       }

//       map.panTo([coords.lng, coords.lat]);
//       drawRoute(coords, dropLocation);
//     });

//     return () => socket.off("location-update");
//   }, [map, deliveryId, dropLocation]);

//   return (
//    <div className="flex flex-col w-full h-full">
//   <h3 className="text-center text-lg font-semibold py-2">🚴 Tracking Your Delivery</h3>
//   <div ref={mapRef} className="flex-1 w-full h-full" />
// </div>
//   );
// };

// export default CustomerApp;






import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { io } from "socket.io-client";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
const socket = io("http://localhost:3001");

const CustomerApp = ({ deliveryId, dropLocation }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const deliveryMarkerRef = useRef(null);
  const dropMarkerRef = useRef(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const routeId = "route-to-drop";

  // ✅ Draw route between two coordinates
  const drawRoute = async (start, end) => {
    if (!start || !end || !map) return;

    const query = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
    );
    const data = await query.json();
    const route = data.routes[0].geometry;

    if (map.getSource(routeId)) {
      map.getSource(routeId).setData(route);
    } else {
      map.addSource(routeId, {
        type: "geojson",
        data: route,
      });

      map.addLayer({
        id: routeId,
        type: "line",
        source: routeId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#32CD32",
          "line-width": 4,
        },
      });
    }
  };

  // ✅ Initialize the map only once
  useEffect(() => {
    const mapInstance = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [dropLocation.lng, dropLocation.lat],
      zoom: 13,
    });

    setMap(mapInstance);

    return () => mapInstance.remove();
  }, []);

  // ✅ Show updated drop location marker
  useEffect(() => {
    if (!map || !dropLocation) return;

    if (dropMarkerRef.current) {
      dropMarkerRef.current.remove();
    }

    dropMarkerRef.current = new mapboxgl.Marker({ color: "green" })
      .setLngLat([dropLocation.lng, dropLocation.lat])
      .setPopup(new mapboxgl.Popup().setText("Drop Location"))
      .addTo(map);
  }, [dropLocation, map]);

  // ✅ Handle driver's live location
  useEffect(() => {
    if (!map || !deliveryId) return;

    socket.emit("join-room", deliveryId);

    const handleLocation = ({ coords }) => {
      setDriverCoords(coords);

      if (!deliveryMarkerRef.current) {
        deliveryMarkerRef.current = new mapboxgl.Marker({ color: "red" })
          .setLngLat([coords.lng, coords.lat])
          .setPopup(new mapboxgl.Popup().setText("Driver"))
          .addTo(map);
      } else {
        deliveryMarkerRef.current.setLngLat([coords.lng, coords.lat]);
      }

      map.panTo([coords.lng, coords.lat]);
    };

    socket.on("location-update", handleLocation);

    return () => {
      socket.off("location-update", handleLocation);
    };
  }, [map, deliveryId]);

  // ✅ Redraw route when driver or drop location changes
  useEffect(() => {
    if (map && driverCoords && dropLocation) {
      drawRoute(driverCoords, dropLocation);
    }
  }, [driverCoords, dropLocation, map]);

  return (
    <div className="flex flex-col w-full h-full">
      <h3 className="text-center text-lg font-semibold py-2">🚴 Tracking Your Delivery</h3>
      <div ref={mapRef} className="flex-1 w-full h-full" />
    </div>
  );
};

export default CustomerApp;

