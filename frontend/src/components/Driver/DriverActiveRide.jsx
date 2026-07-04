import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../../lib/supabase";
import { distanceKm, distanceMeters, computeBounds } from "../../lib/geo";
import { mapboxgl, MAP_STYLE, createImageMarker, createVehicleMarker } from "../../lib/mapbox";
import { fetchRoute } from "../../lib/geocoding";
import Chatbox from "../Chatbox";
import Button from "../ui/Button";
import Field, { Input } from "../ui/Field";

const ROUTE_PAINT = { "line-color": "#0f9b7f", "line-width": 6, "line-opacity": 0.85 };

function speak(text, rate = 0.95) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* speech synthesis unsupported */
  }
}

/** Pickup navigation (ride accepted). */
function LiveNavigationMap({ origin, destination, vehicleType }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [eta, setEta] = useState(null);
  const [instruction, setInstruction] = useState("Initializing navigation…");

  useEffect(() => {
    if (!origin || !destination) return;
    if (!mapRef.current) {
      const { sw, ne } = computeBounds(origin[1], origin[0]);
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE.navigation,
        center: origin,
        zoom: 15,
        maxBounds: [sw, ne],
        attributionControl: false,
      });
      createImageMarker({ iconPath: "/icons/destination.svg", coords: destination, map: mapRef.current, popupText: "Pickup location" });
    }

    (async () => {
      try {
        const route = await fetchRoute([origin, destination], { steps: true });
        if (!route) return;
        setEta({ duration: Math.round(route.duration / 60), distance: (route.distance / 1000).toFixed(2) });
        const next = route.legs[0].steps[0]?.maneuver.instruction;
        if (next && next !== instruction) {
          setInstruction(next);
          speak(next);
        }
        const geo = { type: "Feature", geometry: route.geometry };
        if (mapRef.current.getSource("route")) mapRef.current.getSource("route").setData(geo);
        else {
          mapRef.current.addSource("route", { type: "geojson", data: geo });
          mapRef.current.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: ROUTE_PAINT });
        }
      } catch {
        setInstruction("Could not fetch route information.");
      }
    })();

    if (!userMarkerRef.current) {
      userMarkerRef.current = createVehicleMarker({ vehicleType, coords: origin, map: mapRef.current, popupText: "You are here" });
    } else {
      userMarkerRef.current.setLngLat(origin);
    }
    mapRef.current.fitBounds(new mapboxgl.LngLatBounds(origin, destination), { padding: 80, speed: 1.2 });
  }, [origin, destination, instruction, vehicleType]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="glass absolute left-4 top-4 max-w-xs rounded-2xl border border-border p-4 shadow-floating">
        <p className="text-sm font-semibold text-foreground">
          ETA: {eta ? `${eta.duration} min · ${eta.distance} km` : "Calculating…"}
        </p>
        <p className="mt-1 text-sm text-muted">{instruction}</p>
      </div>
    </div>
  );
}

