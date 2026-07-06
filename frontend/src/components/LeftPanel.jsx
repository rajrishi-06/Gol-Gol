import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";
import Navbar from "./Navbar";
import LocationInputs from "./LocationInputs";
import AvailableRides from "./AvailableRides";
import PublishRide from "./PublishRide";
import FindMatch from "./FindMatch";

const TABS = [
  { id: "DAILY RIDES", label: "Ride" },
  { id: "PUBLISH RIDE", label: "Publish" },
  { id: "FIND MATCH", label: "Share" },
];

export default function LeftPanel(props) {
  const [when, setWhen] = useState("Now");
  const [dateOfDeparture, setDateOfDeparture] = useState(null);
  const [activeTab, setActiveTab] = useState("DAILY RIDES");
  const [isDriverApproved, setIsDriverApproved] = useState(false);
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
        navigate("/driver/activate");
        return;
      }
      if (driver?.verification_status === "approved") setIsDriverApproved(true);
      else navigate("/driver/activate");
    };
    checkDriverStatus();
  }, [activeTab, navigate]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-y-auto border-border bg-background px-6 pb-8 sm:w-[500px] sm:shrink-0 sm:border-r lg:w-[540px]">
      <Navbar logIn={props.logIn} />

      <div className="animate-fade-up pt-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Where to today?
        </h1>
        <p className="mt-1 text-sm text-muted">
          Book instantly, publish a ride, or share a commute.
        </p>
      </div>

      {/* Segmented, accessible tablist */}
      <div
        role="tablist"
        aria-label="Ride mode"
        className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1"
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-lg py-2 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-surface text-foreground shadow-soft"
                  : "text-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
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
      </div>

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
        />
      )}

      {activeTab === "FIND MATCH" && (
        <FindMatch
          fromCords={props.fromCords}
          toCords={props.toCords}
          when={when}
          dateOfDeparture={dateOfDeparture}
        />
      )}
    </div>
  );
}
