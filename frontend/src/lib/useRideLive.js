import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useConnection } from "./connection.jsx";

/**
 * One subscription for everything that changes during a ride: the ride row, its
 * event timeline and the chat thread.
 *
 * Previously each ride screen opened its own two channels and re-implemented
 * the same fetch-then-subscribe dance, and neither of them re-synced after the
 * websocket dropped — so a backgrounded phone came back showing a stale status.
 * This hook re-fetches on every reconnect.
 */
export function useRideLive(rideId, { withChat = true } = {}) {
  const [ride, setRide] = useState(null);
  const [events, setEvents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { subscribeToReconnect } = useConnection();
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!rideId) return;
    const [rideRes, eventsRes, chatRes] = await Promise.all([
      supabase.from("rides").select("*").eq("id", rideId).maybeSingle(),
      supabase.from("ride_events").select("*").eq("ride_id", rideId).order("created_at"),
      withChat
        ? supabase.from("chat_messages").select("*").eq("ride_id", rideId).order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
    if (!mounted.current) return;
    if (rideRes.error || !rideRes.data) {
      setError("We couldn't load this ride.");
    } else {
      setRide(rideRes.data);
      setError(null);
    }
    setEvents(eventsRes.data ?? []);
    if (withChat) setMessages(chatRes.data ?? []);
    setLoading(false);
  }, [rideId, withChat]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Re-sync whatever we missed while the socket was down.
  useEffect(() => subscribeToReconnect(load), [subscribeToReconnect, load]);

  useEffect(() => {
    if (!rideId) return undefined;
    const suffix = Math.random().toString(36).slice(2, 8);

    const rideChannel = supabase
      .channel(`ride:${rideId}:${suffix}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        ({ new: row }) => setRide((prev) => ({ ...prev, ...row }))
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ride_events", filter: `ride_id=eq.${rideId}` },
        ({ new: row }) => setEvents((prev) => (prev.some((e) => e.id === row.id) ? prev : [...prev, row]))
      )
      .subscribe();

    let chatChannel = null;
    if (withChat) {
      chatChannel = supabase
        // Private: joining is checked against RLS on `realtime.messages`, so only
        // the two people on this ride can read or post to it.
        .channel(`ride-chat:${rideId}:${suffix}`, { config: { private: true } })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `ride_id=eq.${rideId}` },
          ({ new: row }) => setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(rideChannel);
      if (chatChannel) supabase.removeChannel(chatChannel);
    };
  }, [rideId, withChat]);

  return { ride, setRide, events, messages, loading, error, reload: load };
}
