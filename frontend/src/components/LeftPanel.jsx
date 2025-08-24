import React, { useState } from "react";
import Navbar from "./Navbar";
import LocationInputs from "./LocationInputs";
import AvailableRides from "./AvailableRides";

function LeftPanel(props) {
  const [when, setWhen] = useState("Now");

  return (
    <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
      <Navbar logIn={props.logIn} />
      <div className="flex gap-6 text-sm font-medium my-4">
        <span className="text-green-600 border-b-2 border-green-600 pb-1">DAILY RIDES</span>
        <span className="text-gray-500">OUTSTATION</span>
        <span className="text-gray-500">RENTALS</span>
      </div>

      <LocationInputs
        fromValue={props.from}
        toValue={props.to}
        setMode={props.setMode}
        whenValue={when}
        whenOptions={["Now", "In 30 minutes", "Schedule..."]}
        onWhenChange={setWhen}
        setClickedFrom={props.setClickedFrom}
        setClickedTo={props.setClickedTo}
      />

      <AvailableRides fromCords={props.fromCords} toCords={props.toCords}/>
    </div>
  );
}

export default LeftPanel;