/** Turn-by-turn navigation (ongoing ride). */
function TurnByTurnNavigation({ origin, destination, vehicleType }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [eta, setEta] = useState(null);
  const [routeSteps, setRouteSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spokenSteps, setSpokenSteps] = useState(new Set());

  const checkProximity = useCallback(() => {
    if (!routeSteps.length || !origin || !navigationStarted) return;
    const [lng, lat] = origin;
    for (let i = currentStepIndex; i < routeSteps.length; i++) {
      const step = routeSteps[i];
      const [sLng, sLat] = step.maneuver.location;
      const dist = distanceMeters({ lat, lng }, { lat: sLat, lng: sLng });
      let threshold = 100;
      const t = step.maneuver.type;
      if (t === "turn") threshold = 150;
      else if (t === "roundabout") threshold = 200;
      else if (t === "merge" || t === "fork") threshold = 300;
      else if (t === "off ramp" || t === "on ramp") threshold = 400;

      if (dist <= threshold && !spokenSteps.has(i)) {
        const phrase = (dist > 50 ? `In ${Math.round(dist)} meters, ` : "Now, ") + step.maneuver.instruction;
        setCurrentStep(phrase);
        speak(phrase);
        setSpokenSteps((prev) => new Set([...prev, i]));
        if (dist <= 50) setCurrentStepIndex(i + 1);
        break;
      }
    }
    const destDist = distanceMeters({ lat, lng }, { lat: destination[1], lng: destination[0] });
    if (destDist <= 50 && !spokenSteps.has("destination")) {
      speak("You have arrived at your destination!");
      setCurrentStep("Destination reached!");
      setSpokenSteps((prev) => new Set([...prev, "destination"]));
    }
  }, [origin, routeSteps, currentStepIndex, spokenSteps, navigationStarted, destination]);

  useEffect(() => {
    if (navigationStarted) checkProximity();
  }, [origin, checkProximity, navigationStarted]);

  const drawRoute = useCallback(async () => {
    if (!origin || !destination || !mapRef.current) return;
    try {
      const route = await fetchRoute([origin, destination], { steps: true });
      if (!route) return;
      setEta({ duration: Math.round(route.duration / 60), distance: (route.distance / 1000).toFixed(2) });
      setRouteSteps(route.legs[0].steps);
      setCurrentStepIndex(0);
      setSpokenSteps(new Set());
      const geo = { type: "Feature", geometry: route.geometry };
      if (mapRef.current.getSource("route")) mapRef.current.getSource("route").setData(geo);
      else {
        mapRef.current.addSource("route", { type: "geojson", data: geo });
        mapRef.current.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: ROUTE_PAINT });
      }
    } catch {
      /* ignore */
    }
  }, [origin, destination]);

  useEffect(() => {
    if (!origin || !destination) return;
    if (!mapRef.current) {
      const { sw, ne } = computeBounds(origin[1], origin[0]);
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE.navigation,
        center: origin,
        zoom: 15,
        maxBounds: [sw, ne],
        attributionControl: false,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "bottom-left");
      userMarkerRef.current = createVehicleMarker({ vehicleType, coords: origin, map: mapRef.current, popupText: "You are here" });
      createImageMarker({ iconPath: "/icons/destination.svg", coords: destination, map: mapRef.current, popupText: "Destination" });
      mapRef.current.on("load", drawRoute);
    }
    drawRoute();
  }, [origin, destination, drawRoute, vehicleType]);

  useEffect(() => {
    if (userMarkerRef.current && origin) userMarkerRef.current.setLngLat(origin);
  }, [origin]);

  const startNavigation = () => {
    if (!routeSteps.length) return;
    setNavigationStarted(true);
    speak("Navigation started. Drive safely!");
    const first = routeSteps[0].maneuver.instruction;
    setCurrentStep(first);
    speak(first);
    setSpokenSteps(new Set([0]));
  };

  const stopNavigation = () => {
    setNavigationStarted(false);
    setCurrentStep(null);
    setCurrentStepIndex(0);
    setSpokenSteps(new Set());
    speechSynthesis.cancel();
  };

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="glass absolute right-4 top-4 max-w-xs rounded-2xl border border-border p-4 shadow-floating">
        <p className="text-sm font-semibold text-foreground">
          {eta ? `ETA: ${eta.duration} min · ${eta.distance} km` : "Loading route…"}
        </p>
        <div className="mt-3">
          {!navigationStarted ? (
            <Button fullWidth size="sm" onClick={startNavigation}>Start navigation</Button>
          ) : (
            <Button fullWidth size="sm" variant="danger" onClick={stopNavigation}>Stop navigation</Button>
          )}
        </div>
        {currentStep && (
          <div className="mt-3 rounded-xl bg-primary-subtle p-3">
            <p className="text-xs font-medium text-primary-subtle-fg">Current instruction</p>
            <p className="mt-1 text-sm text-foreground">{currentStep}</p>
          </div>
        )}
        {navigationStarted && routeSteps.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted">Step {currentStepIndex + 1} of {routeSteps.length}</p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(currentStepIndex / routeSteps.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DriverActiveRide() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otpInput, setOtpInput] = useState("");
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [driverLocation, setDriverLocation] = useState(null);

  const handleEndRide = useCallback(
    async (isAutoEnd = false) => {
      if (!ride || ride.status !== "ongoing") return;
      const { error } = await supabase.from("rides").update({ status: "completed" }).eq("id", rideId);
      if (!error) {
        await supabase.from("active_drivers").update({ on_ride: false, current_ride_id: null }).eq("user_id", userId);
        if (isAutoEnd) speak("Destination reached. Ride completed!");
      }
    },
    [ride, rideId, userId]
  );

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDriverLocation(loc);
        if (userId) {
          supabase
            .from("active_drivers")
            .update({ current_lat: loc.lat, current_lng: loc.lng, last_updated: new Date().toISOString() })
            .eq("user_id", userId)
            .then();
        }
        if (ride?.status === "ongoing" && distanceKm(loc, { lat: ride.to_lat, lng: ride.to_lng }) < 0.03) {
          handleEndRide(true);
        }
      },
      () => setError("Location access is required for navigation."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [ride, userId, handleEndRide]);

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
    if (ride && otpInput === ride.start_otp) {
      await supabase.from("rides").update({ status: "ongoing" }).eq("id", rideId);
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

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <div className="flex w-full flex-col overflow-y-auto bg-background px-6 py-6 sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">On ride</h1>

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
          <div className="mt-5 rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <h2 className="font-semibold text-foreground">Trip to destination</h2>
            <p className="mt-1 text-sm text-muted">Follow turn-by-turn navigation. The ride ends automatically on arrival.</p>
            <Button variant="danger" fullWidth className="mt-4" onClick={() => handleEndRide(false)}>
              End ride manually
            </Button>
          </div>
        )}

        <div className="mt-5">
          <Chatbox rideId={rideId} userId={userId} messages={messages} title="Chat with rider" />
        </div>
      </div>

      <div className="relative hidden flex-1 sm:block">
        {originCoords && destinationCoords ? (
          ride.status === "ongoing" ? (
            <TurnByTurnNavigation origin={originCoords} destination={destinationCoords} vehicleType={ride.vehicle_type} />
          ) : (
            <LiveNavigationMap origin={originCoords} destination={destinationCoords} vehicleType={ride.vehicle_type} />
          )
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-2 text-muted">
            {error || "Waiting for location data…"}
          </div>
        )}
      </div>
    </div>
  );
}
