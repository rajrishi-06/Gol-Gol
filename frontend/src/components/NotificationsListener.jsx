import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";

/**
 * App-wide notification toaster. Subscribes to the signed-in user's
 * `notifications` inserts and surfaces a Sonner toast on any route (including
 * the ride screens, which have no navbar).
 */
export default function NotificationsListener() {
  const navigate = useNavigate();
  const { userId } = useAuth();

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
