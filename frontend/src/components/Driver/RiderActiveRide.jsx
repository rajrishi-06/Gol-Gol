import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Car, ArrowLeft, LocateFixed, Phone, Star, ShieldCheck, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth.jsx";
import { useRideLive } from "../../lib/useRideLive";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  createVehicleMarker,
  drawRoutePolyline,
  boundsFrom,
} from "../../lib/googlemaps";
import { fetchRoute } from "../../lib/geocoding";
import { distanceKm } from "../../lib/geo";
import { subscribeRideLocation } from "../../lib/liveLocation";
import { createTripShare, shareTripLink } from "../../lib/safety";
import { formatCurrency, formatDuration } from "../../lib/format";
import { statusCopy, isLive } from "../../lib/rideStatus";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import Chatbox from "../Chatbox";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Spinner from "../ui/Spinner";
import RideSheet from "../RideSheet";
import MapFallback from "../MapFallback";
import RideStatusStepper from "../ride/RideStatusStepper";
import { ridePoolContext } from "../../lib/pooling";
import SafetyPanel from "../ride/SafetyPanel";
import CancelRideDialog from "../ride/CancelRideDialog";
import RatingSheet from "../ride/RatingSheet";
import SharedRideBanner from "../ride/SharedRideBanner";

/**
 * Live tracking map. The driver marker moves in real time, the route is redrawn
 * when the driver has moved far enough to matter, and the ETA prefers the
 * server-published number (the one the driver's own navigation is quoting) so
 * both sides agree.
 */
