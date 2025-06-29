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

  return (

    // <div className="flex flex-col sm:flex-row h-screen">

    //   <LeftPanel
    //     logIn={props.logIn}
    //     UserId={props.UserId}
    //     setClickedFrom={setClickedLocFrom}
    //     setClickedTo={setClickedLocTo}
    //     from={from}
    //     to={to}
    //   />



    //   {clickedLocFrom || clickedLocTo ? (
    //     <MapPicker
    //       setLoc={clickedLocFrom ? setFrom : setTo}
    //        UserId={props.UserId} 
    //       setClickedLoc={clickedLocFrom ? setClickedLocFrom : setClickedLocTo}
    //     />
    //   ) : (
    //     <RightPanel />
    //   )}
    // </div>

<div className="flex flex-col sm:flex-row h-screen">
      
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <Navbar logIn={props.logIn} />
       <LeftPanel
          fromLocation={fromLocation}
          toLocation={toLocation}
          setFromLocation={setFromLocation}
          setToLocation={setToLocation}
          UserId={props.UserId}
        />
      </div>

   
      <div className="hidden sm:block flex-1 h-screen relative">
       <RightMapPanel
          fromLocation={fromLocation}
          toLocation={toLocation}
          setFromLocation={setFromLocation}
          setToLocation={setToLocation}
        />
      </div>
    </div>

  );
}

export default Getride;