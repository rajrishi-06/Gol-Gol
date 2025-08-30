// src/components/PublishRide.jsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../server/supabase";

// --- Helper: Calculates distance between two coordinates ---
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

export default function PublishRide({
  fromCords,
  toCords,
  fromValue,
  toValue,
  when,
  dateOfDeparture,
	setSelectedRide
}) {
  const user = localStorage.getItem("user_uuid");
  const [publishedRide, setPublishedRide] = useState(null);
  const [rideRequests, setRideRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    availableSeats: 1,
    distanceKm: "",
    farePerSeat: "",
    notes: "",
  });

  // auto compute distance when from/to cords change
  useEffect(() => {
    if (fromCords && toCords) {
      const dist = calculateDistance(fromCords, toCords);
      setForm((prev) => ({
        ...prev,
        distanceKm: dist.toFixed(1), // round to 1 decimal place
      }));
    }
  }, [fromCords, toCords]);

  // fetch driver's active published ride
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
    } catch (err) {
      console.error("fetchPublishedRide:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  // fetch ride requests (with user info)
  const fetchRequests = useCallback(async (rideId) => {
    if (!rideId) return;
    try {
      const { data, error } = await supabase
				.from("ride_requests")
				.select("*, users(id, name, mobile)")
				.eq("published_ride_id", rideId)
				.eq("status", "pending") // ✅ only fetch pending requests
				.order("created_at", { ascending: true });
      if (error) throw error;
      setRideRequests(data || []);
    } catch (err) {
      console.error("fetchRequests:", err);
      setRideRequests([]);
    }
  }, []);

  useEffect(() => {
    if (!publishedRide?.id) return;

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [publishedRide?.id, fetchRequests]);

  useEffect(() => {
    if (user) fetchPublishedRide();
  }, [user, fetchPublishedRide]);


  // publish ride
  async function handlePublishRide(e) {
    e?.preventDefault();
    setError(null);

    if (!fromCords || !toCords) {
      setError("Missing route info");
      return;
    }
    if (!form.availableSeats || Number(form.availableSeats) < 1) {
      setError("Available seats must be >= 1");
      return;
    }
    if (!dateOfDeparture) {
      setError("Missing dateOfDeparture time");
      return;
    }

    setLoading(true);
    try {
      if (publishedRide) {
        setError("You already have an active published ride.");
        setLoading(false);
        return;
      }

      const payload = {
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
      };

      const { data, error } = await supabase
        .from("published_rides")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      setPublishedRide(data);
      setRideRequests([]);
    } catch (err) {
      console.error("handlePublishRide error:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function closeRide(mode = "completed") {
    if (!publishedRide) return;
    setLoading(true);
    try {
      await supabase
        .from("published_rides")
        .update({ status: mode, updated_at: new Date().toISOString() })
        .eq("id", publishedRide.id);

      setPublishedRide(null);
      setRideRequests([]);
    } catch (err) {
      console.error("closeRide error:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  // UI helpers
  const Card = ({ children, className = "", ...rest }) => (
		<div
			className={`bg-white border rounded-lg shadow-sm p-3 mb-3 ${className}`}
			{...rest}
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
    async function handleAccept(req) {
  try {
    // 1. Update request status
    await supabase
      .from("ride_requests")
      .update({ status: "accepted" })
      .eq("id", req.id);

    // 2. Fetch current accepted_riders
    const { data: ride, error: rideError } = await supabase
      .from("published_rides")
      .select("accepted_riders, available_seats")
      .eq("id", req.published_ride_id)
      .single();

    if (rideError) throw rideError;

    const current = ride.accepted_riders || [];

    // 3. Build rider object (include user details)
    const riderDetails = {
      user_id: req.rider_id,
      name: req.users?.name,
      mobile: req.users?.mobile,
      seats: req.seats_requested,
      pickup: { lat: req.pickup_lat, lng: req.pickup_lng },
      drop: { lat: req.drop_lat, lng: req.drop_lng },
    };

    const updated = [...current, riderDetails];

    const newSeats = ride.available_seats - req.seats_requested;

    // 4. Update published_rides
    const { error: updateError } = await supabase
      .from("published_rides")
      .update({
        accepted_riders: updated,
        available_seats: newSeats >= 0 ? newSeats : 0,
      })
      .eq("id", req.published_ride_id);

    if (updateError) throw updateError;

    // refresh UI
    fetchRequests(req.published_ride_id);
    fetchPublishedRide();
  } catch (err) {
    console.error("handleAccept error:", err);
  }
}
    async function handleReject(req) {
        try {
            await supabase
            .from("ride_requests")
            .update({ status: "rejected" })
            .eq("id", req.id);

            fetchRequests(req.published_ride_id);
        } catch (err) {
            console.error("handleReject error:", err);
            setError(err.message || String(err));
        }
    }

    // NEW: Handle removing an accepted rider
    async function handleRemoveRider(riderIndex) {
      if (!publishedRide) return;
      
      try {
        setLoading(true);
        
        const currentRiders = publishedRide.accepted_riders || [];
        const riderToRemove = currentRiders[riderIndex];
        
        if (!riderToRemove) {
          setError("Rider not found");
          return;
        }
        
        // Remove rider from array
        const updatedRiders = currentRiders.filter((_, index) => index !== riderIndex);
        
        // Calculate new available seats (add back the removed rider's seats)
        const newAvailableSeats = publishedRide.available_seats + riderToRemove.seats;
        
        // Update the database
        const { error: updateError } = await supabase
          .from("published_rides")
          .update({
            accepted_riders: updatedRiders,
            available_seats: newAvailableSeats,
            updated_at: new Date().toISOString()
          })
          .eq("id", publishedRide.id);
        
        if (updateError) throw updateError;
        
        // Update the ride request status back to 'pending' if we want to allow re-requesting
        // Optional: You might want to set it to 'removed' instead
        await supabase
          .from("ride_requests")
          .update({ status: "removed" })
          .eq("published_ride_id", publishedRide.id)
          .eq("rider_id", riderToRemove.user_id);
        
        // Refresh the UI
        await fetchPublishedRide();
        
      } catch (err) {
        console.error("handleRemoveRider error:", err);
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    }

		function formatRideForMap(publishedRide) {
			if (!publishedRide) return null;

			return {
				driver: {
					driver_start: {
						lat: publishedRide.from_lat,
						lng: publishedRide.from_lng,
					},
					driver_end: {
						lat: publishedRide.to_lat,
						lng: publishedRide.to_lng,
					},
				},
				riders: (publishedRide.accepted_riders || []).map((r) => ({
					pickup: r.pickup ? { lat: r.pickup.lat, lng: r.pickup.lng } : null,
					drop: r.drop ? { lat: r.drop.lat, lng: r.drop.lng } : null,
					// you can preserve metadata if needed
					name: r.name,
					seats: r.seats_requested,
					phone: r.mobile,
				})),
			};
		}

  
  return (
    <div className="p-4 relative">
      {loading && <LoadingSpinner />}
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

      {publishedRide ? (
				<Card>
					<h2 className="text-base font-semibold mb-2 border-b pb-1">
						Your Published Ride
					</h2>
					<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><strong>From:</strong> {publishedRide.from_address}</div>
						<div><strong>To:</strong> {publishedRide.to_address}</div>
						<div><strong>Seats Left:</strong> {publishedRide.available_seats}</div>
						<div><strong>Distance:</strong> {publishedRide.distance_km} km</div>
						<div><strong>Fare/Seat:</strong> ₹{publishedRide.fare_per_seat}</div>
						<div>
							<strong>Departure:</strong>{" "}
							{new Date(publishedRide.departure_time).toLocaleString()}
						</div>
						<div><strong>Status:</strong> {publishedRide.status}</div>
					</div>

					<div className="mt-3 flex gap-2">
						<PrimaryButton
							onClick={() => closeRide("completed")}
							className="bg-green-600 text-sm"
						>
							Mark Completed
						</PrimaryButton>
						<PrimaryButton
							onClick={() => closeRide("cancelled")}
							className="bg-red-600 text-sm"
						>
							Cancel Ride
						</PrimaryButton>
					</div>
				</Card>
			) : (
        <form
            onSubmit={handlePublishRide}
            className="bg-white shadow-sm rounded-lg p-4"
            >
            <h2 className="text-lg font-semibold mb-3">Publish a Ride</h2>

            {/* Available Seats */}
            <div className="relative w-full mb-4">
                <input
                className="peer w-full border rounded px-3 pt-5 pb-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="number"
                min={1}
                id="availableSeats"
                placeholder=" "
                value={form.availableSeats}
                onChange={(e) =>
                    setForm({
                    ...form,
                    availableSeats: parseInt(e.target.value, 10) || 1,
                    })
                }
                />
                <label
                htmlFor="availableSeats"
                className="absolute left-3 top-2 text-gray-500 text-xs transition-all 
                            peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm 
                            peer-placeholder-shown:text-gray-400 peer-focus:top-2 
                            peer-focus:text-xs peer-focus:text-blue-500"
                >
                Available Seats
                </label>
            </div>

            {/* Distance & Fare */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="relative">
                <input
                    className="peer w-full border rounded px-3 pt-5 pb-2 text-sm bg-gray-100 cursor-not-allowed"
                    type="text"
                    id="distanceKm"
                    placeholder=" "
                    value={form.distanceKm}
                    readOnly
                />
                <label
                    htmlFor="distanceKm"
                    className="absolute left-3 top-2 text-gray-500 text-xs transition-all 
                            peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm 
                            peer-placeholder-shown:text-gray-400 peer-focus:top-2 
                            peer-focus:text-xs peer-focus:text-blue-500"
                >
                    Distance (km)
                </label>
                </div>

                <div className="relative">
                <input
                    className="peer w-full border rounded px-3 pt-5 pb-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="number"
                    step="0.1"
                    id="farePerSeat"
                    placeholder=" "
                    value={form.farePerSeat}
                    onChange={(e) =>
                    setForm({ ...form, farePerSeat: e.target.value })
                    }
                />
                <label
                    htmlFor="farePerSeat"
                    className="absolute left-3 top-2 text-gray-500 text-xs transition-all 
                            peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm 
                            peer-placeholder-shown:text-gray-400 peer-focus:top-2 
                            peer-focus:text-xs peer-focus:text-blue-500"
                >
                    Fare per Seat
                </label>
                </div>
            </div>

            {/* Notes (unchanged) */}
            <textarea
                className="w-full border p-2 rounded mb-2"
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <p className="text-sm text-gray-500 mb-3">
                Departure: <strong>{when}</strong> — {dateOfDeparture}
            </p>

            <div className="flex gap-2">
                <PrimaryButton type="submit" className="bg-blue-600">
                Publish Ride
                </PrimaryButton>
            </div>
        </form>
      )}
			{publishedRide?.accepted_riders?.length > 0 && (
				<Card className="mt-4 cursor-pointer" onClick={() => setSelectedRide(formatRideForMap(publishedRide))}>
					<h2 className="text-base font-semibold mb-2 border-b pb-1">
						Accepted Riders
					</h2>
					<div className="space-y-2">
						{publishedRide.accepted_riders.map((rider, idx) => (
							<div key={idx} className="border rounded p-2 text-xs bg-gray-50 relative">
								{/* Cross button to remove rider */}
								<button
									onClick={(e) => {
										e.stopPropagation(); // Prevent triggering the card's onClick
										handleRemoveRider(idx);
									}}
									className="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs leading-none transition-colors"
									title="Remove rider"
								>
									×
								</button>
								
								<div><strong>Name:</strong> {rider.name}</div>
								<div><strong>Phone:</strong> {rider.mobile}</div>
								<div>
									<strong>Pickup:</strong> {rider.pickup?.lat.toFixed(4)},{" "}
									{rider.pickup?.lng.toFixed(4)}
								</div>
								<div>
									<strong>Drop:</strong> {rider.drop?.lat.toFixed(4)},{" "}
									{rider.drop?.lng.toFixed(4)}
								</div>
								<div><strong>Seats:</strong> {rider.seats}</div>
							</div>
						))}
					</div>
				</Card>
			)}
      {rideRequests.length > 0 && (
				<div className="mt-4">
					<h3 className="font-semibold mb-2">Ride Requests</h3>
					{rideRequests.map((req) => (
						<div
							key={req.id}
							className="border rounded p-3 mb-2 text-xs bg-gray-50"
						>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1">
								<div>
									<strong>Rider:</strong> {req.users?.name} ({req.users?.mobile})
								</div>
								<div>
									<strong>Seats:</strong> {req.seats_requested}
								</div>
								{req.pickup_lat && req.pickup_lng && (
									<div className="col-span-2">
										<strong>Pickup:</strong>{" "}
										{req.pickup_lat.toFixed(4)}, {req.pickup_lng.toFixed(4)}
									</div>
								)}
								{req.drop_lat && req.drop_lng && (
									<div className="col-span-2">
										<strong>Drop:</strong>{" "}
										{req.drop_lat.toFixed(4)}, {req.drop_lng.toFixed(4)}
									</div>
								)}
								{req.min_price && (
									<div className="col-span-2">
										<strong>Min Price:</strong> ₹{req.min_price}
									</div>
								)}
								{req.notes && (
									<div className="col-span-2">
										<strong>Notes:</strong> {req.notes}
									</div>
								)}
							</div>

							{req.status === "pending" && (
								<div className="flex gap-2 mt-2">
									<button
										className="bg-green-600 text-white px-3 py-1 rounded text-xs"
										onClick={() => handleAccept(req)}
									>
										Accept
									</button>
									<button
										className="bg-red-600 text-white px-3 py-1 rounded text-xs"
										onClick={() => handleReject(req)}
									>
										Reject
									</button>
								</div>
							)}
						</div>
					))}
				</div>
			)}
    </div>
  );
}