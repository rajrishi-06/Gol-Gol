// src/components/FindMatch.jsx
import { useEffect, useState } from "react";
import { supabase } from "../server/supabase";

// Helper: Calculates distance between two coordinates (Haversine formula)
const calculateDistance = (coords1, coords2) => {
  if (!coords1 || !coords2) return 0;
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(coords2.lat - coords1.lat);
  const dLon = toRad(coords2.lng - coords1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1.lat)) *
      Math.cos(toRad(coords2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

const FindMatch = ({ fromCords, toCords, dateOfDeparture, setSelectedRide }) => {
  const [form, setForm] = useState({
    seatsRequested: 1,
    vehicleType: "",
    minPrice: "",
    notes: "",
    maxDistance: "",
  });
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // helpers
  const Card = ({ children, onClick, className = "" }) => (
    <div 
      className={`bg-white border rounded-lg shadow-sm p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );

  const PrimaryButton = ({
    children,
    onClick,
    disabled = false,
    type = "button",
    className = "",
  }) => (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 rounded-md text-white ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      {children}
    </button>
  );

  const LoadingSpinner = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70 z-10 rounded-lg">
      <div className="flex flex-col items-center">
        <svg
          className="animate-spin h-10 w-10 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          ></path>
        </svg>
        <p className="text-blue-600 mt-3 text-sm">Loading…</p>
      </div>
    </div>
  );

  // fetch rides
  const fetchRides = async () => {
    if (!fromCords || !toCords || !dateOfDeparture) {
      setError("Route and date are required.");
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("published_rides")
        .select(
          `
            *,
            drivers(
              vehicle_type,
              users(name, mobile)
            )
          `
        )
        .eq("status", "active")
        .gte("available_seats", form.seatsRequested) // Available seats must be >= requested seats
        .order("departure_time", { ascending: true });

      // Only filter by departure time if it's a future date
      const requestedDate = new Date(dateOfDeparture);
      const now = new Date();
      if (requestedDate > now) {
        query = query.gte("departure_time", dateOfDeparture);
      }

      // Filter by minimum price only if specified (rider's willingness to pay)
      if (form.minPrice && parseFloat(form.minPrice) > 0) {
        query = query.lte("fare_per_seat", parseFloat(form.minPrice)); // Fare should be <= what rider is willing to pay
      }

      const { data, error } = await query;
      if (error) throw error;

      let filteredRides = data || [];
      
      // Debug logging
      console.log("Initial query results:", filteredRides.length);
      console.log("Search criteria:", {
        seatsRequested: form.seatsRequested,
        vehicleType: form.vehicleType,
        minPrice: form.minPrice,
        maxDistance: form.maxDistance,
        dateOfDeparture
      });

      // Client-side filtering for vehicle type (since it's in the drivers table)
      if (form.vehicleType) {
        const beforeVehicleFilter = filteredRides.length;
        filteredRides = filteredRides.filter(ride => 
          ride.drivers?.vehicle_type === form.vehicleType
        );
        console.log(`Vehicle filter: ${beforeVehicleFilter} -> ${filteredRides.length}`);
      }

      // Optional: Filter by proximity if maxDistance is specified
      if (form.maxDistance && parseFloat(form.maxDistance) > 0) {
        const beforeDistanceFilter = filteredRides.length;
        filteredRides = filteredRides.filter(ride => {
          if (!ride.from_lat || !ride.from_lng) return true;
          
          const distance = calculateDistance(
            fromCords,
            { lat: ride.from_lat, lng: ride.from_lng }
          );
          console.log(`Ride ${ride.id}: distance = ${distance.toFixed(2)}km, max allowed = ${form.maxDistance}km`);
          return distance <= parseFloat(form.maxDistance);
        });
        console.log(`Distance filter: ${beforeDistanceFilter} -> ${filteredRides.length}`);
      }

      console.log("Final filtered results:", filteredRides.length);
      setRides(filteredRides);
      setSubmitted(true);
    } catch (err) {
      console.error("fetchRides error:", err);
      setError("Failed to fetch rides: " + (err.message || String(err)));
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  // send request
  const handleSendRequest = async (ride, e) => {
    e.stopPropagation(); // Prevent triggering card onClick
    try {
      const userId = localStorage.getItem("user_uuid");
      if (!userId) {
        alert("You need to be logged in to send requests.");
        return;
      }

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
      alert("Ride request sent!");
    } catch (err) {
      console.error("Error sending request:", err);
      alert("Failed to send request. Try again.");
    }
  };

  // Format ride data for map display according to the structure shown in the image
  const formatRideForMap = (ride) => {
    return {
      driver: {
        driver_start: {
          lat: ride.from_lat,
          lng: ride.from_lng,
        },
        driver_end: {
          lat: ride.to_lat,
          lng: ride.to_lng,
        },
      },
      riders: (ride.accepted_riders || []).map((rider) => ({
        pickup: rider.pickup ? { lat: rider.pickup.lat, lng: rider.pickup.lng } : null,
        drop: rider.drop ? { lat: rider.drop.lat, lng: rider.drop.lng } : null,
        name: rider.name || "Unknown",
        seats: rider.seats || 0,
        phone: rider.mobile || "N/A",
      })),
    };
  };

  return (
    <div className="p-4 relative flex flex-col h-full">
      {loading && <LoadingSpinner />}
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

      {/* Compact Search Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchRides();
        }}
        className="bg-white shadow-sm rounded-lg p-3 mb-4 flex-shrink-0"
      >
        <h2 className="text-base font-semibold mb-2">Find a Ride</h2>

        {/* First row: Essential fields */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="relative">
            <input
              type="number"
              min={1}
              value={form.seatsRequested}
              onChange={(e) =>
                setForm({ ...form, seatsRequested: parseInt(e.target.value, 10) })
              }
              className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Seats"
            />
          </div>

          <div className="relative">
            <input
              type="number"
              step="0.1"
              value={form.minPrice}
              onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Min Price (₹)"
            />
          </div>

          <div className="relative">
            <select
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any Vehicle</option>
              <option value="car">Car</option>
              <option value="bike">Bike</option>
              <option value="auto">Auto</option>
              <option value="van">Van</option>
              <option value="truck">Truck</option>
            </select>
          </div>
        </div>

        {/* Second row: Optional fields */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            type="number"
            step="0.1"
            value={form.maxDistance}
            onChange={(e) => setForm({ ...form, maxDistance: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Max Distance (km)"
          />
          
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Pickup notes"
          />
        </div>

        <PrimaryButton type="submit" className="bg-blue-600 text-xs py-1.5 px-3">
          Search Rides
        </PrimaryButton>
      </form>

      {/* Matched Rides with Scrollable Container */}
      <div className="flex-1 overflow-hidden">
        {submitted && !loading && rides.length === 0 && (
          <p className="text-sm text-gray-500">No rides found matching your criteria.</p>
        )}

        {rides.length > 0 && (
          <div className="h-full overflow-y-auto pr-1">
            <h3 className="text-sm font-semibold mb-2 sticky top-0 bg-white py-1">
              Available Rides ({rides.length})
            </h3>
            
            <div className="space-y-2">
              {rides.map((ride) => (
                <Card 
                  key={ride.id} 
                  onClick={() => setSelectedRide(formatRideForMap(ride))}
                  className="hover:border-blue-300"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">
                        {ride.drivers?.users?.name || "Unknown Driver"}
                      </h4>
                      <p className="text-xs text-gray-600">
                        {ride.drivers?.vehicle_type} • {ride.drivers?.users?.mobile || "N/A"}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-green-600">
                        ₹{ride.fare_per_seat}/seat
                      </div>
                      <div className="text-xs text-gray-500">
                        {ride.available_seats} seats left
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                    <div><strong>From:</strong> {ride.from_address || "N/A"}</div>
                    <div><strong>To:</strong> {ride.to_address || "N/A"}</div>
                    <div><strong>Distance:</strong> {ride.distance_km} km</div>
                    <div><strong>Departure:</strong> {new Date(ride.departure_time).toLocaleTimeString()}</div>
                  </div>

                  {ride.notes && (
                    <div className="text-xs text-gray-600 mb-2">
                      <strong>Notes:</strong> {ride.notes}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleSendRequest(ride, e)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs transition-colors"
                    >
                      🚗 Send Request
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRide(formatRideForMap(ride));
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs transition-colors"
                    >
                      📍 View on Map
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FindMatch;