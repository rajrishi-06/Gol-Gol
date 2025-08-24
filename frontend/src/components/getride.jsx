import React, { useState } from "react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import MapPicker from "./MapPicker";

function Getride(props) {
  const [clickedLocFrom, setClickedLocFrom] = useState(false);
  const [clickedLocTo, setClickedLocTo] = useState(false);
  const [mode, setMode] = useState("from");
  

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      <LeftPanel
        logIn={props.logIn}
        setMode={setMode}
        setClickedFrom={setClickedLocFrom}
        setClickedTo={setClickedLocTo}
        from={props.from}
        to={props.to}
        fromCords={props.fromCords}
        toCords={props.toCords}
      />

      {clickedLocFrom || clickedLocTo ? (
        <MapPicker
          mode={mode}
          initialCenter={clickedLocFrom ? props.fromCords : props.toCords}
          setLoc={clickedLocFrom ? props.setFrom : props.setTo}
          setCords={clickedLocFrom ? props.setFromCords : props.setToCords}
          setClickedLoc={clickedLocFrom ? setClickedLocFrom : setClickedLocTo}
        />
      ) : (
        <RightPanel />
      )}
    </div>
  );
}

export default Getride;