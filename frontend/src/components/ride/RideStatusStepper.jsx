import { Check, Circle, Loader2, XCircle } from "lucide-react";
import { RIDE_FLOW, statusCopy, statusLabel } from "../../lib/rideStatus";
import { formatTime } from "../../lib/format";
import { cn } from "../../lib/cn";

const STEP_LABEL = {
  pending: "Requested",
  accepted: "Driver assigned",
  arrived: "Driver arrived",
  ongoing: "On the way",
  completed: "Arrived",
};

const STEP_TIME_FIELD = {
  pending: "created_at",
  accepted: "accepted_at",
  arrived: "arrived_at",
  ongoing: "started_at",
  completed: "completed_at",
};

/**
 * Live ride progress.
 *
 * Both people on a ride read the same timeline, built from the server's
 * lifecycle timestamps rather than from whatever the local screen last heard —
 * so a rider who backgrounds their phone during a trip comes back to the truth,
 * not to a frozen "Driver on the way".
 */
export default function RideStatusStepper({ ride, role = "rider", className }) {
  if (!ride) return null;

  const failed = ride.status === "cancelled" || ride.status === "expired";
  const currentIndex = RIDE_FLOW.indexOf(ride.status);
  const copy = statusCopy(ride.status, role);

  if (failed) {
    return (
      <div className={cn("rounded-2xl border border-border bg-surface p-4 shadow-soft", className)}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger-subtle text-danger-fg">
            <XCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{copy.title}</p>
            <p className="mt-0.5 text-sm text-muted">
              {ride.cancellation_reason || copy.detail}
            </p>
            {ride.cancelled_at && (
              <p className="mt-1 text-xs text-subtle">{formatTime(ride.cancelled_at)}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-2xl border border-border bg-surface p-4 shadow-soft", className)}
      role="group"
      aria-label="Ride progress"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-foreground">{copy.title}</p>
        <p className="shrink-0 text-xs font-medium text-primary" aria-live="polite">
          {statusLabel(ride.status)}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-muted">{copy.detail}</p>

      <ol className="mt-4 space-y-0">
        {RIDE_FLOW.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const at = ride[STEP_TIME_FIELD[step]];
          const last = i === RIDE_FLOW.length - 1;

          return (
            <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-0.5 rounded-full transition-colors",
                    done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  done && "border-primary bg-primary text-primary-fg",
                  active && "border-primary bg-surface text-primary",
                  !done && !active && "border-border bg-surface text-subtle"
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Circle className="h-2 w-2 fill-current" />
                )}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span
                  className={cn(
                    "block text-sm",
                    active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-subtle"
                  )}
                >
                  {STEP_LABEL[step]}
                </span>
                {at && <span className="block text-xs text-muted">{formatTime(at)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
