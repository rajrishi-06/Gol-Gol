
import React, { useState, useEffect, useRef } from "react";
import { reverseGeocode } from "../hooks/useGeocode";
import { useNavigate } from "react-router-dom";
import {supabase} from "../server/supabase";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

const rides = [
  { id: 1, name: "Auto", desc: "Get an auto at your doorstep", icon: "🚗", eta: "…" },
  { id: 2, name: "Mini", desc: "Comfy hatchbacks at pocket‑friendly fares", icon: "🚘", eta: "8 min" },
  { id: 3, name: "Bike", desc: "Zip through traffic at affordable fares", icon: "🏍️", eta: "2 min" },
  { id: 4, name: "Prime Sedan", desc: "Sedans with free wifi and top drivers", icon: "🚖", eta: "3 min" },
  { id: 5, name: "Prime SUV", desc: "SUVs with free wifi and top drivers", icon: "🚙", eta: "3 min" },
];

const LeftPanel = ({ UserId, setActiveInput, setFromLocation, setToLocation, fromLocation, toLocation }) => {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const fromBoxRef = useRef();
  const toBoxRef = useRef();
  const navigate = useNavigate();

  const fetchSuggestions = async (input, setter) => {
    if (!input) return setter([]);
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`);
    const data = await res.json();
    setter(data.features || []);
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(fromInput, setFromSuggestions), 300);
    return () => clearTimeout(timer);
  }, [fromInput]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(toInput, setToSuggestions), 300);
    return () => clearTimeout(timer);
  }, [toInput]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (fromBoxRef.current && !fromBoxRef.current.contains(e.target)) setFromSuggestions([]);
      if (toBoxRef.current && !toBoxRef.current.contains(e.target)) setToSuggestions([]);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);


  useEffect(() => {
  if (fromLocation?.address) {
    setFromInput(fromLocation.address);
  }
}, [fromLocation]);

useEffect(() => {
  if (toLocation?.address) {
    setToInput(toLocation.address);
  }
}, [toLocation]);


  const handleFromSelect = async (place) => {
    setFromInput(place.place_name);
    setFromSuggestions([]);
    setFromLocation({ lat: place.center[1], lng: place.center[0], address: place.place_name });
  };

  const handleToSelect = async (place) => {
    setToInput(place.place_name);
    setToSuggestions([]);
    setToLocation({ lat: place.center[1], lng: place.center[0], address: place.place_name });
  };

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const location = await reverseGeocode(latitude, longitude);
      if (location) {
        setFromLocation(location);
        setFromInput(location.address);
      }
    });
  };

const handleRideSelect = async (rideId) => {
  if (!fromLocation || !toLocation) {
    alert("Please select both From and To locations.");
    return;
  }

  const { data, error } = await supabase
    .from("pending_req")
    .upsert(
      [
        {
          user_id: UserId,
          pick_lat: fromLocation.lat,
          pick_lng: fromLocation.lng,
          drop_lat: toLocation.lat,
          drop_lng: toLocation.lng,
          ride_id: rideId,
        },
      ],
      { onConflict: ['user_id'] } // <- this is key
    );

  if (error) {
    console.error("Error creating/updating ride request:", error);
    alert("Failed to create or update ride request. Please try again.");
    return;
  }

  navigate("/conformride", {
    state: {
      userId: UserId,
      rideId: rideId,
    },
  });
};


  return (
    <div className="p-4 font-sans bg-white shadow-lg h-full overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Select Locations</h2>

      {/* From Location */}
      <div className="mb-6 relative" ref={fromBoxRef}>
        <label className="block text-gray-700 font-medium mb-1">From:</label>
        <input
          type="text"
          value={fromInput}
          onChange={(e) => setFromInput(e.target.value)}
          onFocus={() => {
            if (!UserId) navigate("/login");
            setActiveInput("from");
          }}
          onKeyDown={(e) => e.key === "Enter" && setFromSuggestions([])}
          placeholder="Enter pickup location"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={useCurrentLocation}
          className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Use My Current Location
        </button>
        {fromSuggestions.length > 0 && (
          <ul className="absolute w-full bg-white border border-gray-300 mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
            {fromSuggestions.map((place, index) => (
              <li
                key={index}
                onClick={() => handleFromSelect(place)}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
              >
                {place.place_name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* To Location */}
      <div className="mb-6 relative" ref={toBoxRef}>
        <label className="block text-gray-700 font-medium mb-1">To:</label>
        <input
          type="text"
          value={toInput}
          onChange={(e) => setToInput(e.target.value)}
          onFocus={() => {
            if (!UserId) navigate("/login");
            setActiveInput("to");
          }}
          onKeyDown={(e) => e.key === "Enter" && setToSuggestions([])}
          placeholder="Enter drop location"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {toSuggestions.length > 0 && (
          <ul className="absolute w-full bg-white border border-gray-300 mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
            {toSuggestions.map((place, index) => (
              <li
                key={index}
                onClick={() => handleToSelect(place)}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
              >
                {place.place_name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Available Rides Section */}
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Available Rides</h2>
      <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200 shadow-sm">
        {rides.map((r) => (
          <li
            key={r.id}
            onClick={() => handleRideSelect(r.id)}
            className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex flex-col items-center justify-center w-12">
              <div className="text-2xl">{r.icon}</div>
              <span className="mt-1 text-xs text-gray-500">{r.eta}</span>
            </div>
            <div className="ml-4 flex-1">
              <div className="text-base font-medium text-gray-900 mb-1">{r.name}</div>
              <div className="text-sm text-gray-500">{r.desc}</div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LeftPanel;
