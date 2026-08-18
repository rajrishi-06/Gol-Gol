import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, MapPin, RefreshCw, Star, ChevronRight, Car } from "lucide-react";
import { myRides } from "../lib/rides";
import { useAuth } from "../lib/auth.jsx";
import { statusLabel, statusTone } from "../lib/rideStatus";
import { formatCurrency, formatDate, formatDistance, formatTime } from "../lib/format";
import { RIDE_TYPE_MAP } from "../lib/vehicles";
import { cn } from "../lib/cn";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import StarRating from "../components/ui/StarRating";
import RatingSheet from "../components/ride/RatingSheet";

const PAGE_SIZE = 15;

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function TripCard({ trip, onRate }) {
  const vehicle = RIDE_TYPE_MAP[trip.vehicle_type];
  const amount = trip.final_fare ?? trip.fare;
  const needsRating = trip.status === "completed" && trip.my_rating == null && trip.counterpart_name;

  return (
    <Card className="overflow-hidden">
      <Link
        to={`/activity/${trip.id}`}
        className="block p-4 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2">
            {vehicle?.icon ? (
              <img src={vehicle.icon} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain" />
            ) : (
              <Car className="h-5 w-5 text-subtle" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {formatDate(trip.created_at)} · {formatTime(trip.created_at)}
              </span>
              <Badge tone={statusTone(trip.status)} className="ml-auto shrink-0">
                {statusLabel(trip.status)}
              </Badge>
            </div>

            <div className="mt-2 space-y-1">
              <p className="flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="line-clamp-1 text-foreground">{trip.from_address || "Pickup"}</span>
              </p>
              <p className="flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                <span className="line-clamp-1 text-muted">{trip.to_address || "Destination"}</span>
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="capitalize">{trip.role}</span>
              <span aria-hidden>·</span>
              <span>{formatDistance(trip.distance_km)}</span>
              {trip.counterpart_name && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{trip.counterpart_name}</span>
                </>
              )}
              {trip.my_rating != null && (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-warning text-warning" />
                  {trip.my_rating}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-base font-semibold text-foreground">{formatCurrency(amount)}</p>
            <ChevronRight className="ml-auto mt-1 h-4 w-4 text-subtle" />
          </div>
        </div>
      </Link>

      {needsRating && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2 px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs text-muted">
            <StarRating value={0} size="sm" label="Not yet rated" />
            Rate {trip.counterpart_name?.split(" ")[0]}
          </span>
          <Button size="sm" variant="secondary" onClick={() => onRate(trip)}>
            Rate trip
          </Button>
        </div>
      )}
    </Card>
  );
}

function TripSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <Skeleton className="h-5 w-14" />
      </div>
    </Card>
  );
}

/**
 * Trip history for both roles.
 *
 * The old Dashboard tab only ever showed a rider's last 20 completed rides — a
 * driver could not see a single trip they had driven, and a cancelled ride left
 * no trace at all. This reads `my_rides()`, which returns both sides with the
 * counterpart, the fare actually settled and whether you still owe a rating.
 */
export default function Activity({ defaultRole = "all" }) {
  const { isApprovedDriver } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState(defaultRole);
  const [status, setStatus] = useState("all");
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(null);

  const load = useCallback(
    async ({ append = false } = {}) => {
      const offset = append ? trips.length : 0;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setDone(false);
      }
      setError(false);

      const { data, error: err } = await myRides({ role, status, limit: PAGE_SIZE, offset });
      if (err) setError(true);
      else {
        const rows = data ?? [];
        setTrips((prev) => (append ? [...prev, ...rows] : rows));
        if (rows.length < PAGE_SIZE) setDone(true);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    // `trips.length` is read for the offset but must not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, status]
  );

  useEffect(() => {
    load();
  }, [load]);

  const roleFilters = [
    { id: "all", label: "All" },
    { id: "rider", label: "As rider" },
    ...(isApprovedDriver ? [{ id: "driver", label: "As driver" }] : []),
  ];

  const isDriverView = defaultRole === "driver";

  return (
    <Page
      title={isDriverView ? "Your trips" : "Activity"}
      subtitle={isDriverView ? "Every trip you've driven" : "Your rides, receipts and ratings"}
      actions={
        <button
          type="button"
          onClick={() => load()}
          aria-label="Refresh"
          disabled={loading}
          className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className={cn("h-[18px] w-[18px]", loading && "animate-spin")} />
        </button>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {!isDriverView && roleFilters.length > 1 && (
          <div role="group" aria-label="Filter by role" className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {roleFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={role === f.id}
                onClick={() => setRole(f.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  role === f.id ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={status === f.id}
              onClick={() => setStatus(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                status === f.id ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {loading ? (
          [1, 2, 3, 4].map((i) => <TripSkeleton key={i} />)
        ) : error ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted">We couldn&apos;t load your trips.</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => load()}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          </Card>
        ) : trips.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Nothing here yet"
            description={
              isDriverView
                ? "Trips you complete will show up here with their earnings."
                : "Your rides will appear here with receipts and ratings."
            }
            action={
              !isDriverView && (
                <Button onClick={() => navigate("/")}>Book a ride</Button>
              )
            }
          />
        ) : (
          <>
            {trips.map((trip, i) => (
              <div key={trip.id} className="animate-rise" style={{ "--i": Math.min(i, 8) }}>
                <TripCard trip={trip} onRate={setRating} />
              </div>
            ))}
            {!done && (
              <Button variant="secondary" fullWidth loading={loadingMore} onClick={() => load({ append: true })}>
                Load more
              </Button>
            )}
          </>
        )}
      </div>

      <RatingSheet
        open={Boolean(rating)}
        onClose={() => setRating(null)}
        ride={rating}
        role={rating?.role}
        counterpartName={rating?.counterpart_name}
        onSubmitted={({ stars }) =>
          setTrips((prev) => prev.map((t) => (t.id === rating.id ? { ...t, my_rating: stars } : t)))
        }
      />
    </Page>
  );
}
