import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Route as RouteIcon, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { distanceKm } from "../lib/geo";
import { reverseGeocode } from "../lib/geocoding";
import { estimateFare, getRideType } from "../lib/vehicles";
import { formatCurrency, formatDistance } from "../lib/format";
import Button from "./ui/Button";
import Spinner from "./ui/Spinner";

function BookingStatus({ message, children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="relative grid h-16 w-16 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-subtle text-primary-subtle-fg">
          <Loader2 className="h-6 w-6 animate-spin" />
        </span>
      </div>
      <p className="mt-6 text-base font-medium text-foreground">{message}</p>
      <div className="mt-8 w-full max-w-xs">{children}</div>
    </div>
  );
}

export default function BookLeft() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fromCords, toCords, selectedRide } = location.state || {};

  const [distance, setDistance] = useState(0);
  const [fare, setFare] = useState(null);
  const [fromAddress, setFromAddress] = useState("Loading address…");
  const [toAddress, setToAddress] = useState("Loading address…");
  const [isBooking, setIsBooking] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("Contacting nearby drivers…");
  const [rideRequestId, setRideRequestId] = useState(null);

  const ride = selectedRide ? getRideType(selectedRide.vehicle_type) : null;

  useEffect(() => {
    if (!fromCords || !toCords || !selectedRide) return;
    const d = distanceKm(fromCords, toCords);
    setDistance(d);
    setFare(estimateFare(selectedRide.vehicle_type, d));
    (async () => {
      try {
        setFromAddress((await reverseGeocode(fromCords.lng, fromCords.lat, { types: "address,place" })) || "Selected pickup");
        setToAddress((await reverseGeocode(toCords.lng, toCords.lat, { types: "address,place" })) || "Selected drop");
      } catch {
        setFromAddress("Selected pickup");
        setToAddress("Selected drop");
      }
    })();
  }, [fromCords, toCords, selectedRide]);

  // Realtime: react when a driver accepts.
  useEffect(() => {
    if (!rideRequestId) return;
    const channel = supabase
      .channel(`public:rides:id=eq.${rideRequestId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideRequestId}` },
        (payload) => {
          if (payload.new.status === "accepted") {
            setBookingMessage("Driver found! Preparing your ride…");
            supabase.removeChannel(channel);
            setTimeout(() => navigate(`/rider/ride/${payload.new.id}`), 2000);
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [rideRequestId, navigate]);

  const handleConfirmBooking = async () => {
    const user_uuid = localStorage.getItem("user_uuid");
    if (!user_uuid) {
      setIsBooking(true);
      setBookingMessage("Please sign in to book a ride.");
      setTimeout(() => navigate("/login"), 1800);
      return;
    }
    setIsBooking(true);
    setBookingMessage("Sending your ride request…");
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const { data, error } = await supabase
      .from("rides")
      .insert({
        rider_id: user_uuid,
        from_lat: fromCords.lat,
        from_lng: fromCords.lng,
        vehicle_type: selectedRide.vehicle_type,
        to_lat: toCords.lat,
        to_lng: toCords.lng,
        from_address: fromAddress,
        to_address: toAddress,
        distance_km: distance,
        fare: fare.total,
        status: "pending",
        start_otp: otp,
      })
      .select()
      .single();

    if (error) {
      setBookingMessage("Couldn't create your ride. Please try again.");
      setTimeout(() => setIsBooking(false), 2500);
      return;
    }
    setRideRequestId(data.id);
    setBookingMessage("Request sent! Waiting for a driver to accept…");
  };

  const handleCancelBooking = async () => {
    if (!rideRequestId) return;
    await supabase.from("rides").delete().match({ id: rideRequestId });
    setIsBooking(false);
    setRideRequestId(null);
    setBookingMessage("Contacting nearby drivers…");
  };

  const panel = "flex h-[100dvh] w-full flex-col overflow-y-auto bg-background sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]";

  if (!selectedRide || !fare) {
    return (
      <div className={panel}>
        <BookingStatus message="Calculating trip details…" />
      </div>
    );
  }

  if (isBooking) {
    return (
      <div className={panel}>
        <BookingStatus message={bookingMessage}>
          {rideRequestId && (
            <Button variant="danger" fullWidth onClick={handleCancelBooking}>
              Cancel request
            </Button>
          )}
        </BookingStatus>
      </div>
    );
  }

  return (
    <div className={panel}>
      <div className="flex flex-1 flex-col px-6 py-6">
        <div className="animate-fade-up text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-zinc-50 to-zinc-200 shadow-soft ring-1 ring-black/[0.06]">
            <img src={ride?.icon} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
          </div>
          <h1 className="mt-3 text-xl font-semibold text-foreground">{ride?.name}</h1>
          <p className="text-sm text-muted">{selectedRide.desc || ride?.tagline}</p>
        </div>

        {/* Trip */}
        <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground">Your trip</h2>
          <div className="relative mt-3 pl-6">
            <span aria-hidden className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px border-l border-dashed border-border-strong" />
            <div className="relative pb-4">
              <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary-subtle" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">From</p>
              <p className="text-sm text-foreground">{fromAddress}</p>
            </div>
            <div className="relative">
              <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-danger ring-4 ring-danger-subtle" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">To</p>
              <p className="text-sm text-foreground">{toAddress}</p>
            </div>
          </div>
        </div>

        {/* Fare */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground">Fare breakdown</h2>
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
            <span className="font-semibold text-foreground">Total fare</span>
            <span className="text-lg font-bold text-foreground">{formatCurrency(fare.total)}</span>
          </div>
          <p className="mt-2 text-center text-xs text-subtle">
            Estimated fare. Tolls &amp; surcharges may apply.
          </p>
        </div>

        <div className="mt-auto space-y-2 pt-6">
          <Button fullWidth size="lg" onClick={handleConfirmBooking}>
            Confirm booking · {formatCurrency(fare.total)}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
