import React, { useState } from "react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import MapPicker from "./MapPicker";

function Getride(props) {
  const [clickedLocFrom, setClickedLocFrom] = useState(false);
  const [clickedLocTo, setClickedLocTo] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

 

  return (
    <div className="flex flex-col sm:flex-row h-screen">

      <LeftPanel
        logIn={props.logIn}
        UserId={props.UserId}
        setClickedFrom={setClickedLocFrom}
        setClickedTo={setClickedLocTo}
        from={from}
        to={to}
      />



      {clickedLocFrom || clickedLocTo ? (
        <MapPicker
          setLoc={clickedLocFrom ? setFrom : setTo}
           UserId={props.UserId} 
          setClickedLoc={clickedLocFrom ? setClickedLocFrom : setClickedLocTo}
        />
      ) : (
        <RightPanel />
      )}
    </div>
  );
}

export default Getride;