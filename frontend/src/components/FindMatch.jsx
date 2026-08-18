import { useCallback, useEffect, useState } from "react";
import { Search, Send, Users, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { distanceKm, hasValidCoords } from "../lib/geo";
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
  const [form, setForm] = useState({ seats: 1, maxPrice: "", maxDistance: "", notes: "" });
  const [rides, setRides] = useState([]);
  const [myRequests, setMyRequests] = useState({});
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
      .select("published_ride_id, status")
      .eq("rider_id", userId)
      .in("status", ["pending", "accepted", "rejected"]);
    setMyRequests(Object.fromEntries((data ?? []).map((r) => [r.published_ride_id, r.status])));
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
          setMyRequests((prev) => ({ ...prev, [row.published_ride_id]: row.status }));
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

    let query = supabase
      .from("published_rides")
      // The driver's mobile is deliberately not selected — it's only shared
      // once they accept you onto the ride.
      .select("*, drivers(vehicle_class, vehicle_type, users(name, user_rating))")
      .eq("status", "active")
      .gte("available_seats", form.seats)
      .order("departure_time", { ascending: true });

    if (dateOfDeparture && new Date(dateOfDeparture) > new Date()) {
      query = query.gte("departure_time", dateOfDeparture);
    }
    if (form.maxPrice && parseFloat(form.maxPrice) > 0) {
      query = query.lte("fare_per_seat", parseFloat(form.maxPrice));
    }

    const { data, error: err } = await query;
    setLoading(false);
    if (err) {
      setError("Couldn't search shared rides. Please try again.");
      return;
    }

    let results = data ?? [];
    const radius = parseFloat(form.maxDistance);
    if (radius > 0) {
      results = results.filter(
        (r) => distanceKm(fromCords, { lat: r.from_lat, lng: r.from_lng }) <= radius
      );
    }
    // Closest pickup first — the thing that actually decides whether a shared
    // ride is worth taking.
    results = results
      .map((r) => ({ ...r, detour_km: distanceKm(fromCords, { lat: r.from_lat, lng: r.from_lng }) }))
      .sort((a, b) => a.detour_km - b.detour_km);

    setRides(results);
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
    setMyRequests((prev) => ({ ...prev, [ride.id]: "pending" }));
    toast.success("Request sent — we'll tell you as soon as the driver decides.");
  };

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
                const status = myRequests[ride.id];
                const driverName = ride.drivers?.users?.name || "Driver";
                return (
                  <Card key={ride.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{driverName}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <StarRating value={ride.drivers?.users?.user_rating} size="sm" />
                          <span className="capitalize">{ride.drivers?.vehicle_class || "car"}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-primary">
                          {formatCurrency(ride.fare_per_seat)}/seat
                        </p>
                        <p className="inline-flex items-center gap-1 text-xs text-subtle">
                          <Users className="h-3 w-3" />
                          {ride.available_seats} left
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
                      {status === "accepted" && (
                        <span className="inline-flex items-center gap-1 text-xs text-success-fg">
                          <Check className="h-3.5 w-3.5" /> The driver has your details
                        </span>
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
