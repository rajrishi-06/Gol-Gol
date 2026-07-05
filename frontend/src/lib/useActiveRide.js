import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Returns the current user's in-progress ride (as rider or driver), kept live
 * via a realtime subscription, or `null`. Lets the home screen surface an
 * ongoing ride instead of the idle state when the user navigates back.
 */
export function useActiveRide() {
  const [ride, setRide] = useState(null);

  useEffect(() => {
    const uid = localStorage.getItem("user_uuid");
    if (!uid) return;
    let active = true;
    let channel = null;

    const load = async () => {
      const { data } = await supabase
        .from("rides")
        .select("id, status, rider_id, driver_id, vehicle_type, from_address, to_address, fare, created_at")
        .or(`rider_id.eq.${uid},driver_id.eq.${uid}`)
        .in("status", ["accepted", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setRide(data ?? null);

      if (data) {
        channel = supabase
          .channel(`active-ride:${data.id}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${data.id}` },
            (payload) => {
              const next = payload.new;
              if (["completed", "cancelled"].includes(next.status)) setRide(null);
              else setRide((prev) => ({ ...prev, ...next }));
            }
          )
          .subscribe();
      }
    };

    load();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const uid = typeof localStorage !== "undefined" ? localStorage.getItem("user_uuid") : null;
  const role = ride ? (ride.driver_id === uid ? "driver" : "rider") : null;
  return { ride, role };
}
