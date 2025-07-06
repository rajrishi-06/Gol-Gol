import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";

import LeftPanel from "./leftpanel";
import RightMapPanel from "../comp/right";



import { io } from "socket.io-client";
const socket = io("http://localhost:3001");

function Publishride(props) {
  const [clickedLocFrom, setClickedLocFrom] = useState(false);
  const [clickedLocTo, setClickedLocTo] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

 
const [fromLocation, setFromLocation] = useState(null);
  const [toLocation, setToLocation] = useState(null);
const [activeInput, setActiveInput] = useState("");

const UserId = props.UserId;
 useEffect(() => {
   

    socket.emit("register", UserId);

    const handleHi = ({ userId, message }) => {
      if (userId === UserId) {
        console.log("🎯 Message for me (FindRide):", message);
      }
    };

    socket.on("hi", handleHi);

    return () => {
      socket.off("hi", handleHi);
    };
  }, [UserId]);


  return (

<div className="flex flex-col sm:flex-row h-screen">
      
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <Navbar logIn={props.logIn} />
       <LeftPanel
          fromLocation={fromLocation}
          toLocation={toLocation}
          setFromLocation={setFromLocation}
          setToLocation={setToLocation}
          UserId={props.UserId}
          setActiveInput={setActiveInput}
          Usertype={"driver"}
        />
        
      </div>

   
      <div className="hidden sm:block flex-1 h-screen relative">
       <RightMapPanel
          fromLocation={fromLocation}
          toLocation={toLocation}
          setFromLocation={setFromLocation}
          setToLocation={setToLocation}
          activeInput={activeInput}
        />
      </div>
    </div>

  );
}

export default Publishride;