import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldCheck, MapPin, LinkIcon, Car } from "lucide-react";
import { fetchSharedTrip } from "../lib/safety";
import { statusCopy, statusLabel, statusTone, isTerminal } from "../lib/rideStatus";
import { formatDuration } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import {
  loadGoogleMaps,
  createMap,
  createImageMarker,
  createVehicleMarker,
  drawRoutePolyline,
  boundsFrom,
  toPath,
} from "../lib/googlemaps";
import { fetchRoute } from "../lib/geocoding";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import { LogoMark } from "../components/ui/Logo";

const POLL_MS = 10000;

/**
 * Public live-tracking page for a shared trip.
 *
 * Deliberately anonymous: the token is the only credential, and the server-side
 * `get_shared_trip()` returns status, the two endpoints, the driver's first
 * name, vehicle and live position — no phone numbers, no rider identity, no
 * fare. It polls rather than subscribing, because a viewer has no session and
 * therefore no realtime authorisation.
 */
export default function SharedTrip() {
  const { token } = useParams();
  useDocumentTitle("Live trip");

  const [trip, setTrip] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | invalid
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarker = useRef(null);
  const routeRef = useRef(null);
  const fitted = useRef(false);

  const load = useCallback(async () => {
    const { trip: row } = await fetchSharedTrip(token);
    if (!row) {
      setState("invalid");
      return;
    }
    setTrip(row);
    setState("ok");
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the trip is live; stop once it ends.
  useEffect(() => {
    if (state !== "ok" || (trip && isTerminal(trip.status))) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [state, trip, load]);

  // Map: created once we have the trip, then updated in place.
  useEffect(() => {
    if (state !== "ok" || !trip || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      await loadGoogleMaps();
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = createMap(containerRef.current, {
        center: { lat: trip.from_lat, lng: trip.from_lng },
        zoom: 13,
      });
      mapRef.current = map;
      createImageMarker({
        iconPath: "/icons/pickup.svg",
        position: { lat: trip.from_lat, lng: trip.from_lng },
        map,
        title: "Pickup",
      });
      createImageMarker({
        iconPath: "/icons/destination.svg",
        position: { lat: trip.to_lat, lng: trip.to_lng },
        map,
        title: "Destination",
      });
      try {
        const route = await fetchRoute([
          [trip.from_lng, trip.from_lat],
          [trip.to_lng, trip.to_lat],
        ]);
        if (!cancelled && route?.geometry) {
          routeRef.current = drawRoutePolyline(map, route.geometry.coordinates, { width: 5 });
          map.fitBounds(boundsFrom(toPath(route.geometry.coordinates)), 64);
          fitted.current = true;
        }
      } catch {
        /* the map still shows both pins without a route */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, trip]);

  // Move the driver marker as new positions arrive.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trip?.driver_lat) return;
    const position = { lat: trip.driver_lat, lng: trip.driver_lng };
    if (!driverMarker.current) {
      driverMarker.current = createVehicleMarker({
        vehicleType: trip.vehicle_type,
        position,
        map,
        title: trip.driver_name ? `${trip.driver_name}'s vehicle` : "Driver",
      });
      if (!fitted.current) {
        map.panTo(position);
        map.setZoom(15);
      }
    } else {
      driverMarker.current.setPosition(position);
    }
  }, [trip]);

  if (state === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-subtle">
          <LinkIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">This link isn&apos;t active</h1>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Share links expire six hours after they&apos;re created, and can be revoked at any time
            by the person who shared them.
          </p>
        </div>
        <Button as={Link} to="/">
          Go to Gol·Gol
        </Button>
      </div>
    );
  }

  const copy = statusCopy(trip.status, "rider");
  const ended = isTerminal(trip.status);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
        <div className="glass pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border px-4 py-3 shadow-floating">
          <LogoMark size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{copy.title}</p>
            <p className="truncate text-xs text-muted">
              {trip.driver_name ? `${trip.driver_name} · ` : ""}
              {trip.vehicle_registration || trip.vehicle_type || "on the way"}
            </p>
          </div>
          <Badge tone={statusTone(trip.status)}>{statusLabel(trip.status)}</Badge>
        </div>
      </div>

      {/* Footer card */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="glass pointer-events-auto mx-auto max-w-lg rounded-2xl border border-border p-4 shadow-floating">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
              <Car className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">{ended ? "This trip has ended." : copy.detail}</p>
              {!ended && trip.eta_minutes != null && (
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  Arriving in {formatDuration(trip.eta_minutes)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            <p className="flex items-start gap-1.5 text-xs">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="line-clamp-1 text-foreground">{trip.from_address || "Pickup"}</span>
            </p>
            <p className="flex items-start gap-1.5 text-xs">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <span className="line-clamp-1 text-muted">{trip.to_address || "Destination"}</span>
            </p>
          </div>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.68rem] text-subtle">
            <ShieldCheck className="h-3 w-3" />
            Shared safely — this link shows the route only, and expires
          </p>
        </div>
      </div>
    </div>
  );
}
