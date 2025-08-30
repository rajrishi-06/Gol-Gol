import React, { useState } from "react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import MapPicker from "./MapPicker";
import DriverRoute from "./DriverRoute";

function Getride(props) {
  const [clickedLocFrom, setClickedLocFrom] = useState(false);
  const [clickedLocTo, setClickedLocTo] = useState(false);
  const [mode, setMode] = useState("from");
  const [selectedRide, setSelectedRide] = useState(null);
  const getInitialCenter = () => {
    if (mode === "from") {
      return props.fromCords;
    } else if (mode === "to") {
      return props.toCords;
    }
    return null;
  };
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
        setSelectedRide={setSelectedRide}
      />

      {clickedLocFrom || clickedLocTo ? (
        <MapPicker
          mode={mode}
          initialCenter={getInitialCenter()}
          setLoc={clickedLocFrom ? props.setFrom : props.setTo}
          setCords={clickedLocFrom ? props.setFromCords : props.setToCords}
          setClickedLoc={clickedLocFrom ? setClickedLocFrom : setClickedLocTo}
        />
      ) : selectedRide ? 
        (
          <DriverRoute ride={selectedRide} />
        ) : (
          <RightPanel />
        )
      }
      {selectedRide && (
        <button
          className="mt-2 px-4 py-2 bg-gray-200 rounded"
          onClick={() => setSelectedRide(null)}
        >
          Back
        </button>
      )}
    </div>
  );
}

export default Getride;