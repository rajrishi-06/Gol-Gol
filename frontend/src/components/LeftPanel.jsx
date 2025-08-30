import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase"; // adjust path
import Navbar from "./Navbar";
import LocationInputs from "./LocationInputs";
import AvailableRides from "./AvailableRides";
import PublishRide from "./PublishRide"; // create this component
import FindMatch from "../components/FindMatch"; // create this component

function LeftPanel(props) {
  const [when, setWhen] = useState("Now");
  const [dateOfDeparture, setDateOfDeparture] = useState(null);
  const [activeTab, setActiveTab] = useState("DAILY RIDES");
  const [isDriverApproved, setIsDriverApproved] = useState(false);
  const tabs = ["DAILY RIDES", "PUBLISH RIDE", "FIND MATCH"];

  const navigate = useNavigate();

  useEffect(() => {
    const checkDriverStatus = async () => {
      if (activeTab !== "PUBLISH RIDE") return;

      const user_uuid = localStorage.getItem("user_uuid");

      if (!user_uuid) {
        navigate("/login");
        return;
      }

      const { data: driver, error } = await supabase
        .from("drivers")
        .select("verification_status")
        .eq("user_id", user_uuid)
        .single();

      if (error) {
        console.error("Error fetching driver:", error);
        navigate("/driver/activate");
        return;
      }

      if (driver?.verification_status === "approved") {
        setIsDriverApproved(true);
      } else {
        navigate("/driver/activate");
      }
    };

    checkDriverStatus();
  }, [activeTab, navigate]);

  return (
    <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
      <Navbar logIn={props.logIn} />

      {/* Tabs */}
      <div className="flex text-sm font-medium my-4">
        {tabs.map((tab) => (
          <span
            key={tab}
            className={`flex-1 text-center cursor-pointer ${
              activeTab === tab
                ? "text-green-600 border-b-2 border-green-600 pb-1"
                : "text-gray-500"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </span>
        ))}
      </div>

      <LocationInputs
        fromValue={props.from}
        toValue={props.to}
        setMode={props.setMode}
        whenValue={when}
        whenOptions={["Now", "In 30 minutes", "Schedule..."]}
        setDateOfDeparture={setDateOfDeparture}
        onWhenChange={setWhen}
        setClickedFrom={props.setClickedFrom}
        setClickedTo={props.setClickedTo}
        activeTab={activeTab}
      />

      {activeTab === "DAILY RIDES" && (
        <AvailableRides fromCords={props.fromCords} toCords={props.toCords} />
      )}

      {activeTab === "PUBLISH RIDE" && isDriverApproved && (
        <PublishRide
          fromCords={props.fromCords}
          toCords={props.toCords}
          fromValue={props.from}
          toValue={props.to}
          when={when}
          dateOfDeparture={dateOfDeparture}
          setSelectedRide={props.setSelectedRide}
        />
      )}

      {activeTab === "FIND MATCH" && (
        <FindMatch 
          fromCords={props.fromCords} 
          toCords={props.toCords} 
          when={when} 
          dateOfDeparture={dateOfDeparture}
          setSelectedRide={props.setSelectedRide}
        />
      )}
    </div>
  );
}

export default LeftPanel;
