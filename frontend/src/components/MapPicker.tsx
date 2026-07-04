import React, { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Crosshair, ArrowLeft, Check, Search, MapPin } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAP_STYLE } from "../lib/mapbox";
import { computeBounds } from "../lib/geo";
import { reverseGeocode, forwardGeocode } from "../lib/geocoding";

interface MapPickerProps {
  setLoc: (value: string) => void;
  setClickedLoc: (flag: boolean) => void;
  setCords: (coords: { lat: number; lng: number }) => void;
  initialCenter?: { lat: number; lng: number };
  mode: "from" | "to";
}

const MapPicker: React.FC<MapPickerProps> = ({ setLoc, setClickedLoc, setCords, initialCenter, mode }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [didUserType, setDidUserType] = useState(false);
  const [ready, setReady] = useState(false);

  // Initialize map, preferring `initialCenter` over geolocation.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      let lat: number, lng: number;
      const valid =
        initialCenter &&
        Number.isFinite(initialCenter.lat) &&
        Number.isFinite(initialCenter.lng) &&
        (initialCenter.lat !== 0 || initialCenter.lng !== 0);

      if (valid) {
        lat = initialCenter!.lat;
        lng = initialCenter!.lng;
      } else {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Fall back to a sensible default (New Delhi) instead of aborting.
          lat = 28.6139;
          lng = 77.209;
        }
      }

      if (cancelled) return;
      setCoords({ lat, lng });

      const { sw, ne } = computeBounds(lat, lng);
      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: MAP_STYLE.streets,
        center: [lng, lat],
        zoom: 13,
        maxBounds: [sw, ne] as any,
        attributionControl: false,
        // Zoom around the centre pin (not the cursor) so the selected point
        // stays fixed while the user zooms.
        scrollZoom: { around: "center" },
        touchZoomRotate: { around: "center" },
        doubleClickZoom: false,
        dragRotate: false,
      });
      mapRef.current = map;
      // The centre coordinate is valid immediately, so enable Confirm now
      // rather than waiting on `load` (which never fires if tiles fail).
      setReady(true);
      map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");

      map.getCanvas().style.cursor = "grab";
      map.on("mousedown", () => (map.getCanvas().style.cursor = "grabbing"));
      map.on("mouseup", () => (map.getCanvas().style.cursor = "grab"));
      map.on("move", () => {
        const c = map.getCenter();
        setCoords({ lat: c.lat, lng: c.lng });
      });
      map.on("idle", async () => {
        if (didUserType) return;
        const { lat: cLat, lng: cLng } = map.getCenter();
        try {
          const place = await reverseGeocode(cLng, cLat);
          if (place && !cancelled) setSearchInput(place);
        } catch {
          /* ignore reverse-geocode failures */
        }
      });
    }

    init();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter]);

  // Debounced forward-geocode as the user types.
  useEffect(() => {
    if (!didUserType || !mapRef.current) return;
    const trimmed = searchInput.trim();
    if (!trimmed || /^[-+]?\d+(?:\.\d+)?,\s*[-+]?\d+(?:\.\d+)?$/.test(trimmed)) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        // Bias results to what the user is currently looking at.
        setSuggestions(await forwardGeocode(trimmed, { proximity: coords }));
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, didUserType, coords]);

  const flyTo = (lat: number, lng: number) => {
    const { sw, ne } = computeBounds(lat, lng);
    mapRef.current!.setMaxBounds([sw, ne] as any);
    mapRef.current!.flyTo({ center: [lng, lat], zoom: 14, essential: true });
    setCoords({ lat, lng });
  };

  const handleSuggestionClick = (place: any) => {
    const [lng, lat] = place.center;
    setSearchInput(place.place_name);
    flyTo(lat, lng);
    setSuggestions([]);
    setDidUserType(false);
  };

  const handleSearch = async () => {
    const trimmed = searchInput.trim();
    if (!trimmed || !mapRef.current) return;
    const m = trimmed.match(/^([-+]?\d{1,2}(?:\.\d+)?),\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (m) {
      flyTo(parseFloat(m[1]), parseFloat(m[2]));
      setSuggestions([]);
    } else if (suggestions.length > 0) {
      handleSuggestionClick(suggestions[0]);
    } else {
      try {
        const results = await forwardGeocode(trimmed, { proximity: coords, limit: 1 });
        if (results[0]) handleSuggestionClick(results[0]);
      } catch {
        /* ignore */
      }
    }
    setDidUserType(false);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        flyTo(latitude, longitude);
        setSearchInput(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        setSuggestions([]);
        setDidUserType(false);
      },
      () => {}
    );
  };

  const handleConfirm = () => {
    setLoc(searchInput);
    setCords({ lat: coords.lat, lng: coords.lng });
    setClickedLoc(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex-1 sm:relative sm:inset-auto sm:z-auto sm:block">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      {/* Top search bar */}
      <div className="absolute inset-x-0 top-0 z-30 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-floating backdrop-blur">
          <button
            onClick={() => setClickedLoc(false)}
            aria-label="Cancel and go back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-2 h-4 w-4 text-subtle" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setDidUserType(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={`Search ${mode === "from" ? "pickup" : "drop"} location`}
              aria-label="Search location"
              className="w-full rounded-lg bg-transparent py-2 pl-8 pr-2 text-sm text-foreground placeholder:text-subtle focus:outline-none"
            />
          </div>
          <button
            onClick={handleCurrentLocation}
            aria-label="Use my current location"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-primary-subtle hover:text-primary-subtle-fg focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Crosshair className="h-5 w-5" />
          </button>
        </div>

        {suggestions.length > 0 && (
          <ul className="mx-auto mt-2 max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-floating">
            {suggestions.map((s, i) => {
              // Split the main place name from its administrative context.
              const context = s.place_name?.startsWith(s.text)
                ? s.place_name.slice(s.text.length).replace(/^,\s*/, "")
                : s.place_name;
              return (
                <li key={s.id || i}>
                  <button
                    onClick={() => handleSuggestionClick(s)}
                    className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{s.text}</span>
                      {context && <span className="block truncate text-xs text-muted">{context}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Centre pin */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
        <img
          src={mode === "from" ? "/icons/pickup.svg" : "/icons/destination.svg"}
          alt=""
          className="h-11 w-11 drop-shadow-lg"
        />
        <span className="mx-auto -mt-1 block h-1.5 w-1.5 rounded-full bg-black/30 blur-[1px]" />
      </div>

      {/* Bottom confirm sheet */}
      <div className="absolute inset-x-0 bottom-0 z-30 p-3 sm:p-4">
        <div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-surface/95 p-3 shadow-floating backdrop-blur">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
            {mode === "from" ? "Pickup" : "Drop"} location
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {searchInput || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
          </p>
          <button
            onClick={handleConfirm}
            disabled={!ready}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-fg shadow-brand transition-all hover:bg-primary-hover hover:-translate-y-px disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Check className="h-4 w-4" />
            Confirm {mode === "from" ? "pickup" : "drop"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapPicker;
