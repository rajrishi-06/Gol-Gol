import React, { useState } from "react";
// import LeftPanel from "./LeftPanel";
// import RightPanel from "./RightPanel";
import MapPicker from "./MapPicker";
import Navbar from "./Navbar";

import LeftPanel from "../comp/left";
import RightMapPanel from "../comp/right";

function Getride(props) {
  const [clickedLocFrom, setClickedLocFrom] = useState(false);
  const [clickedLocTo, setClickedLocTo] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

 
const [fromLocation, setFromLocation] = useState(null);
  const [toLocation, setToLocation] = useState(null);
const [activeInput, setActiveInput] = useState("");
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

export default Getride;