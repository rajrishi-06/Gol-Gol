import { useLocation } from "react-router-dom";
import react from "react";
import Navbar from "./Navbar";
import RideTrackingMap from "../comp/RideTrackingMap";

const AcceptRide = () => {
  const location = useLocation();
  const { user_id } = location.state || {};

  return(
  <div className="flex flex-col sm:flex-row h-screen">
    
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
       
     

      </div>

    

      <div className="hidden sm:block flex-1 h-screen relative">

<RideTrackingMap userId={user_id} userType="driver" />
     
      
     </div>
 
    </div>)
};

export default AcceptRide;