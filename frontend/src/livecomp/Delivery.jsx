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
        socket.emit("location-update", { deliveryId, coords });
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
