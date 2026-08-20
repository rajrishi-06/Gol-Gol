import { useState } from "react";
import { Users, Sparkles, Clock, Ban, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { blockCoPassenger, issueDropOtp } from "../../lib/pooling";
import { formatDuration } from "../../lib/format";
import Card from "../ui/Card";

/**
 * What a rider is told about sharing.
 *
 * Two obligations live here. The detour has to be shown as a number — a
 * promise nobody displays is not a promise, and the breach rate against it is
 * the metric that decides whether riders keep the toggle on. And co-passengers
 * are shown as a first name and a rating only: the stop sequence would
 * otherwise tell a stranger where another rider lives.
 */
export default function SharedRideBanner({ context, rideId }) {
  const [dropCode, setDropCode] = useState(null);
  const [blocked, setBlocked] = useState(() => new Set());

  if (!context) return null;
  const mates = context.co_passengers ?? [];

  const block = async (mate) => {
    if (!mate.user_id) return;
    const { error } = await blockCoPassenger(mate.user_id);
    if (error) {
      toast.error("Couldn't save that.");
      return;
    }
    setBlocked((prev) => new Set(prev).add(mate.user_id));
    toast.success(`You won't be matched with ${mate.name} again`);
  };

  const showDropCode = async () => {
    const { data, error } = await issueDropOtp(rideId);
    if (error || !data) {
      toast.error("Couldn't get your code.");
      return;
    }
    setDropCode(data);
  };
  if (!context.pooled && !context.shareable) return null;

  if (!context.pooled) {
    return (
      <Card className="flex items-start gap-2.5 p-3.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-muted">
          You&apos;re open to sharing. If we match someone going your way, you&apos;ll get
          money back automatically — nothing changes if we don&apos;t.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40 bg-primary/5 p-3.5">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Users className="h-4 w-4 text-primary" />
        Sharing this ride
      </p>

      {context.promised_detour_min > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Arrives up to {formatDuration(context.promised_detour_min)} later than travelling
          alone. Longer than that and we credit you back automatically.
        </p>
      )}

      {mates.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {mates.map((m, i) => (
            <li
              key={`${m.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs"
            >
              <span className="font-medium text-foreground">{m.name}</span>
              <span className="text-subtle">★ {m.rating}</span>
              {m.aboard && <span className="text-primary">· aboard</span>}
              {/* Opt-out that sticks: reporting someone should mean never
                  sharing with them again, not just this once. */}
              {m.user_id && !blocked.has(m.user_id) && (
                <button
                  type="button"
                  onClick={() => block(m)}
                  aria-label={`Never match me with ${m.name} again`}
                  className="ml-0.5 rounded-full p-0.5 text-subtle transition-colors hover:bg-danger-subtle hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Ban className="h-3 w-3" />
                </button>
              )}
              {m.user_id && blocked.has(m.user_id) && (
                <span className="text-danger">· blocked</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Getting out of a shared vehicle needs a code, so a driver cannot close
          the wrong booking when several are aboard. */}
      {context.pooled && rideId && (
        <div className="mt-3 border-t border-border pt-3">
          {dropCode ? (
            <p className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-muted">Show your driver</span>
              <span className="font-mono text-lg font-semibold tracking-[0.3em] text-foreground">
                {dropCode}
              </span>
            </p>
          ) : (
            <button
              type="button"
              onClick={showDropCode}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Get my drop-off code
            </button>
          )}
        </div>
      )}

      {context.stops_before_drop > 0 && (
        <p className="mt-2 text-xs text-subtle">
          {context.stops_before_drop} stop{context.stops_before_drop === 1 ? "" : "s"} before yours.
        </p>
      )}
    </Card>
  );
}
