import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Repeat, Star, Download, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { fetchRideDetail } from "../lib/rides";
import { useAuth } from "../lib/auth.jsx";
import { useBooking } from "../lib/booking.jsx";
import { statusLabel, statusTone } from "../lib/rideStatus";
import { formatDate, formatDistance, formatTime } from "../lib/format";
import { RIDE_TYPE_MAP } from "../lib/vehicles";
import { supabase } from "../lib/supabase";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import Skeleton from "../components/ui/Skeleton";
import StarRating from "../components/ui/StarRating";
import EmptyState from "../components/ui/EmptyState";
import FareBreakdown from "../components/ride/FareBreakdown";
import RideStatusStepper from "../components/ride/RideStatusStepper";
import RatingSheet from "../components/ride/RatingSheet";

/**
 * One trip, in full: route, timeline, receipt and rating.
 *
 * This is what "past rides" was missing — the app could show you that a trip
 * happened but never what it cost, when each step occurred, or who drove it.
 */
export default function TripDetail() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { patch } = useBooking();

  const [state, setState] = useState({ ride: null, payment: null, events: [], ratings: [] });
  const [counterpart, setCounterpart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rating, setRating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const detail = await fetchRideDetail(rideId);
    if (!detail.ride) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setState(detail);

    const otherId = detail.ride.rider_id === userId ? detail.ride.driver_id : detail.ride.rider_id;
    if (otherId) {
      const { data } = await supabase
        .from("users")
        .select("id, name, user_rating, mobile")
        .eq("id", otherId)
        .maybeSingle();
      setCounterpart(data ?? null);
    }
    setLoading(false);
  }, [rideId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const { ride, payment, ratings } = state;
  const role = ride?.driver_id === userId ? "driver" : "rider";
  const myRating = ratings.find((r) => r.rater_id === userId);
  const theirRating = ratings.find((r) => r.ratee_id === userId);

  const rebook = () => {
    if (!ride) return;
    patch({
      from: ride.from_address ?? "",
      to: ride.to_address ?? "",
      fromCords: { lat: ride.from_lat, lng: ride.from_lng },
      toCords: { lat: ride.to_lat, lng: ride.to_lng },
    });
    toast.success("Trip loaded — pick a ride to book again.");
    navigate("/");
  };

  const printReceipt = () => window.print();

  if (loading) {
    return (
      <Page title="Trip" back>
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
      </Page>
    );
  }

  if (notFound || !ride) {
    return (
      <Page title="Trip" back>
        <EmptyState
          icon={MapPin}
          title="Trip not found"
          description="This trip doesn't exist, or it isn't yours to view."
          action={<Button onClick={() => navigate("/activity")}>Back to activity</Button>}
        />
      </Page>
    );
  }

  const vehicle = RIDE_TYPE_MAP[ride.vehicle_type];

  return (
    <Page
      title={formatDate(ride.created_at)}
      subtitle={`${formatTime(ride.created_at)} · ${vehicle?.name ?? ride.vehicle_type}`}
      documentTitle="Trip details"
      back
      actions={
        <button
          type="button"
          onClick={printReceipt}
          aria-label="Print receipt"
          className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-[18px] w-[18px]" />
        </button>
      }
    >
      <div className="space-y-4">
        {/* Route */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {vehicle?.icon && (
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2">
                  <img src={vehicle.icon} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{vehicle?.name ?? ride.vehicle_type}</p>
                <p className="text-xs text-muted">{formatDistance(ride.distance_km)}</p>
              </div>
            </div>
            <Badge tone={statusTone(ride.status)}>{statusLabel(ride.status)}</Badge>
          </div>

          <div className="relative mt-4 pl-6">
            <span
              aria-hidden
              className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px border-l border-dashed border-border-strong"
            />
            <div className="relative pb-4">
              <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary-subtle" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">From</p>
              <p className="text-sm text-foreground">{ride.from_address || "Pickup"}</p>
            </div>
            <div className="relative">
              <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-danger ring-4 ring-danger-subtle" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">To</p>
              <p className="text-sm text-foreground">{ride.to_address || "Destination"}</p>
            </div>
          </div>

          <Button variant="secondary" size="sm" className="mt-4" onClick={rebook}>
            <Repeat className="h-3.5 w-3.5" /> Book this trip again
          </Button>
        </Card>

        {/* Counterpart */}
        {counterpart && (
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={counterpart.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{counterpart.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <StarRating value={counterpart.user_rating} size="sm" />
                {Number(counterpart.user_rating ?? 0).toFixed(1)} · your {role === "driver" ? "rider" : "driver"}
              </p>
            </div>
            {myRating ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
                <Star className="h-3 w-3 fill-warning text-warning" />
                You rated {myRating.stars}
              </span>
            ) : (
              ride.status === "completed" && (
                <Button size="sm" onClick={() => setRating(true)}>
                  Rate
                </Button>
              )
            )}
          </Card>
        )}

        {/* Receipt */}
        <FareBreakdown ride={ride} payment={payment} title="Receipt" />

        {/* Timeline */}
        <RideStatusStepper ride={ride} role={role} />

        {/* Feedback received */}
        {theirRating && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground">Feedback you received</h2>
            <div className="mt-2 flex items-center gap-2">
              <StarRating value={theirRating.stars} size="sm" />
              <span className="text-sm text-muted">{theirRating.stars} / 5</span>
            </div>
            {theirRating.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {theirRating.tags.map((t) => (
                  <Badge key={t} tone="brand">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {theirRating.comment && (
              <p className="mt-2 flex gap-2 text-sm text-muted">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {theirRating.comment}
              </p>
            )}
          </Card>
        )}
      </div>

      <RatingSheet
        open={rating}
        onClose={() => setRating(false)}
        ride={ride}
        role={role}
        counterpartName={counterpart?.name}
        onSubmitted={load}
      />
    </Page>
  );
}
