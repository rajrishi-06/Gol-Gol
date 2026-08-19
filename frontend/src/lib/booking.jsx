import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * The trip the user is composing: endpoints, timing, payment and the chosen
 * ride class.
 *
 * This used to live as five `useState`s in `App` threaded through props, with
 * the selected ride passed via `location.state` — so a refresh (or a deep link)
 * on the booking screen dropped everything and rendered "Calculating trip
 * details…" forever. Now it's one context, mirrored into sessionStorage.
 */

const BookingContext = createContext(null);
const KEY = "golgol:booking";

const EMPTY = {
  from: "",
  to: "",
  fromCords: null,
  toCords: null,
  when: "Now",
  scheduledFor: null,
  paymentMethod: "cash",
  pickupNotes: "",
  vehicleType: null,
};

// The carpool a rider is previewing on the map. Kept out of the persisted trip
// because it's a transient view, not part of the booking.
const PREVIEW_EMPTY = null;

function readStored() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch {
    return EMPTY;
  }
}

export function BookingProvider({ children }) {
  const [trip, setTrip] = useState(readStored);
  const [previewRide, setPreviewRide] = useState(PREVIEW_EMPTY);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(trip));
    } catch {
      /* private mode — in-memory state still works */
    }
  }, [trip]);

  const patch = useCallback((next) => setTrip((prev) => ({ ...prev, ...next })), []);

  const setPickup = useCallback(
    (address, coords) => patch({ from: address ?? "", fromCords: coords ?? null }),
    [patch]
  );
  const setDrop = useCallback(
    (address, coords) => patch({ to: address ?? "", toCords: coords ?? null }),
    [patch]
  );

  const swap = useCallback(
    () =>
      setTrip((prev) => ({
        ...prev,
        from: prev.to,
        to: prev.from,
        fromCords: prev.toCords,
        toCords: prev.fromCords,
      })),
    []
  );

  const reset = useCallback(() => {
    setTrip(EMPTY);
    setPreviewRide(PREVIEW_EMPTY);
  }, []);

  const value = useMemo(
    () => ({ ...trip, previewRide, setPreviewRide, patch, setPickup, setDrop, swap, reset }),
    [trip, previewRide, patch, setPickup, setDrop, swap, reset]
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}
