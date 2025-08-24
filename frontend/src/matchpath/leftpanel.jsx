
import React, { useState, useEffect, useRef } from "react";
import { reverseGeocode } from "./useGeocode";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase";
import { findMatchingRoutes } from "./matchroute";
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

const LeftPanel = ({ UserId, setActiveInput, setFromLocation, setToLocation, fromLocation, toLocation, Usertype ,setSelectedMatchId}) => {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [travelDate, setTravelDate] = useState("");
  const [travelTime, setTravelTime] = useState("");
  const [anyTime, setAnyTime] = useState(false);
  const [matchResult, setMatchResult] = useState(null);

//  const [matches, setMatches] = useState([]);
  const fromBoxRef = useRef();
  const toBoxRef = useRef();
  const navigate = useNavigate();



  // Fetch suggestions
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
    if (fromLocation?.address) setFromInput(fromLocation.address);
  }, [fromLocation]);

  useEffect(() => {
    if (toLocation?.address) setToInput(toLocation.address);
  }, [toLocation]);

  // Check for existing match on load

useEffect(() => {
  const checkMatched = async () => {
    if (!UserId) return;

 let query = supabase.from("matched_routes").select("*");

if (Usertype === "rider") {
  query = query.eq("rider_id", UserId);
} else if (Usertype === "driver") {
  query = query.eq("driver_id", UserId);
}

const { data, error } = await query;

    if (error) {
      console.error("❌ Failed to fetch matched_routes:", error.message);
      return;
    }

    if (data && data.length > 0) {
      const matches = data.map((entry) => {
        const isDriver = Usertype === "driver";
        const matchedUserId = isDriver ? entry.user_id : entry.driver_id;
        const matchedFrom = isDriver
          ? `${entry.user_start_lat.toFixed(4)}, ${entry.user_start_lng.toFixed(4)}`
          : `${entry.driver_start_lat.toFixed(4)}, ${entry.driver_start_lng.toFixed(4)}`;
        const matchedTo = isDriver
          ? `${entry.user_end_lat.toFixed(4)}, ${entry.user_end_lng.toFixed(4)}`
          : `${entry.driver_end_lat.toFixed(4)}, ${entry.driver_end_lng.toFixed(4)}`;

        return {
           id: entry.id,
          user_id: matchedUserId,
          type: isDriver ? "rider" : "driver",
          from: matchedFrom,
          to: matchedTo,
        };
      });

      setMatchResult({ matches });
    }
  };

  checkMatched();
}, [UserId, Usertype]);


  const handleFromSelect = (place) => {
    setFromInput(place.place_name);
    setFromSuggestions([]);
    setFromLocation({
      lat: place.center[1],
      lng: place.center[0],
      address: place.place_name,
    });
  };

  const handleToSelect = (place) => {
    setToInput(place.place_name);
    setToSuggestions([]);
    setToLocation({
      lat: place.center[1],
      lng: place.center[0],
      address: place.place_name,
    });
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


// const fetchMatchedRoutes = async (userType, userId) => {
//     try {
//       const response = await fetch(
//         `http://localhost:3001/api/match?userType=${userType}&userId=${userId}`
//       );
//       const data = await response.json();
//       console.log("✅ Matched pairs:", data);
//       return data;
//     } catch (err) {
//       console.error("❌ Error fetching matches:", err);
//       return [];
//     }
//   };

const [matchedRides, setMatchedRides] = useState([]);

const handleSubmit = async () => {
  if (!fromLocation || !toLocation || !travelDate || (!travelTime && !anyTime)) {
    alert("Please fill in all required fields.");
    return;
  }

  const formattedTime = anyTime ? "23:59" : travelTime;
  const fullDateTime = new Date(`${travelDate}T${formattedTime}:00`);

  // Step 1: Insert current ride data into route_req
  const { error: insertError } = await supabase.from("route_req").insert([
    {
      user_id: UserId,
      user_type: Usertype,
      start_lat: fromLocation.lat,
      start_lng: fromLocation.lng,
      end_lat: toLocation.lat,
      end_lng: toLocation.lng,
      time: fullDateTime.toISOString(),
    },
  ]);

  if (insertError) {
    console.log(Usertype);
    console.error("❌ Insert error:", insertError.message);
    alert("Failed to submit your route.");
    return;
  }

  // Step 2: Call backend to get matched routes

 let matches = [];
  try {
    matches = await findMatchingRoutes(Usertype, UserId);
    console.log("✅ Matched pairs:", matches);
  } catch (err) {
    console.error("❌ Error fetching matches:", err);
    matches = [];
  }
//   const getMatches = async () => {
//     try {
//       const data = await findMatchingRoutes(userType, userId);
//       console.log("✅ Matched pairs:", data);
//       setMatches(data);
//     } catch (err) {
//       console.error("❌ Error fetching matches:", err);
//       setMatches([]);
//     }
//   };




  if (matches.length > 0) {
    alert(`Found ${matches.length} match(es)!`);

    // Step 3: Fetch current user's route
    const { data: myRoute, error: myRouteError } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_id", UserId)
      .order("time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (myRouteError || !myRoute) {
      console.error("❌ Failed to get current user route:", myRouteError?.message);
      return;
    }

    // Step 4: Insert matches into matched_routes
    for (const match of matches) {
      const matchedUserId = Usertype === "rider" ? match.driver_id : match.rider_id;

      const { data: matchedRoute, error: matchedError } = await supabase
        .from("route_req")
        .select("*")
        .eq("user_id", matchedUserId)
        .order("time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (matchedError || !matchedRoute) {
        console.error("❌ Failed to get matched user route:", matchedError?.message);
        continue;
      }

      const rider_id = Usertype === "rider" ? UserId : matchedUserId;
      const driver_id = Usertype === "driver" ? UserId : matchedUserId;

      const riderRoute = Usertype === "rider" ? myRoute : matchedRoute;
      const driverRoute = Usertype === "driver" ? myRoute : matchedRoute;

      const insertMatch = await supabase.from("matched_routes").insert([
        {
          rider_id,
          driver_id,
          driver_start_lat: driverRoute.start_lat,
          driver_start_lng: driverRoute.start_lng,
          rider_start_lat: riderRoute.start_lat,
          rider_start_lng: riderRoute.start_lng,
          driver_end_lat: driverRoute.end_lat,
          driver_end_lng: driverRoute.end_lng,
          rider_end_lat: riderRoute.end_lat,
          rider_end_lng: riderRoute.end_lng,
          time: driverRoute.time,
        },
      ]);

      if (insertMatch.error) {
        console.error("❌ Failed to insert into matched_routes:", insertMatch.error.message);
      }
    }

    // ✅ Step 5: Add a short delay and fetch matched data again
    await new Promise((resolve) => setTimeout(resolve, 500));
    await fetchUserMatches(); // manual trigger
  } else {
    setMatchedRides([]);
    alert("No matches found.");
  }
};






const fetchUserMatches = async () => {
  if (!UserId || !Usertype) return;

  const columnToMatch = Usertype === "rider" ? "rider_id" : "driver_id";
  const { data, error } = await supabase
    .from("matched_routes")
    .select("*")
    .eq(columnToMatch, UserId);

  if (error) {
    console.error("❌ Error fetching matched routes:", error.message);
  } else {
    setMatchedRides(data || []);
    console.log("✅ Fetched matched routes:", data);
  }
};



// 🚀 Automatically fetch matched routes on load
useEffect(() => {
  fetchUserMatches(); // initial fetch

  const interval = setInterval(fetchUserMatches, 10000);
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") fetchUserMatches();
  };
  const handleFocus = () => fetchUserMatches();

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleFocus);

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleFocus);
  };
}, [UserId, Usertype]);









  const handleApprove = () => {
  console.log("🛠 Approve logic here (to be implemented)");
  
};


