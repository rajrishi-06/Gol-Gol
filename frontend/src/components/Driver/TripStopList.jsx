import { MapPin, Flag, Check, Users } from "lucide-react";
import { cn } from "../../lib/cn";
import Card from "../ui/Card";
import Badge from "../ui/Badge";

/**
 * The schedule the driver has to drive, in order.
 *
 * With one booking this is just pickup → drop and reads as it always did. With
 * two it is the whole point of the feature: the sequence is ordered by progress
 * along the route, so a second rider going further than the first lands after
 * their drop rather than sending the vehicle backwards.
 */
export default function TripStopList({ stops = [], seatCapacity }) {
  const pending = stops.filter((s) => !s.reached_at);
  if (stops.length <= 2) return null;

  // Running occupancy after each stop — the number that must never exceed the
  // vehicle, and the reason capacity is checked at every stop rather than once.
  let aboard = stops
    .filter((s) => s.reached_at && s.kind === "pickup")
    .reduce((n, s) => n + s.seat_delta, 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Your route</h2>
        <Badge tone="neutral">
          {pending.length} stop{pending.length === 1 ? "" : "s"} left
        </Badge>
      </div>

      <ol className="mt-3 space-y-0">
        {stops.map((stop, i) => {
          if (!stop.reached_at) aboard += stop.seat_delta;
          const done = Boolean(stop.reached_at);
          const isPickup = stop.kind === "pickup";
          const last = i === stops.length - 1;

          return (
            <li key={`${stop.ride_id}-${stop.kind}`} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px",
                    done ? "bg-primary/40" : "border-l border-dashed border-border"
                  )}
                />
              )}
              <span
                className={cn(
                  "z-10 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2",
                  done
                    ? "border-primary bg-primary text-primary-fg"
                    : isPickup
                      ? "border-primary bg-surface text-primary"
                      : "border-danger bg-surface text-danger"
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isPickup ? (
                  <MapPin className="h-3 w-3" />
                ) : (
                  <Flag className="h-3 w-3" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="font-medium uppercase tracking-wide">
                    {isPickup ? "Pick up" : "Drop"}
                  </span>
                  <span className={cn("truncate", done && "line-through")}>{stop.rider_name}</span>
                </p>
                <p
                  className={cn(
                    "truncate text-sm",
                    done ? "text-subtle line-through" : "text-foreground"
                  )}
                >
                  {stop.address || (isPickup ? "Pickup" : "Destination")}
                </p>
              </div>

              {!done && seatCapacity != null && (
                <span
                  className="shrink-0 self-center text-xs tabular-nums text-muted"
                  title={`${aboard} of ${seatCapacity} seats in use after this stop`}
                >
                  <Users className="mr-0.5 inline h-3 w-3" />
                  {aboard}/{seatCapacity}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
