import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { User, Car } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../../lib/supabase";
import { computeBounds } from "../../lib/geo";
import { mapboxgl, MAP_STYLE, createImageMarker, createVehicleMarker } from "../../lib/mapbox";
import { fetchRoute } from "../../lib/geocoding";
import { formatCurrency } from "../../lib/format";
import Chatbox from "../Chatbox";
import Button from "../ui/Button";
import Spinner from "../ui/Spinner";

/** Map for the "driver approaching" (accepted) state. */
function RiderMapView({ ride, driverLocation, riderLocation, destinationLocation, status }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropoffMarkerRef = useRef(null);

  useEffect(() => {
    if (!riderLocation || mapRef.current) return;
    const { sw, ne } = computeBounds(riderLocation.lat, riderLocation.lng);
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE.streets,
      center: [riderLocation.lng, riderLocation.lat],
      zoom: 13,
      maxBounds: [sw, ne],
      attributionControl: false,
    });
  }, [riderLocation]);

  useEffect(() => {
    if (!mapRef.current) return;
    const bounds = new mapboxgl.LngLatBounds();

    if (riderLocation && status === "accepted") {
      const riderCoords = [riderLocation.lng, riderLocation.lat];
      if (!pickupMarkerRef.current)
        pickupMarkerRef.current = createImageMarker({ iconPath: "/icons/human.svg", coords: riderCoords, map: mapRef.current, popupText: "Pickup" });
      bounds.extend(riderCoords);
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    if (driverLocation) {
      const driverCoords = [driverLocation.lng, driverLocation.lat];
      if (!driverMarkerRef.current)
        driverMarkerRef.current = createVehicleMarker({ vehicleType: ride.driver.drivers.vehicle_type, coords: driverCoords, map: mapRef.current, popupText: "Your driver" });
      else driverMarkerRef.current.setLngLat(driverCoords);
      bounds.extend(driverCoords);
    }

    if (destinationLocation && status === "ongoing") {
      const destCoords = [destinationLocation.lng, destinationLocation.lat];
      if (!dropoffMarkerRef.current)
        dropoffMarkerRef.current = createImageMarker({ iconPath: "/icons/destination.svg", coords: destCoords, map: mapRef.current, popupText: "Destination" });
      bounds.extend(destCoords);
    }

    if (bounds.getNorthEast() && bounds.getSouthWest())
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
  }, [driverLocation, riderLocation, destinationLocation, status, ride]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}

/** Route-overview map for the ongoing state. */
function RiderNavigationView({ ride, riderLocation, driverLocation, destination }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const [eta, setEta] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  const drawRoute = useCallback(async () => {
    if (!riderLocation || !destination || !mapRef.current) return;
    try {
      const route = await fetchRoute([
        [riderLocation.lng, riderLocation.lat],
        [destination.lng, destination.lat],
      ], { steps: true });
      if (!route) return;
      setEta({ duration: Math.round(route.duration / 60), distance: (route.distance / 1000).toFixed(2) });
      setRouteInfo({ instructions: route.legs[0].steps.slice(0, 3) });
      const geo = { type: "Feature", geometry: route.geometry };
      if (mapRef.current.getSource("rider-route")) mapRef.current.getSource("rider-route").setData(geo);
      else {
        mapRef.current.addSource("rider-route", { type: "geojson", data: geo });
        mapRef.current.addLayer({ id: "rider-route", type: "line", source: "rider-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0f9b7f", "line-width": 4, "line-opacity": 0.8 } });
      }
    } catch {
      /* ignore */
    }
  }, [riderLocation, destination]);

  useEffect(() => {
    if (!riderLocation) return;
    if (!mapRef.current) {
      const { sw, ne } = computeBounds(riderLocation.lat, riderLocation.lng);
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE.streets,
        center: [riderLocation.lng, riderLocation.lat],
        zoom: 13,
        maxBounds: [sw, ne],
        attributionControl: false,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "bottom-left");
      if (destination)
        destinationMarkerRef.current = createImageMarker({ iconPath: "/icons/destination.svg", coords: [destination.lng, destination.lat], map: mapRef.current, popupText: "Destination" });
      mapRef.current.on("load", drawRoute);
    }
    drawRoute();
  }, [riderLocation, destination, drawRoute]);

  useEffect(() => {
    if (!mapRef.current || !driverLocation) return;
    const driverCoords = [driverLocation.lng, driverLocation.lat];
    if (!driverMarkerRef.current && ride?.driver?.drivers?.vehicle_type)
      driverMarkerRef.current = createVehicleMarker({ vehicleType: ride.driver.drivers.vehicle_type, coords: driverCoords, map: mapRef.current, popupText: "Your driver" });
    else if (driverMarkerRef.current) driverMarkerRef.current.setLngLat(driverCoords);

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([riderLocation.lng, riderLocation.lat]);
    bounds.extend(driverCoords);
    if (destination) bounds.extend([destination.lng, destination.lat]);
    mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
  }, [driverLocation, riderLocation, destination, ride]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="glass absolute right-4 top-4 max-w-xs rounded-2xl border border-border p-4 shadow-floating">
        <h3 className="text-sm font-semibold text-primary">Your journey</h3>
        <p className="mt-0.5 text-sm text-muted">
          {eta ? `${eta.duration} min · ${eta.distance} km to destination` : "Calculating route…"}
        </p>
        {routeInfo?.instructions && (
          <div className="mt-3 space-y-1.5">
            {routeInfo.instructions.map((step, i) => (
              <p key={i} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                {step.maneuver.instruction}
              </p>
            ))}
          </div>
        )}
      </div>
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

  useEffect(() => {
    if (!ride?.driver_id) return;
    (async () => {
      const { data } = await supabase.from("active_drivers").select("current_lat, current_lng").eq("user_id", ride.driver_id).single();
      if (data) setDriverLocation({ lat: data.current_lat, lng: data.current_lng });
    })();
    const channel = supabase
      .channel(`driver-location:${ride.driver_id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "active_drivers", filter: `user_id=eq.${ride.driver_id}` }, (payload) => setDriverLocation({ lat: payload.new.current_lat, lng: payload.new.current_lng }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [ride?.driver_id]);

  const handleCancelRide = async () => {
    if (window.confirm("Are you sure you want to cancel this ride?")) {
      await supabase.from("rides").update({ status: "cancelled" }).eq("id", rideId);
    }
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

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <div className="flex w-full flex-col overflow-y-auto bg-background px-6 py-6 sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {ride.status === "accepted" ? "Driver is on the way" : "You're on your way"}
        </h1>

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
              {ride.start_otp}
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
          <Chatbox rideId={rideId} userId={userId} messages={messages} title="Chat with driver" />
        </div>

        {ride.status !== "ongoing" && (
          <Button variant="danger" fullWidth className="mt-4" onClick={handleCancelRide}>
            Cancel ride
          </Button>
        )}
      </div>

      <div className="relative hidden flex-1 sm:block">
        {ride.status === "ongoing" && driverLocation ? (
          <RiderNavigationView
            ride={ride}
            riderLocation={{ lat: ride.from_lat, lng: ride.from_lng }}
            driverLocation={driverLocation}
            destination={{ lat: ride.to_lat, lng: ride.to_lng }}
          />
        ) : (
          <RiderMapView
            ride={ride}
            driverLocation={driverLocation}
            riderLocation={{ lat: ride.from_lat, lng: ride.from_lng }}
            destinationLocation={{ lat: ride.to_lat, lng: ride.to_lng }}
            status={ride.status}
          />
        )}
      </div>
    </div>
  );
}