const handleMatchClick = (match) => {

  setSelectedMatchId(match.id );
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
          <ul className="absolute w-full bg-white border mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
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
          placeholder="Enter drop location"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {toSuggestions.length > 0 && (
          <ul className="absolute w-full bg-white border mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
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

      {/* Date + Time */}
      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-1">Date of Travel:</label>
        <input
          type="date"
          value={travelDate}
          onChange={(e) => setTravelDate(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-1">Time of Travel:</label>
        <div className="flex items-center space-x-3">
          <input
            type="time"
            value={travelTime}
            onChange={(e) => setTravelTime(e.target.value)}
            disabled={anyTime}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="inline-flex items-center space-x-2">
            <input
              type="checkbox"
              checked={anyTime}
              onChange={() => setAnyTime(!anyTime)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-600">Any time</span>
          </label>
        </div>
      </div>

      {/* Confirm Ride */}
      <button
        onClick={handleSubmit}
        className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"
      >
        Confirm Ride
      </button>



      {/* Match Display */}

{matchedRides.length > 0 && (
  <div className="mt-6">
    <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">
      Your Matched Rides
    </h3>

    <div className="grid gap-4">
      {matchedRides.map((ride, index) => (
        <button
          key={index}
          onClick={() => handleMatchClick(ride)}
          className="text-left w-full border border-gray-300 p-4 rounded-xl shadow-md bg-white hover:bg-blue-50 hover:shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="mb-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-800">Driver ID:</span>{" "}
            {ride.driver_id ?? "N/A"}
          </div>

          <div className="mb-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-800">Rider ID:</span>{" "}
            {ride.rider_id ?? "N/A"}
          </div>

          <div className="mb-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-800">Driver Start:</span>{" "}
            {ride.driver_start_lat?.toFixed(4) ?? "?"},{" "}
            {ride.driver_start_lng?.toFixed(4) ?? "?"}
          </div>

          <div className="mb-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-800">Rider Start:</span>{" "}
            {ride.rider_start_lat?.toFixed(4) ?? "?"},{" "}
            {ride.rider_start_lng?.toFixed(4) ?? "?"}
          </div>

          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-800">Time:</span>{" "}
            {ride.time ? new Date(ride.time).toLocaleString() : "N/A"}
          </div>
        </button>
      ))}
    </div>
  </div>
)}
    </div>
  );
};

export default LeftPanel;








