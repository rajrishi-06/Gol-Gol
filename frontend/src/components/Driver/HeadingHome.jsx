import { useState } from "react";
import { Home, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth.jsx";
import Card from "../ui/Card";
import Button from "../ui/Button";
import PlaceSearch from "../PlaceSearch";

/**
 * "I'm heading home — take someone going my way."
 *
 * This is the state that makes one-account-two-modes worth anything. A driver
 * on shift takes whatever dispatch sends; someone on their way home will take a
 * passenger only if it does not send them somewhere else. Declaring the
 * destination turns the corridor test on their own route, so every offer is one
 * that gets them home.
 */
export default function HeadingHome({ onChange }) {
  const { mode, setMode } = useAuth();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = mode === "heading_home";

  const start = async (place) => {
    if (!place?.lat || !place?.lng) return;
    setBusy(true);
    const { error } = await setMode("heading_home", { lat: place.lat, lng: place.lng });
    setBusy(false);
    setPicking(false);
    if (error) {
      toast.error(error.message || "Couldn't set your destination.");
      return;
    }
    toast.success("Heading home — we'll only offer rides on your way");
    onChange?.();
  };

  const stop = async () => {
    setBusy(true);
    const { error } = await setMode("available");
    setBusy(false);
    if (error) {
      toast.error(error.message || "Couldn't switch back.");
      return;
    }
    toast("Back on normal dispatch");
    onChange?.();
  };

  if (active) {
    return (
      <Card className="flex items-center gap-3 border-primary/40 bg-primary/5 p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
          <Home className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">Heading home</span>
          <span className="block text-xs text-muted">
            Only rides that keep you on your way will be offered.
          </span>
        </span>
        <Button variant="ghost" size="sm" loading={busy} onClick={stop} aria-label="Stop heading home">
          <X className="h-4 w-4" />
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-3.5">
      {picking ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Where are you headed?</p>
          <PlaceSearch onSelect={start} placeholder="Your destination" autoFocus />
          <Button variant="ghost" size="sm" fullWidth onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
            <Home className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Last ride of the day?</span>
            <span className="block text-xs text-muted">
              Tell us where you&apos;re headed and we&apos;ll only offer rides on the way.
            </span>
          </span>
        </button>
      )}
    </Card>
  );
}
