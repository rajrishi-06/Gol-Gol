import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Route as RouteIcon, LogOut, Inbox, Moon } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { distanceKm } from "../../lib/geo";
import { notifyUser } from "../../lib/notify";
import { formatCurrency, formatDistance } from "../../lib/format";
import { cn } from "../../lib/cn";
import RightPanel from "../RightPanel";
import Logo from "../ui/Logo";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Spinner from "../ui/Spinner";
import EmptyState from "../ui/EmptyState";

/** On-duty switch — go offline (off-duty) without logging out of the app. */
function DutyToggle({ online, onToggle }) {
  return (
    <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", online ? "bg-success" : "bg-subtle")} />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{online ? "You're online" : "You're offline"}</p>
          <p className="text-xs text-muted">
            {online ? "Receiving nearby ride requests" : "Not receiving requests — still logged in"}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        aria-label={online ? "Go offline" : "Go online"}
        onClick={onToggle}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          online ? "bg-primary" : "bg-surface-3"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            online ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function RideRequestCard({ ride, onAccept, isAccepting }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">New ride request</h3>
        <span className="text-lg font-bold text-primary">{formatCurrency(ride.fare)}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-muted">
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Pickup · {ride.from_lat.toFixed(4)}, {ride.from_lng.toFixed(4)}
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-danger" />
          Drop · {ride.to_lat.toFixed(4)}, {ride.to_lng.toFixed(4)}
        </p>
        <p className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-subtle" />
          {formatDistance(ride.distance_km)}
        </p>
      </div>
      <Button fullWidth className="mt-4" loading={isAccepting} onClick={() => onAccept(ride.id)}>
        {isAccepting ? "Accepting…" : "Accept ride"}
      </Button>
    </Card>
  );
}

export default function DriverDashboard() {
  const navigate = useNavigate();
  const [driverDetails, setDriverDetails] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [availableRides, setAvailableRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingRideId, setAcceptingRideId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const initialFetched = useRef(false);

  const handleLogout = useCallback(async () => {
    const driverId = localStorage.getItem("user_uuid");
    if (driverId) await supabase.from("active_drivers").delete().eq("user_id", driverId);
    await supabase.auth.signOut();
    localStorage.removeItem("user_uuid");
    navigate("/");
  }, [navigate]);

  const fetchInitialRides = useCallback(async (location, vehicleType) => {
    if (!location || !vehicleType) return;
    const { data: pendingRides, error } = await supabase.rpc("nearby_pending_rides", {
      p_lat: location.lat,
      p_lng: location.lng,
      p_vehicle: vehicleType,
      p_radius_km: 5,
    });
    if (!error && pendingRides) setAvailableRides(pendingRides);
    setLoading(false);
  }, []);

  // Toggle on/off duty. Offline keeps the session but stops matching.
  const toggleOnline = useCallback(async () => {
    const driverId = localStorage.getItem("user_uuid");
    const next = !isOnline;
    setIsOnline(next);
    await supabase
      .from("active_drivers")
      .update({ is_online: next, last_active_at: new Date().toISOString() })
      .eq("user_id", driverId);
    if (!next) {
      setAvailableRides([]);
    } else if (driverLocation && driverDetails) {
      setLoading(true);
      fetchInitialRides(driverLocation, driverDetails.vehicle_type);
    }
  }, [isOnline, driverLocation, driverDetails, fetchInitialRides]);

  useEffect(() => {
    const driverId = localStorage.getItem("user_uuid");
    if (!driverId) {
      navigate("/login");
      return;
    }
    let mounted = true;
    let watcher = null;

    (async () => {
      const { data: driverData, error } = await supabase
        .from("drivers")
        .select("vehicle_type")
        .eq("user_id", driverId)
        .single();
      if (error || !driverData) {
        if (mounted) handleLogout();
        return;
      }
      if (!mounted) return;
      setDriverDetails(driverData);

      // Sync the persisted duty state.
      const { data: ad } = await supabase
        .from("active_drivers")
        .select("is_online")
        .eq("user_id", driverId)
        .maybeSingle();
      if (mounted && ad) setIsOnline(ad.is_online ?? true);

      watcher = navigator.geolocation.watchPosition(
        async (position) => {
          if (!mounted) return;
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setDriverLocation(loc);
          await supabase
            .from("active_drivers")
            .update({ current_lat: loc.lat, current_lng: loc.lng, last_active_at: new Date().toISOString() })
            .eq("user_id", driverId);
          if (!initialFetched.current) {
            initialFetched.current = true;
            fetchInitialRides(loc, driverData.vehicle_type);
          }
        },
        () => mounted && setLoading(false),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    })();

    return () => {
      mounted = false;
      if (watcher) navigator.geolocation.clearWatch(watcher);
    };
  }, [navigate, handleLogout, fetchInitialRides]);

  // Realtime new/updated requests — only while on duty.
  useEffect(() => {
    if (!isOnline || !driverLocation || !driverDetails) return;
    const channel = supabase
      .channel("public:rides")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, (payload) => {
        const newRide = payload.new;
        const oldRide = payload.old;
        if (
          payload.eventType === "INSERT" &&
          newRide.status === "pending" &&
          newRide.vehicle_type === driverDetails.vehicle_type &&
          distanceKm(driverLocation, { lat: newRide.from_lat, lng: newRide.from_lng }) <= 5
        ) {
          setAvailableRides((prev) => [newRide, ...prev.filter((r) => r.id !== newRide.id)]);
        }
        if (payload.eventType === "UPDATE" && oldRide?.status === "pending") {
          setAvailableRides((prev) => prev.filter((r) => r.id !== newRide.id));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [isOnline, driverLocation, driverDetails]);

  const handleAcceptRide = async (rideId) => {
    setAcceptingRideId(rideId);
    const driverId = localStorage.getItem("user_uuid");
    const { data: updatedRide, error } = await supabase
      .from("rides")
      .update({ status: "accepted", driver_id: driverId })
      .eq("id", rideId)
      .eq("status", "pending")
      .select()
      .single();
    if (error || !updatedRide) {
      setAvailableRides((prev) => prev.filter((r) => r.id !== rideId));
    } else {
      await supabase
        .from("active_drivers")
        .update({ on_ride: true, current_ride_id: rideId })
        .eq("user_id", driverId);
      notifyUser({
        userId: updatedRide.rider_id,
        title: "Driver on the way",
        body: `A ${driverDetails?.vehicle_type || "driver"} accepted your ride and is heading to you.`,
        url: `/rider/ride/${rideId}`,
        type: "ride_accepted",
      });
      navigate(`/driver/ride/${rideId}`);
    }
    setAcceptingRideId(null);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <div className="flex w-full flex-col overflow-y-auto bg-background px-6 pb-8 sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </header>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Driver dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Requests for your <span className="font-medium text-foreground">{driverDetails?.vehicle_type || "vehicle"}</span> appear here in real time.
        </p>

        <DutyToggle online={isOnline} onToggle={toggleOnline} />

        <div className="mt-5 flex-1 space-y-3">
          {!isOnline ? (
            <EmptyState
              icon={Moon}
              title="You're off duty"
              description="Flip the switch above to go back online and start receiving ride requests."
            />
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-muted">
              <Spinner className="h-6 w-6 text-primary" />
              <p className="text-sm">Finding rides near you…</p>
            </div>
          ) : availableRides.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No requests right now"
              description="Stay online — we'll ping you the moment a nearby rider needs a lift."
            />
          ) : (
            availableRides.map((ride, i) => (
              <div key={ride.id} className="animate-rise" style={{ "--i": i }}>
                <RideRequestCard
                  ride={ride}
                  onAccept={handleAcceptRide}
                  isAccepting={acceptingRideId === ride.id}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <RightPanel driverLocation={driverLocation} />
    </div>
  );
}
