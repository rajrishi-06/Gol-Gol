import { useState } from "react";
import { Search, MapPin, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { distanceKm } from "../lib/geo";
import { formatCurrency, formatTime } from "../lib/format";
import { DRIVER_VEHICLE_TYPES } from "../lib/vehicles";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Spinner from "./ui/Spinner";
import EmptyState from "./ui/EmptyState";
import Alert from "./ui/Alert";

const inputCls =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

export default function FindMatch({ fromCords, toCords, dateOfDeparture, setSelectedRide }) {
  const [form, setForm] = useState({ seatsRequested: 1, vehicleType: "", minPrice: "", notes: "", maxDistance: "" });
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchRides = async () => {
    if (!fromCords || !toCords || !dateOfDeparture) {
      setError("Route and date are required.");
      setTimeout(() => setError(null), 2500);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("published_rides")
        .select("*, drivers(vehicle_type, users(name, mobile))")
        .eq("status", "active")
        .gte("available_seats", form.seatsRequested)
        .order("departure_time", { ascending: true });

      if (new Date(dateOfDeparture) > new Date()) query = query.gte("departure_time", dateOfDeparture);
      if (form.minPrice && parseFloat(form.minPrice) > 0) query = query.lte("fare_per_seat", parseFloat(form.minPrice));

      const { data, error } = await query;
      if (error) throw error;

      let filtered = data || [];
      if (form.vehicleType) filtered = filtered.filter((r) => r.drivers?.vehicle_type === form.vehicleType);
      if (form.maxDistance && parseFloat(form.maxDistance) > 0) {
        filtered = filtered.filter((r) => {
          if (!r.from_lat || !r.from_lng) return true;
          return distanceKm(fromCords, { lat: r.from_lat, lng: r.from_lng }) <= parseFloat(form.maxDistance);
        });
      }
      setRides(filtered);
      setSubmitted(true);
    } catch (err) {
      setError("Failed to fetch rides: " + (err.message || String(err)));
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (ride, e) => {
    e.stopPropagation();
    try {
      const userId = localStorage.getItem("user_uuid");
      if (!userId) return setError("Sign in to send ride requests.");
      const { error } = await supabase.from("ride_requests").insert([
        {
          published_ride_id: ride.id,
          rider_id: userId,
          seats_requested: form.seatsRequested,
          status: "pending",
          pickup_lat: fromCords.lat,
          pickup_lng: fromCords.lng,
          drop_lat: toCords.lat,
          drop_lng: toCords.lng,
          min_price: form.minPrice || null,
          preferred_vehicle: form.vehicleType || null,
          notes: form.notes || null,
          max_distance: form.maxDistance || null,
        },
      ]);
      if (error) throw error;
      setError(null);
    } catch {
      setError("Failed to send request. Try again.");
    }
  };

  const formatRideForMap = (ride) => ({
    driver: {
      driver_start: { lat: ride.from_lat, lng: ride.from_lng },
      driver_end: { lat: ride.to_lat, lng: ride.to_lng },
    },
    riders: (ride.accepted_riders || []).map((r) => ({
      pickup: r.pickup ? { lat: r.pickup.lat, lng: r.pickup.lng } : null,
      drop: r.drop ? { lat: r.drop.lat, lng: r.drop.lng } : null,
      name: r.name || "Unknown",
    })),
  });

  return (
    <section className="relative mt-5 flex flex-1 flex-col">
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchRides();
        }}
        className="rounded-2xl border border-border bg-surface p-3.5 shadow-soft"
      >
        <h2 className="mb-2.5 text-sm font-semibold text-foreground">Find a shared ride</h2>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" min={1} value={form.seatsRequested} onChange={(e) => setForm((f) => ({ ...f, seatsRequested: parseInt(e.target.value, 10) || 1 }))} className={inputCls} placeholder="Seats" aria-label="Seats" />
          <input type="number" step="0.1" value={form.minPrice} onChange={set("minPrice")} className={inputCls} placeholder="Max ₹/seat" aria-label="Max price" />
          <select value={form.vehicleType} onChange={set("vehicleType")} className={inputCls} aria-label="Vehicle type">
            <option value="">Any vehicle</option>
            {DRIVER_VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input type="number" step="0.1" value={form.maxDistance} onChange={set("maxDistance")} className={inputCls} placeholder="Max distance (km)" aria-label="Max distance" />
          <input type="text" value={form.notes} onChange={set("notes")} className={inputCls} placeholder="Pickup notes" aria-label="Notes" />
        </div>
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
        {submitted && !loading && rides.length === 0 && (
          <EmptyState icon={Search} title="No matching rides" description="Try widening your distance or price filters." />
        )}
        {!loading && rides.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Available rides ({rides.length})</h3>
            <div className="space-y-2">
              {rides.map((ride) => (
                <Card key={ride.id} interactive className="p-3.5" onClick={() => setSelectedRide(formatRideForMap(ride))}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{ride.drivers?.users?.name || "Unknown driver"}</p>
                      <p className="text-xs text-muted">{ride.drivers?.vehicle_type} · {ride.drivers?.users?.mobile || "N/A"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{formatCurrency(ride.fare_per_seat)}/seat</p>
                      <p className="text-xs text-subtle">{ride.available_seats} seats left</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-muted">
                    <span className="truncate"><span className="text-subtle">From</span> {ride.from_address || "N/A"}</span>
                    <span className="truncate"><span className="text-subtle">To</span> {ride.to_address || "N/A"}</span>
                    <span><span className="text-subtle">Dist</span> {ride.distance_km} km</span>
                    <span><span className="text-subtle">Departs</span> {formatTime(ride.departure_time)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={(e) => handleSendRequest(ride, e)}>
                      <Send className="h-3.5 w-3.5" /> Request
                    </Button>
                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelectedRide(formatRideForMap(ride)); }}>
                      <MapPin className="h-3.5 w-3.5" /> View on map
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
