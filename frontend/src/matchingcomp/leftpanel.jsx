// import React, { useState, useEffect, useRef } from "react";
// import { reverseGeocode } from "../hooks/useGeocode";
// import { useNavigate } from "react-router-dom";
// import { supabase } from "../server/supabase";
// import { io } from "socket.io-client";

// const socket = io("http://localhost:3001");
// const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

// const LeftPanel = ({ UserId, setActiveInput, setFromLocation, setToLocation, fromLocation, toLocation ,Usertype}) => {
//   const [fromInput, setFromInput] = useState("");
//   const [toInput, setToInput] = useState("");
//   const [fromSuggestions, setFromSuggestions] = useState([]);
//   const [toSuggestions, setToSuggestions] = useState([]);
//   const [travelDate, setTravelDate] = useState("");
//   const [travelTime, setTravelTime] = useState("");
//   const [anyTime, setAnyTime] = useState(false);

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

// const handleSubmit = async () => {
//   if (!fromLocation || !toLocation || !travelDate || (!travelTime && !anyTime)) {
//     alert("Please fill in all required fields.");
//     return;
//   }

//   // Combine date and time into a full ISO timestamp
//   const formattedTime = anyTime ? "23:59" : travelTime;
//   const fullDateTime = new Date(`${travelDate}T${formattedTime}:00`);

//   const { data, error } = await supabase
//     .from("route_req")
//     .insert([
//       {
//         user_id: UserId,
//         user_type: Usertype,
//         start_lat: fromLocation.lat,
//         start_lng: fromLocation.lng,
//         end_lat: toLocation.lat,
//         end_lng: toLocation.lng,
//         time: fullDateTime.toISOString(), // Supabase accepts ISO 8601 format for timestamptz
//       },
//     ]);

//  if (error) {
//   console.error("Supabase Error:", error.message, error.details, error.hint);
//   alert("Failed to submit your route. Please check the console for more details.");
//   return;
// }

//   alert("Your ride request has been saved! We’ll notify you when a match is found.");
//   // Optionally reset inputs or navigate to a "My Rides" page
// };


// socket.on("connect", () => {
//   console.log("Connected to server");
// socket.emit("register", UserId);
// });

// socket.on("hi", (data) => {
//   console.log("Received:", data.message, "for user:", data.userId);
// });

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
//           onKeyDown={(e) => e.key === "Enter" && setFromSuggestions([])}
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
//           <ul className="absolute w-full bg-white border border-gray-300 mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
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
//           onKeyDown={(e) => e.key === "Enter" && setToSuggestions([])}
//           placeholder="Enter drop location"
//           className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//         {toSuggestions.length > 0 && (
//           <ul className="absolute w-full bg-white border border-gray-300 mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
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
//     </div>
//   );
// };

// export default LeftPanel;



