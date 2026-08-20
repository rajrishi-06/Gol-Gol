import { Users, ShieldCheck } from "lucide-react";
import { maxSeatsFor, canShare, fareForSeats } from "../../lib/pooling";
import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import Switch from "../ui/Switch";

/**
 * How many seats, and whether the rider is open to sharing them.
 *
 * The sharing toggle is the consent gate for pooling: a driver may only take a
 * second booking when everyone already aboard has it set. Making it a
 * per-booking flag rather than a separate ride class is what keeps poolable
 * supply liquid — a discounted "Share" class only ever contains the people who
 * deliberately sought it out, so matches rarely land and the class dies.
 *
 * The rebate is paid on match, not on opt-in, so it costs nothing on the rides
 * that never find a co-passenger.
 */
export default function SeatPicker({
  vehicleType,
  seats,
  onSeatsChange,
  shareable,
  onShareableChange,
  oneSeatFare,
  discountPct = 20,
  // Only offered to riders who have said they are women — otherwise the
  // control is a way to filter other people by gender, which is the opposite
  // of a safety feature. The server enforces the same rule regardless.
  canRequestWomenOnly = false,
  womenOnly = false,
  onWomenOnlyChange,
}) {
  const capacity = maxSeatsFor(vehicleType);
  const shareAllowed = canShare(vehicleType);

  if (capacity <= 1) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-xs text-muted">
        <Users className="h-4 w-4 shrink-0" />
        A bike carries one passenger.
      </p>
    );
  }

  const options = Array.from({ length: capacity }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
          <Users className="h-3.5 w-3.5" /> Passengers
        </legend>
        <div className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={seats === n}
              onClick={() => onSeatsChange(n)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                seats === n ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {seats > 1 && oneSeatFare != null && (
          <p className="mt-1.5 text-xs text-subtle">
            {formatCurrency(fareForSeats(oneSeatFare, seats))} for {seats} seats
            {" · "}
            {formatCurrency(oneSeatFare)} for one
          </p>
        )}
      </fieldset>

      {shareAllowed && (
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <Switch
            checked={shareable}
            onChange={onShareableChange}
            label="Open to sharing"
            description={`We may pick up one more passenger going your way. Get ${discountPct}% back if we match you — you pay full fare if we don't.`}
          />
        </div>
      )}

      {shareAllowed && shareable && canRequestWomenOnly && (
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <Switch
            checked={womenOnly}
            onChange={onWomenOnlyChange}
            label="Share with women only"
            description="We'll only match you with other women. Fewer matches, so it may take longer to find one."
          />
          <p className="mt-2 flex items-start gap-1.5 text-[0.7rem] text-subtle">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
            Checked on our side when a driver is offered your ride — not filtered
            on your phone.
          </p>
        </div>
      )}

    </div>
  );
}
