import { useCallback, useEffect, useState } from "react";
import { X, Check, Users, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { useBooking } from "../lib/booking.jsx";
import { acceptRideRequest, rejectRideRequest, removeCarpoolRider } from "../lib/rides";
import { distanceKm, hasValidCoords } from "../lib/geo";
import { formatCurrency, formatDate, formatDistance } from "../lib/format";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import Spinner from "./ui/Spinner";
import Alert from "./ui/Alert";
import EmptyState from "./ui/EmptyState";
import Field, { Input, Textarea } from "./ui/Field";

/**
 * Publish a shared ride and manage who joins it.
 *
 * Seat accounting used to be a client-side read-modify-write on
 * `available_seats` + `accepted_riders`, so two riders accepted at the same
 * moment could overbook the car. Accept / reject / remove now go through
 * SECURITY DEFINER RPCs that take a row lock — and, unlike before, they tell
 * the rider what happened.
 */
export default function PublishRide() {
  const { userId } = useAuth();
  const trip = useBooking();

  const [publishedRide, setPublishedRide] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ availableSeats: 1, farePerSeat: "", notes: "" });

  const routeReady = hasValidCoords(trip.fromCords) && hasValidCoords(trip.toCords);
  const routeKm = routeReady ? distanceKm(trip.fromCords, trip.toCords) : 0;

  const fetchRequests = useCallback(async (rideId) => {
    if (!rideId) return;
    const { data } = await supabase
      .from("ride_requests")
      .select("*, users(id, name, mobile, user_rating)")
      .eq("published_ride_id", rideId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests(data ?? []);
  }, []);

  const fetchPublished = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("published_rides")
      .select("*")
      .eq("driver_id", userId)
      .eq("status", "active")
      .maybeSingle();
    setPublishedRide(data ?? null);
    if (data) await fetchRequests(data.id);
    else setRequests([]);
    setLoading(false);
  }, [userId, fetchRequests]);

  useEffect(() => {
    fetchPublished();
  }, [fetchPublished]);

  // Live incoming requests for this published ride.
  useEffect(() => {
    if (!publishedRide?.id) return undefined;
    const channel = supabase
      .channel(`ride_requests:${publishedRide.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_requests",
          filter: `published_ride_id=eq.${publishedRide.id}`,
        },
        () => fetchRequests(publishedRide.id)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [publishedRide?.id, fetchRequests]);

  const publish = async (e) => {
    e.preventDefault();
    setError(null);
    if (!routeReady) return setError("Set your route above first.");
    if (Number(form.availableSeats) < 1) return setError("You need at least one available seat.");
    if (!trip.scheduledFor) return setError("Choose a departure time using the When selector.");
    if (publishedRide) return setError("You already have an active published ride.");

    setLoading(true);
    const { data, error: err } = await supabase
      .from("published_rides")
      .insert({
        driver_id: userId,
        from_lat: trip.fromCords.lat,
        from_lng: trip.fromCords.lng,
        to_lat: trip.toCords.lat,
        to_lng: trip.toCords.lng,
        from_address: trip.from || null,
        to_address: trip.to || null,
        available_seats: parseInt(form.availableSeats, 10),
        distance_km: Number(routeKm.toFixed(1)),
        fare_per_seat: form.farePerSeat ? parseFloat(form.farePerSeat) : 0,
        notes: form.notes || null,
        status: "active",
        departure_time: trip.scheduledFor,
      })
      .select()
      .single();
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    setPublishedRide(data);
    setRequests([]);
    toast.success("Ride published — riders can now request a seat.");
  };

  const closeRide = async (mode) => {
    if (!publishedRide) return;
    setLoading(true);
    await supabase
      .from("published_rides")
      .update({ status: mode, updated_at: new Date().toISOString() })
      .eq("id", publishedRide.id);
    setLoading(false);
    setPublishedRide(null);
    setRequests([]);
    toast.success(mode === "completed" ? "Ride marked completed" : "Ride cancelled");
  };

  const accept = async (req) => {
    setBusyId(req.id);
    const { data, error: err } = await acceptRideRequest(req.id);
    setBusyId(null);
    if (err) return toast.error(err.message || "Couldn't accept this request.");
    if (!data) return toast.error("Not enough seats left for this request.");
    toast.success(`${req.users?.name || "Rider"} added to your ride`);
    fetchPublished();
  };

  const reject = async (req) => {
    setBusyId(req.id);
    const { error: err } = await rejectRideRequest(req.id);
    setBusyId(null);
    if (err) return toast.error("Couldn't decline this request.");
    fetchRequests(publishedRide.id);
  };

  const removeRider = async (rider) => {
    setBusyId(rider.user_id);
    const { error: err } = await removeCarpoolRider(publishedRide.id, rider.user_id);
    setBusyId(null);
    if (err) return toast.error("Couldn't remove this rider.");
    toast.success(`${rider.name || "Rider"} removed`);
    fetchPublished();
  };

  const riders = publishedRide?.accepted_riders ?? [];

  return (
    <section className="relative mt-5 space-y-4">
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-10">
          <Spinner className="h-6 w-6 text-primary" />
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {publishedRide ? (
        <Card className="p-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h2 className="text-sm font-semibold text-foreground">Your published ride</h2>
            <Badge tone="success" dot>
              {publishedRide.status}
            </Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-subtle">From</dt>
              <dd className="truncate text-foreground">{publishedRide.from_address || "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle">To</dt>
              <dd className="truncate text-foreground">{publishedRide.to_address || "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle">Seats left</dt>
              <dd className="text-foreground">{publishedRide.available_seats}</dd>
            </div>
            <div>
              <dt className="text-subtle">Distance</dt>
              <dd className="text-foreground">{formatDistance(publishedRide.distance_km)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Fare / seat</dt>
              <dd className="text-foreground">{formatCurrency(publishedRide.fare_per_seat)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Departs</dt>
              <dd className="text-foreground">{formatDate(publishedRide.departure_time)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => closeRide("completed")}>
              Mark completed
            </Button>
            <Button size="sm" variant="danger" onClick={() => closeRide("cancelled")}>
              Cancel ride
            </Button>
          </div>
        </Card>
      ) : (
        <form onSubmit={publish} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Publish a ride</h2>
          <div className="space-y-3">
            <Field label="Available seats" htmlFor="seats">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={1}
                  max={7}
                  value={form.availableSeats}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, availableSeats: parseInt(e.target.value, 10) || 1 }))
                  }
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance" hint="Calculated from your route" htmlFor="dist">
                {(a) => (
                  <Input
                    {...a}
                    readOnly
                    value={routeReady ? `${routeKm.toFixed(1)} km` : "Set route"}
                    className="cursor-not-allowed bg-surface-2"
                  />
                )}
              </Field>
              <Field label="Fare / seat" htmlFor="fare">
                {(a) => (
                  <Input
                    {...a}
                    type="number"
                    min={0}
                    step="1"
                    value={form.farePerSeat}
                    onChange={(e) => setForm((f) => ({ ...f, farePerSeat: e.target.value }))}
                    placeholder="₹"
                  />
                )}
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              {(a) => (
                <Textarea
                  {...a}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional — landmarks, luggage space, timing…"
                  maxLength={240}
                />
              )}
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">
            Departure:{" "}
            <span className="font-medium text-foreground">
              {trip.scheduledFor ? formatDate(trip.scheduledFor) : "pick a time in When"}
            </span>
          </p>
          <Button type="submit" className="mt-3" disabled={!routeReady || !trip.scheduledFor}>
            Publish ride
          </Button>
        </form>
      )}

      {riders.length > 0 && (
        <Card className="p-4">
          <h2 className="flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" /> Riders on board ({riders.length})
          </h2>
          <div className="mt-2 space-y-2">
            {riders.map((rider) => (
              <div
                key={rider.user_id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{rider.name}</span>
                  <span className="block text-muted">
                    {rider.mobile} · {rider.seats} {rider.seats === 1 ? "seat" : "seats"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeRider(rider)}
                  disabled={busyId === rider.user_id}
                  aria-label={`Remove ${rider.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger-subtle hover:text-danger-fg disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {publishedRide && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Seat requests {requests.length > 0 && `(${requests.length})`}
          </h3>
          {requests.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Riders travelling your way will show up here in real time."
            />
          ) : (
            <div className="space-y-2">
              {requests.map((req) => (
                <Card key={req.id} className="p-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <p className="text-foreground">
                      <span className="text-subtle">Rider</span> {req.users?.name}
                    </p>
                    <p className="text-foreground">
                      <span className="text-subtle">Seats</span> {req.seats_requested}
                    </p>
                    {req.min_price && (
                      <p className="col-span-2 text-foreground">
                        <span className="text-subtle">Max price</span> {formatCurrency(req.min_price)}
                      </p>
                    )}
                    {req.notes && (
                      <p className="col-span-2 text-muted">
                        <span className="text-subtle">Notes</span> {req.notes}
                      </p>
                    )}
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" loading={busyId === req.id} onClick={() => accept(req)}>
                      <Check className="h-3.5 w-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="danger" disabled={busyId === req.id} onClick={() => reject(req)}>
                      <X className="h-3.5 w-3.5" /> Decline
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
