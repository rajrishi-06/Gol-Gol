import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useActiveRide } from "../../lib/activeRide.jsx";
import { statusCopy, statusLabel } from "../../lib/rideStatus";
import { formatDuration } from "../../lib/format";

/**
 * Persistent "you have a ride in progress" strip.
 *
 * Sits directly above the tab bar on every screen so a rider who wandered off
 * to check their trip history is always one tap from the live map — previously
 * the only route back was the browser's back button.
 */
export default function ActiveRideBar() {
  const { ride, role, path } = useActiveRide();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Don't shadow the ride screen itself.
  if (!ride || !path || pathname === path) return null;

  const copy = statusCopy(ride.status, role);

  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className="animate-fade-up z-30 flex shrink-0 items-center gap-3 border-t border-primary/25 bg-primary px-4 py-2.5 text-left text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{copy.title}</span>
        <span className="block truncate text-xs text-primary-fg/80">
          {ride.to_address || statusLabel(ride.status)}
        </span>
      </span>

      {ride.eta_minutes != null && (
        <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
          {formatDuration(ride.eta_minutes)}
        </span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0" />
    </button>
  );
}
