
// import React, { useState, useEffect, useRef } from "react";
// import { reverseGeocode } from "../hooks/useGeocode";
// import { useNavigate } from "react-router-dom";
// import { supabase } from "../server/supabase";
// import { User } from "lucide-react";

// const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

// const LeftPanel = ({ UserId, setActiveInput, setFromLocation, setToLocation, fromLocation, toLocation, Usertype }) => {
 
//   const [fromInput, setFromInput] = useState("");
//   const [toInput, setToInput] = useState("");
//   const [fromSuggestions, setFromSuggestions] = useState([]);
//   const [toSuggestions, setToSuggestions] = useState([]);
//   const [travelDate, setTravelDate] = useState("");
//   const [travelTime, setTravelTime] = useState("");
//   const [anyTime, setAnyTime] = useState(false);
//   const [matchResult, setMatchResult] = useState(null);

//   const fromBoxRef = useRef();
//   const toBoxRef = useRef();
//   const navigate = useNavigate();

//   const fetchSuggestions = async (input, setter) => {
//     if (!input) return setter([]);
//     const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`);
//     const data = await res.json();
//     setter(data.features || []);
//   };

//   useEffect(() => {
//     const timer = setTimeout(() => fetchSuggestions(fromInput, setFromSuggestions), 300);
//     return () => clearTimeout(timer);
//   }, [fromInput]);

//   useEffect(() => {
//     const timer = setTimeout(() => fetchSuggestions(toInput, setToSuggestions), 300);
//     return () => clearTimeout(timer);
//   }, [toInput]);

//   useEffect(() => {
//     const handleClickOutside = (e) => {
//       if (fromBoxRef.current && !fromBoxRef.current.contains(e.target)) setFromSuggestions([]);
//       if (toBoxRef.current && !toBoxRef.current.contains(e.target)) setToSuggestions([]);
//     };
//     document.addEventListener("click", handleClickOutside);
//     return () => document.removeEventListener("click", handleClickOutside);
//   }, []);

//   useEffect(() => {
//     if (fromLocation?.address) setFromInput(fromLocation.address);
//   }, [fromLocation]);

//   useEffect(() => {
//     if (toLocation?.address) setToInput(toLocation.address);
//   }, [toLocation]);

//   const handleFromSelect = async (place) => {
//     setFromInput(place.place_name);
//     setFromSuggestions([]);
//     setFromLocation({ lat: place.center[1], lng: place.center[0], address: place.place_name });
//   };

//   const handleToSelect = async (place) => {
//     setToInput(place.place_name);
//     setToSuggestions([]);
//     setToLocation({ lat: place.center[1], lng: place.center[0], address: place.place_name });
//   };

//   const useCurrentLocation = async () => {
//     if (!navigator.geolocation) return;
//     navigator.geolocation.getCurrentPosition(async (pos) => {
//       const { latitude, longitude } = pos.coords;
//       const location = await reverseGeocode(latitude, longitude);
//       if (location) {
//         setFromLocation(location);
//         setFromInput(location.address);
//       }
//     });
//   };

//   const handleSubmit = async () => {
//     if (!fromLocation || !toLocation || !travelDate || (!travelTime && !anyTime)) {
//       alert("Please fill in all required fields.");
//       return;
//     }

//     const formattedTime = anyTime ? "23:59" : travelTime;
//     const fullDateTime = new Date(`${travelDate}T${formattedTime}:00`);

//     const { error } = await supabase.from("route_req").insert([
//       {
//         user_id: UserId,
//         user_type: Usertype,
//         start_lat: fromLocation.lat,
//         start_lng: fromLocation.lng,
//         end_lat: toLocation.lat,
//         end_lng: toLocation.lng,
//         time: fullDateTime.toISOString(),
//       },
//     ]);

//     if (error) {
//       console.error("Supabase Error:", error.message);
//       alert("Failed to submit your route.");
//       return;
//     }

//     alert("Your ride request has been saved!");

//     // Match search: find the opposite user type with similar route
//     const { data: candidates } = await supabase
//       .from("route_req")
//       .select("*")
//       .eq("user_type", Usertype === "rider" ? "driver" : "rider");

//     const match = candidates.find((user) => {
//       const distStart = Math.hypot(user.start_lat - fromLocation.lat, user.start_lng - fromLocation.lng);
//       const distEnd = Math.hypot(user.end_lat - toLocation.lat, user.end_lng - toLocation.lng);
//       return distStart < 0.05 && distEnd < 0.05; // ~5km
//     });

