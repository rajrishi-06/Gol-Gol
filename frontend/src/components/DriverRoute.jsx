import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

// Utility to get driving route using Mapbox Directions API
const getDirectionsRoute = async (coordinates) => {
  if (coordinates.length < 2) return null;
  
  const coordinatesString = coordinates
    .map(coord => `${coord[0]},${coord[1]}`)
    .join(';');
  
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesString}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry;
    }
  } catch (error) {
    console.error('Error fetching directions:', error);
  }
  
  return null;
};

// Utility to generate consistent colors
const getRandomColor = (i) => {
  const colors = [
    "#FF5733", "#33FF57", "#3357FF",
    "#FF33A6", "#FF8C33", "#33FFF0",
    "#8E44AD", "#2ECC71", "#E74C3C"
  ];
  return colors[i % colors.length];
};

function DriverRoute({ ride }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    console.log('DriverRoute useEffect triggered with ride:', ride);
    
    if (!ride || !ride.driver || !mapContainerRef.current) {
      console.log('Early return - missing ride, driver, or container');
      return;
    }

    // Clean up existing map if ride changes
    if (mapRef.current) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Initialize new map
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [ride.driver?.driver_start?.lng || -74.006, ride.driver?.driver_start?.lat || 40.7128], // Default to NYC if coords missing
      zoom: 12,
    });

    const map = mapRef.current;

    const drawRide = () => {
      try {
        // Validate ride data - updated for your data structure
        const driverStart = ride.driver?.driver_start;
        const driverEnd = ride.driver?.driver_end;
        
        if (!driverStart?.lng || !driverStart?.lat || !driverEnd?.lng || !driverEnd?.lat) {
          console.error('Missing driver start/end coordinates', { driverStart, driverEnd });
          return;
        }

        // Driver start and end markers
        const startMarker = new mapboxgl.Marker({ color: "blue" })
          .setLngLat([driverStart.lng, driverStart.lat])
          .setPopup(new mapboxgl.Popup().setHTML("<b>Driver Start</b>"))
          .addTo(map);
        markersRef.current.push(startMarker);

        const endMarker = new mapboxgl.Marker({ color: "purple" })
          .setLngLat([driverEnd.lng, driverEnd.lat])
          .setPopup(new mapboxgl.Popup().setHTML("<b>Driver End</b>"))
          .addTo(map);
        markersRef.current.push(endMarker);

        // Initialize bounds
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([driverStart.lng, driverStart.lat]);
        bounds.extend([driverEnd.lng, driverEnd.lat]);

        // Create optimized route coordinates including all stops in logical order
        let routeCoordinates = [[driverStart.lng, driverStart.lat]];
        
        // Add all pickup points first, then all drop points (you might want to optimize this order)
        const pickupPoints = [];
        const dropPoints = [];

        // Add pickup and drop points to route - updated for your data structure
        if (ride.riders && ride.riders.length > 0) {
          ride.riders.forEach((rider, i) => {
            const { pickup, drop } = rider;
            const color = getRandomColor(i);

            if (pickup && pickup.lng && pickup.lat) {
              pickupPoints.push([pickup.lng, pickup.lat]);
              bounds.extend([pickup.lng, pickup.lat]);

              const pickupMarker = new mapboxgl.Marker({ color: "green" })
                .setLngLat([pickup.lng, pickup.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`<b>Pickup ${i + 1}</b><br/>${rider.name !== 'undefined' ? rider.name : 'Rider'}`))
                .addTo(map);
              markersRef.current.push(pickupMarker);
            }

            if (drop && drop.lng && drop.lat) {
              dropPoints.push([drop.lng, drop.lat]);
              bounds.extend([drop.lng, drop.lat]);

              const dropMarker = new mapboxgl.Marker({ color: "red" })
                .setLngLat([drop.lng, drop.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`<b>Drop ${i + 1}</b><br/>${rider.name !== 'undefined' ? rider.name : 'Rider'}`))
                .addTo(map);
              markersRef.current.push(dropMarker);
            }

            // Draw individual rider route (pickup to drop) with actual roads
            if (pickup && drop && pickup.lng && pickup.lat && drop.lng && drop.lat) {
              const routeId = `route-rider-${i}`;
              
              // Remove existing layer/source if it exists
              if (map.getSource(routeId)) {
                map.removeLayer(routeId);
                map.removeSource(routeId);
              }

              // Get actual driving route for this rider (async)
              getDirectionsRoute([
                [pickup.lng, pickup.lat],
                [drop.lng, drop.lat]
              ]).then(riderRoute => {
                if (riderRoute && map.getCanvas()) { // Check if map still exists
                  map.addSource(routeId, {
                    type: "geojson",
                    data: {
                      type: "Feature",
                      geometry: riderRoute,
                    },
                  });

                  map.addLayer({
                    id: routeId,
                    type: "line",
                    source: routeId,
                    paint: {
                      "line-color": color,
                      "line-width": 3,
                      "line-dasharray": [2, 2],
                      "line-opacity": 0.7
                    },
                  });
                }
              }).catch(error => {
                console.error(`Error loading rider ${i} route:`, error);
              });
            }
          });
        }

        // Add pickup and drop points to main route
        routeCoordinates = [...routeCoordinates, ...pickupPoints, ...dropPoints];
        routeCoordinates.push([driverEnd.lng, driverEnd.lat]);

        // Get actual driving route for the main driver route
        console.log('Fetching main driver route for coordinates:', routeCoordinates);
        
        // Handle main route asynchronously
        getDirectionsRoute(routeCoordinates).then(mainRoute => {
          // Draw main driver route
          if (map.getSource("route-driver")) {
            map.removeLayer("route-driver");
            map.removeSource("route-driver");
          }

          if (mainRoute && map.getCanvas()) { // Check if map still exists
            map.addSource("route-driver", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: mainRoute,
              },
            });

            map.addLayer({
              id: "route-driver",
              type: "line",
              source: "route-driver",
              paint: { 
                "line-color": "#1E90FF", 
                "line-width": 6,
                "line-opacity": 0.8
              },
            });

            // Extend bounds to include the entire route
            if (mainRoute.coordinates) {
              mainRoute.coordinates.forEach(coord => bounds.extend(coord));
            }
            
            // Fit map after route is loaded
            map.fitBounds(bounds, { 
              padding: { top: 50, bottom: 50, left: 50, right: 50 },
              maxZoom: 15
            });
          } else {
            // Fallback to straight lines if directions API fails
            console.warn('Directions API failed, falling back to straight lines');
            map.addSource("route-driver", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: routeCoordinates },
              },
            });

            map.addLayer({
              id: "route-driver",
              type: "line",
              source: "route-driver",
              paint: { 
                "line-color": "#1E90FF", 
                "line-width": 4,
                "line-opacity": 0.8
              },
            });
            
            // Fit map with fallback route
            map.fitBounds(bounds, { 
              padding: { top: 50, bottom: 50, left: 50, right: 50 },
              maxZoom: 15
            });
          }
        }).catch(error => {
          console.error('Error loading main route:', error);
          // Fallback to straight lines on error
          if (map.getCanvas()) {
            map.addSource("route-driver", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: routeCoordinates },
              },
            });

            map.addLayer({
              id: "route-driver",
              type: "line",
              source: "route-driver",
              paint: { 
                "line-color": "#1E90FF", 
                "line-width": 4,
                "line-opacity": 0.8
              },
            });
          }
        });

        // Initial fit bounds (will be updated when routes load)
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { 
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            maxZoom: 15
          });
        } else {
          map.setCenter([driverStart.lng, driverStart.lat]);
          map.setZoom(12);
        }

      } catch (error) {
        console.error('Error drawing ride:', error);
      }
    };

    // Wait for map to load before drawing
    map.on('load', () => {
      drawRide();
    });

    // Handle map errors
    map.on('error', (e) => {
      console.error('Mapbox error:', e);
    });

    // Cleanup function
    return () => {
      if (mapRef.current) {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        mapRef.current.remove();
        mapRef.current = null;
      }
    };

  }, [ride]);

  // Debug logging
  console.log('DriverRoute received ride data:', ride);

  // Show loading state or error if no ride data
  if (!ride || !ride.driver) {
    return (
      <div className="hidden sm:block flex-1 h-screen relative bg-gray-100 items-center justify-center">
        <p className="text-gray-500">No ride data available</p>
        {ride && <p className="text-xs text-gray-400 mt-2">Ride data: {JSON.stringify(ride, null, 2)}</p>}
      </div>
    );
  }

  return (
    <div className="hidden sm:block flex-1 h-screen relative">
      <div ref={mapContainerRef} className="absolute top-0 left-0 w-full h-full" />
      {/* Loading indicator for when routes are being fetched */}
      <div className="absolute top-4 right-4 bg-white p-2 rounded shadow">
        <p className="text-xs text-gray-600">🔄 Loading routes...</p>
      </div>
      <div className="absolute top-4 left-4 bg-white p-2 rounded shadow">
        <p className="text-sm font-medium">Driver Route</p>
        <p className="text-xs text-gray-600">
          {ride.riders?.length || 0} rider(s)
        </p>
      </div>
    </div>
  );
}

export default DriverRoute;