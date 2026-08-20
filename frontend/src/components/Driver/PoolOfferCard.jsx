import { MapPin, Clock, Route, IndianRupee, X, Users } from "lucide-react";
import { formatCurrency, formatDistance, formatDuration } from "../../lib/format";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";

/**
 * Another booking offered to a driver already on a trip.
 *
 * Two shapes, because they are different bargains. A **pooled** offer shares the
 * vehicle now, so the honest number is marginal: what it adds in money, in
 * minutes, and the rate between them. A **chained** offer is the next fare,
 * taken when this one ends — nothing is shared, nothing is delayed, so the
 * numbers that matter are the whole fare and how far the pickup is from where
 * the driver finishes.
 *
 * Either way the card leads with the driver's economics. One who cannot see
 * that this raises their earnings per hour declines every offer, and the
 * feature dies on the supply side rather than the demand side.
 */
export default function PoolOfferCard({ offer, onAccept, onDismiss, busy, secondsLeft, kind = "pool" }) {
  if (!offer) return null;

  const chained = kind === "chain";
  const perMinute =
    offer.added_minutes > 0 ? Number(offer.fare) / offer.added_minutes : Number(offer.fare);

  return (
    <Card className="border-primary/40 bg-primary/5 p-4 shadow-floating">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          <Badge tone={chained ? "brand" : "success"}>
            {chained ? "Next fare" : "On your way"}
          </Badge>
          {Number.isFinite(secondsLeft) && secondsLeft > 0 && (
            <span className="text-xs tabular-nums text-muted">{secondsLeft}s</span>
          )}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this offer"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-sm font-medium text-foreground">
        {offer.rider_name}
        {offer.seats > 1 && (
          <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-muted">
            <Users className="h-3 w-3" /> {offer.seats} seats
          </span>
        )}
      </p>

      <div className="mt-2.5 space-y-1.5 text-sm">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="line-clamp-1 text-foreground">{offer.from_address}</span>
        </p>
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <span className="line-clamp-1 text-muted">{offer.to_address}</span>
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface px-3 py-2.5 text-center">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-wide text-subtle">You earn</dt>
          <dd className="mt-0.5 flex items-center justify-center gap-0.5 text-sm font-semibold text-foreground">
            <IndianRupee className="h-3.5 w-3.5" />
            {Math.round(Number(offer.fare))}
          </dd>
        </div>
        <div className="border-x border-border">
          <dt className="text-[0.65rem] uppercase tracking-wide text-subtle">
            {chained ? "Trip length" : "Extra time"}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {chained ? formatDistance(offer.distance_km) : `+${formatDuration(offer.added_minutes)}`}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-wide text-subtle">
            {chained ? "Starts in" : "Per minute"}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-primary">
            {chained ? formatDuration(offer.free_in_min) : formatCurrency(Math.round(perMinute))}
          </dd>
        </div>
      </dl>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {chained ? (
          <span className="inline-flex items-center gap-1">
            <Route className="h-3 w-3" /> {formatDistance(offer.pickup_from_drop_km)} from where you
            finish
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1">
              <Route className="h-3 w-3" /> {formatDistance(offer.added_km)} off your route
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> pickup in {formatDuration(offer.pickup_eta_min)}
            </span>
          </>
        )}
      </p>

      <Button fullWidth className="mt-3" loading={busy} onClick={() => onAccept(offer)}>
        {chained ? "Queue as my next fare" : "Add to this trip"}
      </Button>
    </Card>
  );
}
