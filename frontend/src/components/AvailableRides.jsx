import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, RefreshCw, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { distanceKm, hasValidCoords } from "../lib/geo";
import { fetchEtaMinutes } from "../lib/geocoding";
import { RIDE_TYPES } from "../lib/vehicles";
import { formatDuration } from "../lib/format";
import { cn } from "../lib/cn";
import Skeleton from "./ui/Skeleton";

/**
 * Nearest-driver ETA per ride type. Geo + ETA logic now comes from shared
 * `lib/` helpers instead of an inline Haversine + Mapbox fetch.
 */
export default function AvailableRides({ fromCords, toCords }) {
  const navigate = useNavigate();
  const [etas, setEtas] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchRides = useCallback(async () => {
    if (!hasValidCoords(fromCords)) {
      setEtas({});
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("active_drivers")
      .select("current_lat, current_lng, on_ride, is_online, drivers!inner(vehicle_type)")
      .eq("is_online", true)
      .eq("on_ride", false);

    if (error) {
      setEtas({});
      setLoading(false);
      return;
    }

    const next = {};
    await Promise.all(
      RIDE_TYPES.map(async (ride) => {
        const matches = (data ?? []).filter(
          (d) => d.drivers?.vehicle_type?.toLowerCase() === ride.id
        );
        if (!matches.length) {
          next[ride.id] = null;
          return;
        }
        const nearest = matches
          .map((d) => ({ d, km: distanceKm(fromCords, { lat: d.current_lat, lng: d.current_lng }) }))
          .sort((a, b) => a.km - b.km)[0].d;
        next[ride.id] = await fetchEtaMinutes(
          [fromCords.lng, fromCords.lat],
          [nearest.current_lng, nearest.current_lat]
        );
      })
    );
    setEtas(next);
    setLoading(false);
  }, [fromCords]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const handleSelect = (ride) => {
    if (hasValidCoords(fromCords) && hasValidCoords(toCords)) {
      navigate("/book", {
        state: {
          fromCords,
          toCords,
          selectedRide: { ...ride, vehicle_type: ride.id, desc: ride.tagline },
        },
      });
    } else {
      document.getElementById("rides-hint")?.classList.remove("hidden");
    }
  };

  return (
    <section className="mt-5" aria-label="Available rides">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Choose a ride</h2>
        <button
          onClick={fetchRides}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-subtle disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Updating" : "Refresh"}
        </button>
      </div>

      <p id="rides-hint" className="mb-2 hidden text-xs text-danger-fg">
        Set your drop location above to continue.
      </p>

      <ul className="space-y-2">
        {RIDE_TYPES.map((ride) => {
          const eta = etas[ride.id];
          return (
            <li key={ride.id}>
              <button
                onClick={() => handleSelect(ride)}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface p-3 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-200 ring-1 ring-black/[0.06]">
                  <img
                    src={ride.icon}
                    alt=""
                    width={34}
                    height={34}
                    className="h-[34px] w-[34px] object-contain"
                    loading="lazy"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{ride.name}</span>
                    <span className="inline-flex items-center gap-0.5 text-[0.7rem] text-subtle">
                      <Users className="h-3 w-3" />
                      {ride.seats}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{ride.tagline}</span>
                </span>
                <span className="flex flex-col items-end gap-1 pr-0.5">
                  {loading ? (
                    <Skeleton className="h-5 w-12" />
                  ) : eta != null ? (
                    <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary-subtle-fg">
                      {formatDuration(eta)}
                    </span>
                  ) : (
                    <span className="text-[0.7rem] font-medium text-subtle">No cabs</span>
                  )}
                  <ChevronRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
