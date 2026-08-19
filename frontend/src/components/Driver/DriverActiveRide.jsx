import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Home, MapPin, Flag, ShieldCheck, Phone, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth.jsx";
import { useRideLive } from "../../lib/useRideLive";
import { useDriverPresence } from "../../lib/useDriverPresence";
import { completeRide, markArrived, startRide, updateRideEta } from "../../lib/rides";
import {
  acceptPooledRide,
  driverTripState,
  holdPoolSeat,
  poolableRides,
  releaseSeatHold,
} from "../../lib/pooling";
import { distanceKm } from "../../lib/geo";
import { notifyUser } from "../../lib/notify";
import { publishRideLocation } from "../../lib/liveLocation";
import { formatCurrency, formatDistance } from "../../lib/format";
import { statusCopy } from "../../lib/rideStatus";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import Chatbox from "../Chatbox";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Spinner from "../ui/Spinner";
import Field, { Input } from "../ui/Field";
import RideSheet from "../RideSheet";
import NavigationView from "./NavigationView";
import SafetyPanel from "../ride/SafetyPanel";
import CancelRideDialog from "../ride/CancelRideDialog";
import RatingSheet from "../ride/RatingSheet";
import HeadcountDialog from "./HeadcountDialog";
import PoolOfferCard from "./PoolOfferCard";
import TripStopList from "./TripStopList";

/** Distance at which we suggest the driver mark themselves as arrived. */
const ARRIVAL_M = 120;
const ETA_PUSH_MS = 30000;
/** How often to look for another booking along the route already being driven. */
const POOL_POLL_MS = 20000;

