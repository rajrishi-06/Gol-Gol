import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

/**
 * App-wide realtime/network health.
 *
 * Before this, a dropped websocket was completely invisible: the ride screen
 * simply stopped updating and the rider had no idea the driver marker had gone
 * stale. We now keep one lightweight presence channel open, expose its state,
 * and give screens a `subscribeToReconnect` hook so they can re-fetch the rows
 * they missed while offline.
 */

const ConnectionContext = createContext(null);

const OFFLINE = "offline";       // no network at all
const CONNECTING = "connecting"; // network up, socket not established
const ONLINE = "online";         // socket subscribed

export function ConnectionProvider({ children }) {
  const [networkUp, setNetworkUp] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [channelState, setChannelState] = useState(CONNECTING);
  const [lastConnectedAt, setLastConnectedAt] = useState(null);
  const listeners = useRef(new Set());
  const wasDown = useRef(false);

  // Browser online/offline.
  useEffect(() => {
    const up = () => setNetworkUp(true);
    const down = () => setNetworkUp(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // One heartbeat channel whose subscription state stands in for socket health.
  useEffect(() => {
    let cancelled = false;
    const channel = supabase.channel("app-health", {
      config: { broadcast: { self: false }, presence: { key: "health" } },
    });

    channel.subscribe((status) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        setChannelState(ONLINE);
        setLastConnectedAt(Date.now());
        if (wasDown.current) {
          wasDown.current = false;
          listeners.current.forEach((fn) => {
            try {
              fn();
            } catch {
              /* a bad listener must not break the others */
            }
          });
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        wasDown.current = true;
        setChannelState(CONNECTING);
      }
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Coming back from a background tab is the most common way to miss updates.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && wasDown.current) {
        listeners.current.forEach((fn) => {
          try {
            fn();
          } catch {
            /* ignore */
          }
        });
        wasDown.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /** Register a re-sync callback fired whenever the socket comes back. */
  const subscribeToReconnect = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const state = !networkUp ? OFFLINE : channelState;

  const value = useMemo(
    () => ({
      state,
      isOnline: state === ONLINE,
      isOffline: state === OFFLINE,
      isConnecting: state === CONNECTING,
      lastConnectedAt,
      subscribeToReconnect,
    }),
    [state, lastConnectedAt, subscribeToReconnect]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  // Usable outside the provider (tests, storybook) with a benign default.
  return ctx ?? { state: ONLINE, isOnline: true, isOffline: false, isConnecting: false, subscribeToReconnect: () => () => {} };
}

/** Run `fn` once now and again on every reconnect. */
export function useResync(fn, deps = []) {
  const { subscribeToReconnect } = useConnection();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => subscribeToReconnect(() => ref.current?.()), [subscribeToReconnect, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
