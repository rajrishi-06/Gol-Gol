import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaRoute, FaRupeeSign, FaGasPump } from 'react-icons/fa';
import { supabase } from '../server/supabase'; // Adjust the import path as needed

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

// --- Helper: Mapbox Reverse Geocoding ---
const getAddressFromCoordinates = async (lng, lat) => {
    const accessToken = import.meta.env.VITE_MAPBOX_GL_API;
    if (!accessToken) {
        console.error("Mapbox access token is missing.");
        return "Address not available";
    }
    try {
        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${accessToken}&types=address,place`);
        if (!response.ok) throw new Error('Failed to fetch address from Mapbox API.');
        
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return "Address not found.";
    } catch (error) {
        console.error("Error fetching address:", error);
        return "Could not retrieve address.";
    }
};

// --- Configuration for different vehicle types ---
const vehicleDetails = {
  auto: { name: 'Auto', icon: '🚗', baseFare: 25, perKmRate: 12, mileage: '25 km/l' },
  mini: { name: 'Mini', icon: '🚘', baseFare: 40, perKmRate: 15, mileage: '20 km/l' },
  bike: { name: 'Bike', icon: '🏍️', baseFare: 15, perKmRate: 8, mileage: '45 km/l' },
  sedan: { name: 'Prime Sedan', icon: '🚖', baseFare: 60, perKmRate: 18, mileage: '15 km/l' },
  suv: { name: 'Prime SUV', icon: '🚙', baseFare: 80, perKmRate: 22, mileage: '12 km/l' },
};

// --- Loading Spinner Component ---
const BookingLoader = ({ message, children }) => (
  <div className="flex flex-col items-center justify-center h-full text-center">
    <div>
      <svg className="animate-spin h-10 w-10 text-green-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="mt-4 text-gray-600 font-semibold">{message}</p>
    </div>
    <div className="mt-8 w-full max-w-xs">
        {children}
    </div>
  </div>
);


export default function Leftside() {
  const location = useLocation();
  const navigate = useNavigate();

  const { fromCords, toCords, selectedRide } = location.state || {};

  const [distance, setDistance] = useState(0);
  const [fare, setFare] = useState(null);
  const [fromAddress, setFromAddress] = useState('Loading address...');
  const [toAddress, setToAddress] = useState('Loading address...');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("Contacting nearby drivers...");
  const [rideRequestId, setRideRequestId] = useState(null);

  useEffect(() => {
    if (fromCords && toCords && selectedRide) {
      // Calculate distance and fare
      const tripDistance = calculateDistance(fromCords, toCords);
      setDistance(tripDistance);
      const vehicle = vehicleDetails[selectedRide.vehicle_type];
      if (vehicle) {
        const distanceCharge = tripDistance * vehicle.perKmRate;
        const totalFare = vehicle.baseFare + distanceCharge;
        setFare({ base: vehicle.baseFare, perKm: vehicle.perKmRate, total: Math.ceil(totalFare) });
      }
      // Fetch addresses
      const fetchAddresses = async () => {
          setFromAddress(await getAddressFromCoordinates(fromCords.lng, fromCords.lat));
          setToAddress(await getAddressFromCoordinates(toCords.lng, toCords.lat));
      };
      fetchAddresses();
    }
  }, [fromCords, toCords, selectedRide]);

  // Real-time listener for ride status
  useEffect(() => {
    if (!rideRequestId) return;
    const channel = supabase
      .channel(`public:rides:id=eq.${rideRequestId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideRequestId}` }, (payload) => {
        const updatedRide = payload.new;
        if (updatedRide.status === 'accepted') {
          setBookingMessage("Driver found! Preparing your ride...");
          supabase.removeChannel(channel);
          setTimeout(() => { navigate(`/rider/ride/${updatedRide.id}`); }, 3000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rideRequestId, navigate]);

  const handleConfirmBooking = async () => {
    setIsBooking(true);
    // ... (rest of the booking logic is unchanged)
    const user_uuid = localStorage.getItem('user_uuid');

    if (!user_uuid) {
        setBookingMessage("You must be logged in to book a ride.");
        setTimeout(() => { setIsBooking(false); navigate('/login'); }, 3000);
        return;
    }

    // Generate a random 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    setBookingMessage("Sending your ride request...");
    const { data: rideData, error } = await supabase
      .from('rides')
      .insert({
        rider_id: user_uuid,
        from_lat: fromCords.lat,
        from_lng: fromCords.lng,
        vehicle_type: selectedRide.vehicle_type,
        to_lat: toCords.lat,
        to_lng: toCords.lng,
        from_address: fromAddress,
        to_address: toAddress,
        distance_km: distance,
        fare: fare.total,
        status: 'pending',
        start_otp: otp
      })
      .select()
      .single();

    if (error) {
        console.error("Error creating ride:", error);
        setBookingMessage("Could not create your ride. Please try again.");
        setTimeout(() => setIsBooking(false), 3000);
        return;
    }
    
    setRideRequestId(rideData.id);
    setBookingMessage("Request sent! Waiting for a driver to accept...");
  };

  const handleCancelBooking = async () => {
    if (!rideRequestId) return;
    // ... (rest of the cancel logic is unchanged)
    const channel = supabase.channel(`public:rides:id=eq.${rideRequestId}`);
    supabase.removeChannel(channel);
    await supabase.from('rides').delete().match({ id: rideRequestId });
    setIsBooking(false);
    setRideRequestId(null);
    setBookingMessage("Contacting nearby drivers...");
  };

  const handleCancel = () => { navigate(-1); };

  if (!selectedRide || !fare) {
    return (
      <div className="w-full sm:w-[550px] h-screen p-4 bg-white overflow-auto border-r border-gray-200">
        <BookingLoader message="Calculating trip details..." />
      </div>
    );
  }
  
  if (isBooking) {
      return (
        <div className="w-full sm:w-[550px] h-screen p-4 bg-white overflow-auto border-r border-gray-200">
            <BookingLoader message={bookingMessage}>
                {rideRequestId && (
                    <button onClick={handleCancelBooking} className="w-full bg-red-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-red-700 transition-colors shadow-lg">
                        Cancel Ride Request
                    </button>
                )}
            </BookingLoader>
        </div>
      )
  }

  const vehicle = vehicleDetails[selectedRide.vehicle_type];

  return (
    // MODIFIED: Reduced main padding from p-6/p-8 to p-4/p-6
    <div className="w-full sm:w-[550px] h-screen p-4 sm:p-6 bg-gray-50 overflow-y-auto border-r border-gray-200">
      <div className="flex flex-col h-full">
        {/* MODIFIED: Reduced margin-bottom from mb-6 to mb-4 */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-1">{vehicle.icon}</div>
          {/* MODIFIED: Reduced font size from text-2xl to text-xl */}
          <h1 className="text-xl font-bold text-gray-800">{vehicle.name}</h1>
          <p className="text-sm text-gray-500">{selectedRide.desc}</p>
        </div>

        {/* MODIFIED: Reduced padding, margins, and font sizes */}
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Your Trip</h2>
            <div className="space-y-3 text-sm">
                <div className="flex items-start">
                    <div className="mt-1 mr-3 text-green-500">●</div>
                    <div>
                        <p className="text-xs text-gray-500 font-semibold">FROM</p>
                        <p className="text-gray-800">{fromAddress}</p>
                    </div>
                </div>
                <div className="flex items-start">
                    <div className="mt-1 mr-3 text-red-500">●</div>
                    <div>
                        <p className="text-xs text-gray-500 font-semibold">TO</p>
                        <p className="text-gray-800">{toAddress}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* MODIFIED: Reduced padding, margins, and font sizes */}
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Fare Breakdown</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between items-center">
              <span>Base Fare</span>
              <span className="font-medium text-gray-800">₹{fare.base.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Distance Charge ({`₹${fare.perKm}/km`})</span>
              <span className="font-medium text-gray-800">₹{(distance * fare.perKm).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-500">
              <span className="flex items-center"><FaRoute className="mr-2" /> Total Distance</span>
              <span className="font-medium">{distance.toFixed(1)} km</span>
            </div>
          </div>
          <hr className="my-3" />
          {/* MODIFIED: Reduced font size from text-xl to text-lg */}
          <div className="flex justify-between items-center text-lg font-bold">
            <span className="text-gray-900">Total Fare</span>
            <span>₹{fare.total}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">This is an estimated fare. Tolls & other charges may apply.</p>
        </div>
        
        {/* MODIFIED: Made action buttons more compact */}
        <div className="mt-auto pt-4">
           <button onClick={handleConfirmBooking} className="w-full bg-green-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-green-700 transition-colors text-base shadow-lg">
             Confirm Booking
           </button>
           <button onClick={handleCancel} className="w-full mt-2 bg-transparent text-gray-600 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-200 transition-colors text-base">
             Cancel
           </button>
        </div>
      </div>
    </div>
  );
}