export default function DriverActiveRide() {
  useDocumentTitle("On ride");
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { userId, settings } = useAuth();

  const { ride, messages, loading, error } = useRideLive(rideId);
  const { position } = useDriverPresence({ enabled: true });

  const [rider, setRider] = useState(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [nearPickup, setNearPickup] = useState(false);
  const [nearDestination, setNearDestination] = useState(false);
  const [tripState, setTripState] = useState(null);
  const [offer, setOffer] = useState(null);
  const [offerLeft, setOfferLeft] = useState(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [headcountOpen, setHeadcountOpen] = useState(false);
  const [pendingOtp, setPendingOtp] = useState("");

  const heldRef = useRef(null);
  const publisherRef = useRef(null);
  const lastEtaPush = useRef(0);
  const arrivalSpoken = useRef(false);
  const completedHandled = useRef(false);

  // ── rider profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ride?.rider_id) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, mobile, user_rating")
        .eq("id", ride.rider_id)
        .maybeSingle();
      if (active) setRider(data ?? null);
    })();
    return () => {
      active = false;
    };
  }, [ride?.rider_id]);

  // ── broadcast our position on the ride channel ───────────────────────────
  useEffect(() => {
    if (!rideId) return undefined;
    publisherRef.current = publishRideLocation(rideId);
    return () => {
      publisherRef.current?.cleanup();
      publisherRef.current = null;
    };
  }, [rideId]);

  useEffect(() => {
    if (!position || !publisherRef.current) return;
    publisherRef.current.send({ lat: position.lat, lng: position.lng, heading: position.heading });
  }, [position]);

  // ── proximity prompts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ride || !position) return;
    if (ride.status === "accepted") {
      const m = distanceKm(position, { lat: ride.from_lat, lng: ride.from_lng }) * 1000;
      setNearPickup(m < ARRIVAL_M);
    } else if (ride.status === "ongoing") {
      const m = distanceKm(position, { lat: ride.to_lat, lng: ride.to_lng }) * 1000;
      if (m < 60 && !arrivalSpoken.current) {
        arrivalSpoken.current = true;
        setNearDestination(true);
        try {
          speechSynthesis.speak(
            new SpeechSynthesisUtterance("You've arrived. Tap complete ride to finish.")
          );
        } catch {
          /* speech is optional */
        }
      }
    }
  }, [ride, position]);

  // ── share the ETA so the rider sees the same number we do ────────────────
  const pushEta = useCallback(
    async (minutes, km) => {
      const now = Date.now();
      if (now - lastEtaPush.current < ETA_PUSH_MS) return;
      lastEtaPush.current = now;
      await updateRideEta(rideId, minutes, km);
    },
    [rideId]
  );

  // ── completion / cancellation redirects ──────────────────────────────────
  useEffect(() => {
    if (!ride || completedHandled.current) return;
    if (ride.status === "completed") {
      completedHandled.current = true;
      setRateOpen(true);
    } else if (ride.status === "cancelled" || ride.status === "expired") {
      completedHandled.current = true;
      toast(ride.status === "cancelled" ? "This ride was cancelled" : "This request expired");
      navigate("/driver/dashboard", { replace: true });
    }
  }, [ride, navigate]);

  // ── the whole trip, not just this booking ────────────────────────────────
  // A pooled vehicle carries several bookings at once, so the driver screen
  // needs the vehicle's seat state and full stop order — `useRideLive` only
  // ever knows about the one ride in the URL.
  const refreshTrip = useCallback(async () => {
    const { data } = await driverTripState();
    setTripState(data ?? null);
  }, []);

  useEffect(() => {
    refreshTrip();
  }, [refreshTrip, ride?.status]);

  // ── offers along the current route ───────────────────────────────────────
  const seatsFree = tripState?.seats_available ?? 0;
  const poolOpen = ride?.status === "ongoing" && seatsFree > 0;

  // Release whatever we are holding, wherever we leave from.
  const dropHold = useCallback(async () => {
    const held = heldRef.current;
    heldRef.current = null;
    setOfferLeft(null);
    if (held) await releaseSeatHold(held);
  }, []);

  useEffect(() => {
    if (!poolOpen) {
      setOffer(null);
      dropHold();
      return undefined;
    }
    let active = true;

    const look = async () => {
      // Don't go looking while the driver is deciding on one.
      if (heldRef.current) return;
      const { data } = await poolableRides(3);
      if (!active) return;
      const next = (data ?? []).find((o) => !dismissed.has(o.ride_id));
      if (!next) {
        setOffer(null);
        return;
      }
      // Reserve it before showing it, so the card the driver sees is one they
      // can actually take. Losing the reservation is how a race is lost, and
      // it means we simply never showed the offer.
      const { data: hold } = await holdPoolSeat(next.ride_id);
      if (!active) {
        if (hold) releaseSeatHold(next.ride_id);
        return;
      }
      if (!hold) {
        setDismissed((prev) => new Set(prev).add(next.ride_id));
        return;
      }
      heldRef.current = next.ride_id;
      setOffer(next);
      setOfferLeft(Math.max(0, Math.round((new Date(hold.expiresAt) - Date.now()) / 1000)));
    };

    look();
    const timer = setInterval(look, POOL_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [poolOpen, dismissed, dropHold]);

  // Countdown; when it runs out the hold has lapsed server-side too, so the
  // card goes away rather than lying about being available.
  useEffect(() => {
    if (offerLeft == null) return undefined;
    if (offerLeft <= 0) {
      setOffer(null);
      heldRef.current = null;
      setOfferLeft(null);
      return undefined;
    }
    const t = setTimeout(() => setOfferLeft((n) => (n == null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [offerLeft]);

  // Leaving the screen must not strand a seat for the rest of the TTL.
  useEffect(() => () => { if (heldRef.current) releaseSeatHold(heldRef.current); }, []);

  const handleAcceptOffer = async (candidate) => {
    setOfferBusy(true);
    const { data, error: err } = await acceptPooledRide(candidate.ride_id);
    setOfferBusy(false);
    heldRef.current = null;      // consumed by the accept, or already gone
    setOfferLeft(null);
    // The offer was priced from a read; the server re-checks seats, corridor
    // and detour under a lock, so a refusal here is normal, not a fault.
    if (err) {
      toast.error(err.message || "That ride is no longer available.");
      setOffer(null);
      return;
    }
    if (!data) {
      toast("Another driver got there first.");
      setOffer(null);
      return;
    }
    setOffer(null);
    await refreshTrip();
    // The rider's id comes from the accepted row, not the offer: an offer
    // deliberately carries only what the driver needs to decide, so a request
    // they never take does not hand them an identity.
    notifyUser({
      userId: data.rider_id,
      title: "Driver found — you're sharing",
      body: "Your driver is already on the road and heading your way.",
      url: `/rider/ride/${candidate.ride_id}`,
      type: "ride_accepted",
    });
    toast.success(`${candidate.rider_name} added to this trip`);
  };

  // ── actions ───────────────────────────────────────────────────────────────
  const handleArrived = async () => {
    setBusy(true);
    const { data, error: err } = await markArrived(rideId);
    setBusy(false);
    if (err || !data) {
      toast.error("Couldn't update your status.");
      return;
    }
    notifyUser({
      userId: ride.rider_id,
      title: "Your driver is here",
      body: "Head out and share your 4-digit OTP to start the trip.",
      url: `/rider/ride/${rideId}`,
      type: "driver_arrived",
    });
    toast.success("Rider notified that you've arrived");
  };

  // The OTP is checked and the headcount recorded in one server call, so the
  // code is held here until the driver has said how many people got in.
  const handleStart = (e) => {
    e.preventDefault();
    setOtpError("");
    setPendingOtp(otp);
    setHeadcountOpen(true);
  };

  const handleConfirmHeadcount = async (headcount) => {
    setBusy(true);
    const { data, error: err } = await startRide(rideId, pendingOtp, headcount);
    setBusy(false);
    if (err) {
      setHeadcountOpen(false);
      setOtpError("Couldn't verify the code. Please try again.");
      return;
    }
    if (!data?.ok) {
      setHeadcountOpen(false);
      setOtpError("That code doesn't match. Ask the rider to read it again.");
      return;
    }
    setHeadcountOpen(false);
    setOtp("");
    setPendingOtp("");
    await refreshTrip();

    // More bodies than booked can leave an already-accepted booking without a
    // seat. That rider goes back to dispatch free of charge rather than being
    // left at a kerb, and the driver is told why their next stop vanished.
    if (data.displacedRideId) {
      toast.warning("The extra passenger left no room for your next pickup — we're re-matching them.");
    }

    notifyUser({
      userId: ride.rider_id,
      title: "Your ride has started",
      body: "You're on your way to your destination.",
      url: `/rider/ride/${rideId}`,
      type: "ride_started",
    });
    toast.success(`Trip started · ${headcount} passenger${headcount > 1 ? "s" : ""}`);
  };

  const handleComplete = async () => {
    if (!ride || ride.status !== "ongoing") return;
    setBusy(true);
    const waitingMinutes = ride.arrived_at && ride.started_at
      ? Math.max(0, (new Date(ride.started_at) - new Date(ride.arrived_at)) / 60000)
      : 0;
    const { data, error: err } = await completeRide(rideId, waitingMinutes);
    setBusy(false);
    if (err) {
      toast.error("Couldn't complete the ride. Please try again.");
      return;
    }
    notifyUser({
      userId: ride.rider_id,
      title: "Trip completed",
      body: `Fare ${formatCurrency(data?.final_fare ?? ride.fare)}. Thanks for riding with us.`,
      url: `/activity/${rideId}`,
      type: "ride_completed",
    });
    toast.success(`Trip completed · ${formatCurrency(data?.final_fare ?? ride.fare)}`);

    // Dropping one rider must not end the journey for the others: if anyone is
    // still aboard, send the driver on to the next stop instead of the summary.
    const { data: next } = await driverTripState();
    setTripState(next ?? null);
    const remaining = (next?.rides ?? []).filter((r) => r.id !== rideId);
    if (remaining.length > 0) {
      completedHandled.current = true;
      toast.info(`Still carrying ${remaining[0].rider_name} — heading to the next stop.`);
      navigate(`/driver/ride/${remaining[0].id}`, { replace: true });
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted">
        <Spinner className="mr-2 h-5 w-5 text-primary" /> Loading ride…
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-muted">{error || "We couldn't load this ride."}</p>
        <Button onClick={() => navigate("/driver/dashboard")}>Back to dashboard</Button>
      </div>
    );
  }

  const heading = statusCopy(ride.status, "driver");
  const toPickup = ride.status === "accepted" || ride.status === "arrived";
  const origin = position ? [position.lng, position.lat] : null;
  const destination = toPickup ? [ride.from_lng, ride.from_lat] : [ride.to_lng, ride.to_lat];

  const mapEl =
    origin && ride.status !== "completed" ? (
      <NavigationView
        key={toPickup ? "pickup" : "dropoff"}
        origin={origin}
        destination={destination}
        vehicleType={ride.vehicle_type}
        phase={toPickup ? "pickup" : "dropoff"}
        destinationLabel={toPickup ? "pickup point" : "destination"}
        voiceEnabled={settings?.voice_guidance ?? true}
        onEta={pushEta}
        onExit={
          ride.status === "ongoing" ? (
            <Button size="sm" variant="danger" loading={busy} onClick={handleComplete}>
              Complete ride
            </Button>
          ) : null
        }
      />
    ) : (
      <div className="flex h-full items-center justify-center bg-surface-2 text-muted">
        {ride.status === "completed" ? "Trip complete" : "Waiting for location…"}
      </div>
    );

  return (
    <>
      <RideSheet title={heading.title} map={mapEl}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading.title}</h1>
            <p className="mt-0.5 text-sm text-muted">{heading.detail}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SafetyPanel
              rideId={rideId}
              currentLocation={position}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button variant="ghost" size="sm" onClick={() => navigate("/driver/dashboard")}>
              <Home className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Rider */}
        {rider && (
          <Card className="mt-4 flex items-center gap-3 p-3.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-foreground">{rider.name}</span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Star className="h-3 w-3 fill-warning text-warning" />
                {Number(rider.user_rating ?? 5).toFixed(1)} · {formatDistance(ride.distance_km)} trip
              </span>
            </span>
            <span className="text-right">
              <span className="block font-bold text-foreground">
                {formatCurrency(ride.final_fare ?? ride.fare)}
              </span>
              <Badge tone={ride.payment_method === "cash" ? "neutral" : "brand"} className="mt-1">
                {ride.payment_method}
              </Badge>
            </span>
            {rider.mobile && (
              <a
                href={`tel:${rider.mobile}`}
                aria-label={`Call ${rider.name}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </Card>
        )}

        {ride.pickup_notes && toPickup && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
            <span className="font-medium text-foreground">Rider&apos;s note:</span> {ride.pickup_notes}
          </p>
        )}

        {/* Accepted → head to pickup */}
        {ride.status === "accepted" && (
          <Card className="mt-4 p-4">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" /> Head to pickup
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{ride.from_address || "Pickup point"}</p>
            <Button
              fullWidth
              className="mt-4"
              variant={nearPickup ? "primary" : "secondary"}
              loading={busy}
              onClick={handleArrived}
            >
              {nearPickup ? "I've arrived — notify rider" : "Mark as arrived"}
            </Button>
            <Button variant="ghost" fullWidth className="mt-2" onClick={() => setCancelOpen(true)}>
              Cancel ride
            </Button>
          </Card>
        )}

        {/* Another booking along the road we're already on */}
        {poolOpen && offer && (
          <div className="mt-4">
            <PoolOfferCard
              offer={offer}
              busy={offerBusy}
              onAccept={handleAcceptOffer}
              secondsLeft={offerLeft}
              onDismiss={() => {
                dropHold();
                setDismissed((prev) => new Set(prev).add(offer.ride_id));
                setOffer(null);
              }}
            />
          </div>
        )}

        {/* The full schedule, once there is more than one booking aboard */}
        {tripState?.stops?.length > 2 && (
          <div className="mt-4">
            <TripStopList
              stops={tripState.stops}
              seatCapacity={tripState.trip?.seat_capacity}
            />
          </div>
        )}

        {/* Arrived → OTP */}
        {ride.status === "arrived" && (
          <Card className="mt-4 p-4">
            <h2 className="font-semibold text-foreground">Start the trip</h2>
            <p className="mt-1 text-sm text-muted">
              Ask the rider for their 4-digit code. It proves the right person got in.
            </p>
            <form onSubmit={handleStart} className="mt-4 space-y-3">
              <Field label="Start OTP" error={otpError} htmlFor="start-otp">
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    {...aria}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    placeholder="4-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="text-center text-lg tracking-[0.4em]"
                  />
                )}
              </Field>
              <Button type="submit" fullWidth loading={busy} disabled={otp.length !== 4}>
                Start ride
              </Button>
            </form>
            <Button variant="ghost" fullWidth className="mt-2" onClick={() => setCancelOpen(true)}>
              Cancel ride
            </Button>
          </Card>
        )}

        {/* Ongoing */}
        {ride.status === "ongoing" &&
          (nearDestination ? (
            <Card className="mt-4 border-2 border-primary bg-primary-subtle p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <Flag className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-foreground">You&apos;ve arrived</h2>
                  <p className="text-xs text-muted">Confirm to settle the fare and finish.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button fullWidth loading={busy} onClick={handleComplete}>
                  Complete ride
                </Button>
                <Button variant="ghost" fullWidth onClick={() => setNearDestination(false)}>
                  Not yet
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="mt-4 p-4">
              <h2 className="font-semibold text-foreground">Trip to destination</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {ride.to_address || "Destination"}
              </p>
              <Button variant="danger" fullWidth className="mt-4" loading={busy} onClick={handleComplete}>
                Complete ride
              </Button>
            </Card>
          ))}

        {/* Completed */}
        {ride.status === "completed" && (
          <Card className="mt-4 p-4 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-success-subtle text-success-fg">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-3 font-semibold text-foreground">Trip complete</h2>
            <p className="mt-1 text-sm text-muted">
              You earned {formatCurrency((ride.final_fare ?? ride.fare) * 0.85)} after the platform fee.
            </p>
            <div className="mt-4 flex gap-2">
              <Button fullWidth onClick={() => setRateOpen(true)}>
                Rate rider
              </Button>
              <Button variant="secondary" fullWidth onClick={() => navigate("/driver/dashboard")}>
                Next ride
              </Button>
            </div>
          </Card>
        )}

        <div className="mt-4">
          <Chatbox
            rideId={rideId}
            userId={userId}
            messages={messages}
            title="Chat with rider"
            recipientId={ride.rider_id}
            recipientUrl={`/rider/ride/${rideId}`}
          />
        </div>
      </RideSheet>

      <HeadcountDialog
        open={headcountOpen}
        onClose={() => setHeadcountOpen(false)}
        ride={{ ...ride, rider_name: rider?.name }}
        seatsFree={seatsFree}
        busy={busy}
        onConfirm={handleConfirmHeadcount}
      />

      <CancelRideDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        ride={ride}
        role="driver"
        onCancelled={() => navigate("/driver/dashboard", { replace: true })}
      />

      <RatingSheet
        open={rateOpen}
        onClose={() => {
          setRateOpen(false);
          navigate("/driver/dashboard", { replace: true });
        }}
        ride={ride}
        role="driver"
        counterpartName={rider?.name}
        onSubmitted={() => navigate("/driver/dashboard", { replace: true })}
      />
    </>
  );
}
