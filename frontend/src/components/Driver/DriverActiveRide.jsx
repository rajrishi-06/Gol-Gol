import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { distanceKm } from "../../lib/geo";
import { notifyUser } from "../../lib/notify";
import { publishRideLocation } from "../../lib/liveLocation";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import Chatbox from "../Chatbox";
import Button from "../ui/Button";
import Field, { Input } from "../ui/Field";
import RideSheet from "../RideSheet";
import NavigationView from "./NavigationView";

export default function DriverActiveRide() {
  useDocumentTitle("Active Ride");
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otpInput, setOtpInput] = useState("");
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [driverLocation, setDriverLocation] = useState(null);
  const [nearDestination, setNearDestination] = useState(false);

  const handleEndRide = useCallback(
    async (isAutoEnd = false) => {
      if (!ride || ride.status !== "ongoing") return;
      const { error } = await supabase.from("rides").update({ status: "completed" }).eq("id", rideId);
      if (!error) {
        await supabase.from("active_drivers").update({ on_ride: false, current_ride_id: null }).eq("user_id", userId);
        if (isAutoEnd) {
          try {
            speechSynthesis.speak(new SpeechSynthesisUtterance("Destination reached. Ride completed."));
          } catch {
            /* ignore */
          }
        }
      }
    },
    [ride, rideId, userId]
  );

  const rideRef = useRef(ride);
  const endRideRef = useRef(handleEndRide);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);
  useEffect(() => {
    endRideRef.current = handleEndRide;
  }, [handleEndRide]);

  useEffect(() => {
    if (!userId) return;
    const publisher = publishRideLocation(rideId);
    let lastDbWrite = 0;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDriverLocation(loc);
        publisher.send(loc);
        const now = Date.now();
        if (now - lastDbWrite > 12000) {
          lastDbWrite = now;
          supabase
            .from("active_drivers")
            .update({ current_lat: loc.lat, current_lng: loc.lng, last_updated: new Date().toISOString() })
            .eq("user_id", userId)
            .then();
        }
        const r = rideRef.current;
        if (r?.status === "ongoing" && distanceKm(loc, { lat: r.to_lat, lng: r.to_lng }) < 0.03) {
          // Show a confirmation prompt instead of silently ending the ride.
          // GPS can drift, so the driver must explicitly confirm arrival.
          setNearDestination(true);
          try {
            speechSynthesis.speak(new SpeechSynthesisUtterance("You've arrived. Tap Complete Ride to finish."));
          } catch { /* ignore */ }
        }
      },
      () => setError("Location access is required for navigation."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      publisher.cleanup();
    };
  }, [rideId, userId]);

  useEffect(() => {
    (async () => {
      const storedUserId = localStorage.getItem("user_uuid");
      if (!storedUserId) return navigate("/login");
      setUserId(storedUserId);
      const { data: rideData, error } = await supabase.from("rides").select("*").eq("id", rideId).single();
      if (error || !rideData) return setError("Could not load ride details.");
      setRide(rideData);
      const { data: chatData } = await supabase.from("chat_messages").select("*").eq("ride_id", rideId).order("created_at");
      setMessages(chatData || []);
    })();

    const rideSub = supabase
      .channel(`ride-status:${rideId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` }, (payload) => {
        setRide(payload.new);
        if (payload.new.status === "completed") setTimeout(() => navigate("/driver/dashboard"), 2000);
      })
      .subscribe();
    const chatSub = supabase
      .channel(`chat:${rideId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `ride_id=eq.${rideId}` }, (payload) => setMessages((prev) => [...prev, payload.new]))
      .subscribe();
    return () => {
      supabase.removeChannel(rideSub);
      supabase.removeChannel(chatSub);
    };
  }, [rideId, navigate]);

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const { data: ok, error: rpcError } = await supabase.rpc("start_ride", {
      p_ride_id: rideId,
      p_otp: otpInput,
    });
    if (rpcError) {
      setError("Couldn't verify the code. Please try again.");
      return;
    }
    if (ok) {
      notifyUser({
        userId: ride.rider_id,
        title: "Your ride has started",
        body: "You're on your way to your destination.",
        url: `/rider/ride/${rideId}`,
        type: "ride_started",
      });
    } else {
      setError("Invalid OTP. Please try again.");
    }
  };

  if (!ride)
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-muted">
        {error || "Loading ride details…"}
      </div>
    );

  const originCoords = driverLocation ? [driverLocation.lng, driverLocation.lat] : null;
  let destinationCoords = null;
  if (ride.status === "accepted") destinationCoords = [ride.from_lng, ride.from_lat];
  else if (ride.status === "ongoing") destinationCoords = [ride.to_lng, ride.to_lat];

  const mapEl =
    originCoords && destinationCoords ? (
      <NavigationView
        key={ride.status}
        origin={originCoords}
        destination={destinationCoords}
        vehicleType={ride.vehicle_type}
        phase={ride.status === "ongoing" ? "dropoff" : "pickup"}
        destinationLabel={ride.status === "ongoing" ? "destination" : "pickup point"}
        onExit={
          ride.status === "ongoing" ? (
            <Button size="sm" variant="danger" onClick={() => handleEndRide(false)}>
              End ride
            </Button>
          ) : null
        }
      />
    ) : (
      <div className="flex h-full items-center justify-center bg-surface-2 text-muted">
        {error || "Waiting for location data…"}
      </div>
    );

  return (
    <RideSheet title="On ride" map={mapEl}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">On ride</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate("/driver/dashboard")}>
          <Home className="h-4 w-4" /> Dashboard
        </Button>
      </div>

      {ride.status === "accepted" && (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h2 className="font-semibold text-foreground">Pick up rider</h2>
          <p className="mt-1 text-sm text-muted">Head to the pickup point, then enter the rider&apos;s OTP to begin.</p>
          <form onSubmit={handleOtpSubmit} className="mt-4 space-y-3">
            <Field label="Start OTP" error={error} htmlFor="otp">
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  {...aria}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="4-digit code"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              )}
            </Field>
            <Button type="submit" fullWidth>Start ride</Button>
          </form>
        </div>
      )}

      {ride.status === "ongoing" && (
        nearDestination ? (
          /* Arrival confirmation — shown instead of silently ending the ride */
          <div className="mt-5 rounded-2xl border-2 border-primary bg-primary-subtle p-5 shadow-elevated">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white text-lg">
                🏁
              </span>
              <div>
                <h2 className="font-semibold text-foreground">You&apos;ve arrived!</h2>
                <p className="text-xs text-muted">Confirm to complete the ride and collect payment.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                fullWidth
                onClick={() => handleEndRide(false)}
              >
                Complete ride
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setNearDestination(false)}
              >
                Not yet
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <h2 className="font-semibold text-foreground">Trip to destination</h2>
            <p className="mt-1 text-sm text-muted">Follow turn-by-turn navigation. Tap when you arrive.</p>
            <Button variant="danger" fullWidth className="mt-4" onClick={() => setNearDestination(true)}>
              End ride
            </Button>
          </div>
        )
      )}

      <div className="mt-5">
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
  );
}
