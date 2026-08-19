import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Route as RouteIcon, CalendarClock, SearchX, Radar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { useBooking } from "../lib/booking.jsx";
import { cancelRide, createRide, expireStaleRides } from "../lib/rides";
import { distanceKm, hasValidCoords } from "../lib/geo";
import { reverseGeocode } from "../lib/geocoding";
import { estimateFare, getRideType } from "../lib/vehicles";
import { formatCurrency, formatDistance, formatTime } from "../lib/format";
import Button from "./ui/Button";
import Card from "./ui/Card";
import EmptyState from "./ui/EmptyState";
import { Textarea } from "./ui/Field";
import PaymentMethodPicker from "./ride/PaymentMethodPicker";

/** How long we hunt for a driver before calling it. */
const SEARCH_TIMEOUT_MS = 3 * 60 * 1000;

const panel =
  "flex w-full flex-col overflow-y-auto bg-background sm:w-[460px] sm:shrink-0 sm:border-r sm:border-border lg:w-[500px]";

function Searching({ elapsed, onCancel, cancelling }) {
  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <span
          className="absolute inset-2 animate-ping rounded-full bg-primary/20"
          style={{ animationDelay: "0.4s" }}
        />
        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-subtle text-primary-subtle-fg">
          <Radar className="h-7 w-7" />
        </span>
      </div>

      <p className="mt-6 text-base font-semibold text-foreground" role="status" aria-live="polite">
        Finding you a driver
      </p>
      <p className="mt-1 text-sm text-muted">
        We&apos;re pinging nearby drivers — searching for {mins}:{secs}
      </p>
      <p className="mt-4 max-w-xs text-xs text-subtle">
        You can leave this screen; we&apos;ll notify you the moment someone accepts.
      </p>

      <div className="mt-8 w-full max-w-xs">
        <Button variant="danger" fullWidth loading={cancelling} onClick={onCancel}>
          Cancel request
        </Button>
      </div>
    </div>
  );
}

/**
 * Confirm and book.
 *
 * Three things this screen never used to do: it honours the scheduled pickup
 * time (bookings used to silently become "now"), it gives up rather than
 * spinning forever when no driver accepts, and cancelling records a real
 * cancellation instead of deleting the row.
 */
