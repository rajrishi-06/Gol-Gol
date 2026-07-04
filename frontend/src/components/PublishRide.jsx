import { useCallback, useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { distanceKm } from "../lib/geo";
import { formatCurrency, formatDate } from "../lib/format";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import Spinner from "./ui/Spinner";
import Alert from "./ui/Alert";
import Field, { Input, Textarea } from "./ui/Field";

export default function PublishRide({ fromCords, toCords, fromValue, toValue, when, dateOfDeparture, setSelectedRide }) {
  const user = localStorage.getItem("user_uuid");
  const [publishedRide, setPublishedRide] = useState(null);
  const [rideRequests, setRideRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ availableSeats: 1, distanceKm: "", farePerSeat: "", notes: "" });

  useEffect(() => {
    if (fromCords && toCords) {
      setForm((f) => ({ ...f, distanceKm: distanceKm(fromCords, toCords).toFixed(1) }));
    }
  }, [fromCords, toCords]);

  const fetchRequests = useCallback(async (rideId) => {
    if (!rideId) return;
    const { data } = await supabase
      .from("ride_requests")
      .select("*, users(id, name, mobile)")
      .eq("published_ride_id", rideId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setRideRequests(data || []);
  }, []);

  const fetchPublishedRide = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("published_rides")
        .select("*")
        .eq("driver_id", user)
        .eq("status", "active")
        .maybeSingle();
      if (!error && data) {
        setPublishedRide(data);
        await fetchRequests(data.id);
      } else {
        setPublishedRide(null);
        setRideRequests([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user, fetchRequests]);

  useEffect(() => {
    if (user) fetchPublishedRide();
  }, [user, fetchPublishedRide]);

  useEffect(() => {
    if (!publishedRide?.id) return;
    const channel = supabase
      .channel(`ride_requests:${publishedRide.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests", filter: `published_ride_id=eq.${publishedRide.id}` }, () => fetchRequests(publishedRide.id))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [publishedRide?.id, fetchRequests]);

  const handlePublish = async (e) => {
    e?.preventDefault();
    setError(null);
    if (!fromCords || !toCords) return setError("Set your route above first.");
    if (Number(form.availableSeats) < 1) return setError("Available seats must be at least 1.");
    if (!dateOfDeparture) return setError("Choose a departure time.");
    if (publishedRide) return setError("You already have an active published ride.");

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("published_rides")
        .insert([{
          driver_id: user,
          from_lat: parseFloat(fromCords.lat),
          from_lng: parseFloat(fromCords.lng),
          to_lat: parseFloat(toCords.lat),
          to_lng: parseFloat(toCords.lng),
          from_address: fromValue || null,
          to_address: toValue || null,
          available_seats: parseInt(form.availableSeats, 10),
          distance_km: parseFloat(form.distanceKm) || 0,
          fare_per_seat: form.farePerSeat ? parseFloat(form.farePerSeat) : 0,
          notes: form.notes || null,
          status: "active",
          departure_time: dateOfDeparture,
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();
      if (error) throw error;
      setPublishedRide(data);
      setRideRequests([]);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const closeRide = async (mode) => {
    if (!publishedRide) return;
    setLoading(true);
    try {
      await supabase.from("published_rides").update({ status: mode, updated_at: new Date().toISOString() }).eq("id", publishedRide.id);
      setPublishedRide(null);
      setRideRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (req) => {
    try {
      await supabase.from("ride_requests").update({ status: "accepted" }).eq("id", req.id);
      const { data: ride, error } = await supabase.from("published_rides").select("accepted_riders, available_seats").eq("id", req.published_ride_id).single();
      if (error) throw error;
      const updated = [...(ride.accepted_riders || []), {
        user_id: req.rider_id,
        name: req.users?.name,
        mobile: req.users?.mobile,
        seats: req.seats_requested,
        pickup: { lat: req.pickup_lat, lng: req.pickup_lng },
        drop: { lat: req.drop_lat, lng: req.drop_lng },
      }];
      const newSeats = Math.max(0, ride.available_seats - req.seats_requested);
      await supabase.from("published_rides").update({ accepted_riders: updated, available_seats: newSeats }).eq("id", req.published_ride_id);
      fetchRequests(req.published_ride_id);
      fetchPublishedRide();
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const handleReject = async (req) => {
    await supabase.from("ride_requests").update({ status: "rejected" }).eq("id", req.id);
    fetchRequests(req.published_ride_id);
  };

  const handleRemoveRider = async (idx) => {
    if (!publishedRide) return;
    setLoading(true);
    try {
      const riders = publishedRide.accepted_riders || [];
      const toRemove = riders[idx];
      if (!toRemove) return;
      const updated = riders.filter((_, i) => i !== idx);
      await supabase.from("published_rides").update({
        accepted_riders: updated,
        available_seats: publishedRide.available_seats + toRemove.seats,
        updated_at: new Date().toISOString(),
      }).eq("id", publishedRide.id);
      await supabase.from("ride_requests").update({ status: "removed" }).eq("published_ride_id", publishedRide.id).eq("rider_id", toRemove.user_id);
      await fetchPublishedRide();
    } finally {
      setLoading(false);
    }
  };

  const formatRideForMap = (r) => ({
    driver: { driver_start: { lat: r.from_lat, lng: r.from_lng }, driver_end: { lat: r.to_lat, lng: r.to_lng } },
    riders: (r.accepted_riders || []).map((x) => ({
      pickup: x.pickup ? { lat: x.pickup.lat, lng: x.pickup.lng } : null,
      drop: x.drop ? { lat: x.drop.lat, lng: x.drop.lng } : null,
      name: x.name,
    })),
  });

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
            <Badge tone="success" dot>{publishedRide.status}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div><dt className="text-subtle">From</dt><dd className="truncate text-foreground">{publishedRide.from_address}</dd></div>
            <div><dt className="text-subtle">To</dt><dd className="truncate text-foreground">{publishedRide.to_address}</dd></div>
            <div><dt className="text-subtle">Seats left</dt><dd className="text-foreground">{publishedRide.available_seats}</dd></div>
            <div><dt className="text-subtle">Distance</dt><dd className="text-foreground">{publishedRide.distance_km} km</dd></div>
            <div><dt className="text-subtle">Fare/seat</dt><dd className="text-foreground">{formatCurrency(publishedRide.fare_per_seat)}</dd></div>
            <div><dt className="text-subtle">Departs</dt><dd className="text-foreground">{formatDate(publishedRide.departure_time)}</dd></div>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => closeRide("completed")}>Mark completed</Button>
            <Button size="sm" variant="danger" onClick={() => closeRide("cancelled")}>Cancel ride</Button>
          </div>
        </Card>
      ) : (
        <form onSubmit={handlePublish} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Publish a ride</h2>
          <div className="space-y-3">
            <Field label="Available seats" htmlFor="seats">
              {(a) => <Input {...a} type="number" min={1} value={form.availableSeats} onChange={(e) => setForm((f) => ({ ...f, availableSeats: parseInt(e.target.value, 10) || 1 }))} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance (km)" htmlFor="dist">
                {(a) => <Input {...a} readOnly value={form.distanceKm} className="cursor-not-allowed bg-surface-2" />}
              </Field>
              <Field label="Fare / seat" htmlFor="fare">
                {(a) => <Input {...a} type="number" step="0.1" value={form.farePerSeat} onChange={(e) => setForm((f) => ({ ...f, farePerSeat: e.target.value }))} placeholder="₹" />}
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              {(a) => <Textarea {...a} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional — landmarks, timing…" />}
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">
            Departure: <span className="font-medium text-foreground">{when}</span>
          </p>
          <Button type="submit" className="mt-3">Publish ride</Button>
        </form>
      )}

      {publishedRide?.accepted_riders?.length > 0 && (
        <Card interactive className="p-4" onClick={() => setSelectedRide(formatRideForMap(publishedRide))}>
          <h2 className="border-b border-border pb-2 text-sm font-semibold text-foreground">Accepted riders</h2>
          <div className="mt-2 space-y-2">
            {publishedRide.accepted_riders.map((rider, idx) => (
              <div key={idx} className="relative rounded-xl border border-border bg-surface-2 p-3 text-xs">
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveRider(idx); }}
                  aria-label={`Remove ${rider.name}`}
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-danger text-white transition-colors hover:bg-danger-hover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <p className="text-foreground"><span className="text-subtle">Name</span> {rider.name}</p>
                <p className="text-foreground"><span className="text-subtle">Phone</span> {rider.mobile}</p>
                <p className="text-foreground"><span className="text-subtle">Seats</span> {rider.seats}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {rideRequests.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Ride requests</h3>
          <div className="space-y-2">
            {rideRequests.map((req) => (
              <Card key={req.id} className="p-3.5 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <p className="text-foreground"><span className="text-subtle">Rider</span> {req.users?.name}</p>
                  <p className="text-foreground"><span className="text-subtle">Seats</span> {req.seats_requested}</p>
                  {req.min_price && <p className="col-span-2 text-foreground"><span className="text-subtle">Max price</span> {formatCurrency(req.min_price)}</p>}
                  {req.notes && <p className="col-span-2 text-muted"><span className="text-subtle">Notes</span> {req.notes}</p>}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <Button size="sm" onClick={() => handleAccept(req)}>
                    <Check className="h-3.5 w-3.5" /> Accept
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleReject(req)}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
