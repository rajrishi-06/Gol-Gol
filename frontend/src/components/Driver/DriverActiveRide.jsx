// DriverActiveRide.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../server/supabase';
import { FaPaperPlane, FaUserCircle } from 'react-icons/fa';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set your Mapbox access token here
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API; 

// --- Helper: Calculates distance between two coordinates in Kilometers ---
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
    return R * c;
};
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
    img.src = "/icons/" + vehicleType + ".svg"; // fallback
    const scale = 1.2;
    img.style.width = `${32 * scale}px`;
    img.style.height = `${32 * scale}px`;
    el.appendChild(img);

    return new mapboxgl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup().setText(popupText))
        .addTo(map);
}

// --- Live Navigation Map Component for Pickup (Ride Accepted) ---
const LiveNavigationMap = ({ origin, destination, vehicleType }) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const userMarkerRef = useRef(null);

    const [eta, setEta] = useState(null);
    const [currentInstruction, setCurrentInstruction] = useState("Initializing Navigation...");

    const speak = useCallback((text) => {
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.cancel();
            speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn("Speech synthesis not supported or failed.", error);
        }
    }, []);
    
    useEffect(() => {
        if (!origin || !destination) return;

        if (!mapRef.current) {
            const radiusInDegrees = 75 / 111; // Roughly 75km in degrees
            const bounds = [
                [origin[0] - radiusInDegrees, origin[1] - radiusInDegrees], // Southwest
                [origin[0] + radiusInDegrees, origin[1] + radiusInDegrees]  // Northeast
            ];
            mapRef.current = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/navigation-day-v1',
                center: origin,
                zoom: 15,
                maxBounds: bounds
            });
            createIconMarker("/icons/destination.svg", destination, mapRef.current, "Pickup Location");
        }

        const fetchRoute = async () => {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?steps=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    const steps = route.legs[0].steps;
                    setEta({
                        duration: Math.round(route.duration / 60),
                        distance: (route.distance / 1000).toFixed(2)
                    });
                    if (steps.length > 0) {
                        const nextInstruction = steps[0].maneuver.instruction;
                        if (currentInstruction !== nextInstruction) {
                             setCurrentInstruction(nextInstruction);
                             speak(nextInstruction);
                        }
                    }
                    const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
                    if (mapRef.current.getSource('route')) {
                        mapRef.current.getSource('route').setData(routeGeoJSON);
                    } else {
                        mapRef.current.addSource('route', { type: 'geojson', data: routeGeoJSON });
                        mapRef.current.addLayer({
                            id: 'route',
                            type: 'line',
                            source: 'route',
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': '#3887be', 'line-width': 7 }
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching route:", err);
                setCurrentInstruction("Could not fetch route information.");
            }
        };

        fetchRoute();

        if (!userMarkerRef.current) {
            userMarkerRef.current = createDriverMarker(vehicleType, origin, mapRef.current, "You are here");
        } else {
            userMarkerRef.current.setLngLat(origin);
        }

        const bounds = new mapboxgl.LngLatBounds(origin, destination);
        mapRef.current.fitBounds(bounds, { padding: 80, speed: 1.2 });

    }, [origin, destination, currentInstruction, speak]);

    return (
        <div className="h-full w-full relative">
            <div ref={mapContainerRef} className="h-full w-full" />
            <div className="absolute top-0 left-0 m-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg">
                <h3 className="font-bold text-lg">ETA: {eta ? `${eta.duration} min • ${eta.distance} km` : "Calculating..."}</h3>
                <p className="text-gray-700 mt-1">{currentInstruction}</p>
            </div>
        </div>
    );
};

// --- Turn-by-Turn Navigation Component for Ongoing Rides ---
// DRIVER COMPONENT FIX - Remove input controls completely
// Replace the TurnByTurnNavigation component with this version:

const TurnByTurnNavigation = ({ origin, destination, vehicleType}) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const userMarkerRef = useRef(null);
    const destinationMarkerRef = useRef(null);
    const [navigationStarted, setNavigationStarted] = useState(false);
    const [currentStep, setCurrentStep] = useState(null);
    const [eta, setEta] = useState(null);
    const [routeSteps, setRouteSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [spokenSteps, setSpokenSteps] = useState(new Set());

    const speak = useCallback((text) => {
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            speechSynthesis.cancel();
            speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn("Speech synthesis not supported or failed.", error);
        }
    }, []);

    const calculateDistance = useCallback((lat1, lng1, lat2, lng2) => {
        const toRad = (value) => (value * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c * 1000;
    }, []);

    const checkProximityToSteps = useCallback(() => {
        if (!routeSteps.length || !origin || !navigationStarted) return;

        const currentLat = origin[1];
        const currentLng = origin[0];

        for (let i = currentStepIndex; i < routeSteps.length; i++) {
            const step = routeSteps[i];
            const stepLocation = step.maneuver.location;
            const distance = calculateDistance(
                currentLat, 
                currentLng, 
                stepLocation[1], 
                stepLocation[0]
            );

            let proximityThreshold = 100;
            
            if (step.maneuver.type === 'turn') {
                proximityThreshold = 150;
            } else if (step.maneuver.type === 'roundabout') {
                proximityThreshold = 200;
            } else if (step.maneuver.type === 'merge' || step.maneuver.type === 'fork') {
                proximityThreshold = 300;
            } else if (step.maneuver.type === 'off ramp' || step.maneuver.type === 'on ramp') {
                proximityThreshold = 400;
            }

            if (distance <= proximityThreshold && !spokenSteps.has(i)) {
                const instruction = step.maneuver.instruction;
                
                let distanceText = "";
                if (distance > 50) {
                    distanceText = `In ${Math.round(distance)} meters, `;
                } else {
                    distanceText = "Now, ";
                }
                
                const fullInstruction = distanceText + instruction;
                
                setCurrentStep(fullInstruction);
                speak(fullInstruction);
                setSpokenSteps(prev => new Set([...prev, i]));
                
                if (distance <= 50) {
                    setCurrentStepIndex(i + 1);
                }
                
                break;
            }
        }

        if (routeSteps.length > 0) {
            const destinationDistance = calculateDistance(
                currentLat,
                currentLng,
                destination[1],
                destination[0]
            );

            if (destinationDistance <= 50 && !spokenSteps.has('destination')) {
                speak("You have arrived at your destination!");
                setCurrentStep("Destination reached!");
                setSpokenSteps(prev => new Set([...prev, 'destination']));
            }
        }
    }, [origin, routeSteps, currentStepIndex, spokenSteps, navigationStarted, calculateDistance, speak, destination]);

    useEffect(() => {
        if (navigationStarted) {
            checkProximityToSteps();
        }
    }, [origin, checkProximityToSteps, navigationStarted]);

    // Fetch route manually instead of using Directions plugin
    const fetchRoute = useCallback(async () => {
        if (!origin || !destination) return;

        try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?steps=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const steps = route.legs[0].steps;
                
                setEta({
                    duration: Math.round(route.duration / 60),
                    distance: (route.distance / 1000).toFixed(2)
                });
                
                setRouteSteps(steps);
                setCurrentStepIndex(0);
                setSpokenSteps(new Set());

                // Add route to map
                const routeGeoJSON = {
                    type: 'Feature',
                    geometry: route.geometry
                };

                if (mapRef.current.getSource('route')) {
                    mapRef.current.getSource('route').setData(routeGeoJSON);
                } else {
                    mapRef.current.addSource('route', {
                        type: 'geojson',
                        data: routeGeoJSON
                    });
                    mapRef.current.addLayer({
                        id: 'route',
                        type: 'line',
                        source: 'route',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#3887be',
                            'line-width': 6,
                            'line-opacity': 0.8
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching route:', error);
        }
    }, [origin, destination]);

    useEffect(() => {
        if (!origin || !destination) return;

        if (!mapRef.current) {
            const radiusInDegrees = 75 / 111;
            const bounds = [
                [origin[0] - radiusInDegrees, origin[1] - radiusInDegrees],
                [origin[0] + radiusInDegrees, origin[1] + radiusInDegrees]
            ];

            mapRef.current = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/navigation-day-v1',
                center: origin,
                zoom: 15,
                maxBounds: bounds
            });

            mapRef.current.addControl(new mapboxgl.NavigationControl());

            // Add markers
            userMarkerRef.current = createDriverMarker(vehicleType, origin, mapRef.current, "You are here");

            destinationMarkerRef.current = createIconMarker("/icons/destination.svg", destination, mapRef.current, "Destination");

            // Fetch route after map is loaded
            mapRef.current.on('load', fetchRoute);
        }

        fetchRoute();
    }, [origin, destination, fetchRoute]);

    useEffect(() => {
        if (userMarkerRef.current && origin) {
            userMarkerRef.current.setLngLat(origin);
        }
    }, [origin]);

    const handleStartNavigation = () => {
        if (routeSteps.length === 0) {
            alert("Route not found. Please wait for the route to load.");
            return;
        }
        
        setNavigationStarted(true);
        speak("Navigation started. Drive safely!");
        
        if (routeSteps.length > 0) {
            const firstInstruction = routeSteps[0].maneuver.instruction;
            setCurrentStep(firstInstruction);
            speak(firstInstruction);
            setSpokenSteps(new Set([0]));
        }
    };

    const handleStopNavigation = () => {
        setNavigationStarted(false);
        setCurrentStep(null);
        setCurrentStepIndex(0);
        setSpokenSteps(new Set());
        speechSynthesis.cancel();
    };

    return (
        <div className="h-full w-full relative">
            <div ref={mapContainerRef} className="h-full w-full" />
            
            <div className="absolute top-4 right-4 bg-white bg-opacity-95 p-4 rounded-lg shadow-lg max-w-sm">
                <div className="mb-3">
                    <h3 className="font-bold text-lg">
                        {eta ? `ETA: ${eta.duration} min • ${eta.distance} km` : "Loading route..."}
                    </h3>
                </div>
                
                <div className="flex gap-2 mb-3">
                    {!navigationStarted ? (
                        <button
                            onClick={handleStartNavigation}
                            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Start Navigation
                        </button>
                    ) : (
                        <button
                            onClick={handleStopNavigation}
                            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                        >
                            Stop Navigation
                        </button>
                    )}
                </div>
                
                {currentStep && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm font-medium text-blue-900">Current Instruction:</p>
                        <p className="text-blue-800 mt-1 text-sm">{currentStep}</p>
                    </div>
                )}

                {navigationStarted && routeSteps.length > 0 && (
                    <div className="mt-3 text-xs text-gray-600">
                        <p>Step {currentStepIndex + 1} of {routeSteps.length}</p>
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                            <div 
                                className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                                style={{ width: `${(currentStepIndex / routeSteps.length) * 100}%` }}
                            ></div>
                        </div>
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

// --- Main DriverActiveRide Component ---
export default function DriverActiveRide() {
    const { rideId } = useParams();
    const navigate = useNavigate();
    const [ride, setRide] = useState(null);
    const [messages, setMessages] = useState([]);
    const [otpInput, setOtpInput] = useState('');
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState('');
    const [driverLocation, setDriverLocation] = useState(null);

    useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation = { lat: latitude, lng: longitude };
            setDriverLocation(newLocation);

            // Update driver location in database more frequently for better tracking
            if (userId) {
                supabase.from('active_drivers')
                    .update({ 
                        current_lat: latitude, 
                        current_lng: longitude,
                        last_updated: new Date().toISOString()
                    })
                    .eq('user_id', userId)
                    .then();
            }

            // Check if the ride should be marked as completed
            if (ride && ride.status === 'ongoing') {
                const distanceToDestination = calculateDistance(
                    newLocation,
                    { lat: ride.to_lat, lng: ride.to_lng }
                );

                // If driver is within 30 meters of the destination (reduced for accuracy)
                if (distanceToDestination < 0.03) {
                    handleEndRide(true); // Automatically end the ride
                }
            }
        },
        (err) => {
            console.error("Error watching location:", err);
            setError("Location access is required for navigation.");
        },
        { 
            enableHighAccuracy: true, 
            timeout: 10000, // Increased timeout
            maximumAge: 5000 // Cache location for max 5 seconds
        }
    );

    return () => navigator.geolocation.clearWatch(watchId);
}, [ride, userId]);

    // Effect to fetch ride data and subscribe to real-time updates
    useEffect(() => {
        const setup = async () => {
            const storedUserId = localStorage.getItem('user_uuid');
            if (!storedUserId) {
                navigate('/login');
                return;
            }
            setUserId(storedUserId);

            const { data: rideData, error: rideError } = await supabase.from('rides').select('*').eq('id', rideId).single();
            if (rideError || !rideData) {
                setError("Could not load ride details.");
                return;
            }
            setRide(rideData);

            const { data: chatData } = await supabase.from('chat_messages').select('*').eq('ride_id', rideId).order('created_at');
            setMessages(chatData || []);
        };

        setup();

        const rideSubscription = supabase.channel(`ride-status:${rideId}`).on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'rides', 
            filter: `id=eq.${rideId}` 
        }, (payload) => {
            setRide(payload.new);
            
            // Navigate to dashboard when ride is completed
            if (payload.new.status === 'completed') {
                setTimeout(() => {
                    navigate('/driver/dashboard'); // Navigate to driver dashboard
                }, 2000);
            }
        }).subscribe();
        
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

    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (ride && otpInput === ride.start_otp) {
            await supabase.from('rides').update({ status: 'ongoing' }).eq('id', rideId);
        } else {
            setError("Invalid OTP. Please try again.");
        }
    };
    
    const handleEndRide = async (isAutoEnd = false) => {
        if (!ride || ride.status !== 'ongoing') return; // Prevent multiple calls

        const { error } = await supabase.from('rides').update({ status: 'completed' }).eq('id', rideId);
        if (!error) {
            await supabase.from('active_drivers').update({ on_ride: false, current_ride_id: null }).eq('user_id', userId);
            if(isAutoEnd){
                alert("Destination reached. Ride completed!");
            } else {
                alert("Ride Completed!");
            }
            // Navigation will be handled by the subscription effect
        }
    };

    if (!ride) return <div className="flex justify-center items-center h-screen">{error || "Loading ride details..."}</div>;

    const originCoords = driverLocation ? [driverLocation.lng, driverLocation.lat] : null;
    let destinationCoords = null;

    if (ride.status === 'accepted') {
        destinationCoords = [ride.from_lng, ride.from_lat];
    } else if (ride.status === 'ongoing') {
        destinationCoords = [ride.to_lng, ride.to_lat];
    }

    return (
        <div className="flex flex-col sm:flex-row h-screen">
            <div className="w-full sm:w-[550px] h-screen p-6 bg-gray-50 overflow-y-auto border-r">
                <h1 className="text-2xl font-bold mb-4">On Ride</h1>
                
                {ride.status === 'accepted' && (
                    <div className="bg-white p-4 rounded-lg shadow mb-4">
                        <h2 className="font-bold text-lg">Pickup Rider</h2>
                        <p>Head to the pickup location. Enter the OTP to start the trip.</p>
                        <form onSubmit={handleOtpSubmit} className="mt-3">
                            <input 
                                type="text" 
                                value={otpInput} 
                                onChange={(e) => setOtpInput(e.target.value)} 
                                placeholder="Enter 4-digit OTP" 
                                className="w-full p-2 border rounded" 
                            />
                            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                            <button type="submit" className="w-full mt-2 bg-blue-600 text-white font-bold py-2 rounded-lg">
                                Start Ride
                            </button>
                        </form>
                    </div>
                )}

                {ride.status === 'ongoing' && (
                     <div className="bg-white p-4 rounded-lg shadow mb-4">
                        <h2 className="font-bold text-lg">Trip to Destination</h2>
                        <p>Follow the turn-by-turn navigation to the destination. The ride will end automatically upon arrival.</p>
                         <button 
                            onClick={() => handleEndRide(false)} 
                            className="w-full mt-2 bg-red-600 text-white font-bold py-2 rounded-lg"
                        >
                            End Ride Manually
                        </button>
                    </div>
                )}

                <h2 className="font-bold text-lg mb-2">Chat with Rider</h2>
                <Chatbox rideId={rideId} userId={userId} messages={messages} />
            </div>
            
            <div className="hidden sm:block flex-1 h-screen relative">
                {originCoords && destinationCoords ? (
                    ride.status === 'ongoing' ? (
                        // Use turn-by-turn navigation for ongoing rides
                        <TurnByTurnNavigation origin={originCoords} destination={destinationCoords} vehicleType={ride.vehicle_type}/>
                    ) : (
                        // Use simple navigation for pickup
                        <LiveNavigationMap origin={originCoords} destination={destinationCoords} vehicleType={ride.vehicle_type}/>
                    )
                ) : (
                    <div className="flex items-center justify-center h-full bg-gray-200">
                        <p className="text-gray-600">{error || "Waiting for location data..."}</p>
                    </div>
                )}
            </div>
        </div>
    );
}