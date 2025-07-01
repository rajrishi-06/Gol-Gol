import react from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import { Navigate } from "react-router-dom"; 
import { useState, useEffect } from "react";

import RideTrackingMap from "../comp/RideTrackingMap";

function ConformRide(props){

    const location = useLocation();
  const { userId, rideId } = location.state || {};
 
return(
 <div className="flex flex-col sm:flex-row h-screen">
      {/* Left Panel */}
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <Navbar logIn={props.logIn} />
        
      </div>

      {/* Right Panel */}
      <div className="hidden sm:block flex-1 h-screen relative">
        <RideTrackingMap userId={userId} userType="user" />
      </div>
    </div>)
};

export default ConformRide;