//     if (match) {
//       setMatchResult({
//         current: { from: fromLocation.address, to: toLocation.address },
//         match: {
//           user_id: match.user_id,
//           type: match.user_type,
//           from: `${match.start_lat.toFixed(4)}, ${match.start_lng.toFixed(4)}`,
//           to: `${match.end_lat.toFixed(4)}, ${match.end_lng.toFixed(4)}`,
//         },
//       });
//     } else {
//       setMatchResult({ current: { from: fromLocation.address, to: toLocation.address }, match: null });
//     }
//   };

//   return (
//     <div className="p-4 font-sans bg-white shadow-lg h-full overflow-y-auto">
//       <h2 className="text-xl font-bold mb-4">Select Locations</h2>

//       {/* From Location */}
//       <div className="mb-6 relative" ref={fromBoxRef}>
//         <label className="block text-gray-700 font-medium mb-1">From:</label>
//         <input
//           type="text"
//           value={fromInput}
//           onChange={(e) => setFromInput(e.target.value)}
//           onFocus={() => {
//             if (!UserId) navigate("/login");
//             setActiveInput("from");
//           }}
//           placeholder="Enter pickup location"
//           className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//         <button
//           onClick={useCurrentLocation}
//           className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
//         >
//           Use My Current Location
//         </button>
//         {fromSuggestions.length > 0 && (
//           <ul className="absolute w-full bg-white border mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
//             {fromSuggestions.map((place, index) => (
//               <li
//                 key={index}
//                 onClick={() => handleFromSelect(place)}
//                 className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
//               >
//                 {place.place_name}
//               </li>
//             ))}
//           </ul>
//         )}
//       </div>

//       {/* To Location */}
//       <div className="mb-6 relative" ref={toBoxRef}>
//         <label className="block text-gray-700 font-medium mb-1">To:</label>
//         <input
//           type="text"
//           value={toInput}
//           onChange={(e) => setToInput(e.target.value)}
//           onFocus={() => {
//             if (!UserId) navigate("/login");
//             setActiveInput("to");
//           }}
//           placeholder="Enter drop location"
//           className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//         {toSuggestions.length > 0 && (
//           <ul className="absolute w-full bg-white border mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
//             {toSuggestions.map((place, index) => (
//               <li
//                 key={index}
//                 onClick={() => handleToSelect(place)}
//                 className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
//               >
//                 {place.place_name}
//               </li>
//             ))}
//           </ul>
//         )}
//       </div>

//       {/* Travel Date */}
//       <div className="mb-6">
//         <label className="block text-gray-700 font-medium mb-1">Date of Travel:</label>
//         <input
//           type="date"
//           value={travelDate}
//           onChange={(e) => setTravelDate(e.target.value)}
//           className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//       </div>

//       {/* Travel Time */}
//       <div className="mb-6">
//         <label className="block text-gray-700 font-medium mb-1">Time of Travel:</label>
//         <div className="flex items-center space-x-3">
//           <input
//             type="time"
//             value={travelTime}
//             onChange={(e) => setTravelTime(e.target.value)}
//             disabled={anyTime}
//             className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//           />
//           <label className="inline-flex items-center space-x-2">
//             <input
//               type="checkbox"
//               checked={anyTime}
//               onChange={() => setAnyTime(!anyTime)}
//               className="form-checkbox h-5 w-5 text-blue-600"
//             />
//             <span className="text-gray-600">Any time in the day</span>
//           </label>
//         </div>
//       </div>

//       {/* Submit Button */}
//       <button
//         onClick={handleSubmit}
//         className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"
//       >
//         Confirm Ride
//       </button>

//       {/* Matched Result */}
//       {matchResult && (
//         <div className="mt-6 p-4 bg-gray-100 rounded-lg">
//           <h3 className="text-lg font-semibold mb-2">Matching Result</h3>
//           <p><strong>Your Route:</strong> {matchResult.current.from} → {matchResult.current.to}</p>
//           {matchResult.match ? (
//             <div>
//               <p><strong>Matched with:</strong> {matchResult.match.user_id}</p>
//               <p><strong>User Type:</strong> {matchResult.match.type}</p>
//               <p><strong>Start:</strong> {matchResult.match.from}</p>
//               <p><strong>End:</strong> {matchResult.match.to}</p>
//             </div>
//           ) : (
//             <p className="text-red-500">No match found yet.</p>
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export default LeftPanel;


import React, { useState, useEffect, useRef } from "react";
import { reverseGeocode } from "../hooks/useGeocode";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

