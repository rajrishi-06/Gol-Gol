import React, { useState, useEffect, useRef } from "react";
import { forwardGeocode, reverseGeocode } from "../hooks/useGeocode";
import { useNavigate } from "react-router-dom";
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

const LeftPanel = ({ fromLocation, toLocation, setFromLocation, setToLocation ,UserId}) => {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);

  const fromBoxRef = useRef();
  const toBoxRef = useRef();

  const navigate = useNavigate();

  const fetchSuggestions = async (input, setter) => {
    if (!input) return setter([]);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`
    );
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
      if (fromBoxRef.current && !fromBoxRef.current.contains(e.target)) {
        setFromSuggestions([]);
      }
      if (toBoxRef.current && !toBoxRef.current.contains(e.target)) {
        setToSuggestions([]);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleFromSelect = async (place) => {

    if (!props.UserId) {
    return <Navigate to="/login" replace />;
  }
  
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

  return (


    <div className="p-4 font-sans bg-white shadow-lg h-full overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Location Input</h2>

      {/* From Input */}
      <div className="mb-6 relative" ref={fromBoxRef}>
        <label className="block text-gray-700 font-medium mb-1">From:</label>
        <input
  type="text"
  value={fromInput}
  onChange={(e) => setFromInput(e.target.value)}
  onFocus={() => {
    if (!UserId) navigate("/login");
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
        {fromLocation && (
          <div className="mt-2 text-sm text-gray-600">
            <div><strong>Lat:</strong> {fromLocation.lat.toFixed(5)}</div>
            <div><strong>Lng:</strong> {fromLocation.lng.toFixed(5)}</div>
            <div><strong>Address:</strong> {fromLocation.address}</div>
          </div>
        )}
      </div>

      {/* To Input */}
      <div className="mb-6 relative" ref={toBoxRef}>
        <label className="block text-gray-700 font-medium mb-1">To:</label>
        <input
  type="text"
  value={toInput}
  onChange={(e) => setToInput(e.target.value)}
  onFocus={() => {
    if (!UserId) navigate("/login");
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
        {toLocation && (
          <div className="mt-2 text-sm text-gray-600">
            <div><strong>Lat:</strong> {toLocation.lat.toFixed(5)}</div>
            <div><strong>Lng:</strong> {toLocation.lng.toFixed(5)}</div>
            <div><strong>Address:</strong> {toLocation.address}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;