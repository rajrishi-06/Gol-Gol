import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { User, Car, ArrowLeft, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { distanceKm } from "../../lib/geo";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  createVehicleMarker,
  drawRoutePolyline,
  boundsFrom,
  restrictionAround,
  minZoomForRadius,
} from "../../lib/googlemaps";
import { fetchRoute } from "../../lib/geocoding";
import { notifyUser } from "../../lib/notify";
import { subscribeRideLocation } from "../../lib/liveLocation";
import { formatCurrency } from "../../lib/format";
import Chatbox from "../Chatbox";
import Button from "../ui/Button";
import Spinner from "../ui/Spinner";
import RideSheet from "../RideSheet";

/**
 * Google-Maps-style live tracking for the rider. The driver marker moves in
 * real time, a live route is drawn (driver → pickup while approaching, driver →
 * destination during the trip), with an ETA, a recenter control and a
 * back-to-home button. Route is re-fetched only after the driver moves a bit,
 * so we don't hammer the Routes API on every GPS tick.
 */
function RiderTrackingMap({ ride, riderLocation, driverLocation, destination, status, onBack }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const routeRef = useRef(null);
  const lastRoutedRef = useRef(null);
  const fittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [eta, setEta] = useState(null);

  const vehicleType = ride?.driver?.drivers?.vehicle_type;
  // Where the driver is currently heading.
  const target = status === "ongoing" ? destination : riderLocation;

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [];
    if (driverLocation) pts.push(driverLocation);
    if (target) pts.push(target);
    if (pts.length >= 2) map.fitBounds(boundsFrom(pts), 90);
    else if (pts.length === 1) {
      map.panTo(pts[0]);
      map.setZoom(15);
    }
  }, [driverLocation, target]);

  // Create the map once (centred on the rider, which is always known).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadGoogleMaps();
      if (cancelled || !containerRef.current || mapRef.current) return;
      const c = riderLocation;
      mapRef.current = createMap(containerRef.current, {
        center: { lat: c.lat, lng: c.lng },
        zoom: 14,
        restriction: restrictionAround(c.lat, c.lng, 100),
        minZoom: minZoomForRadius(c.lat, 100),
      });
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers — re-runs once the map is ready and whenever locations change,
  // which also fixes the driver marker never appearing if the position
  // arrived before the (async) map finished loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (riderLocation && status !== "ongoing") {
      if (!pickupMarkerRef.current)
        pickupMarkerRef.current = createImageMarker({ iconPath: "/icons/human.svg", position: riderLocation, map, title: "Pickup" });
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.setMap(null);
      pickupMarkerRef.current = null;
    }

    if (destination && status === "ongoing" && !destMarkerRef.current) {
      destMarkerRef.current = createImageMarker({ iconPath: "/icons/destination.svg", position: destination, map, title: "Destination" });
    }

    if (driverLocation && vehicleType) {
      if (!driverMarkerRef.current)
        driverMarkerRef.current = createVehicleMarker({ vehicleType, position: driverLocation, map, title: "Your driver" });
      else driverMarkerRef.current.setPosition(driverLocation);
    }
  }, [mapReady, driverLocation, riderLocation, destination, status, vehicleType]);

  // Live route + ETA, re-fetched when the driver moves > ~150 m.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !driverLocation || !target) return;
    const last = lastRoutedRef.current;
    if (last && distanceKm(last, driverLocation) < 0.15) return;
    lastRoutedRef.current = driverLocation;
    let cancelled = false;
    (async () => {
      try {
        const route = await fetchRoute([
          [driverLocation.lng, driverLocation.lat],
          [target.lng, target.lat],
        ]);
        if (cancelled || !route) return;
        setEta({ min: Math.max(1, Math.round(route.duration / 60)), km: (route.distance / 1000).toFixed(1) });
        if (route.geometry) {
          routeRef.current?.setMap(null);
          routeRef.current = drawRoutePolyline(mapRef.current, route.geometry.coordinates, { width: 5 });
        }
      } catch {
        /* route is non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapReady, driverLocation, target]);

  // Fit both driver + target into view the first time we have both.
  useEffect(() => {
    if (!mapReady || fittedRef.current || !driverLocation || !target) return;
    fittedRef.current = true;
    recenter();
  }, [mapReady, driverLocation, target, recenter]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back to home"
          className="glass absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-border text-foreground shadow-floating transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}

      <div className="glass absolute right-4 top-4 rounded-2xl border border-border px-4 py-2.5 shadow-floating">
        <p className="text-xs font-medium text-primary">
          {status === "ongoing" ? "To destination" : "Driver on the way"}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {driverLocation ? (eta ? `${eta.min} min · ${eta.km} km` : "Calculating…") : "Locating driver…"}
        </p>
      </div>

      <button
        onClick={recenter}
        aria-label="Recenter map"
        className="glass absolute bottom-[calc(40dvh+1rem)] right-4 grid h-11 w-11 place-items-center rounded-full border border-border text-foreground shadow-floating transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring sm:bottom-4"
      >
        <LocateFixed className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function RiderActiveRide() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startOtp, setStartOtp] = useState(null);

  useEffect(() => {
    (async () => {
      const storedUserId = localStorage.getItem("user_uuid");
      if (!storedUserId) return navigate("/login");
      setUserId(storedUserId);

      const { data: rideData, error } = await supabase.from("rides").select("*").eq("id", rideId).single();
      if (error || !rideData) {
        navigate("/");
        return;
      }
      if (rideData.driver_id) {
        const { data: driverData, error: driverError } = await supabase
          .from("drivers")
          .select("*, users(*)")
          .eq("user_id", rideData.driver_id)
          .single();
        setRide(!driverError && driverData ? { ...rideData, driver: { drivers: driverData } } : rideData);
      } else {
        setRide(rideData);
      }
      setLoading(false);
      const { data: chatData } = await supabase.from("chat_messages").select("*").eq("ride_id", rideId).order("created_at");
      setMessages(chatData || []);
    })();

    const rideSub = supabase
      .channel(`ride-updates:${rideId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` }, async (payload) => {
        const updated = payload.new;
        if (payload.old.driver_id === null && updated.driver_id) {
          const { data: fullRide } = await supabase.from("rides").select("*, driver:driver_id(drivers(*, users(*)))").eq("id", updated.id).single();
          setRide(fullRide);
        } else {
          setRide((prev) => ({ ...prev, ...updated }));
        }
        if (updated.status === "completed") setTimeout(() => navigate("/"), 2000);
        if (updated.status === "cancelled") navigate("/");
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

  // Live driver location. The last-known position comes from the DB (so the
  // driver appears instantly on open); live movement streams over Realtime
  // Broadcast keyed by the ride id (matches the driver's publisher).
  useEffect(() => {
    if (!ride?.driver_id) return;
    (async () => {
      const { data } = await supabase
        .from("active_drivers")
        .select("current_lat, current_lng")
        .eq("user_id", ride.driver_id)
        .maybeSingle();
      if (data?.current_lat != null) setDriverLocation({ lat: data.current_lat, lng: data.current_lng });
    })();
    const unsubscribe = subscribeRideLocation(rideId, setDriverLocation);
    return unsubscribe;
  }, [ride?.driver_id, rideId]);

  // The start-OTP lives in a rider-only table (migration 0003); fetch it to show.
  useEffect(() => {
    if (ride?.status !== "accepted") return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("ride_otps").select("otp").eq("ride_id", rideId).maybeSingle();
      if (active && data?.otp) setStartOtp(data.otp);
    })();
    return () => {
      active = false;
    };
  }, [ride?.status, rideId]);

  const handleCancelRide = () => {
    toast("Cancel this ride?", {
      description: "This can't be undone. Your driver will be notified.",
      action: {
        label: "Cancel ride",
        onClick: async () => {
          const { error } = await supabase.from("rides").update({ status: "cancelled" }).eq("id", rideId);
          if (error) {
            toast.error("Couldn't cancel the ride. Please try again.");
            return;
          }
          toast.success("Ride cancelled.");
          if (ride?.driver_id) {
            notifyUser({
              userId: ride.driver_id,
              title: "Ride cancelled",
              body: "The rider cancelled this ride.",
              url: "/driver/dashboard",
              type: "ride_cancelled",
            });
          }
        },
      },
      cancel: { label: "Keep ride" },
    });
  };

  if (loading)
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-muted">
        <Spinner className="mr-2 h-5 w-5 text-primary" /> Loading ride…
      </div>
    );

  if (!ride.driver_id)
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="relative grid h-16 w-16 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-subtle text-primary-subtle-fg">
            <Car className="h-6 w-6" />
          </span>
        </div>
        <p className="text-muted">Waiting for a driver to accept…</p>
        <Button variant="danger" onClick={handleCancelRide}>Cancel ride</Button>
      </div>
    );

  const heading = ride.status === "accepted" ? "Driver is on the way" : "You're on your way";
  const mapEl = (
    <RiderTrackingMap
      ride={ride}
      riderLocation={{ lat: ride.from_lat, lng: ride.from_lng }}
      driverLocation={driverLocation}
      destination={{ lat: ride.to_lat, lng: ride.to_lng }}
      status={ride.status}
      onBack={() => navigate("/")}
    />
  );

  return (
    <RideSheet title={heading} map={mapEl}>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
          <User className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{ride.driver.drivers.users.name}</p>
          <p className="truncate text-sm text-muted">
            {ride.driver.drivers.vehicle_type} · {ride.driver.drivers.vehicle_registration}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{formatCurrency(ride.fare)}</p>
          <p className="text-xs text-subtle">Total fare</p>
        </div>
      </div>

      {ride.status === "accepted" && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-center shadow-soft">
          <h2 className="font-semibold text-foreground">Share this OTP</h2>
          <p className="mt-1 text-sm text-muted">Give it to your driver to start the ride.</p>
          <p className="mt-3 rounded-xl bg-primary-subtle py-3 text-3xl font-bold tracking-[0.3em] text-primary-subtle-fg">
            {startOtp || "····"}
          </p>
        </div>
      )}

      {ride.status === "ongoing" && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h2 className="font-semibold text-foreground">Trip in progress</h2>
          <p className="mt-1 text-sm text-muted">The map shows your live route and progress to the destination.</p>
        </div>
      )}

      <div className="mt-4">
        <Chatbox
          rideId={rideId}
          userId={userId}
          messages={messages}
          title="Chat with driver"
          recipientId={ride.driver_id}
          recipientUrl={`/driver/ride/${rideId}`}
        />
      </div>

      {ride.status !== "ongoing" && (
        <Button variant="danger" fullWidth className="mt-4" onClick={handleCancelRide}>
          Cancel ride
        </Button>
      )}
    </RideSheet>
  );
}
