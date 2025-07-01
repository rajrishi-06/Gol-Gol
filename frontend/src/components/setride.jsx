import React from "react";
import { Navigate } from "react-router-dom"; 
import Navbar from "./Navbar";

import DriverMap from "../comp/driver_map";
import NearbyRequests from "../comp/NearbyRequests";
function Setride(props) {
  
  if (!props.UserId) {
    return <Navigate to="/login" replace />;
  }

  return (
     <div className="flex flex-col sm:flex-row h-screen">
    
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
       <Navbar logIn={props.logIn} />
     

        <NearbyRequests  UserId={props.UserId}/>
      </div>

    

      <div className="hidden sm:block flex-1 h-screen relative">

      <DriverMap/>
      
     </div>
 
    </div>
  );
}

export default Setride;
