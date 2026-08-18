import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cancelRide } from "../../lib/rides";
import { CANCEL_REASONS } from "../../lib/rideStatus";
import { formatCurrency } from "../../lib/format";
import { notifyUser } from "../../lib/notify";
import { cn } from "../../lib/cn";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Textarea } from "../ui/Field";

/**
 * Cancelling used to hard-delete the ride row, which erased any record that the
 * trip was ever attempted. It's now a real state change with a reason and an
 * actor, so support can see what happened and the fee policy has something to
 * work from.
 */
export default function CancelRideDialog({ open, onClose, ride, role = "rider", onCancelled }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reasons = CANCEL_REASONS[role === "driver" ? "driver" : "rider"];

  // Mirrors cancel_ride(): the rider pays only if a driver already committed
  // and more than two minutes have passed.
  const feeApplies =
    role === "rider" &&
    ride?.accepted_at &&
    Date.now() - new Date(ride.accepted_at).getTime() > 2 * 60 * 1000;

  const submit = async () => {
    if (!ride) return;
    setBusy(true);
    const text = [reason, note.trim()].filter(Boolean).join(" — ");
    const { data, error } = await cancelRide(ride.id, text || null);
    setBusy(false);

    if (error) {
      toast.error(error.message || "Couldn't cancel this ride. Please try again.");
      return;
    }

    const counterpart = role === "rider" ? ride.driver_id : ride.rider_id;
    if (counterpart) {
      notifyUser({
        userId: counterpart,
        title: "Ride cancelled",
        body: text || `The ${role} cancelled this ride.`,
        url: role === "rider" ? "/driver/dashboard" : "/",
        type: "ride_cancelled",
      });
    }

    const fee = Number(data?.cancellation_fee) || 0;
    toast.success(fee > 0 ? `Ride cancelled · ${formatCurrency(fee)} fee applied` : "Ride cancelled");
    onClose?.();
    onCancelled?.(data);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Cancel this ride?"
      description="Tell us why so we can improve matching."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
            Keep ride
          </Button>
          <Button variant="danger" fullWidth loading={busy} disabled={!reason} onClick={submit}>
            Cancel ride
          </Button>
        </div>
      }
    >
      {feeApplies && (
        <div className="mb-4 flex gap-2.5 rounded-xl bg-warning-subtle p-3 text-sm text-warning-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Your driver is already on the way, so a {formatCurrency(30)} cancellation fee applies.
          </p>
        </div>
      )}

      <fieldset>
        <legend className="sr-only">Reason for cancelling</legend>
        <div className="space-y-2">
          {reasons.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                reason === r
                  ? "border-primary bg-primary-subtle text-foreground"
                  : "border-border bg-surface hover:bg-surface-2"
              )}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <Textarea
        className="mt-3"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything else? (optional)"
        aria-label="Additional details"
        maxLength={280}
      />
    </Modal>
  );
}
