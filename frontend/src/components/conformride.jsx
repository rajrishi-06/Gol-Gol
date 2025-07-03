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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDropLocation = async () => {
      if (!rideId) return;

      const { data, error } = await supabase
        .from("progress_req")
        .select("pick_lat, pick_lng")
        .eq("user_id", userId)
        .single(); 

      if (error) {
        console.error("Error fetching location:", error.message);
        return;
      }

      if (data) {
        setDropLocation({ lat: data.pick_lat, lng: data.pick_lng });
        setLoading(false);
      }
    };

    fetchDropLocation();
  }, [rideId]);


 useEffect(() => {
  if (!userId) return;

  // Join room
  socket.emit("join", userId);
  console.log("🟢 Joined room:", userId);

  // Register listener
 socket.on("driver_accecpted", ({ accecpted }) => {
    console.log("🚖 Ride accepted by driver:", accecpted);
    });

  return () => {
    socket.off("driver_accepted", handleRideAccepted);
    console.log("🔴 Removed driver_accepted listener");
  };
}, [userId]);



  return (
    <div className="flex flex-col sm:flex-row h-screen">
      {/* Left Panel */}
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <Navbar logIn={props.logIn} />
<p>{props.logIn}</p>
      </div>

      {/* Right Panel */}
      <div className="hidden sm:block flex-1 h-screen relative">
        {loading ? (
          <div className="text-center mt-10 text-lg font-semibold">Loading map...</div>
        ) : (
          <Customer
            deliveryId={userId}
            dropLocation={dropLocation}
          />

        )}
      </div>
    </div>
  );
}

export default ConformRide;





 

 
