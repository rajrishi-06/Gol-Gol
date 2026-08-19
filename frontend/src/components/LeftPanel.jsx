import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Briefcase, MapPin, Clock, ArrowUpDown } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { useBooking } from "../lib/booking.jsx";
import { listSavedPlaces, recentDestinations } from "../lib/places";
import { cn } from "../lib/cn";
import LocationInputs from "./LocationInputs";
import AvailableRides from "./AvailableRides";
import PublishRide from "./PublishRide";
import FindMatch from "./FindMatch";
import Alert from "./ui/Alert";

const TABS = [
  { id: "DAILY RIDES", label: "Ride" },
  { id: "PUBLISH RIDE", label: "Publish" },
  { id: "FIND MATCH", label: "Share" },
];

const KIND_ICON = { home: Home, work: Briefcase, custom: MapPin };

/** One-tap shortcuts to the places this rider actually goes. */
function QuickPlaces({ places, recents, onPick }) {
  const items = [
    ...places.map((p) => ({ key: p.id, icon: KIND_ICON[p.kind] ?? MapPin, label: p.label, place: p })),
    ...recents.map((r, i) => ({
      key: `recent-${i}`,
      icon: Clock,
      label: r.address.split(",")[0],
      place: { address: r.address, lat: r.lat, lng: r.lng },
    })),
  ].slice(0, 6);

  if (!items.length) return null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Saved and recent destinations">
      {items.map(({ key, icon: Icon, label, place }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(place)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-soft transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[9rem] truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The booking panel. Trip state now comes from the booking context rather than
 * a prop chain through `App`, so a refresh mid-booking no longer loses the trip.
 */
export default function LeftPanel({ onPickFrom, onPickTo }) {
  const navigate = useNavigate();
  const { userId, isAuthenticated, driver, isApprovedDriver } = useAuth();
  const trip = useBooking();

  const [activeTab, setActiveTab] = useState("DAILY RIDES");

  // `patch` is stable, so these are too — LocationInputs uses them as effect
  // dependencies.
  const { patch } = trip;
  const setWhen = useCallback((when) => patch({ when }), [patch]);
  const setScheduledFor = useCallback((scheduledFor) => patch({ scheduledFor }), [patch]);
  const [places, setPlaces] = useState([]);
  const [recents, setRecents] = useState([]);

  useEffect(() => {
    if (!userId) {
      setPlaces([]);
      setRecents([]);
      return;
    }
    let active = true;
    (async () => {
      const [{ data: saved }, recent] = await Promise.all([
        listSavedPlaces(userId),
        recentDestinations(userId, 3),
      ]);
      if (!active) return;
      setPlaces(saved);
      setRecents(recent);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const pickDestination = (place) => trip.setDrop(place.address, { lat: place.lat, lng: place.lng });

  const canPublish = isApprovedDriver;
  const driverStatus = driver?.verification_status;

  return (
    <div className="flex w-full flex-col overflow-y-auto border-border bg-background px-5 pb-8 pt-5 sm:w-[460px] sm:shrink-0 sm:border-r sm:px-6 lg:w-[500px]">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Where to today?</h1>
        <p className="mt-1 text-sm text-muted">
          Book instantly, publish a ride, or share a commute.
        </p>
      </div>

      {/* Mode tabs */}
      <div
        role="tablist"
        aria-label="Ride mode"
        className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1"
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
                selected ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <LocationInputs
          fromValue={trip.from}
          toValue={trip.to}
          whenValue={trip.when}
          onWhenChange={setWhen}
          setDateOfDeparture={setScheduledFor}
          onPickFrom={onPickFrom}
          onPickTo={onPickTo}
          onSwap={trip.swap}
          activeTab={activeTab}
        />

        {trip.from && trip.to && (
          <button
            type="button"
            onClick={trip.swap}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpDown className="h-3.5 w-3.5" /> Swap pickup and drop
          </button>
        )}
      </div>

      {activeTab === "DAILY RIDES" && (
        <>
          {isAuthenticated && (
            <QuickPlaces places={places} recents={recents} onPick={pickDestination} />
          )}
          <AvailableRides fromCords={trip.fromCords} toCords={trip.toCords} />
        </>
      )}

      {activeTab === "PUBLISH RIDE" &&
        (canPublish ? (
          <PublishRide />
        ) : (
          <Alert tone="info" title="Publishing needs a verified driver account" className="mt-5">
            {driverStatus === "pending"
              ? "Your application is being reviewed — you'll be able to publish once it's approved."
              : "Sign up as a driver and get your documents verified to publish shared rides."}{" "}
            <button
              type="button"
              onClick={() => navigate("/driver/activate")}
              className="font-semibold underline underline-offset-2"
            >
              {driverStatus ? "Check status" : "Get started"}
            </button>
          </Alert>
        ))}

      {activeTab === "FIND MATCH" && (
        <FindMatch
          fromCords={trip.fromCords}
          toCords={trip.toCords}
          dateOfDeparture={trip.scheduledFor}
        />
      )}
    </div>
  );
}