function TrackingMap({ ride, driverLocation, vehicleType, onBack }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarker = useRef(null);
  const pickupMarker = useRef(null);
  const destMarker = useRef(null);
  const routeRef = useRef(null);
  const lastRouted = useRef(null);
  const fitted = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [localEta, setLocalEta] = useState(null);
  const [mapFailed, setMapFailed] = useState(false);

  // Where the driver is currently heading. Memoised so the recenter callback
  // and the routing effect don't see a new object on every render.
  const target = useMemo(
    () =>
      ride.status === "ongoing"
        ? { lat: ride.to_lat, lng: ride.to_lng }
        : { lat: ride.from_lat, lng: ride.from_lng },
    [ride.status, ride.to_lat, ride.to_lng, ride.from_lat, ride.from_lng]
  );

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [driverLocation, target].filter(Boolean);
    if (pts.length >= 2) map.fitBounds(boundsFrom(pts), 90);
    else if (pts.length === 1) {
      map.panTo(pts[0]);
      map.setZoom(15);
    }
  }, [driverLocation, target]);

  // Create the map once, centred on the pickup (always known).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        if (!cancelled) setMapFailed(true);
        return;
      }
      if (cancelled || !containerRef.current || mapRef.current) return;
      mapRef.current = createMap(containerRef.current, {
        center: { lat: ride.from_lat, lng: ride.from_lng },
        zoom: 14,
      });
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (ride.status !== "ongoing") {
      if (!pickupMarker.current) {
        pickupMarker.current = createImageMarker({
          iconPath: "/icons/human.svg",
          position: { lat: ride.from_lat, lng: ride.from_lng },
          map,
          title: "Pickup",
        });
      }
    } else if (pickupMarker.current) {
      pickupMarker.current.setMap(null);
      pickupMarker.current = null;
    }

    if (ride.status === "ongoing" && !destMarker.current) {
      destMarker.current = createImageMarker({
        iconPath: "/icons/destination.svg",
        position: { lat: ride.to_lat, lng: ride.to_lng },
        map,
        title: "Destination",
      });
    }

    if (driverLocation) {
      if (!driverMarker.current) {
        driverMarker.current = createVehicleMarker({
          vehicleType: vehicleType || "car",
          position: driverLocation,
          map,
          title: "Your driver",
        });
      } else {
        driverMarker.current.setPosition(driverLocation);
      }
    }
  }, [mapReady, driverLocation, ride, vehicleType]);

  // Route + fallback ETA, re-fetched only after the driver moves ~150 m.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !driverLocation) return undefined;
    if (lastRouted.current && distanceKm(lastRouted.current, driverLocation) < 0.15) return undefined;
    lastRouted.current = driverLocation;

    let cancelled = false;
    (async () => {
      try {
        const route = await fetchRoute([
          [driverLocation.lng, driverLocation.lat],
          [target.lng, target.lat],
        ]);
        if (cancelled || !route) return;
        setLocalEta({
          min: Math.max(1, Math.round(route.duration / 60)),
          km: (route.distance / 1000).toFixed(1),
        });
        if (route.geometry) {
          routeRef.current?.setMap(null);
          routeRef.current = drawRoutePolyline(mapRef.current, route.geometry.coordinates, { width: 5 });
        }
      } catch {
        /* route drawing is non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapReady, driverLocation, target]);

  // Fit both points the first time we have them.
  useEffect(() => {
    if (!mapReady || fitted.current || !driverLocation) return;
    fitted.current = true;
    recenter();
  }, [mapReady, driverLocation, recenter]);

  // The driver's own navigation is the source of truth when it's fresh.
  const serverEtaFresh =
    ride.eta_minutes != null &&
    ride.eta_updated_at &&
    Date.now() - new Date(ride.eta_updated_at).getTime() < 120000;
  const etaText = serverEtaFresh
    ? `${formatDuration(ride.eta_minutes)}${ride.eta_distance_km ? ` · ${ride.eta_distance_km} km` : ""}`
    : localEta
    ? `${formatDuration(localEta.min)} · ${localEta.km} km`
    : driverLocation
    ? "Calculating…"
    : "Locating driver…";

  return (
    <div className="relative h-full w-full">
      {mapFailed ? (
        <MapFallback message="We can't draw the map, but your ride is still live — the status and ETA below are up to date." />
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}

      <button
        onClick={onBack}
        aria-label="Back to home"
        className="glass absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-border text-foreground shadow-floating transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="glass absolute right-4 top-4 rounded-2xl border border-border px-4 py-2.5 shadow-floating">
        <p className="text-xs font-medium text-primary">
          {ride.status === "ongoing"
            ? "To destination"
            : ride.status === "arrived"
            ? "Driver is outside"
            : "Driver on the way"}
        </p>
        <p className="text-sm font-semibold text-foreground" aria-live="polite">
          {etaText}
        </p>
      </div>

      <button
        onClick={recenter}
        aria-label="Recenter map"
        className="glass absolute bottom-[calc(42dvh+1rem)] right-4 grid h-11 w-11 place-items-center rounded-full border border-border text-foreground shadow-floating transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring sm:bottom-4"
      >
        <LocateFixed className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function RiderActiveRide() {
  useDocumentTitle("Tracking your ride");
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { userId, settings } = useAuth();

  const { ride, messages, loading, error } = useRideLive(rideId);
  const [driverLocation, setDriverLocation] = useState(null);
  const [driver, setDriver] = useState(null);
  const [startOtp, setStartOtp] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [pool, setPool] = useState(null);

  // Sharing state, as a server-side projection: first name and rating only.
  // A policy on `rides` would leak co-passengers' pickup addresses.
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    (async () => {
      const { data } = await ridePoolContext(rideId);
      if (active) setPool(data ?? null);
    })();
    return () => {
      active = false;
    };
  }, [rideId, ride?.status, ride?.trip_id]);

  const autoShared = useRef(false);
  const arrivedToast = useRef(false);
  const finished = useRef(false);

  // ── driver profile ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ride?.driver_id) return;
    let active = true;
    (async () => {
      const [{ data: user }, { data: d }] = await Promise.all([
        supabase.from("users").select("id, name, mobile, user_rating").eq("id", ride.driver_id).maybeSingle(),
        supabase
          .from("drivers")
          .select("vehicle_type, vehicle_class, vehicle_registration, vehicle_model, vehicle_color")
          .eq("user_id", ride.driver_id)
          .maybeSingle(),
      ]);
      if (active) setDriver(user || d ? { ...(user ?? {}), ...(d ?? {}) } : null);
    })();
    return () => {
      active = false;
    };
  }, [ride?.driver_id]);

  // ── live driver position ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ride?.driver_id) return undefined;
    let active = true;
    (async () => {
      // Last known position from the DB so the marker appears immediately.
      const { data } = await supabase
        .from("active_drivers")
        .select("current_lat, current_lng")
        .eq("user_id", ride.driver_id)
        .maybeSingle();
      if (active && data?.current_lat != null) {
        setDriverLocation({ lat: data.current_lat, lng: data.current_lng });
      }
    })();
    const unsubscribe = subscribeRideLocation(rideId, setDriverLocation);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [ride?.driver_id, rideId]);

  // ── rider-only start OTP ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ride || !["accepted", "arrived"].includes(ride.status)) return undefined;
    let active = true;
    (async () => {
      const { data } = await supabase.from("ride_otps").select("otp").eq("ride_id", rideId).maybeSingle();
      if (active && data?.otp) setStartOtp(data.otp);
    })();
    return () => {
      active = false;
    };
  }, [ride, rideId]);

  // ── auto-share when the rider has asked for it ────────────────────────────
  useEffect(() => {
    if (!ride || autoShared.current) return;
    if (!settings?.share_trip_default) return;
    if (!isLive(ride.status)) return;
    autoShared.current = true;
    (async () => {
      const { url } = await createTripShare(rideId);
      if (url) {
        const how = await shareTripLink(url);
        if (how === "copied") toast.success("Trip link copied — auto-share is on.");
      }
    })();
  }, [ride, settings, rideId]);

  // ── status side effects ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ride) return;
    if (ride.status === "arrived" && !arrivedToast.current) {
      arrivedToast.current = true;
      toast.success("Your driver is outside", { description: "Share your OTP to start the trip." });
    }
    if (finished.current) return;
    if (ride.status === "completed") {
      finished.current = true;
      setRateOpen(true);
    } else if (ride.status === "cancelled" || ride.status === "expired") {
      finished.current = true;
      navigate("/", { replace: true });
    }
  }, [ride, navigate]);

  const share = async () => {
    const { url, error: err } = await createTripShare(rideId);
    if (err || !url) {
      toast.error("Couldn't create a share link.");
      return;
    }
    const how = await shareTripLink(url);
    if (how === "copied") toast.success("Trip link copied");
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
        <Button onClick={() => navigate("/")}>Back to home</Button>
      </div>
    );
  }

  // Still searching for a driver.
  if (!ride.driver_id) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <div className="relative grid h-16 w-16 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-subtle text-primary-subtle-fg">
              <Car className="h-6 w-6" />
            </span>
          </div>
          <p className="text-muted">Waiting for a driver to accept…</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/")}>
              Back to home
            </Button>
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              Cancel ride
            </Button>
          </div>
        </div>
        <CancelRideDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          ride={ride}
          role="rider"
          onCancelled={() => navigate("/", { replace: true })}
        />
      </>
    );
  }

  const copy = statusCopy(ride.status, "rider");
  const mapEl = (
    <TrackingMap
      ride={ride}
      driverLocation={driverLocation}
      vehicleType={driver?.vehicle_type || driver?.vehicle_class}
      onBack={() => navigate("/")}
    />
  );

  return (
    <>
      <RideSheet title={copy.title} map={mapEl}>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={share}
              aria-label="Share this trip"
              className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <SafetyPanel
              rideId={rideId}
              currentLocation={{ lat: ride.from_lat, lng: ride.from_lng }}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {(pool?.pooled || pool?.shareable) && (
          <div className="mt-4">
            <SharedRideBanner context={pool} />
          </div>
        )}

        {/* Driver card */}
        <Card className="mt-4 flex items-center gap-3 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
            <Car className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{driver?.name || "Your driver"}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">
              <Star className="h-3 w-3 fill-warning text-warning" />
              {Number(driver?.user_rating ?? 5).toFixed(1)}
              {driver?.vehicle_registration && ` · ${driver.vehicle_registration}`}
            </p>
            {(driver?.vehicle_model || driver?.vehicle_color) && (
              <p className="truncate text-xs text-subtle">
                {[driver.vehicle_color, driver.vehicle_model].filter(Boolean).join(" ")}
              </p>
            )}
          </div>
          {driver?.mobile && ["accepted", "arrived", "ongoing"].includes(ride.status) && (
            <a
              href={`tel:${driver.mobile}`}
              aria-label={`Call ${driver.name}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          <div className="shrink-0 text-right">
            <p className="font-bold text-foreground">{formatCurrency(ride.final_fare ?? ride.fare)}</p>
            <Badge tone={ride.payment_status === "paid" ? "success" : "neutral"} className="mt-1">
              {ride.payment_method}
            </Badge>
          </div>
        </Card>

        {/* OTP */}
        {["accepted", "arrived"].includes(ride.status) && (
          <Card
            className={
              ride.status === "arrived" ? "mt-4 border-2 border-primary p-4 text-center" : "mt-4 p-4 text-center"
            }
          >
            <h2 className="font-semibold text-foreground">Share this OTP</h2>
            <p className="mt-1 text-sm text-muted">
              {ride.status === "arrived"
                ? "Your driver is waiting — read them this code."
                : "Give it to your driver to start the ride."}
            </p>
            <p className="mt-3 rounded-xl bg-primary-subtle py-3 text-3xl font-bold tracking-[0.3em] text-primary-subtle-fg">
              {startOtp || "····"}
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-subtle">
              <ShieldCheck className="h-3 w-3" />
              Never share this before you&apos;re in the vehicle
            </p>
          </Card>
        )}

        {/* Progress */}
        <RideStatusStepper ride={ride} role="rider" className="mt-4" />

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

        {ride.status !== "ongoing" && ride.status !== "completed" && (
          <Button variant="danger" fullWidth className="mt-4" onClick={() => setCancelOpen(true)}>
            Cancel ride
          </Button>
        )}
      </RideSheet>

      <CancelRideDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        ride={ride}
        role="rider"
        onCancelled={() => navigate("/", { replace: true })}
      />

      <RatingSheet
        open={rateOpen}
        onClose={() => {
          setRateOpen(false);
          navigate(`/activity/${rideId}`, { replace: true });
        }}
        ride={ride}
        role="rider"
        counterpartName={driver?.name}
        onSubmitted={() => navigate(`/activity/${rideId}`, { replace: true })}
      />
    </>
  );
}
