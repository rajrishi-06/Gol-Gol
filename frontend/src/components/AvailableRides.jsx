import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, RefreshCw, Users } from "lucide-react";
import { nearbyDriverSummary } from "../lib/rides";
import { hasValidCoords } from "../lib/geo";
import { RIDE_TYPES, estimateFare } from "../lib/vehicles";
import { distanceKm } from "../lib/geo";
import { formatCurrency, formatDuration } from "../lib/format";
import { useBooking } from "../lib/booking.jsx";
import { cn } from "../lib/cn";
import Skeleton from "./ui/Skeleton";

/**
 * Ride classes with live supply.
 *
 * Two things changed here. First, the browser no longer downloads every online
 * driver's GPS position to work out the nearest one — `nearby_driver_summary()`
 * does that on the server and returns only a count and a distance per class.
 * Second, the ETA is derived from that distance instead of firing one billed
 * Routes API request per ride class on every render.
 */

// Straight-line → road distance, and a realistic Indian-city average speed.
const ROAD_FACTOR = 1.35;
const KM_PER_MIN = 0.35; // ≈ 21 km/h

function etaFromDistance(km) {
  if (!Number.isFinite(km)) return null;
  return Math.max(2, Math.round((km * ROAD_FACTOR) / KM_PER_MIN));
}

export default function AvailableRides({ fromCords, toCords }) {
  const navigate = useNavigate();
  const { patch } = useBooking();
  const [supply, setSupply] = useState({});
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");

  const tripKm = hasValidCoords(fromCords) && hasValidCoords(toCords) ? distanceKm(fromCords, toCords) : null;

  const fetchSupply = useCallback(async () => {
    if (!hasValidCoords(fromCords)) {
      setSupply({});
      return;
    }
    setLoading(true);
    const { data, error } = await nearbyDriverSummary({ lat: fromCords.lat, lng: fromCords.lng });
    if (!error && data) {
      setSupply(
        Object.fromEntries(
          data.map((row) => [
            row.vehicle_class,
            { count: row.drivers_online, eta: etaFromDistance(Number(row.nearest_km)) },
          ])
        )
      );
    } else {
      setSupply({});
    }
    setLoading(false);
  }, [fromCords]);

  useEffect(() => {
    fetchSupply();
  }, [fetchSupply]);

  // Supply moves; refresh while the user is deciding.
  useEffect(() => {
    if (!hasValidCoords(fromCords)) return undefined;
    const timer = setInterval(fetchSupply, 30000);
    return () => clearInterval(timer);
  }, [fetchSupply, fromCords]);

  const select = (ride) => {
    if (!hasValidCoords(fromCords)) {
      setHint("Set your pickup location above to continue.");
      return;
    }
    if (!hasValidCoords(toCords)) {
      setHint("Set your drop location above to continue.");
      return;
    }
    setHint("");
    patch({ vehicleType: ride.id });
    navigate("/book");
  };

  return (
    <section className="mt-5" aria-label="Available rides">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Choose a ride</h2>
        <button
          type="button"
          onClick={fetchSupply}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-subtle disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Updating" : "Refresh"}
        </button>
      </div>

      {hint && (
        <p role="alert" className="mb-2 text-xs font-medium text-danger-fg">
          {hint}
        </p>
      )}

      <ul className="space-y-2">
        {RIDE_TYPES.map((ride, i) => {
          const live = supply[ride.id];
          const fare = tripKm != null ? estimateFare(ride.id, tripKm) : null;

          return (
            <li key={ride.id} className="animate-rise" style={{ "--i": i }}>
              <button
                type="button"
                onClick={() => select(ride)}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface p-3 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {loading && !live ? (
                      <Skeleton className="h-3 w-32" />
                    ) : live ? (
                      `${live.count} nearby · ${formatDuration(live.eta)} away`
                    ) : (
                      ride.tagline
                    )}
                  </span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-1 pr-0.5">
                  {fare ? (
                    <span className="text-sm font-bold text-foreground">
                      {formatCurrency(fare.total)}
                    </span>
                  ) : loading ? (
                    <Skeleton className="h-5 w-12" />
                  ) : null}
                  {live ? (
                    <span className="animate-scale-in rounded-full bg-primary-subtle px-2 py-0.5 text-[0.7rem] font-semibold text-primary-subtle-fg">
                      {formatDuration(live.eta)}
                    </span>
                  ) : (
                    <span className="text-[0.7rem] font-medium text-subtle">No cabs nearby</span>
                  )}
                  <ChevronRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-center text-[0.68rem] text-subtle">
        Fares and arrival times are estimates. Final fare is confirmed at drop-off.
      </p>
    </section>
  );
}
