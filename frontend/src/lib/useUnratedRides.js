import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth.jsx";
import { myRides } from "./rides";

/**
 * Completed trips the user hasn't rated yet. Drives the Activity tab badge and
 * the "rate your last trip" prompt — feedback is only useful if it's asked for.
 */
export function useUnratedRides() {
  const { userId } = useAuth();
  const [rides, setRides] = useState([]);

  const load = useCallback(async () => {
    if (!userId) {
      setRides([]);
      return;
    }
    const { data } = await myRides({ status: "completed", limit: 20 });
    setRides((data ?? []).filter((r) => r.my_rating == null && r.counterpart_name));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rides, count: rides.length, refresh: load };
}
