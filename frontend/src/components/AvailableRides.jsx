// src/components/AvailableRides.jsx
import React, { useState, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "../server/supabase"; // adjust path as needed
import { useNavigate } from 'react-router-dom'; // Import useNavigate

// Set Mapbox access token globally
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

/**
 * Helper function to fetch Estimated Time of Arrival (ETA) between two coordinates
 * using the Mapbox Directions API.
 * @param {Array<number>} from - Starting coordinates in [longitude, latitude] format.
 * @param {Array<number>} to - Destination coordinates in [longitude, latitude] format.
 * @returns {Promise<string>} - A promise that resolves to the ETA in minutes (e.g., "5 min") or "None" if an error occurs.
 */
async function fetchETA(from, to) {
  // Construct the URL for the Mapbox Directions API.
  // The format is /directions/v5/{profile}/{coordinates_list}
  // Coordinates are always longitude,latitude.
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?access_token=${mapboxgl.accessToken}&overview=false`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      // duration is in seconds, convert to minutes
      const minutes = Math.ceil(data.routes[0].duration / 60);
      return `${minutes}\u00A0min`; // \u00A0 is non-breaking space
    }
  } catch (err) {
    console.error("Error fetching ETA:", err);
  }
  return "None"; // Return "None" on error or no routes
}

/**
 * AvailableRides component displays a list of ride types with their estimated arrival times.
 * It fetches nearby drivers from Supabase and calculates ETA to the user's current location.
 * @param {object} props - Component props.
 * @param {{lat: number, lng: number}} props.fromCords - The user's current location (latitude and longitude).
 * @param {{lat: number, lng: number}} props.toCords - The user's destination (latitude and longitude). // Add toCords
 */
export default function AvailableRides({ fromCords, toCords }) { // Receive toCords
  const navigate = useNavigate(); // Initialize useNavigate
  // State to hold the list of ride types and their ETAs
  const [rides, setRides] = useState([
    { name: "Auto", vehicle_type: "auto", icon: "🚗", desc: "Get an auto at your doorstep", eta: "None" },
    { name: "Mini", vehicle_type: "mini", icon: "🚘", desc: "Comfy hatchbacks at pocket‑friendly fares", eta: "None" },
    { name: "Bike", vehicle_type: "bike", icon: "🏍️", desc: "Zip through traffic at affordable fares", eta: "None" },
    { name: "Prime Sedan", vehicle_type: "sedan", icon: "🚖", desc: "Sedans with free wifi and top drivers", eta: "None" },
    { name: "Prime SUV", vehicle_type: "suv", icon: "🚙", desc: "SUVs with free wifi and top drivers", eta: "None" },
  ]);
  // State to manage loading status for the refresh button
  const [loading, setLoading] = useState(false);

  /**
   * Fetches active drivers from Supabase, finds the nearest driver for each vehicle type,
   * and calculates their ETA to the user's `fromCords`.
   */
  const fetchRides = async () => {
    // If fromCords is not provided, we cannot fetch rides, so return early.
    if (!fromCords || fromCords.lat === 0 || fromCords.lng === 0) {
      console.log("fromCords not set, skipping ride fetch.");
      // Optionally reset all ETAs to "None" if fromCords becomes invalid
      setRides(prevRides => prevRides.map(ride => ({ ...ride, eta: "None" })));
      return;
    }

    setLoading(true); // Set loading state to true

    // Fetch active drivers who are online and not currently on a ride.
    // Also, join with the 'drivers' table to get vehicle_type.
    const { data, error } = await supabase
      .from('active_drivers')
      .select('current_lat, current_lng, on_ride, is_online, drivers!inner(vehicle_type)')
      .eq('is_online', true)
      .eq('on_ride', false);

    if (error) {
      console.error('Error fetching drivers:', error.message);
      setLoading(false); // Reset loading state on error
      // Also set all ETAs to "None" on a fetch error
      setRides(prevRides => prevRides.map(ride => ({ ...ride, eta: "None" })));
      return;
    }

    // Convert user's location to the [longitude, latitude] format required by Mapbox Directions API
    const userLocationMapboxFormat = [fromCords.lng, fromCords.lat];

    // Calculate ETA for each ride type
    const updatedRides = await Promise.all(
      rides.map(async (rideType) => {
        // Filter drivers that match the current ride type's vehicle_type
        const matchingDrivers = data.filter(
          (driver) => driver.drivers.vehicle_type.toLowerCase() === rideType.vehicle_type
        );

        if (matchingDrivers.length > 0) {
          // Calculate Haversine distance for each matching driver to the user's location
          const distances = matchingDrivers.map((driver) => {
            const R = 6371; // Radius of Earth in kilometers
            const dLat = (driver.current_lat - fromCords.lat) * (Math.PI / 180);
            const dLon = (driver.current_lng - fromCords.lng) * (Math.PI / 180);
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(fromCords.lat * (Math.PI / 180)) *
              Math.cos(driver.current_lat * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceKm = R * c;
            return { driver: driver, distanceKm: distanceKm };
          });

          // Sort drivers by distance to find the nearest one
          distances.sort((a, b) => a.distanceKm - b.distanceKm);
          const nearestDriver = distances[0].driver;

          // Convert nearest driver's location to [longitude, latitude] format for Mapbox
          const nearestDriverLocationMapboxFormat = [nearestDriver.current_lng, nearestDriver.current_lat];

          // Fetch ETA using the helper function
          const eta = await fetchETA(userLocationMapboxFormat, nearestDriverLocationMapboxFormat);
          return { ...rideType, eta }; // Return ride type with updated ETA
        }
        // If no matching drivers, set ETA to "None"
        return { ...rideType, eta: "None" };
      })
    );
    setRides(updatedRides); // Update the state with the new ETAs
    setLoading(false); // Reset loading state
  };

  // Function to handle ride selection
  const handleRideSelect = (rideType) => {
    if (fromCords && toCords && toCords.lat !== 0 && toCords.lng !== 0) {
      // You can pass the selected ride type and coordinates as state to the new route
      navigate('/book', { state: { fromCords, toCords, selectedRide: rideType } });
    } else {
      alert("Please set your destination to book a ride.");
    }
  };


  // useEffect hook to trigger fetching rides when fromCords changes
  useEffect(() => {
    // Only fetch rides if fromCords is available and valid (not default 0,0)
    if (fromCords && (fromCords.lat !== 0 || fromCords.lng !== 0)) {
      fetchRides();
    } else {
      // If fromCords becomes invalid, reset ETAs to "None"
      setRides(prevRides => prevRides.map(ride => ({ ...ride, eta: "None" })));
    }
  }, [fromCords]); // Dependency array: re-run effect when fromCords changes

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Available Rides</h2>
        <button
          onClick={fetchRides} // Call fetchRides when refresh button is clicked
          disabled={loading} // Disable button while loading
          className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh'} {/* Change button text based on loading state */}
        </button>
      </div>

      <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200 shadow-sm">
        {rides.map((r) => (
          <li
            key={r.vehicle_type} // Use vehicle_type as key for uniqueness
            className="flex items-center px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer" // Add cursor-pointer
            onClick={() => handleRideSelect(r)} // Add onClick handler
          >
            <div className="flex flex-col items-center justify-center w-12">
              <div className="text-2xl">{r.icon}</div>
              <span className="mt-1 text-xs text-gray-500">{r.eta}</span>
            </div>
            <div className="ml-4 flex-1">
              <div className="text-base font-medium text-gray-900 mb-1">{r.name}</div>
              {/* Display the description here */}
              <div className="text-sm text-gray-500 mt-0.5">{r.desc}</div>
            </div>
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </li>
        ))}
      </ul>
    </div>
  );
}