const LeftPanel = ({ UserId, setActiveInput, setFromLocation, setToLocation, fromLocation, toLocation, Usertype }) => {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [travelDate, setTravelDate] = useState("");
  const [travelTime, setTravelTime] = useState("");
  const [anyTime, setAnyTime] = useState(false);
  const [matchResult, setMatchResult] = useState(null);

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

    const { data, error } = await supabase
      .from("matched_routes")
      .select("*")
      .or(`user_id.eq.${UserId},driver_id.eq.${UserId}`);

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

  const handleSubmit = async () => {
    if (!fromLocation || !toLocation || !travelDate || (!travelTime && !anyTime)) {
      alert("Please fill in all required fields.");
      return;
    }

    const formattedTime = anyTime ? "23:59" : travelTime;
    const fullDateTime = new Date(`${travelDate}T${formattedTime}:00`);

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
      console.error("❌ Insert error:", insertError.message);
      alert("Failed to submit your route.");
      return;
    }

    // Match logic
    const { data: candidates } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_type", Usertype === "rider" ? "driver" : "rider");

    const match = candidates.find((user) => {
      const distStart = Math.hypot(user.start_lat - fromLocation.lat, user.start_lng - fromLocation.lng);
      const distEnd = Math.hypot(user.end_lat - toLocation.lat, user.end_lng - toLocation.lng);
      return distStart < 0.05 && distEnd < 0.05;
    });

    if (match) {
      const riderId = Usertype === "rider" ? UserId : match.user_id;
      const driverId = Usertype === "driver" ? UserId : match.user_id;

      const { error: matchError } = await supabase.from("matched_routes").insert([
        {
          driver_id: driverId,
          user_id: riderId,
          driver_start_lat: Usertype === "driver" ? fromLocation.lat : match.start_lat,
          driver_start_lng: Usertype === "driver" ? fromLocation.lng : match.start_lng,
          driver_end_lat: Usertype === "driver" ? toLocation.lat : match.end_lat,
          driver_end_lng: Usertype === "driver" ? toLocation.lng : match.end_lng,
          user_start_lat: Usertype === "rider" ? fromLocation.lat : match.start_lat,
          user_start_lng: Usertype === "rider" ? fromLocation.lng : match.start_lng,
          user_end_lat: Usertype === "rider" ? toLocation.lat : match.end_lat,
          user_end_lng: Usertype === "rider" ? toLocation.lng : match.end_lng,
        },
      ]);

      if (matchError) {
        console.error("❌ Match insertion error:", matchError.message);
      }

      const matchedUserId = Usertype === "rider" ? match.user_id : match.user_id;
      const from = Usertype === "rider"
        ? `${match.start_lat.toFixed(4)}, ${match.start_lng.toFixed(4)}`
        : `${fromLocation.lat.toFixed(4)}, ${fromLocation.lng.toFixed(4)}`;
      const to = Usertype === "rider"
        ? `${match.end_lat.toFixed(4)}, ${match.end_lng.toFixed(4)}`
        : `${toLocation.lat.toFixed(4)}, ${toLocation.lng.toFixed(4)}`;

      setMatchResult({
        match: {
          user_id: matchedUserId,
          type: Usertype === "rider" ? "driver" : "rider",
          from,
          to,
        },
      });
    } else {
      alert("No match found yet.");
    }
  };


  const handleApprove = () => {
  console.log("🛠 Approve logic here (to be implemented)");
  // Example:
  // 1. Update matched_routes table with `approved: true`
  // 2. Emit socket event to notify rider
};


const handleMatchClick = (match) => {
  console.log("🔍 Match clicked:", match);
  // Navigate to a detailed view or perform an action
  // Example: navigate(`/ride/${match.user_id}`);

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
     {matchResult?.matches?.length > 0 && (
  <div className="mt-6 space-y-4">
    <h3 className="text-lg font-bold">Matched Rides</h3>
    {matchResult.matches.map((match, index) => (
      <div
        key={index}
        onClick={() => handleMatchClick(match)}
        className="cursor-pointer transform transition duration-200 hover:-translate-y-1 hover:shadow-lg bg-gray-100 rounded-lg p-4"
      >
        <p><strong>User ID:</strong> {match.user_id}</p>
        <p><strong>Type:</strong> {match.type}</p>
        <p><strong>From:</strong> {match.from}</p>
        <p><strong>To:</strong> {match.to}</p>

        {Usertype === "rider" ? (
          <p className="mt-2 text-yellow-600 font-medium">
            ⏳ Waiting for driver to approve your ride...
          </p>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleApprove(); // You already have this
            }}
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Approve Ride
          </button>
        )}
      </div>
    ))}
  </div>
)}


    </div>
  );
};

export default LeftPanel;


