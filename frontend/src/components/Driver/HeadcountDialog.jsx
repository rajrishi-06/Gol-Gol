import { useState } from "react";
import { Users, AlertTriangle } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import { fareForSeats } from "../../lib/pooling";
import { cn } from "../../lib/cn";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";

/**
 * How many people actually got in.
 *
 * This is the number the fare settles on. It defaults to what the rider booked
 * — the common case — but the driver can only ever raise it to the seats the
 * vehicle still has, because the count immediately consumes capacity and the
 * server re-checks every downstream stop against it.
 *
 * Lowering it is deliberately not offered: seats a rider booked are theirs
 * whether or not they filled them, and silently reselling a paid seat is the
 * bug that ends this feature. Releasing a seat is an amendment the rider makes,
 * with a partial refund attached.
 */
export default function HeadcountDialog({ open, onClose, ride, seatsFree, onConfirm, busy }) {
  const booked = ride?.seats ?? 1;
  const ceiling = Math.max(booked, booked + (seatsFree ?? 0));
  const [count, setCount] = useState(booked);

  if (!ride) return null;

  const oneSeat = Math.round((Number(ride.fare) || 0) / (1 + (booked - 1) * 0.4));
  const options = Array.from({ length: ceiling }, (_, i) => i + 1);
  const extra = count - booked;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How many passengers?"
      description={`${ride.rider_name ?? "Your rider"} booked ${booked} seat${booked > 1 ? "s" : ""}.`}
    >
      <div className="space-y-4">
        <div role="group" aria-label="Passenger count" className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              disabled={n < booked}
              onClick={() => setCount(n)}
              className={cn(
                "flex-1 rounded-lg py-3 text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30",
                count === n ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
          <span className="text-muted">Fare for this booking</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(fareForSeats(oneSeat, count))}
          </span>
        </div>

        {extra > 0 && (
          <Alert tone="warning" title={`${extra} extra passenger${extra > 1 ? "s" : ""}`}>
            <span className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This uses {extra} more seat{extra > 1 ? "s" : ""}. If that leaves no room for
              someone already accepted, we&apos;ll find them another ride at no cost to them.
            </span>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button fullWidth loading={busy} onClick={() => onConfirm(count)}>
            <Users className="h-4 w-4" />
            Start with {count}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
