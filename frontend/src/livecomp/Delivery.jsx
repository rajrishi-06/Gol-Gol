
import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { io } from "socket.io-client";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;
const socket = io("http://localhost:3001");

const DeliveryApp = ({ deliveryId, pickupLocation,drop }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const [location, setLocation] = useState(null);
  const routeId = "delivery-route";

  // ✅ Draw route after removing old ones
  const drawRoute = async (start, end, mapInstance) => {
    if (!mapInstance || !start || !end) return;

    // Remove old route if it exists
    if (mapInstance.getLayer(routeId)) {
      mapInstance.removeLayer(routeId);
    }
    if (mapInstance.getSource(routeId)) {
      mapInstance.removeSource(routeId);
    }

    // Fetch new route
    const query = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
    );
    const data = await query.json();
    const route = data.routes[0]?.geometry;

    if (!route) return;

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
  };

 

  // ✅ Track driver’s location and send updates
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setLocation(coords);

        // Emit live location
        socket.emit("location-update", { deliveryId, coords });


      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ✅ Initialize map when driver's location is ready
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

      // 🟥 Driver marker
      driverMarkerRef.current = new mapboxgl.Marker({ color: "red" })
        .setLngLat([location.lng, location.lat])
        .setPopup(new mapboxgl.Popup().setText("You (Driver)"))
        .addTo(mapInstance);

      // 🟩 Pickup marker (if exists)
      if (pickupLocation) {
        pickupMarkerRef.current = new mapboxgl.Marker({ color: "green" })
          .setLngLat([pickupLocation.lng, pickupLocation.lat])
          .setPopup(new mapboxgl.Popup().setText("Pickup / Drop Location"))
          .addTo(mapInstance);

        drawRoute(location, pickupLocation, mapInstance);
      }
    });

    return () => mapInstance.remove();
  }, [location]);

  // ✅ Update driver marker + route if location changes
  useEffect(() => {
    if (!map || !location || !map.isStyleLoaded()) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLngLat([location.lng, location.lat]);
      map.panTo([location.lng, location.lat]);
    }

    if (pickupLocation) {
      drawRoute(location, pickupLocation, map);
    }
  }, [location]);

  // ✅ Update pickup marker & route when pickupLocation changes
  useEffect(() => {
    if (!map || !location || !pickupLocation) return;

    // Remove old pickup marker
    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
    }

    // Add new pickup marker
    pickupMarkerRef.current = new mapboxgl.Marker({ color: "green" })
      .setLngLat([pickupLocation.lng, pickupLocation.lat])
      .setPopup(new mapboxgl.Popup().setText("Pickup / Drop Location"))
      .addTo(map);

    // Redraw route
    drawRoute(location, pickupLocation, map);
  }, [pickupLocation]);

  return (
    <div className="flex flex-col w-full h-full">
      <h3 className="text-center text-lg font-semibold py-2">
        📦 Navigate to Pickup / Drop
      </h3>
      <div ref={mapRef} className="flex-1 w-full h-full" />
    </div>
  );
};

export default DeliveryApp;






