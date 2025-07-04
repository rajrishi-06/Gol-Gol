import React, { use, useEffect, useState } from "react";
import { supabase } from "../server/supabase";
import { reverseGeocode } from "../hooks/useGeocode";
import { getDistance } from "geolib";
import { useNavigate } from "react-router-dom";

import { io } from "socket.io-client"; 
const socket = io("http://localhost:3001");

const MAX_DISTANCE_KM = 20;

const NearbyRequests = ({UserId}) => {
    const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState(null);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      (err) => {
        console.error("Location error:", err.message);
      }
    );
  }, []);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!userLocation) return;

      const { data, error } = await supabase.from("pending_req").select("*");
      if (error) {
        console.error("Supabase error:", error.message);
        return;
      }

      const enriched = await Promise.all(
        data.map(async (req) => {
          const distance = getDistance(
            { latitude: userLocation.lat, longitude: userLocation.lng },
            { latitude: req.pick_lat, longitude: req.pick_lng }
          ) / 1000;

          if (distance > MAX_DISTANCE_KM) return null;

          const fromAddress = await reverseGeocode(req.pick_lat, req.pick_lng);
          const toAddress = await reverseGeocode(req.drop_lat, req.drop_lng);

          return {
            ...req,
            fromAddress: fromAddress?.address || "Unknown",
            toAddress: toAddress?.address || "Unknown",
            distance,
          };
        })
      );

      const filtered = enriched
        .filter((req) => req !== null)
        .sort((a, b) => a.distance - b.distance);

      setFilteredRequests(filtered);
      setLoading(false);
    };

    fetchRequests();
  }, [userLocation]);

  const handleAcceptRide = async (req) => {
  const { error } = await supabase
  .from("progress_req")
  .upsert(
    {
      user_id: req.user_id,
      driver_id: UserId,
      pick_lat: req.pick_lat,
      pick_lng: req.pick_lng,
      drop_lat: req.drop_lat,
      drop_lng: req.drop_lng,
      otp:Math.floor(1000 + Math.random() * 9000), // Generate a random 4-digit OTP
    },
    { onConflict: ['user_id'] } // 👈 ensure 'user_id' is unique in your table
  );

  if (error) {
    console.error("Error inserting into progress_req:", error.message);
    alert("Failed to accept ride. Please try again.");
    return;
  }

  alert(`✅ Ride accepted!`);
  navigate("/acceptride", {
    state: {
      user_id: req.user_id,
      driver_id: UserId,
      ride_id: req.ride_id,
    },
  });
const con=true;

socket.emit("ride_accepted", { userId: req.user_id, accepted: true });
  
};


  if (loading) return <div className="p-4">🔄 Loading nearby requests...</div>;

  if (filteredRequests.length === 0)
    return <div className="p-4 text-gray-500">No pending requests within 20 km.</div>;

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">📍 Nearby Pending Requests</h2>
      <ul className="space-y-6">
        {filteredRequests.map((req) => (
          <li key={req.id} className="p-5 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-gray-500">User ID: <span className="text-black">{req.user_id}</span></div>
                <div className="text-sm text-gray-500">Ride ID: <span className="text-black">{req.ride_id}</span></div>
                <div className="mt-2">
                  <div><span className="font-semibold">From:</span> {req.fromAddress}</div>
                  <div><span className="font-semibold">To:</span> {req.toAddress}</div>
                  <div className="text-sm text-gray-500 mt-1">🧭 {req.distance.toFixed(2)} km from you</div>
                </div>
              </div>
              <button
                onClick={() => handleAcceptRide(req)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium mt-2"
              >
                Accept Ride
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default NearbyRequests;