export default function BookLeft() {
  const navigate = useNavigate();
  const { userId, settings } = useAuth();
  const trip = useBooking();

  const [fromAddress, setFromAddress] = useState(trip.from || "");
  const [toAddress, setToAddress] = useState(trip.to || "");
  const [notes, setNotes] = useState(trip.pickupNotes || "");
  // Falls back to the rider's saved default from Settings/Wallet.
  const [method, setMethod] = useState(
    trip.paymentMethod || settings?.default_payment_method || "cash"
  );

  const [phase, setPhase] = useState("review"); // review | searching | scheduled | nodrivers
  const [rideId, setRideId] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(null);

  const ride = trip.vehicleType ? getRideType(trip.vehicleType) : null;
  const routeReady = hasValidCoords(trip.fromCords) && hasValidCoords(trip.toCords);
  const distance = routeReady ? distanceKm(trip.fromCords, trip.toCords) : 0;
  const fare = ride ? estimateFare(ride.id, distance) : null;

  // Fill in any address the user didn't type (they may have dropped a pin).
  useEffect(() => {
    if (!routeReady) return;
    let cancelled = false;
    (async () => {
      if (!trip.from) {
        try {
          const a = await reverseGeocode(trip.fromCords.lng, trip.fromCords.lat);
          if (!cancelled && a) setFromAddress(a);
        } catch {
          if (!cancelled) setFromAddress("Selected pickup");
        }
      }
      if (!trip.to) {
        try {
          const a = await reverseGeocode(trip.toCords.lng, trip.toCords.lat);
          if (!cancelled && a) setToAddress(a);
        } catch {
          if (!cancelled) setToAddress("Selected drop");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeReady, trip.from, trip.to, trip.fromCords, trip.toCords]);

  // Search timer + timeout.
  useEffect(() => {
    if (phase !== "searching") return undefined;
    startedAt.current = startedAt.current ?? Date.now();
    const tick = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(Math.floor(ms / 1000));
      if (ms > SEARCH_TIMEOUT_MS) giveUp();
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const giveUp = useCallback(async () => {
    setPhase("nodrivers");
    startedAt.current = null;
    // Sweeps any pending request that has aged out, including this one.
    await expireStaleRides("3 minutes");
  }, []);

  // React the moment a driver claims the ride.
  useEffect(() => {
    if (!rideId) return undefined;
    const channel = supabase
      .channel(`booking:${rideId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        ({ new: row }) => {
          if (row.status === "accepted") {
            toast.success("Driver found — heading your way.");
            navigate(`/rider/ride/${row.id}`, { replace: true });
          } else if (row.status === "expired") {
            setPhase("nodrivers");
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [rideId, navigate]);

  const confirm = async () => {
    if (!routeReady || !ride) return;
    setBusy(true);
    trip.patch({ paymentMethod: method, pickupNotes: notes });

    const { data, error } = await createRide({
      riderId: userId,
      from: trip.fromCords,
      to: trip.toCords,
      fromAddress: fromAddress || trip.from || "Selected pickup",
      toAddress: toAddress || trip.to || "Selected drop",
      vehicleType: ride.id,
      paymentMethod: method,
      pickupNotes: notes.trim() || null,
      scheduledFor: trip.scheduledFor,
    });
    setBusy(false);

    if (error || !data) {
      toast.error("Couldn't create your ride. Please try again.");
      return;
    }

    setRideId(data.id);
    if (data.status === "scheduled") {
      setPhase("scheduled");
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("searching");
  };

  const cancel = async () => {
    if (!rideId) return;
    setBusy(true);
    const { error } = await cancelRide(rideId, "Cancelled while searching for a driver");
    setBusy(false);
    if (error) {
      toast.error("Couldn't cancel. Please try again.");
      return;
    }
    setRideId(null);
    startedAt.current = null;
    setPhase("review");
    toast.success("Request cancelled");
  };

  // ── guards ────────────────────────────────────────────────────────────────

  if (!routeReady || !ride) {
    return (
      <div className={panel}>
        <EmptyState
          className="h-full"
          icon={RouteIcon}
          title="No trip selected"
          description="Pick your pickup, drop and a ride type to see the fare."
          action={<Button onClick={() => navigate("/")}>Back to booking</Button>}
        />
      </div>
    );
  }

  if (phase === "scheduled") {
    return (
      <div className={panel}>
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-subtle text-primary-subtle-fg">
            <CalendarClock className="h-8 w-8" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-foreground">Ride scheduled</h2>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            We&apos;ll start looking for a driver about 10 minutes before{" "}
            <span className="font-medium text-foreground">{formatTime(trip.scheduledFor)}</span> and
            notify you as soon as one accepts.
          </p>
          <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
            <Button fullWidth onClick={() => navigate("/activity")}>
              View in activity
            </Button>
            <Button variant="ghost" fullWidth onClick={() => navigate("/")}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "searching") {
    return (
      <div className={panel}>
        <Searching elapsed={elapsed} onCancel={cancel} cancelling={busy} />
      </div>
    );
  }

  if (phase === "nodrivers") {
    return (
      <div className={panel}>
        <EmptyState
          className="h-full"
          icon={SearchX}
          title="No drivers available"
          description={`Nobody accepted your ${ride.name} request in time. Try again, or pick a different ride type — supply varies a lot by class.`}
          action={
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button
                fullWidth
                onClick={() => {
                  setRideId(null);
                  setPhase("review");
                }}
              >
                Try again
              </Button>
              <Button variant="secondary" fullWidth onClick={() => navigate("/")}>
                Choose another ride
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // ── review ────────────────────────────────────────────────────────────────

  return (
    <div className={panel}>
      <div className="flex flex-1 flex-col px-5 py-6 sm:px-6">
        <div className="animate-fade-up text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-zinc-50 to-zinc-200 shadow-soft ring-1 ring-black/[0.06]">
            <img src={ride.icon} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
          </div>
          <h2 className="mt-3 text-xl font-semibold text-foreground">{ride.name}</h2>
          <p className="text-sm text-muted">{ride.tagline}</p>
        </div>

        {/* Trip */}
        <Card className="mt-6 p-4">
          <h3 className="text-sm font-semibold text-foreground">Your trip</h3>
          <div className="relative mt-3 pl-6">
            <span
              aria-hidden
              className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px border-l border-dashed border-border-strong"
            />
            <div className="relative pb-4">
              <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary-subtle" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">From</p>
              <p className="text-sm text-foreground">{fromAddress || "Selected pickup"}</p>
            </div>
            <div className="relative">
              <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-danger ring-4 ring-danger-subtle" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">To</p>
              <p className="text-sm text-foreground">{toAddress || "Selected drop"}</p>
            </div>
          </div>

          {trip.scheduledFor && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary-subtle px-3 py-2 text-xs font-medium text-primary-subtle-fg">
              <CalendarClock className="h-3.5 w-3.5" />
              Scheduled for {formatTime(trip.scheduledFor)}
            </p>
          )}

          <Textarea
            className="mt-3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note for the driver — gate number, landmark…"
            aria-label="Pickup note"
            maxLength={160}
          />
        </Card>

        {/* Payment */}
        <Card className="mt-4 p-4">
          <h3 className="text-sm font-semibold text-foreground">Payment</h3>
          <PaymentMethodPicker value={method} onChange={setMethod} className="mt-3" />
        </Card>

        {/* Fare */}
        <Card className="mt-4 p-4">
          <h3 className="text-sm font-semibold text-foreground">Fare breakdown</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Base fare</dt>
              <dd className="font-medium text-foreground">{formatCurrency(fare.base)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Distance ({formatCurrency(fare.perKm)}/km)</dt>
              <dd className="font-medium text-foreground">{formatCurrency(fare.distanceCharge)}</dd>
            </div>
            <div className="flex items-center justify-between text-muted">
              <dt className="inline-flex items-center gap-1.5">
                <RouteIcon className="h-3.5 w-3.5" /> Total distance
              </dt>
              <dd>{formatDistance(distance)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="font-semibold text-foreground">Estimated total</span>
            <span className="text-lg font-bold text-foreground">{formatCurrency(fare.total)}</span>
          </div>
          <p className="mt-2 text-center text-xs text-subtle">
            The server recalculates this when you book — waiting time and tolls may apply.
          </p>
        </Card>

        <div className="mt-auto space-y-2 pt-6">
          <Button fullWidth size="lg" loading={busy} onClick={confirm}>
            {trip.scheduledFor ? "Schedule ride" : "Confirm booking"} · {formatCurrency(fare.total)}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate("/")}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
