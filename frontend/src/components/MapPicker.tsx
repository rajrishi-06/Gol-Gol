// MapPicker.tsx
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import axios from 'axios';
import { Crosshair } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_GL_API;

interface MapPickerProps {
  setLoc: (value: string) => void;
  setClickedLoc: (flag: boolean) => void;
}

const MapPicker: React.FC<MapPickerProps> = ({ setLoc, setClickedLoc }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [didUserType, setDidUserType] = useState(false);

  // Tooltip state
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  // hold the timeout ID; in browsers setTimeout returns a number
  const idleTimer = useRef<number | null>(null);

  // Utility: compute 150km×150km bounds around a center
  const computeBounds = (lat: number, lng: number) => {
    const halfSideKm = 75; // half of 150 km
    const degLat = halfSideKm / 111; // ~111 km per degree latitude
    const degLng = halfSideKm / (111 * Math.cos((lat * Math.PI) / 180));
    return {
      sw: [lng - degLng, lat - degLat] as [number, number],
      ne: [lng + degLng, lat + degLat] as [number, number],
    };
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current && mapContainerRef.current) {
      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude: lat, longitude: lng } }) => {
          setCoords({ lat, lng });
          const { sw, ne } = computeBounds(lat, lng);

          const map = new mapboxgl.Map({
            container: mapContainerRef.current!,
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [lng, lat],
            zoom: 12,
            maxBounds: [sw, ne],
            scrollZoom: { around: 'center' },
            touchZoomRotate: { around: 'center' },
          });
          mapRef.current = map;

          // Grab/Grabbing cursor
          map.getCanvas().style.cursor = 'grab';
          map.on('mousedown', () => {
            map.getCanvas().style.cursor = 'grabbing';
          });
          map.on('mouseup', () => {
            map.getCanvas().style.cursor = 'grab';
          });

          // Update coords on move
          map.on('move', () => {
            const center = map.getCenter();
            setCoords({ lat: center.lat, lng: center.lng });
          });

          // Reverse geocode after move ends
          map.on('idle', async () => {
            if (didUserType) return;
            const { lat: cLat, lng: cLng } = map.getCenter();
            try {
              const res = await axios.get(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${cLng},${cLat}.json`,
                {
                  params: {
                    access_token: mapboxgl.accessToken,
                    limit: 1,
                  },
                }
              );
              if (res.data.features.length > 0) {
                setSearchInput(res.data.features[0].place_name);
              }
            } catch (err) {
              console.error('Reverse-geocode error:', err);
            }
          });
        },
        (err) => {
          console.error('Geolocation error:', err);
          alert('Unable to get your location; map cannot initialize.');
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch suggestions when typing
  useEffect(() => {
    if (!didUserType || !mapRef.current) return;
    const trimmed = searchInput.trim();
    // If input is coords or empty, clear suggestions
    if (!trimmed || /^[-+]?\d+(?:\.\d+)?,\s*[-+]?\d+(?:\.\d+)?$/.test(trimmed)) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { sw, ne } = computeBounds(coords.lat, coords.lng);
      try {
        const res = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            trimmed
          )}.json`,
          {
            params: {
              access_token: mapboxgl.accessToken,
              limit: 5,
              bbox: `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`,
            },
          }
        );
        setSuggestions(res.data.features);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, didUserType, coords]);

  // Handlers
  const handleSuggestionClick = (place: any) => {
    const [lng, lat] = place.center;
    const { sw, ne } = computeBounds(lat, lng);
    setSearchInput(place.place_name);
    mapRef.current!.setMaxBounds([sw, ne]);
  mapRef.current!.flyTo({ center: [lng, lat], zoom: 14 });
    setCoords({ lat, lng });
    setSuggestions([]);
    setDidUserType(false);
  };

  const handleSearch = async () => {
    const trimmed = searchInput.trim();
    if (!trimmed || !mapRef.current) return;

    const coordMatch = trimmed.match(
      /^([-+]?\d{1,2}(?:\.\d+)?),\s*([-+]?\d{1,3}(?:\.\d+)?)$/
    );
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      const { sw, ne } = computeBounds(lat, lng);
      mapRef.current!.setMaxBounds([sw, ne]);
  mapRef.current!.flyTo({ center: [lng, lat], zoom: 14 });
      setCoords({ lat, lng });
      setSuggestions([]);
    } else if (suggestions.length > 0) {
      handleSuggestionClick(suggestions[0]);
    } else {
      // fallback geocode
      const { sw, ne } = computeBounds(coords.lat, coords.lng);
      try {
        const res = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            trimmed
          )}.json`,
          {
            params: {
              access_token: mapboxgl.accessToken,
              limit: 1,
              bbox: `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`,
            },
          }
        );
        if (res.data.features.length > 0) {
          handleSuggestionClick(res.data.features[0]);
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    }
    setDidUserType(false);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    const map = mapRef.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        const { sw, ne } = computeBounds(lat, lng);
        setCoords({ lat, lng });
        map.setMaxBounds([sw, ne]);
        map?.flyTo({ center: [lng, lat], zoom: 14 });
        setSearchInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        setSuggestions([]);
        setDidUserType(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        alert('Unable to retrieve your location.');
      }
    );
  };

  // Tooltip: show after 3s of no move, hide immediately on any move or leave
  const onMapMouseMove = (e: React.MouseEvent) => {
    // update last position
    setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 });

    // hide it right away
    if (tooltipVisible) {
      setTooltipVisible(false);
    }

    // reset idle timer
    if (idleTimer.current !== null) {
      clearTimeout(idleTimer.current);
    }
    idleTimer.current = window.setTimeout(() => {
      setTooltipVisible(true);
    }, 3000);
  };

  const onMapMouseLeave = () => {
    if (idleTimer.current !== null) {
      clearTimeout(idleTimer.current);
    }
    setTooltipVisible(false);
  };

  const handleOk = () => {
    // send the selected location back to parent
    setLoc(searchInput);
    // close the map
    setClickedLoc(false);
  };

  return (
    <div className="hidden sm:block flex-1 h-screen relative">
      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        className="absolute top-0 left-0 w-full h-full"
        onMouseMove={onMapMouseMove}
        onMouseLeave={onMapMouseLeave}
      />

      {/* Tooltip */}
      {tooltipVisible && (
        <div
          className="absolute bg-black text-white text-xs px-2 py-1 rounded pointer-events-none z-50"
          style={{
            top: tooltipPos.y-450,
            left: tooltipPos.x+10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          Move map to adjust location
        </div>
      )}

      {/* Fixed Center Marker */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
        <img src="/marker.svg" alt="marker" className="h-10 w-10" />
      </div>

      {/* Lat/Lng Display */}
      <div className="absolute bottom-4 left-4 bg-white p-2 rounded shadow-md z-20">
        <input
          type="text"
          readOnly
          className="border px-2 py-1 w-72 text-sm"
          value={`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`}
        />
      </div>

      {/* Search Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-lg">
        <div className="flex flex-col bg-white shadow rounded overflow-visible relative">
          <div className="flex items-center">
            <input
              type="text"
              className="flex-grow px-4 py-2 text-sm outline-none"
              placeholder="Enter coordinates or place"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setDidUserType(true);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleCurrentLocation}
              aria-label="Locate me"
              className="ml-2 p-2 bg-white text-black text-sm hover:bg-blue-700 hover:text-white rounded"
            >
              <Crosshair size={16} />
            </button>
            <button
              onClick={handleOk}
              className="ml-2 p-2 bg-green-600 text-white text-sm hover:bg-green-700 rounded"
            >
              Ok
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border-t z-20 shadow-md max-h-40 overflow-auto">
              {suggestions.map((sugg, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSuggestionClick(sugg)}
                  className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                >
                  {sugg.place_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapPicker;
