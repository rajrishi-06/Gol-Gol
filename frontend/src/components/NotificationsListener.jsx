import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

/**
 * App-wide notification toaster. Subscribes to the signed-in user's
 * `notifications` inserts and surfaces a Sonner toast on any route (including
 * the ride screens, which have no navbar).
 */
export default function NotificationsListener() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);

  // Track auth as state so the subscription effect below can cleanly tear down
  // and re-create its channel via React's lifecycle (avoids re-subscribing a
  // same-named channel, which throws "callbacks after subscribe()").
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user?.id ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id ?? null));
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    // Unique topic per mount so StrictMode's double-invoke can't collide.
    const topic = `notif-toast:${userId}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        ({ new: n }) => {
          toast(n.title, {
            description: n.body || undefined,
            action: n.url ? { label: "View", onClick: () => navigate(n.url) } : undefined,
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, navigate]);

  return null;
}
