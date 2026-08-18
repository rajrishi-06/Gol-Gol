import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search, LocateFixed, Loader2 } from "lucide-react";
import { forwardGeocode, resolvePlace, reverseGeocode } from "../lib/geocoding";
import { cn } from "../lib/cn";

/**
 * Address search with Places autocomplete.
 *
 * Suggestions are debounced and coordinates are resolved lazily — Google's
 * autocomplete doesn't return a location, so a Place Details call happens once,
 * on selection, rather than on every keystroke.
 *
 * Fully keyboard-operable as an ARIA combobox, which the map picker's
 * suggestion list was not.
 */
export default function PlaceSearch({
  value = "",
  onSelect,
  placeholder = "Search for a place",
  proximity,
  autoFocus = false,
  showUseMyLocation = true,
  className,
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const wrapRef = useRef(null);
  const listId = useId();

  useEffect(() => setQuery(value), [value]);

  // Debounced lookup.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const results = await forwardGeocode(term, { proximity });
        if (!cancelled) {
          setSuggestions(results);
          setOpen(results.length > 0);
          setHighlight(-1);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, proximity]);

  // Dismiss on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const choose = async (suggestion) => {
    setOpen(false);
    setBusy(true);
    try {
      const place = await resolvePlace(suggestion.id);
      if (!place) return;
      const [lng, lat] = place.center;
      const label = place.place_name || suggestion.place_name || suggestion.text;
      setQuery(label);
      onSelect?.({ address: label, lat, lng });
    } catch {
      /* keep the typed text; the user can try another suggestion */
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          address = (await reverseGeocode(lng, lat)) || address;
        } catch {
          /* coordinates are a fine fallback */
        }
        setQuery(address);
        onSelect?.({ address, lat, lng });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onKeyDown = (e) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      choose(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <Search className="h-4 w-4 shrink-0 text-subtle" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-11 flex-1 bg-transparent text-sm text-foreground placeholder:text-subtle focus:outline-none"
        />
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-subtle" />}
        {showUseMyLocation && (
          <button
            type="button"
            onClick={useMyLocation}
            aria-label="Use my current location"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="animate-scale-in absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-floating"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={highlight === i}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(s)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                  highlight === i ? "bg-surface-2" : "hover:bg-surface-2"
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{s.text}</span>
                  {s.secondary && (
                    <span className="block truncate text-xs text-muted">{s.secondary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
