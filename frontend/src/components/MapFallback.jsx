import { MapPinOff } from "lucide-react";
import { cn } from "../lib/cn";

/**
 * Shown when Google Maps can't load — a bad or restricted key, an ad blocker,
 * a quota trip, or simply no network.
 *
 * Previously every map component awaited the loader inside an uncaught async
 * IIFE, so a failure surfaced as an unhandled rejection and left the user
 * staring at a blank grey rectangle with no explanation. The ride itself never
 * depended on the map rendering, and now the UI says so.
 */
export default function MapFallback({ className, message }) {
  return (
    <div
      role="status"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-2 px-6 text-center",
        className
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-subtle shadow-soft">
        <MapPinOff className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-foreground">Map unavailable</p>
      <p className="max-w-xs text-xs text-muted">
        {message ?? "We couldn't load the map. Everything else on this screen still works."}
      </p>
    </div>
  );
}