import React, { useState, useEffect, useRef } from "react";
import { reverseGeocode } from "../hooks/useGeocode";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase";
import { User } from "lucide-react";

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

  const handleSubmit = async () => {
    if (!fromLocation || !toLocation || !travelDate || (!travelTime && !anyTime)) {
      alert("Please fill in all required fields.");
      return;
    }

    const formattedTime = anyTime ? "23:59" : travelTime;
    const fullDateTime = new Date(`${travelDate}T${formattedTime}:00`);

    const { error } = await supabase.from("route_req").insert([
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

    if (error) {
      console.error("Supabase Error:", error.message);
      alert("Failed to submit your route.");
      return;
    }

    alert("Your ride request has been saved!");

    // Match search: find the opposite user type with similar route
    const { data: candidates } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_type", Usertype === "rider" ? "driver" : "rider");

    const match = candidates.find((user) => {
      const distStart = Math.hypot(user.start_lat - fromLocation.lat, user.start_lng - fromLocation.lng);
      const distEnd = Math.hypot(user.end_lat - toLocation.lat, user.end_lng - toLocation.lng);
      return distStart < 0.05 && distEnd < 0.05; // ~5km
    });

    if (match) {
      setMatchResult({
        current: { from: fromLocation.address, to: toLocation.address },
        match: {
          user_id: match.user_id,
          type: match.user_type,
          from: `${match.start_lat.toFixed(4)}, ${match.start_lng.toFixed(4)}`,
          to: `${match.end_lat.toFixed(4)}, ${match.end_lng.toFixed(4)}`,
        },
      });
    } else {
      setMatchResult({ current: { from: fromLocation.address, to: toLocation.address }, match: null });
    }
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

      {/* Travel Date */}
      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-1">Date of Travel:</label>
        <input
          type="date"
          value={travelDate}
          onChange={(e) => setTravelDate(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Travel Time */}
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
            <span className="text-gray-600">Any time in the day</span>
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"
      >
        Confirm Ride
      </button>

      {/* Matched Result */}
      {matchResult && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Matching Result</h3>
          <p><strong>Your Route:</strong> {matchResult.current.from} → {matchResult.current.to}</p>
          {matchResult.match ? (
            <div>
              <p><strong>Matched with:</strong> {matchResult.match.user_id}</p>
              <p><strong>User Type:</strong> {matchResult.match.type}</p>
              <p><strong>Start:</strong> {matchResult.match.from}</p>
              <p><strong>End:</strong> {matchResult.match.to}</p>
            </div>
          ) : (
            <p className="text-red-500">No match found yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default LeftPanel;



// import React, { useState, useEffect, useRef } from "react";
// import { reverseGeocode } from "../hooks/useGeocode";
// import { useNavigate } from "react-router-dom";
// import { supabase } from "../server/supabase";

// const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

// const LeftPanel = ({ UserId, setActiveInput, setFromLocation, setToLocation, fromLocation, toLocation ,Usertype}) => {
//   const [fromInput, setFromInput] = useState("");
//   const [toInput, setToInput] = useState("");
//   const [fromSuggestions, setFromSuggestions] = useState([]);
//   const [toSuggestions, setToSuggestions] = useState([]);
//   const [travelDate, setTravelDate] = useState("");
//   const [travelTime, setTravelTime] = useState("");
//   const [anyTime, setAnyTime] = useState(false);

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

// const handleSubmit = async () => {
//   if (!fromLocation || !toLocation || !travelDate || (!travelTime && !anyTime)) {
//     alert("Please fill in all required fields.");
//     return;
//   }

//   // Combine date and time into a full ISO timestamp
//   const formattedTime = anyTime ? "23:59" : travelTime;
//   const fullDateTime = new Date(`${travelDate}T${formattedTime}:00`);

//   const { data, error } = await supabase
//     .from("route_req")
//     .insert([
//       {
//         user_id: UserId,
//         user_type: Usertype,
//         start_lat: fromLocation.lat,
//         start_lng: fromLocation.lng,
//         end_lat: toLocation.lat,
//         end_lng: toLocation.lng,
//         time: fullDateTime.toISOString(), // Supabase accepts ISO 8601 format for timestamptz
//       },
//     ]);

//  if (error) {
//   console.error("Supabase Error:", error.message, error.details, error.hint);
//   alert("Failed to submit your route. Please check the console for more details.");
//   return;
// }

//   alert("Your ride request has been saved! We’ll notify you when a match is found.");
//   // Optionally reset inputs or navigate to a "My Rides" page
// };




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
//           onKeyDown={(e) => e.key === "Enter" && setFromSuggestions([])}
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
//           <ul className="absolute w-full bg-white border border-gray-300 mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
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
//           onKeyDown={(e) => e.key === "Enter" && setToSuggestions([])}
//           placeholder="Enter drop location"
//           className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//         {toSuggestions.length > 0 && (
//           <ul className="absolute w-full bg-white border border-gray-300 mt-1 rounded shadow-md z-10 max-h-52 overflow-y-auto">
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
//     </div>
//   );
// };

// export default LeftPanel;