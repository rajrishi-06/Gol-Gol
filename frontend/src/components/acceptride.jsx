import { useLocation } from "react-router-dom";
import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Delivery from "../livecomp/Delivery"; // Adjust the path
import { supabase } from "../server/supabase"; // Make sure this is correctly imported

const AcceptRide = (props) => {
  const location = useLocation();
  const { user_id, driver_id, ride_id } = location.state || {};

  const [pickupLocation, setPickupLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPickupLocation = async () => {
      if (!ride_id) return;
console.log(user_id, driver_id, ride_id);  
      const { data, error } = await supabase
        .from("progress_req")
        .select("pick_lat, pick_lng")
        .eq("driver_id",driver_id)
        .single();

      if (error) {
        console.error("Error fetching pickup location:", error.message);
        return;
      }

      if (data) {
        setPickupLocation({ lat: data.pick_lat, lng: data.pick_lng });
        setLoading(false);
      }
    };

    fetchPickupLocation();
  }, [user_id]);

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      {/* Left Panel */}
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <Navbar logIn={props.logIn} />
      </div>

      {/* Right Panel */}
      <div className="hidden sm:block flex-1 h-screen relative">
        {loading ? (
          <div className="text-center mt-10 text-lg font-semibold">Loading map...</div>
        ) : (
          <Delivery
            deliveryId={user_id}
            pickupLocation={pickupLocation}
          />
        )}
      </div>
    </div>
  );
};

export default AcceptRide;
