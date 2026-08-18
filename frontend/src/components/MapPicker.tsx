import React, { useRef, useEffect, useState } from "react";
import { Crosshair, ArrowLeft, Check, Search, MapPin } from "lucide-react";
import { loadGoogleMaps, createMap, restrictionAround, attachCenterZoom, minZoomForRadius } from "../lib/googlemaps";
import { reverseGeocode, forwardGeocode, resolvePlace } from "../lib/geocoding";

interface MapPickerProps {
  /** Called with the chosen address and its coordinates. */
  onConfirm: (address: string, coords: { lat: number; lng: number }) => void;
  /** Dismiss without choosing. */
  onClose: () => void;
  initialCenter?: { lat: number; lng: number } | null;
  mode: "from" | "to";
}

interface Suggestion {
  id: string;
  text: string;
  secondary: string;
  place_name: string;
  center: [number, number] | null;
}

const MapPicker: React.FC<MapPickerProps> = ({ onConfirm, onClose, initialCenter, mode }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const zoomCleanupRef = useRef<(() => void) | null>(null);
  const didUserTypeRef = useRef(false);

  // Keep zoom-out within ~100 km of the picked location.
  const MAX_RADIUS_KM = 100;

  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [didUserType, setDidUserType] = useState(false);
  const [ready, setReady] = useState(false);

  // Keep a ref in sync so map event listeners (bound once) read the latest value.
  useEffect(() => {
    didUserTypeRef.current = didUserType;
  }, [didUserType]);

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

      await loadGoogleMaps();
      if (cancelled || !mapContainerRef.current) return;

      const minZoom = minZoomForRadius(lat, MAX_RADIUS_KM);
      const map = createMap(mapContainerRef.current, {
        center: { lat, lng },
        zoom: 15,
        restriction: restrictionAround(lat, lng, MAX_RADIUS_KM),
        strictBounds: true,
        minZoom,
      });
      mapRef.current = map;
      // Zoom in/out around the fixed centre pin, not the cursor.
      zoomCleanupRef.current = attachCenterZoom(map, mapContainerRef.current, { minZoom });
      // The centre coordinate is valid immediately, so enable Confirm now.
      setReady(true);

      // The pin is fixed at screen centre, so the map centre is the selection.
      map.addListener("center_changed", () => {
        const c = map.getCenter();
        if (c) setCoords({ lat: c.lat(), lng: c.lng() });
      });
      map.addListener("idle", async () => {
        if (didUserTypeRef.current) return;
        const c = map.getCenter();
        if (!c) return;
        try {
          const place = await reverseGeocode(c.lng(), c.lat());
          if (place && !cancelled) setSearchInput(place);
        } catch {
          /* ignore reverse-geocode failures */
        }
      });
    }

    init();
    return () => {
      cancelled = true;
      zoomCleanupRef.current?.();
      zoomCleanupRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter]);

  // Debounced autocomplete as the user types.
  useEffect(() => {
    if (!didUserType || !mapRef.current) return;
    const trimmed = searchInput.trim();
    if (!trimmed || /^[-+]?\d+(?:\.\d+)?,\s*[-+]?\d+(?:\.\d+)?$/.test(trimmed)) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSuggestions(await forwardGeocode(trimmed, { proximity: coords }));
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, didUserType, coords]);

  const flyTo = (lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    // Re-centre the 100 km limit on the newly picked location.
    map.setOptions({
      restriction: { latLngBounds: restrictionAround(lat, lng, MAX_RADIUS_KM), strictBounds: true },
      minZoom: minZoomForRadius(lat, MAX_RADIUS_KM),
    });
    map.panTo({ lat, lng });
    map.setZoom(16);
    setCoords({ lat, lng });
  };

  const handleSuggestionClick = async (place: Suggestion) => {
    setSearchInput(place.place_name || place.text);
    setSuggestions([]);
    setDidUserType(false);
    let center = place.center;
    if (!center) {
      try {
        const resolved = await resolvePlace(place.id);
        center = resolved?.center ?? null;
      } catch {
        center = null;
      }
    }
    if (center) flyTo(center[1], center[0]);
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
    const label = searchInput.trim() || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    onConfirm(label, { lat: coords.lat, lng: coords.lng });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex-1 sm:relative sm:inset-auto sm:z-auto sm:block">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      {/* Top search bar */}
      <div className="absolute inset-x-0 top-0 z-30 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-floating backdrop-blur">
          <button
            onClick={onClose}
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
            {suggestions.map((s, i) => (
              <li key={s.id || i}>
                <button
                  onClick={() => handleSuggestionClick(s)}
                  className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{s.text}</span>
                    {s.secondary && <span className="block truncate text-xs text-muted">{s.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
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
