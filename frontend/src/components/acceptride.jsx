
import { useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Delivery from "../livecomp/Delivery";
import { supabase } from "../server/supabase";
import ChatBox from "../comp/chatbox";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

const AcceptRide = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user_id, driver_id, ride_id } = location.state || {};

  const [pickupLocation, setPickupLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [rideStarted, setRideStarted] = useState(false);
  const [drop, setDrop] = useState(false); // controls Delivery mode

  // 🔔 Listen for ride_completed event
  useEffect(() => {

socket.emit("join-room", driver_id);

    socket.on("ride_completed", () => {
      alert("✅ Ride completed!");
      navigate("/setride");
    });

    return () => {
      socket.off("ride_completed");
    };
  }, [navigate]);

  // 📦 Get pickup info
  useEffect(() => {
    const fetchPickupLocation = async () => {
      if (!ride_id || !driver_id) return;

      const { data, error } = await supabase
        .from("progress_req")
        .select("pick_lat, pick_lng, otp")
        .eq("driver_id", driver_id)
        .single();

      if (error) {
        console.error("Error fetching pickup location:", error.message);
        return;
      }

      if (data) {
        setPickupLocation({ lat: data.pick_lat, lng: data.pick_lng });
        setOtp(data.otp);
        setLoading(false);
      }
    };

    fetchPickupLocation();
  }, [ride_id, driver_id]);

  // 🔑 Handle OTP Submission
  const handleOtpSubmit = async () => {
    if (enteredOtp.trim() === otp?.toString()) {
      setOtpError("");

      // Delete from pending_req
      const { error: deleteError } = await supabase
        .from("pending_req")
        .delete()
        .eq("user_id", user_id);

      if (deleteError) {
        console.error("Error deleting from pending_req:", deleteError.message);
      }

      // Get drop location
      const { data: dropData, error: dropError } = await supabase
        .from("progress_req")
        .select("drop_lat, drop_lng")
        .eq("driver_id", driver_id)
        .single();

      if (dropError) {
        console.error("Error fetching drop location:", dropError.message);
      } else if (dropData) {
        setPickupLocation({ lat: dropData.drop_lat, lng: dropData.drop_lng });
        setRideStarted(true);
        setDrop(true);

        // Notify user ride started
        socket.emit("ride_started", { toUserId: user_id });

        console.log("📍 Switched to drop location:", dropData);
      }
    } else {
      setOtpError("❌ Wrong OTP! Please try again.");
    }
  };

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      {/* Left Panel */}
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
       <Navbar logIn={props.logIn} UserId={props.UserId} />

        {loading ? (
          <div className="mt-20 text-center text-xl font-semibold text-gray-700 animate-pulse">
            🔍 Waiting for ride details...
          </div>
        ) : !rideStarted ? (
          <div className="mt-10 space-y-4">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Enter OTP to Start Ride</h2>
            <input
              type="text"
              maxLength="6"
              value={enteredOtp}
              onChange={(e) => setEnteredOtp(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter OTP"
            />
            <button
              onClick={handleOtpSubmit}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-all"
            >
              Start Ride
            </button>
            {otpError && (
              <p className="text-red-600 text-sm font-medium mt-2">{otpError}</p>
            )}
          </div>
        ) : (
          <div className="mt-10 text-center p-6 bg-green-100 border border-green-400 rounded-xl shadow-md">
            <h2 className="text-2xl font-bold text-green-700 animate-bounce">
              ✅ Ride Started!
            </h2>
            <p className="text-gray-700 mt-2">
              You're now heading toward the destination. Enjoy your ride! 🚗💨
            </p>
          </div>
        )}
        <ChatBox fromId={driver_id} toId={user_id} />
      </div>

      {/* Right Panel */}
      <div className="hidden sm:block flex-1 h-screen relative">
        {loading ? (
          <div className="text-center mt-10 text-lg font-semibold">Loading map...</div>
        ) : (
          <Delivery deliveryId={user_id} pickupLocation={pickupLocation} drop={drop} />
        )}
      </div>
    </div>
  );
};

export default AcceptRide;
