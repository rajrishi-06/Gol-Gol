import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../server/supabase'; // Adjust the import path as needed
import { useNavigate } from 'react-router-dom';
import { FaMapMarkerAlt, FaRupeeSign, FaRoute, FaSignOutAlt } from 'react-icons/fa';
import RightPanel from '../RightPanel'; // Assuming this is your map component

// --- Helper: Calculates distance between two coordinates ---
const calculateDistance = (coords1, coords2) => {
    if (!coords1 || !coords2) return 0;
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

// --- Ride Request Card Component ---
const RideRequestCard = ({ ride, onAccept, isAccepting }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg text-gray-800">New Ride Request</h3>
            <span className="text-xl font-bold text-green-600 flex items-center">
                <FaRupeeSign className="text-lg" />{ride.fare}
            </span>
        </div>
        <div className="text-gray-600 space-y-2">
            <p className="flex items-center"><FaMapMarkerAlt className="mr-2 text-red-500" /> <strong>From:</strong> {ride.from_lat.toFixed(4)}, {ride.from_lng.toFixed(4)}</p>
            <p className="flex items-center"><FaMapMarkerAlt className="mr-2 text-blue-500" /> <strong>To:</strong> {ride.to_lat.toFixed(4)}, {ride.to_lng.toFixed(4)}</p>
            <p className="flex items-center"><FaRoute className="mr-2 text-gray-500" /> <strong>Distance:</strong> {ride.distance_km.toFixed(1)} km</p>
        </div>
        <button
            onClick={() => onAccept(ride.id)}
            disabled={isAccepting}
            className="w-full mt-4 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
            {isAccepting ? (
                <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Accepting...
                </>
            ) : 'Accept Ride'}
        </button>
    </div>
);


export default function DriverDashboard() {
    const navigate = useNavigate();
    const [driverDetails, setDriverDetails] = useState(null);
    const [driverLocation, setDriverLocation] = useState(null);
    const [availableRides, setAvailableRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [acceptingRideId, setAcceptingRideId] = useState(null);

    const handleLogout = useCallback(async () => {
        const driverId = localStorage.getItem('user_uuid');
        if (driverId) {
            await supabase.from('active_drivers').delete().eq('user_id', driverId);
        }
        await supabase.auth.signOut();
        localStorage.removeItem('user_uuid');
        navigate('/');
    }, [navigate]);

    // --- Primary setup effect ---
    useEffect(() => {
        const driverId = localStorage.getItem('user_uuid');
        if (!driverId) {
            console.error("DriverDashboard: user_uuid not found in localStorage.");
            navigate('/login');
            return;
        }

        let isMounted = true;
        let locationWatcher = null;

        const setupDriver = async () => {
            // 1. Fetch driver's vehicle type
            const { data: driverData, error: driverError } = await supabase
                .from('drivers')
                .select('vehicle_type')
                .eq('user_id', driverId)
                .single();

            if (driverError || !driverData) {
                console.error("Critical Error: Could not fetch driver details.", driverError);
                alert("There was a problem loading your driver profile. Please log in again.");
                if (isMounted) handleLogout();
                return;
            }

            if (!isMounted) return;
            setDriverDetails(driverData);

            // 2. Start watching location
            locationWatcher = navigator.geolocation.watchPosition(
                async (position) => {
                    if (!isMounted) return;
                    const { latitude, longitude } = position.coords;
                    const newLocation = { lat: latitude, lng: longitude };
                    setDriverLocation(newLocation);

                    // 3. Update location in DB
                    await supabase
                        .from('active_drivers')
                        .update({ current_lat: latitude, current_lng: longitude, last_active_at: new Date().toISOString() })
                        .eq('user_id', driverId);
                    
                    // 4. Fetch initial rides (only the first time)
                    if (loading) {
                        fetchInitialRides(newLocation, driverData.vehicle_type);
                    }
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    alert("Please enable location services to use the dashboard.");
                    if (isMounted) setLoading(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        };

        setupDriver();

        // Cleanup function
        return () => {
            isMounted = false;
            if (locationWatcher) {
                navigator.geolocation.clearWatch(locationWatcher);
            }
        };
    }, [navigate, handleLogout, loading]); // Dependencies are stable

    // --- Fetch initial pending rides that match driver's vehicle type ---
    const fetchInitialRides = useCallback(async (location, vehicleType) => {
        if (!location || !vehicleType) return;

        const { data: pendingRides, error } = await supabase
            .from('rides')
            .select('*')
            .eq('status', 'pending')
            .eq('vehicle_type', vehicleType);

        if (error) {
            console.error("Error fetching initial rides:", error);
        } else {
            const nearbyRides = pendingRides.filter(ride => {
                const distance = calculateDistance(
                    { lat: location, lng: location.lng },
                    { lat: ride.from_lat, lng: ride.from_lng }
                );
                return distance <= 5; // 5 km radius
            });
            setAvailableRides(nearbyRides);
        }
        setLoading(false);
    }, []);

    // --- Subscribe to new ride requests in real-time ---
    useEffect(() => {
        if (!driverLocation || !driverDetails) return;

        const ridesChannel = supabase
            .channel('public:rides')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'rides' },
                (payload) => {
                    const newRide = payload.new;
                    const oldRide = payload.old;
                    
                    if (payload.eventType === 'INSERT' && newRide.status === 'pending' && newRide.vehicle_type === driverDetails.vehicle_type) {
                        const distance = calculateDistance(driverLocation, { lat: newRide.from_lat, lng: newRide.from_lng });
                        if (distance <= 5) {
                            setAvailableRides(prevRides => [newRide, ...prevRides.filter(r => r.id !== newRide.id)]);
                        }
                    }

                    if (payload.eventType === 'UPDATE' && oldRide?.status === 'pending') {
                        setAvailableRides(prevRides => prevRides.filter(ride => ride.id !== newRide.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(ridesChannel);
        };
    }, [driverLocation, driverDetails]);


    // --- Handle Accepting a Ride ---
    const handleAcceptRide = async (rideId) => {
        setAcceptingRideId(rideId);
        const driverId = localStorage.getItem('user_uuid');
        
        const { data: updatedRide, error } = await supabase
            .from('rides')
            .update({ status: 'accepted', driver_id: driverId })
            .eq('id', rideId)
            .eq('status', 'pending')
            .select()
            .single();
        
        if (error || !updatedRide) {
            alert("Could not accept ride. It may have been taken by another driver or cancelled.");
            setAvailableRides(prev => prev.filter(r => r.id !== rideId));
        } else {
            await supabase
                .from('active_drivers')
                .update({ on_ride: true, current_ride_id: rideId })
                .eq('user_id', driverId);
            navigate(`/driver/ride/${rideId}`);
        }
        setAcceptingRideId(null);
    };

    return (
        <div className="flex flex-col sm:flex-row h-screen">
            <div className="w-full sm:w-[550px] h-screen p-6 bg-gray-50 overflow-y-auto border-r border-gray-200 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">Driver Dashboard</h1>
                    <button onClick={handleLogout} className="flex items-center text-sm text-red-600 hover:text-red-800">
                        <FaSignOutAlt className="mr-1" /> Logout
                    </button>
                </div>

                <h2 className="text-lg font-semibold text-gray-700 mb-3">Nearby Ride Requests</h2>
                
                {loading && <p className="text-center text-gray-500 mt-10">Finding rides for your {driverDetails?.vehicle_type || 'vehicle'}...</p>}

                {!loading && availableRides.length === 0 && (
                    <div className="text-center text-gray-500 mt-10">
                        <p>No ride requests nearby for your vehicle type.</p>
                        <p className="text-sm">You will be notified when a new ride becomes available.</p>
                    </div>
                )}

                <div className="flex-grow">
                    {availableRides.map(ride => (
                        <RideRequestCard 
                            key={ride.id} 
                            ride={ride} 
                            onAccept={handleAcceptRide} 
                            isAccepting={acceptingRideId === ride.id}
                        />
                    ))}
                </div>
            </div>
            <RightPanel driverLocation={driverLocation} />
        </div>
    );
}