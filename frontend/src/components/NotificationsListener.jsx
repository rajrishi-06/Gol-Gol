import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";

/** Which preference governs which notification type. */
const SETTING_FOR = {
  chat: "notify_chat",
  ride_accepted: "notify_ride",
  driver_arrived: "notify_ride",
  ride_started: "notify_ride",
  ride_completed: "notify_ride",
  ride_cancelled: "notify_ride",
  carpool: "notify_ride",
  promo: "notify_promos",
};

/**
 * App-wide notification toaster.
 *
 * Surfaces a toast on any route (including the ride screens, which have no
 * header) and honours the user's notification preferences — the settings screen
 * would be decoration otherwise. Safety alerts always come through.
 */
export default function NotificationsListener() {
  const navigate = useNavigate();
  const { userId, settings } = useAuth();
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!userId) return undefined;
    // Unique topic per mount so StrictMode's double-invoke can't collide.
    const topic = `notif-toast:${userId}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        ({ new: n }) => {
          // An SOS is never suppressed by a preference.
          if (n.type !== "sos") {
            const key = SETTING_FOR[n.type];
            if (key && settingsRef.current && settingsRef.current[key] === false) return;
          }
          const fire = n.type === "sos" ? toast.error : toast;
          fire(n.title, {
            description: n.body || undefined,
            action: n.url ? { label: "View", onClick: () => navigate(n.url) } : undefined,
            duration: n.type === "sos" ? 15000 : undefined,
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
