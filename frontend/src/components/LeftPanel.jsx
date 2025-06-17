import React, {useState} from "react";
import Navbar from "./Navbar";
import LocationInputs from "./LocationInputs";
import AvailableRides from "./AvailableRides";

function LeftPanel() {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [when, setWhen] = useState("Now");
    console.log({ to, when }); 
    return(
        <>
            <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
                {/* Header */}
                <Navbar />

                {/* Navigation */}
                <div className="flex gap-6 text-sm font-medium my-4">
                    <span className="text-green-600 border-b-2 border-green-600 pb-1">DAILY RIDES</span>
                    <span className="text-gray-500">OUTSTATION</span>
                    <span className="text-gray-500">RENTALS</span>
                </div>

                {/* Reusable LocationInputs */}
                <LocationInputs
                    fromValue={from}
                    toValue={to}
                    whenValue={when}
                    whenOptions={["Now", "In 30 minutes", "Schedule..."]}
                    onFromChange={setFrom}
                    onToChange={setTo}
                    onWhenChange={setWhen}
                />

                {/* Available Rides */}
                <AvailableRides />
            </div>
        </>
    );
};

export default LeftPanel;