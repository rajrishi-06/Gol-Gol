import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Route as RouteIcon, Inbox, Moon, Star, Navigation, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth.jsx";
import { useConnection } from "../../lib/connection.jsx";
import { useDriverPresence } from "../../lib/useDriverPresence";
import {
  acceptRide,
  nearbyPendingRides,
  releaseScheduledRides,
  setDriverDuty,
} from "../../lib/rides";
import { distanceKm } from "../../lib/geo";
import { notifyUser } from "../../lib/notify";
import { formatCurrency, formatDistance } from "../../lib/format";
import { cn } from "../../lib/cn";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import TopBar from "../layout/TopBar";
import RightPanel from "../RightPanel";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Spinner from "../ui/Spinner";
import Alert from "../ui/Alert";
import EmptyState from "../ui/EmptyState";

const DISPATCH_RADIUS_KM = 5;

/** On-duty switch — go off duty without logging out. */
function DutyToggle({ online, onToggle, busy, live }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {online && live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              online ? (live ? "bg-success" : "bg-warning") : "bg-subtle"
            )}
          />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {online ? (live ? "You're online" : "Going online…") : "You're offline"}
          </p>
          <p className="truncate text-xs text-muted">
            {online
              ? live
                ? "Receiving nearby ride requests"
                : "Waiting for a GPS fix and a live connection"
              : "Not receiving requests — still logged in"}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        aria-label={online ? "Go offline" : "Go online"}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          online ? "bg-primary" : "bg-surface-3"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            online ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

/**
 * A request card that a driver can actually judge: where the pickup is, how far
 * away it is, where the trip goes, what it pays and who's asking. It used to
 * show four raw decimal coordinates and nothing else.
 */
