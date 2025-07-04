// import React, { useState, useEffect } from "react";
// import { useLocation } from "react-router-dom";
// import Navbar from "./Navbar";
// import Customer from "../livecomp/Customer";
// import { supabase } from "../server/supabase";


// import { io } from "socket.io-client"; 
// const socket = io("http://localhost:3001");

// function ConformRide(props) {
//   const location = useLocation();
//   const { userId, rideId } = location.state || {};
  
//   const [dropLocation, setDropLocation] = useState(null);
//   const [loading, setLoading] = useState(true);


//   useEffect(() => {
//     const channel = supabase
//       .channel('realtime:progress_req') // You can name it anything
//       .on(
//         'postgres_changes',
//         {
//           event: 'INSERT',  // You can also use '*' to catch all changes
//           schema: 'public',
//           table: 'progress_req',  // Replace with your table name
//         },
//         (payload) => {
//           console.log("📥 New data received:", payload.new);
//           setData(payload.new); // Update your state
//         }
//       )
//       .subscribe();

//     return () => {
//       supabase.removeChannel(channel); // Cleanup when component unmounts
//     };
//   }, []);

//   useEffect(() => {
//     const fetchDropLocation = async () => {
//       if (!rideId) return;

//       const { data, error } = await supabase
//         .from("progress_req")
//         .select("pick_lat, pick_lng")
//         .eq("user_id", userId)
//         .single(); 

//       if (error) {
//         console.error("Error fetching location:", error.message);
//         return;
//       }

//       if (data) {
//         setDropLocation({ lat: data.pick_lat, lng: data.pick_lng });
//         setLoading(false);
//       }
//     };

//     fetchDropLocation();
//   }, [rideId]);


//  useEffect(() => {
//   if (!userId) return;

//   // Join room
//   socket.emit("join", userId);
//   console.log("🟢 Joined room:", userId);

//   // Register listener
//  socket.on("driver_accecpted", ({ accecpted }) => {
//     console.log("🚖 Ride accepted by driver:", accecpted);
//     });

//   return () => {
//     socket.off("driver_accepted", handleRideAccepted);
//     console.log("🔴 Removed driver_accepted listener");
//   };
// }, [userId]);



//   return (
//     <div className="flex flex-col sm:flex-row h-screen">
//       {/* Left Panel */}
//       <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
//         <Navbar logIn={props.logIn} />
// <p>{props.logIn}</p>
//       </div>

//       {/* Right Panel */}
//       <div className="hidden sm:block flex-1 h-screen relative">
//         {loading ? (
//           <div className="text-center mt-10 text-lg font-semibold">Loading map...</div>
//         ) : (
//           <Customer
//             deliveryId={userId}
//             dropLocation={dropLocation}
//           />

//         )}
//       </div>
//     </div>
//   );
// }

// export default ConformRide;


import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Customer from "../livecomp/Customer";
import { supabase } from "../server/supabase";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

function ConformRide(props) {
  const location = useLocation();
  const { userId, rideId } = location.state || {};

  const [dropLocation, setDropLocation] = useState(null);
  const [otp, setOtp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progressAvailable, setProgressAvailable] = useState(false);
const [isRideStarted, setIsRideStarted] = useState(false);
 
useEffect(() => {
  socket.emit("join-room", userId);
  console.log("🟢 Joined room:", userId);

  socket.on("ride_started", () => {
    console.log("🟢 Ride started signal received from server");

    // Fetch drop_lat and drop_lng from Supabase
    const fetchDrop = async () => {
      const { data, error } = await supabase
        .from("progress_req")
        .select("drop_lat, drop_lng")
        .eq("user_id", userId)
.limit(1)
.maybeSingle(); 

      if (data) {
        setDropLocation({ lat: data.drop_lat, lng: data.drop_lng });
        setIsRideStarted(true); // Optional: mark state
      } else {
        console.error("❌ Failed to fetch drop location:", error?.message);
      }
    };

    fetchDrop();
  });

  return () => {
    socket.off("ride_started");
  };
}, [userId]);




  useEffect(() => {
    if (!userId) return;

    let intervalId = null;

    const pollProgress = async () => {
      const { data, error } = await supabase
        .from("progress_req")
        .select("pick_lat, pick_lng, otp")
        .eq("user_id", userId)
        .single();

      if (data) {
        setDropLocation({ lat: data.pick_lat, lng: data.pick_lng });
        setOtp(data.otp);
        setProgressAvailable(true);
        setLoading(false);

        // ✅ Stop polling once data is found
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Start polling
    intervalId = setInterval(pollProgress, 2000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userId]);

 

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      {/* Left Panel */}
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <Navbar logIn={props.logIn} />
        <p className="text-md mt-4">
          {progressAvailable ? (
            <span className="font-bold text-green-600">OTP: {otp}</span>
          ) : (
            <span className="font-semibold text-blue-600 animate-pulse">
              Searching for driver...
            </span>
          )}
        </p>
      </div>

      {/* Right Panel */}
      <div className="hidden sm:block flex-1 h-screen relative">
        {loading ? (
          <div className="text-center mt-10 text-lg font-semibold">
            Loading map...
          </div>
        ) : progressAvailable ? (
          <Customer deliveryId={userId} dropLocation={dropLocation} />
        ) : (
          <div className="text-center mt-10 text-lg font-semibold text-blue-600 animate-pulse">
            Looking for a nearby driver...
          </div>
        )}
      </div>
    </div>
  );
}

export default ConformRide;





 

 
