// src/components/Rightside.jsx
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
// Set Mapbox access token globally
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

export default function Rightside({ fromCords, toCords }) {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (map.current) return; // Initialize map only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11', // You can choose a different style
      center: fromCords ? [fromCords.lng, fromCords.lat] : [0, 0], // Default center if fromCords is not available
      zoom: 12,
    });

    map.current.on('load', () => {
      if (fromCords && toCords) {
        const fromEl = document.createElement("div");
        const fromImg = document.createElement("img");
        fromImg.src = "/icons/pickup.svg";   // ✅ works directly
        fromImg.style.width = "64px";
        fromImg.style.height = "64px";
        fromEl.appendChild(fromImg);

        new mapboxgl.Marker({ element: fromEl })
          .setLngLat([fromCords.lng, fromCords.lat])
          .addTo(map.current);


        const toEl = document.createElement("div");
        const toImg = document.createElement("img");
        toImg.src = "/icons/destination.svg";   // ✅ no import needed
        toImg.style.width = "64px";
        toImg.style.height = "64px";
        toEl.appendChild(toImg);

        new mapboxgl.Marker({ element: toEl })
          .setLngLat([toCords.lng, toCords.lat])
          .addTo(map.current);


        // Fetch and display route
        const getRoute = async () => {
          const query = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${fromCords.lng},${fromCords.lat};${toCords.lng},${toCords.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`,
            { method: 'GET' }
          );
          const json = await query.json();
          const data = json.routes[0];
          const route = data.geometry.coordinates;
          const geojson = {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: route
            }
          };

          if (map.current.getSource('route')) {
            map.current.getSource('route').setData(geojson);
          } else {
            map.current.addLayer({
              id: 'route',
              type: 'line',
              source: {
                type: 'geojson',
                data: geojson
              },
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': '#3887be',
                'line-width': 5,
                'line-opacity': 0.75
              }
            });
          }

          // Fit map to bounds of the route
          const bounds = new mapboxgl.LngLatBounds();
          for (const coord of route) {
            bounds.extend(coord);
          }
          map.current.fitBounds(bounds, { padding: 50 });
        };
        getRoute();
      }
    });

    // Clean up on unmount
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [fromCords, toCords]); // Re-run effect if fromCords or toCords change

  return (
    <div className="hidden sm:block flex-1 h-screen relative">
      <div ref={mapContainer} className="map-container w-full h-full" />
    </div>
  );
}