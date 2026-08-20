import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Send, Users, Clock, Navigation, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { useBooking } from "../lib/booking.jsx";
import { hasValidCoords } from "../lib/geo";
import { cancelCarpoolSeat } from "../lib/rides";
import { formatCurrency, formatDistance, formatTime } from "../lib/format";
import { cn } from "../lib/cn";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import Spinner from "./ui/Spinner";
import EmptyState from "./ui/EmptyState";
import Alert from "./ui/Alert";
import StarRating from "./ui/StarRating";

const inputCls =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

/**
 * Find a shared ride and ask for a seat.
 *
 * Two fixes here. Clicking a result used to throw — the component called a
 * `setSelectedRide` prop that its parent never passed, so every card and every
 * "View on map" button was a crash. And the rider had no idea what happened to
 * a request they sent: request status is now tracked and shown, and the driver's
 * accept/decline notifies them.
 */
export default function FindMatch({ fromCords, toCords, dateOfDeparture }) {
  const { userId } = useAuth();
  const { setPreviewRide } = useBooking();
  const [form, setForm] = useState({ seats: 1, maxPrice: "", maxDistance: "", notes: "" });
  const [rides, setRides] = useState([]);
  const [myRequests, setMyRequests] = useState({});
  const [releasingId, setReleasingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // What have I already asked for? Keeps the button honest across reloads.
  const loadMyRequests = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("ride_requests")
      .select("id, published_ride_id, status, ride_id")
      .eq("rider_id", userId)
      .in("status", ["pending", "accepted", "rejected"]);
    setMyRequests(
      Object.fromEntries(
        (data ?? []).map((r) => [
          r.published_ride_id,
          { id: r.id, status: r.status, rideId: r.ride_id },
        ])
      )
    );
  }, [userId]);

  useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  // Live updates when a driver decides.
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`my-requests:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ride_requests", filter: `rider_id=eq.${userId}` },
        ({ new: row }) => {
          setMyRequests((prev) => ({
            ...prev,
            [row.published_ride_id]: { id: row.id, status: row.status, rideId: row.ride_id },
          }));
          if (row.status === "accepted") toast.success("Your seat request was accepted");
          if (row.status === "rejected") toast("Your seat request was declined");
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const search = async (e) => {
    e?.preventDefault();
    if (!hasValidCoords(fromCords) || !hasValidCoords(toCords)) {
      setError("Set your pickup and drop above first.");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setLoading(true);
    setError(null);

    // A server-side search: seat, price and detour filtering all happen in the
    // database, and only safe driver fields come back. Reading `drivers`
    // directly used to expose every driver's licence number and document URL
    // to any signed-in user.
    const { data, error: err } = await supabase.rpc("search_published_rides", {
      p_lat: fromCords.lat,
      p_lng: fromCords.lng,
      p_seats: form.seats,
      p_max_price: form.maxPrice ? parseFloat(form.maxPrice) : null,
      p_max_detour_km: form.maxDistance ? parseFloat(form.maxDistance) : null,
      p_after:
        dateOfDeparture && new Date(dateOfDeparture) > new Date() ? dateOfDeparture : null,
    });
    setLoading(false);

    if (err) {
      setError("Couldn't search shared rides. Please try again.");
      return;
    }

    const results = data ?? [];
    setRides(results);
    // Seed request state from the search itself, so a page reload still shows
    // which rides you've already asked to join.
    setMyRequests((prev) => {
      const next = { ...prev };
      results.forEach((r) => {
        // The search knows the status but not the request row; keep whatever
        // `loadMyRequests` already found so the seat stays releasable.
        if (r.my_request_status) {
          next[r.id] = { ...(next[r.id] ?? {}), status: r.my_request_status };
        }
      });
      return next;
    });
    setSearched(true);
  };

  const requestSeat = async (ride) => {
    if (!userId) {
      setError("Sign in to request a seat.");
      return;
    }
    setSendingId(ride.id);
    const { error: err } = await supabase.from("ride_requests").insert({
      published_ride_id: ride.id,
      rider_id: userId,
      seats_requested: form.seats,
      status: "pending",
      pickup_lat: fromCords.lat,
      pickup_lng: fromCords.lng,
      drop_lat: toCords.lat,
      drop_lng: toCords.lng,
      min_price: form.maxPrice ? parseFloat(form.maxPrice) : null,
      notes: form.notes || null,
      max_distance: form.maxDistance ? parseFloat(form.maxDistance) : null,
    });
    setSendingId(null);
    if (err) {
      toast.error("Couldn't send your request. Please try again.");
      return;
    }
    setMyRequests((prev) => ({ ...prev, [ride.id]: { status: "pending" } }));
    toast.success("Request sent — we'll tell you as soon as the driver decides.");
  };

  /**
   * Letting a seat go.
   *
   * A rider could ask for a seat and then had no way to withdraw — the request
   * sat pending forever, or they were accepted onto a ride they no longer
   * wanted and the driver kept a seat off sale for them.
   */
  const releaseSeat = async (mine, ride) => {
    setReleasingId(mine.id);
    const { error: err } = await cancelCarpoolSeat(mine.id);
    setReleasingId(null);
    if (err) {
      toast.error(err.message || "Couldn't release this seat.");
      return;
    }
    setMyRequests((prev) => {
      const next = { ...prev };
      delete next[ride.id];
      return next;
    });
    toast.success("Seat released.");
    loadMyRequests();
  };

  /**
   * Shape the map preview expects: the driver's leg, plus where *you* would
   * join so the detour is obvious.
   *
   * This used to plot every accepted rider's pickup and drop with their name
   * against it, from the `accepted_riders` the search returned. Those are
   * strangers' home addresses. The search no longer returns them and the
   * preview no longer wants them — how full the car is answers the question
   * the pins were pretending to.
   */
  const preview = (ride) => ({
    id: ride.id,
    driver: {
      driver_start: { lat: ride.from_lat, lng: ride.from_lng },
      driver_end: { lat: ride.to_lat, lng: ride.to_lng },
    },
    riders: [{ pickup: fromCords, drop: toCords, name: "You" }],
  });

  const statusBadge = (status) => {
    if (status === "accepted") return <Badge tone="success">You&apos;re on board</Badge>;
    if (status === "pending") return <Badge tone="warning">Requested</Badge>;
    if (status === "rejected") return <Badge tone="danger">Declined</Badge>;
    return null;
  };

  return (
    <section className="relative mt-5 flex flex-1 flex-col">
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}

      <form onSubmit={search} className="rounded-2xl border border-border bg-surface p-3.5 shadow-soft">
        <h2 className="mb-2.5 text-sm font-semibold text-foreground">Find a shared ride</h2>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            min={1}
            max={6}
            value={form.seats}
            onChange={(e) => setForm((f) => ({ ...f, seats: parseInt(e.target.value, 10) || 1 }))}
            className={inputCls}
            placeholder="Seats"
            aria-label="Seats needed"
          />
          <input
            type="number"
            min={0}
            step="1"
            value={form.maxPrice}
            onChange={set("maxPrice")}
            className={inputCls}
            placeholder="Max ₹/seat"
            aria-label="Maximum price per seat"
          />
          <input
            type="number"
            min={0}
            step="0.5"
            value={form.maxDistance}
            onChange={set("maxDistance")}
            className={inputCls}
            placeholder="Max detour km"
            aria-label="Maximum detour in kilometres"
          />
        </div>
        <input
          type="text"
          value={form.notes}
          onChange={set("notes")}
          className={cn(inputCls, "mt-2")}
          placeholder="Note for the driver (optional)"
          aria-label="Note for the driver"
          maxLength={160}
        />
        <Button type="submit" size="sm" className="mt-3" loading={loading}>
          <Search className="h-4 w-4" /> Search rides
        </Button>
      </form>

      <div className="mt-4 flex-1">
        {loading && (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-primary" />
          </div>
        )}

        {searched && !loading && rides.length === 0 && (
          <EmptyState
            icon={Search}
            title="No matching rides"
            description="Try widening your detour or price filters, or pick a later departure time."
          />
        )}

        {!loading && rides.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {rides.length} shared {rides.length === 1 ? "ride" : "rides"} your way
            </h3>
            <div className="space-y-2">
              {rides.map((ride) => {
                const mine = myRequests[ride.id];
                const status = mine?.status;
                const driverName = ride.driver_name || "Driver";
                return (
                  <Card key={ride.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{driverName}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <StarRating value={ride.driver_rating} size="sm" />
                          <span className="capitalize">{ride.vehicle_class || "car"}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-primary">
                          {formatCurrency(ride.fare_per_seat)}/seat
                        </p>
                        <p className="inline-flex items-center gap-1 text-xs text-subtle">
                          <Users className="h-3 w-3" />
                          {ride.available_seats} left
                          {ride.riders_aboard > 0 && (
                            <span className="text-subtle">
                              · {ride.riders_aboard} sharing
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-muted">
                      <span className="truncate">
                        <span className="text-subtle">From</span> {ride.from_address || "—"}
                      </span>
                      <span className="truncate">
                        <span className="text-subtle">To</span> {ride.to_address || "—"}
                      </span>
                      <span>
                        <span className="text-subtle">Detour</span> {formatDistance(ride.detour_km)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-subtle" />
                        {formatTime(ride.departure_time)}
                      </span>
                    </div>

                    {ride.notes && (
                      <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                        {ride.notes}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      {status ? (
                        statusBadge(status)
                      ) : (
                        <Button
                          size="sm"
                          loading={sendingId === ride.id}
                          onClick={() => requestSeat(ride)}
                        >
                          <Send className="h-3.5 w-3.5" /> Request {form.seats}{" "}
                          {form.seats === 1 ? "seat" : "seats"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPreviewRide(preview(ride))}
                      >
                        <MapIcon className="h-3.5 w-3.5" /> View on map
                      </Button>
                      {status === "accepted" && mine?.rideId && (
                        <Button size="sm" as={Link} to={`/rider/ride/${mine.rideId}`}>
                          <Navigation className="h-3.5 w-3.5" /> Track this ride
                        </Button>
                      )}
                      {(status === "accepted" || status === "pending") && mine?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={releasingId === mine.id}
                          onClick={() => releaseSeat(mine, ride)}
                        >
                          Give up seat
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