function RideRequestCard({ ride, onAccept, isAccepting }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-foreground">
              {ride.rider_name || "New ride request"}
            </h3>
            {ride.rider_rating != null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted">
                <Star className="h-3 w-3 fill-warning text-warning" />
                {Number(ride.rider_rating).toFixed(1)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {formatDistance(ride.pickup_distance_km)} away · pays{" "}
            {ride.payment_method === "cash" ? "cash" : ride.payment_method}
          </p>
        </div>
        <span className="shrink-0 text-lg font-bold text-primary">{formatCurrency(ride.fare)}</span>
      </div>

      <div className="relative mt-3 pl-6">
        <span
          aria-hidden
          className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px border-l border-dashed border-border-strong"
        />
        <div className="relative pb-3">
          <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary-subtle" />
          <p className="line-clamp-1 text-sm text-foreground">
            {ride.from_address || `${ride.from_lat.toFixed(4)}, ${ride.from_lng.toFixed(4)}`}
          </p>
        </div>
        <div className="relative">
          <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-danger ring-4 ring-danger-subtle" />
          <p className="line-clamp-1 text-sm text-muted">
            {ride.to_address || `${ride.to_lat.toFixed(4)}, ${ride.to_lng.toFixed(4)}`}
          </p>
        </div>
      </div>

      {ride.pickup_notes && (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="font-medium text-foreground">Note:</span> {ride.pickup_notes}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <RouteIcon className="h-3.5 w-3.5" /> {formatDistance(ride.distance_km)} trip
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> {formatDistance(ride.pickup_distance_km)} to pickup
        </span>
      </div>

      <Button fullWidth className="mt-4" loading={isAccepting} onClick={() => onAccept(ride.id)}>
        {isAccepting ? "Accepting…" : `Accept · ${formatCurrency(ride.fare)}`}
      </Button>
    </Card>
  );
}

/**
 * Driver dispatch.
 *
 * Matching now runs on the service class (`vehicle_class`), which is what
 * actually made Mini/Sedan/SUV requests reachable — a `car` driver could never
 * be matched to any of them before. Claiming a ride goes through the atomic
 * `accept_ride()` RPC, and the realtime subscription is filtered to pending
 * rides instead of every ride event in the system.
 */
export default function DriverDashboard() {
  useDocumentTitle("Driver dashboard");
  const navigate = useNavigate();
  const { userId, driver, profile } = useAuth();
  const { isOnline: socketUp, subscribeToReconnect } = useConnection();

  const [isOnline, setIsOnline] = useState(true);
  const [dutyBusy, setDutyBusy] = useState(false);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const seededRef = useRef(false);

  const { position, error: gpsError, permission } = useDriverPresence({ enabled: isOnline });
  const vehicleClass = driver?.vehicle_class ?? null;

  // Sync the persisted duty state once.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("active_drivers")
        .select("is_online")
        .eq("user_id", userId)
        .maybeSingle();
      if (active && data) setIsOnline(data.is_online ?? true);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!isOnline || !position || !vehicleClass) return;
    // Move any scheduled booking whose window has opened into dispatch. Doing
    // it here means scheduled rides work without a cron job; add the pg_cron
    // schedule in migration 0005's notes for a busy deployment.
    releaseScheduledRides();
    const { data, error } = await nearbyPendingRides({
      lat: position.lat,
      lng: position.lng,
      vehicleClass,
      radiusKm: DISPATCH_RADIUS_KM,
    });
    if (!error) setRides(data ?? []);
    setLoading(false);
  }, [isOnline, position, vehicleClass]);

  // First load once we have a fix, then whenever duty or class changes.
  useEffect(() => {
    if (!isOnline) {
      setRides([]);
      setLoading(false);
      seededRef.current = false;
      return;
    }
    if (!position) return;
    if (!seededRef.current) {
      seededRef.current = true;
      setLoading(true);
    }
    refresh();
  }, [isOnline, position, refresh]);

  // Poll as a safety net: realtime tells us about new requests, but a driver
  // moving into range of an existing one has no event to hear.
  useEffect(() => {
    if (!isOnline) return undefined;
    const timer = setInterval(refresh, 25000);
    return () => clearInterval(timer);
  }, [isOnline, refresh]);

  useEffect(() => subscribeToReconnect(refresh), [subscribeToReconnect, refresh]);

  // Realtime dispatch. RLS narrows this to pending rides of our class within
  // 8 km, so the browser is no longer sent every pickup in the city.
  useEffect(() => {
    if (!isOnline || !position || !vehicleClass) return undefined;
    const channel = supabase
      .channel(`dispatch:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rides" },
        ({ new: row }) => {
          if (
            row.status !== "pending" ||
            row.vehicle_type !== vehicleClass ||
            distanceKm(position, { lat: row.from_lat, lng: row.from_lng }) > DISPATCH_RADIUS_KM
          ) {
            return;
          }
          // The insert payload lacks the joined rider fields the RPC returns.
          refresh();
          toast("New ride request nearby", { description: row.to_address || "Tap to review" });
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides" }, ({ new: row }) => {
        if (row.status !== "pending") setRides((prev) => prev.filter((r) => r.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [isOnline, position, vehicleClass, userId, refresh]);

  const toggleDuty = async () => {
    const next = !isOnline;
    setDutyBusy(true);
    const { error } = await setDriverDuty(next);
    setDutyBusy(false);
    if (error) {
      toast.error("Couldn't change your duty status.");
      return;
    }
    setIsOnline(next);
    if (!next) setRides([]);
    toast.success(next ? "You're online" : "You're off duty");
  };

  const handleAccept = async (rideId) => {
    setAcceptingId(rideId);
    const { data, error } = await acceptRide(rideId);
    setAcceptingId(null);

    if (error) {
      toast.error(error.message || "Couldn't accept this ride.");
      return;
    }
    if (!data) {
      // Another driver won the race.
      setRides((prev) => prev.filter((r) => r.id !== rideId));
      toast("Another driver got there first", { description: "We'll show you the next request." });
      return;
    }

    notifyUser({
      userId: data.rider_id,
      title: "Driver on the way",
      body: `${profile?.name || "Your driver"} accepted your ride and is heading to you.`,
      url: `/rider/ride/${rideId}`,
      type: "ride_accepted",
    });
    navigate(`/driver/ride/${rideId}`);
  };

  const live = Boolean(position) && socketUp;

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Driver dashboard" subtitle={`Requests for your ${vehicleClass || "vehicle"}`} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        <div className="flex w-full flex-col overflow-y-auto bg-background px-5 pb-8 pt-5 sm:w-[460px] sm:shrink-0 sm:border-r sm:border-border sm:px-6 lg:w-[500px]">
          <DutyToggle online={isOnline} onToggle={toggleDuty} busy={dutyBusy} live={live} />

          {gpsError && isOnline && (
            <Alert tone={permission === "denied" ? "danger" : "warning"} className="mt-3">
              {gpsError}
            </Alert>
          )}

          {isOnline && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5" />
                Searching within {DISPATCH_RADIUS_KM} km
              </span>
              <Badge tone={rides.length ? "brand" : "neutral"}>
                {rides.length} {rides.length === 1 ? "request" : "requests"}
              </Badge>
            </div>
          )}

          <div className="mt-4 flex-1 space-y-3">
            {!isOnline ? (
              <EmptyState
                icon={Moon}
                title="You're off duty"
                description="Flip the switch above to go back online and start receiving ride requests."
              />
            ) : !position ? (
              <div className="flex flex-col items-center gap-3 pt-16 text-muted">
                <Spinner className="h-6 w-6 text-primary" />
                <p className="text-sm">Getting your location…</p>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center gap-3 pt-16 text-muted">
                <Spinner className="h-6 w-6 text-primary" />
                <p className="text-sm">Finding rides near you…</p>
              </div>
            ) : rides.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No requests right now"
                description="Stay online — we'll ping you the moment a nearby rider needs a lift."
              />
            ) : (
              rides.map((ride, i) => (
                <div key={ride.id} className="animate-rise" style={{ "--i": Math.min(i, 6) }}>
                  <RideRequestCard
                    ride={ride}
                    onAccept={handleAccept}
                    isAccepting={acceptingId === ride.id}
                  />
                </div>
              ))
            )}
          </div>

          {!vehicleClass && (
            <Alert tone="warning" title="Vehicle class missing" className="mt-4">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Update your vehicle details so we know which requests to send you.
              </span>
            </Alert>
          )}
        </div>

        <RightPanel driverLocation={position} />
      </div>
    </div>
  );
}
