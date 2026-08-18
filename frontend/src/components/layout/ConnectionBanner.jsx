import { CloudOff, RefreshCw } from "lucide-react";
import { useConnection } from "../../lib/connection.jsx";
import { cn } from "../../lib/cn";

/**
 * Honest connection state. A ride-hailing app that silently stops receiving
 * updates is worse than one that says so: the rider needs to know whether the
 * driver marker is live or frozen.
 */
export default function ConnectionBanner() {
  const { isOffline, isConnecting } = useConnection();
  if (!isOffline && !isConnecting) return null;

  const offline = isOffline;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium",
        offline ? "bg-danger-subtle text-danger-fg" : "bg-warning-subtle text-warning-fg"
      )}
    >
      {offline ? (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          You&apos;re offline — live updates are paused
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Reconnecting to live updates…
        </>
      )}
    </div>
  );
}
