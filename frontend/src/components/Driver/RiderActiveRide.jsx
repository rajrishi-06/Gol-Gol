// RiderActiveRide.jsx
import React, { useState, useEffect, useRef, useCallback} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../server/supabase';
import { FaPaperPlane, FaUserCircle, FaRupeeSign } from 'react-icons/fa';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set your Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

function createIconMarker(iconPath, coords, map, popupText) {
    const el = document.createElement("div");
    const img = document.createElement("img");
    img.src = iconPath;
    const scale = 1.2;
    img.style.width = `${32 * scale}px`;
    img.style.height = `${32 * scale}px`;
    el.appendChild(img);

    return new mapboxgl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup().setText(popupText))
        .addTo(map);
}
function createDriverMarker(vehicleType, coords, map, popupText) {
    const el = document.createElement("div");
    const img = document.createElement("img");
    img.src = "/icons/"+ vehicleType +".svg"; // fallback
    const scale = 1.2;
    img.style.width = `${32 * scale}px`;
    img.style.height = `${32 * scale}px`;
    el.appendChild(img);

    return new mapboxgl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup().setText(popupText))
        .addTo(map);
}

// --- Rider's Map View for Accepted Status ---
const RiderMapView = ({ride, driverLocation, riderLocation, destinationLocation, status }) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const pickupMarkerRef = useRef(null);
    const dropoffMarkerRef = useRef(null);

    // Around line 20-25, in the useEffect where the map is created:
    useEffect(() => {
        if (!riderLocation) return;
        if (!mapRef.current) {
            // Calculate bounds for 75km radius around rider location
            const radiusInDegrees = 75 / 111; // Roughly 75km in degrees
            const bounds = [
                [riderLocation.lng - radiusInDegrees, riderLocation.lat - radiusInDegrees], // Southwest
                [riderLocation.lng + radiusInDegrees, riderLocation.lat + radiusInDegrees]  // Northeast
            ];

            mapRef.current = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/streets-v11',
                center: [riderLocation.lng, riderLocation.lat],
                zoom: 13,
                maxBounds: bounds // Add this line
            });
        }
    }, [riderLocation]);
    useEffect(() => {
        if (!mapRef.current) return;

        let bounds = new mapboxgl.LngLatBounds();
        if (riderLocation && status === 'accepted') {
            const riderCoords = [riderLocation.lng, riderLocation.lat];
            if (!pickupMarkerRef.current) {
                pickupMarkerRef.current = createIconMarker("/icons/human.svg", riderCoords, mapRef.current, "Pickup");
            }
            bounds.extend(riderCoords);
        } else {
            if (pickupMarkerRef.current) { pickupMarkerRef.current.remove(); pickupMarkerRef.current = null; }
        }

        if (driverLocation) {
            const driverCoords = [driverLocation.lng, driverLocation.lat];
            if (!driverMarkerRef.current) {
                driverMarkerRef.current = createDriverMarker(
                    ride.driver.drivers.vehicle_type, // vehicle_type from your fetched driver
                    { lng: driverCoords[0], lat: driverCoords[1] },
                    mapRef.current,
                    'Your driver'
                );
            } else {
                driverMarkerRef.current.setLngLat(driverCoords);
            }
            bounds.extend(driverCoords);
        }
        
        if (destinationLocation && status === 'ongoing') {
            const destCoords = [destinationLocation.lng, destinationLocation.lat];
            if (!dropoffMarkerRef.current) {
                dropoffMarkerRef.current = createIconMarker("/icons/destination.svg",destCoords,mapRef.current,"Destination");
            }
            bounds.extend(destCoords);
        }

        if (bounds.getNorthEast() && bounds.getSouthWest()) {
            mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
        }

    }, [driverLocation, riderLocation, destinationLocation, status]);

    return <div ref={mapContainerRef} className="h-full w-full" />;
};

// RIDER COMPONENT FIX - Show complete route from rider's current position to destination
// Replace the RiderNavigationView component with this version:

const RiderNavigationView = ({ride, riderLocation, driverLocation, destination }) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const riderMarkerRef = useRef(null);
    const destinationMarkerRef = useRef(null);
    const [eta, setEta] = useState(null);
    const [routeInfo, setRouteInfo] = useState(null);

    // Fetch route from rider's location to destination
    const fetchRiderRoute = useCallback(async () => {
        if (!riderLocation || !destination) return;

        try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${riderLocation.lng},${riderLocation.lat};${destination.lng},${destination.lat}?steps=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const steps = route.legs[0].steps;
                
                setEta({
                    duration: Math.round(route.duration / 60),
                    distance: (route.distance / 1000).toFixed(2)
                });
                
                setRouteInfo({
                    instructions: steps.slice(0, 3)
                });

                // Add route to map
                const routeGeoJSON = {
                    type: 'Feature',
                    geometry: route.geometry
                };

                if (mapRef.current.getSource('rider-route')) {
                    mapRef.current.getSource('rider-route').setData(routeGeoJSON);
                } else {
                    mapRef.current.addSource('rider-route', {
                        type: 'geojson',
                        data: routeGeoJSON
                    });
                    mapRef.current.addLayer({
                        id: 'rider-route',
                        type: 'line',
                        source: 'rider-route',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#2ecc71',
                            'line-width': 4,
                            'line-opacity': 0.7
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching rider route:', error);
        }
    }, [riderLocation, destination]);

    useEffect(() => {
        if (!riderLocation) return;

        if (!mapRef.current) {
            const radiusInDegrees = 75 / 111;
            const bounds = [
                [riderLocation.lng - radiusInDegrees, riderLocation.lat - radiusInDegrees],
                [riderLocation.lng + radiusInDegrees, riderLocation.lat + radiusInDegrees]
            ];

            mapRef.current = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/streets-v11',
                center: [riderLocation.lng, riderLocation.lat],
                zoom: 13,
                maxBounds: bounds
            });

            mapRef.current.addControl(new mapboxgl.NavigationControl());

            // Add rider marker (current position)
            // riderMarkerRef.current = createIconMarker("/icons/human.svg",{ lng: riderLocation.lng, lat: riderLocation.lat },mapRef.current,"You are here");

            // Add destination marker
            if (destination) {
                destinationMarkerRef.current = createIconMarker("/icons/destination.svg",{ lng: destination.lng, lat: destination.lat },mapRef.current,"Destination");  
            }

            // Fetch route after map loads
            mapRef.current.on('load', fetchRiderRoute);
        }

        fetchRiderRoute();
    }, [riderLocation, destination, fetchRiderRoute]);

    useEffect(() => {
        if (!mapRef.current) return;

        // Update/add driver marker
        if (driverLocation) {
            const driverCoords = [driverLocation.lng, driverLocation.lat];
            if (!driverMarkerRef.current && ride?.driver?.drivers?.vehicle_type) {
                driverMarkerRef.current = createDriverMarker(
                    ride.driver.drivers.vehicle_type,
                    { lng: driverCoords[0], lat: driverCoords[1] },
                    mapRef.current,
                    'Your driver'
                );
            } else {
                driverMarkerRef.current.setLngLat(driverCoords);
            }


            // Auto-fit bounds to show rider, driver, and destination
            let bounds = new mapboxgl.LngLatBounds();
            bounds.extend([riderLocation.lng, riderLocation.lat]);
            bounds.extend(driverCoords);
            if (destination) {
                bounds.extend([destination.lng, destination.lat]);
            }
            mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
        }
    }, [driverLocation, riderLocation, destination]);

    return (
        <div className="h-full w-full relative">
            <div ref={mapContainerRef} className="h-full w-full" />
            
            <div className="absolute top-4 right-4 bg-white bg-opacity-95 p-4 rounded-lg shadow-lg max-w-sm">
                <div className="mb-3">
                    <h3 className="font-bold text-lg text-green-700">Your Journey</h3>
                    <p className="text-sm text-gray-600">
                        {eta ? `${eta.duration} min • ${eta.distance} km to destination` : "Calculating route..."}
                    </p>
                </div>
                
                {routeInfo && routeInfo.instructions && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-700">Route Overview:</p>
                        {routeInfo.instructions.map((step, index) => (
                            <div key={index} className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                {step.maneuver.instruction}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


const Chatbox = ({ rideId, userId, messages }) => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    // Auto-scroll to the latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !userId) return;

        await supabase.from('chat_messages').insert({
            ride_id: rideId,
            sender_id: userId,
            message: newMessage,
        });
        setNewMessage('');
    };

    return (
        <div className="flex flex-col h-64 bg-gray-100 rounded-lg p-3">
            <div className="flex-grow overflow-y-auto mb-2">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_id === userId ? 'justify-end' : 'justify-start'}`}>
                        <p className={`max-w-xs text-sm rounded-lg px-3 py-2 mb-1 ${msg.sender_id === userId ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                            {msg.message}
                        </p>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="flex">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-grow p-2 border rounded-l-lg focus:outline-none"
                />
                <button type="submit" className="bg-blue-600 text-white px-4 rounded-r-lg"><FaPaperPlane /></button>
            </form>
        </div>
    );
};

// --- Main RiderActiveRide Component ---
export default function RiderActiveRide() {
    const { rideId } = useParams();
    const navigate = useNavigate();
    const [ride, setRide] = useState(null);
    const [driverLocation, setDriverLocation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const setup = async () => {
            const storedUserId = localStorage.getItem('user_uuid');
            if (!storedUserId) {
                navigate('/login');
                return;
            }
            setUserId(storedUserId);

            // 1. Fetch the basic ride data first.
            const { data: rideData, error: rideError } = await supabase
                .from('rides')
                .select('*')
                .eq('id', rideId)
                .single();

            if (rideError || !rideData) {
                console.error("Error fetching ride details:", rideError);
                alert("Could not find this ride. It may have been cancelled or does not exist.");
                navigate('/');
                return;
            }

            // 2. If a driver is assigned, fetch their details.
            if (rideData.driver_id) {
                const { data: driverData, error: driverError } = await supabase
                    .from('drivers')
                    .select('*, users(*)')
                    .eq('user_id', rideData.driver_id)
                    .single();
                
                if (!driverError && driverData) {
                    // Combine ride data with driver details
                    setRide({ ...rideData, driver: { drivers: driverData } });
                } else {
                    // If driver details fail, still show the ride
                    setRide(rideData);
                }
            } else {
                // No driver assigned yet
                setRide(rideData);
            }
            
            setLoading(false);

            // Fetch initial chat messages
            const { data: chatData } = await supabase.from('chat_messages').select('*').eq('ride_id', rideId).order('created_at');
            setMessages(chatData || []);
        };

        setup();

        // Real-time subscription for ride updates
        const rideSubscription = supabase.channel(`ride-updates:${rideId}`).on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'rides', 
            filter: `id=eq.${rideId}` 
        }, async (payload) => {
            const updatedRide = payload.new;
            // If a driver was just assigned, fetch their full details
            if (payload.old.driver_id === null && updatedRide.driver_id) {
                 const { data: fullRideData } = await supabase.from('rides').select('*, driver:driver_id(drivers(*, users(*)))').eq('id', updatedRide.id).single();
                setRide(fullRideData);
            } else {
                setRide(prev => ({ ...prev, ...updatedRide }));
            }
            
            // Handle ride completion and cancellation
            if (updatedRide.status === 'completed') { 
                alert("Ride complete!"); 
                setTimeout(() => {
                    navigate('/'); // Navigate to home page
                }, 2000);
            }
            if (updatedRide.status === 'cancelled') { 
                alert("Ride has been cancelled."); 
                navigate('/'); 
            }
        }).subscribe();
        
        // Real-time subscription for chat messages
        const chatSubscription = supabase.channel(`chat:${rideId}`).on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chat_messages', 
            filter: `ride_id=eq.${rideId}` 
        }, (payload) => setMessages(prev => [...prev, payload.new])).subscribe();

        return () => {
            supabase.removeChannel(rideSubscription);
            supabase.removeChannel(chatSubscription);
        };
    }, [rideId, navigate]);

    useEffect(() => {
        if (!ride?.driver_id) return;

        // Fetch initial driver location
        const fetchInitialLocation = async () => {
            const { data } = await supabase
                .from('active_drivers')
                .select('current_lat, current_lng')
                .eq('user_id', ride.driver_id)
                .single();
            if (data) {
                setDriverLocation({ lat: data.current_lat, lng: data.current_lng });
            }
        };
        fetchInitialLocation();

        // Subscribe to driver location updates
        const driverLocationChannel = supabase.channel(`driver-location:${ride.driver_id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'active_drivers',
            filter: `user_id=eq.${ride.driver_id}`
        }, (payload) => {
            setDriverLocation({ lat: payload.new.current_lat, lng: payload.new.current_lng });
        }).subscribe();

        return () => {
            supabase.removeChannel(driverLocationChannel);
        };
    }, [ride?.driver_id]);

    
    const handleCancelRide = async () => {
        if (window.confirm("Are you sure you want to cancel this ride?")) {
            await supabase.from('rides').update({ status: 'cancelled' }).eq('id', rideId);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen">Loading ride...</div>;

    // Screen for when waiting for a driver
    if (!ride.driver_id) {
        return (
            <div className="flex justify-center items-center h-screen flex-col">
                 <svg className="animate-spin h-10 w-10 text-gray-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p className="mt-4 text-gray-600">Waiting for a driver to accept...</p>
                 <button onClick={handleCancelRide} className="mt-4 bg-red-500 text-white font-bold py-2 px-4 rounded-lg">Cancel Ride</button>
            </div>
        );
    }

    // Main screen for when the ride is active
    return (
        <div className="flex flex-col sm:flex-row h-screen">
            <div className="w-full sm:w-[550px] h-screen p-6 bg-gray-50 overflow-y-auto border-r flex flex-col">
                <h1 className="text-2xl font-bold mb-4">
                    {ride.status === 'accepted' ? "Driver is on the way!" : "You are on your way!"}
                </h1>
                
                <div className="bg-white p-4 rounded-lg shadow mb-4">
                    <div className="flex items-center">
                        <FaUserCircle className="text-4xl text-gray-400 mr-3"/>
                        <div>
                            <p className="font-semibold">{ride.driver.drivers.users.name}</p>
                            <p className="text-sm text-gray-600">
                                {ride.driver.drivers.vehicle_type} - {ride.driver.drivers.vehicle_registration}
                            </p>
                        </div>
                        <div className="ml-auto text-right">
                            <p className="font-bold text-lg flex items-center">
                                <FaRupeeSign size={14} />{ride.fare}
                            </p>
                            <p className="text-xs text-gray-500">Total Fare</p>
                        </div>
                    </div>
                </div>

                {ride.status === 'accepted' && (
                    <div className="bg-white p-4 rounded-lg shadow mb-4">
                        <h2 className="font-bold text-lg">Your OTP</h2>
                        <p>Share this with your driver to start the ride.</p>
                        <p className="text-center text-3xl font-bold tracking-widest my-2 bg-gray-100 p-3 rounded-lg">
                            {ride.start_otp}
                        </p>
                    </div>
                )}

                {ride.status === 'ongoing' && (
                    <div className="bg-white p-4 rounded-lg shadow mb-4">
                        <h2 className="font-bold text-lg">Trip in Progress</h2>
                        <p>Your driver is taking you to your destination. The map shows your route and current progress.</p>
                        <div className="mt-2 p-2 bg-green-50 rounded">
                            <p className="text-sm text-green-800">
                                <strong>From:</strong> Your pickup location<br/>
                                <strong>To:</strong> Your destination
                            </p>
                        </div>
                    </div>
                )}
                
                <div className="mt-auto">
                    <h2 className="font-bold text-lg mb-2">Chat with Driver</h2>
                    <Chatbox rideId={rideId} userId={userId} messages={messages} />
                </div>

                {ride.status !== 'ongoing' && (
                    <button 
                        onClick={handleCancelRide} 
                        className="w-full mt-4 bg-red-500 text-white font-bold py-2 px-4 rounded-lg"
                    >
                        Cancel Ride
                    </button>
                )}
            </div>
            
            <div className="hidden sm:block flex-1 h-screen relative">
                {ride.status === 'ongoing' && driverLocation ? (
                    // Use navigation view for ongoing rides - shows route from rider's current position to destination
                    <RiderNavigationView 
                        ride={ride}
                        riderLocation={{ lat: ride.from_lat, lng: ride.from_lng }}
                        driverLocation={driverLocation}
                        destination={{ lat: ride.to_lat, lng: ride.to_lng }}
                    />
                ) : (
                    // Use regular map view for accepted rides - shows driver approaching pickup
                    <RiderMapView 
                        ride={ride}
                        driverLocation={driverLocation} 
                        riderLocation={{ lat: ride.from_lat, lng: ride.from_lng }} 
                        destinationLocation={{ lat: ride.to_lat, lng: ride.to_lng }} 
                        status={ride.status} 
                    />
                )}
            </div>
        </div>
    );
}