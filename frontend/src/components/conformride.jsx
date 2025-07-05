
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Customer from "../livecomp/Customer";
import { supabase } from "../server/supabase";
import { io } from "socket.io-client";

import ChatBox from "../comp/chatbox";

const socket = io("http://localhost:3001");

function ConformRide(props) {
  const location = useLocation();
  const { userId, rideId } = location.state || {};
const navigate = useNavigate();
  const [dropLocation, setDropLocation] = useState(null);
  const [otp, setOtp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progressAvailable, setProgressAvailable] = useState(false);
const [isRideStarted, setIsRideStarted] = useState(false);
 const [driverId, setDriverId] = useState(null);



useEffect(() => {
  socket.emit("join-room", userId);
  console.log("🟢 Joined room:", userId);

  socket.on("ride_started", () => {

    console.log("🟢 Ride started signal received from server");

    const fetchDrop = async () => {
      const { data, error } = await supabase
        .from("progress_req")
        .select("drop_lat, drop_lng")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (data) {
        setDropLocation({ lat: data.drop_lat, lng: data.drop_lng });
        setIsRideStarted(true);
      } else {
        console.error("❌ Failed to fetch drop location:", error?.message);
      }
    };

    fetchDrop();
  });

  // ✅ Ride completed
  socket.on("ride_completed", () => {
    console.log("✅ Ride completed event received");

   
    window.location.href = "/";
     alert("🎉 Ride Completed Successfully!");
     Navigate("/");
  });

  return () => {
    socket.off("ride_started");
    socket.off("ride_completed");
  };
}, [userId]);


  useEffect(() => {
    if (!userId) return;

    let intervalId = null;

    const pollProgress = async () => {
      const { data, error } = await supabase
        .from("progress_req")
        .select("driver_id,pick_lat, pick_lng, otp")
        .eq("user_id", userId)
        .single();

      if (data) {
        setDropLocation({ lat: data.pick_lat, lng: data.pick_lng });
        setOtp(data.otp);
        setProgressAvailable(true);
        setLoading(false);
        setDriverId(data.driver_id); // Store driver ID
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
        <div className="text-md mt-4">
  {progressAvailable ? (
    <>
      <span className="font-bold text-green-600">OTP: {otp}</span>
      <ChatBox fromId={userId} toId={driverId} />
    </>
  ) : (
    <span className="font-semibold text-blue-600 animate-pulse">
      Searching for driver...
    </span>
  )}
</div>
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




