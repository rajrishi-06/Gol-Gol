import { useEffect, useRef, useState } from "react";
import { sendDriverHeartbeat } from "./rides";

const HEARTBEAT_MS = 20000; // server treats a driver as stale after 90 s

/**
 * Keeps a driver's presence and position fresh while they're on duty.
 *
 * Two separate cadences on purpose:
 *  - the *position* comes from `watchPosition`, which fires as fast as the GPS
 *    can manage, and is kept in React state for the map;
 *  - the *server write* is a throttled heartbeat, so a driver sitting at a
 *    traffic light doesn't generate a write per second.
 *
 * A driver who closes the tab simply stops heartbeating and the server stops
 * treating them as live — which is what makes rider-side ETAs trustworthy.
 */
export function useDriverPresence({ enabled = true } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [permission, setPermission] = useState("prompt");
  const lastBeat = useRef(0);
  const latest = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device can't share its location.");
      return undefined;
    }

    let cancelled = false;

    const beat = (force = false) => {
      const now = Date.now();
      if (!force && now - lastBeat.current < HEARTBEAT_MS) return;
      lastBeat.current = now;
      const p = latest.current;
      sendDriverHeartbeat(p ?? {});
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed * 3.6 : null,
          accuracy: pos.coords.accuracy ?? null,
        };
        latest.current = next;
        setPosition(next);
        setPermission("granted");
        setError(null);
        beat();
      },
      (err) => {
        if (cancelled) return;
        setPermission(err.code === err.PERMISSION_DENIED ? "denied" : "prompt");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is off. Turn it on to receive ride requests."
            : "We can't read your location right now."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    // Beat immediately so the driver shows as live before the first GPS fix,
    // then on a timer so a stationary driver stays live.
    beat(true);
    const timer = setInterval(() => beat(true), HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return { position, error, permission };
}
