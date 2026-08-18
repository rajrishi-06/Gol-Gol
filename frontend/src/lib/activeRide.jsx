import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth.jsx";
import { useConnection } from "./connection.jsx";
import { LIVE_STATUSES } from "./rideStatus";

/**
 * The user's in-flight ride, shared app-wide.
 *
 * This is what lets the shell show a persistent "ride in progress" strip on
 * every screen — the thing that stops someone getting lost after tapping away
 * from the tracking map. Fetched once, kept live, re-synced on reconnect.
 */

const ActiveRideContext = createContext(null);

const SELECT =
  "id, status, rider_id, driver_id, vehicle_type, from_address, to_address, fare, final_fare, eta_minutes, created_at";

export function ActiveRideProvider({ children }) {
  const { userId } = useAuth();
  const { subscribeToReconnect } = useConnection();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setRide(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("rides")
      .select(SELECT)
      .or(`rider_id.eq.${userId},driver_id.eq.${userId}`)
      .in("status", LIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRide(data ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => subscribeToReconnect(load), [subscribeToReconnect, load]);

  // Watch both sides: a ride we're on can change status, and a *new* ride can
  // appear (a driver accepting a request they weren't previously attached to).
  useEffect(() => {
    if (!userId) return undefined;
    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`active-ride:${userId}:${suffix}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `rider_id=eq.${userId}` },
        ({ new: row }) => applyChange(row)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `driver_id=eq.${userId}` },
        ({ new: row }) => applyChange(row)
      )
      .subscribe();

    function applyChange(row) {
      setRide((prev) => {
        if (LIVE_STATUSES.includes(row.status)) {
          return prev && prev.id !== row.id ? prev : { ...(prev ?? {}), ...row };
        }
        return prev?.id === row.id ? null : prev;
      });
    }

    return () => supabase.removeChannel(channel);
  }, [userId]);

  const role = ride ? (ride.driver_id === userId ? "driver" : "rider") : null;

  const value = useMemo(
    () => ({
      ride,
      role,
      loading,
      refresh: load,
      clear: () => setRide(null),
      path: ride ? (role === "driver" ? `/driver/ride/${ride.id}` : `/rider/ride/${ride.id}`) : null,
    }),
    [ride, role, loading, load]
  );

  return <ActiveRideContext.Provider value={value}>{children}</ActiveRideContext.Provider>;
}

export function useActiveRide() {
  return (
    useContext(ActiveRideContext) ?? {
      ride: null,
      role: null,
      loading: false,
      refresh: () => {},
      clear: () => {},
      path: null,
    }
  );
}
