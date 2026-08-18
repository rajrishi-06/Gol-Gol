import { useState } from "react";
import { toast } from "sonner";
import { submitRating } from "../../lib/rides";
import { RATING_TAGS } from "../../lib/rideStatus";
import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import StarRating from "../ui/StarRating";
import Avatar from "../ui/Avatar";
import { Textarea } from "../ui/Field";

const TIPS = [0, 20, 50, 100];

const HEADLINE = {
  5: "Brilliant — what stood out?",
  4: "Good trip. Anything to add?",
  3: "Just okay. What let it down?",
  2: "Sorry about that. What went wrong?",
  1: "That's not good enough. Tell us what happened.",
};

/**
 * Post-trip rating. `users.user_rating` was displayed everywhere but never
 * written by anything, so every account sat at a permanent 5 stars; a DB
 * trigger now recomputes the average from these submissions.
 */
export default function RatingSheet({ open, onClose, ride, role = "rider", counterpartName, onSubmitted }) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState(0);
  const [busy, setBusy] = useState(false);

  const tagOptions = RATING_TAGS[role === "driver" ? "driver" : "rider"];
  const canTip = role === "rider";

  const toggleTag = (tag) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const submit = async () => {
    if (!ride || !stars) return;
    setBusy(true);
    const { error } = await submitRating({
      rideId: ride.id,
      stars,
      comment: comment.trim() || null,
      tags,
      tip: canTip ? tip : 0,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your rating. Please try again.");
      return;
    }
    toast.success(tip > 0 ? `Thanks! ${formatCurrency(tip)} tip added.` : "Thanks for the feedback.");
    onClose?.();
    onSubmitted?.({ stars, tip });
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`Rate your ${role === "driver" ? "rider" : "driver"}`}
      description={counterpartName ? `How was your trip with ${counterpartName}?` : undefined}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={onClose} disabled={busy}>
            Skip
          </Button>
          <Button fullWidth loading={busy} disabled={!stars} onClick={submit}>
            Submit
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center">
        <Avatar name={counterpartName} size="lg" />
        <p className="mt-3 font-semibold text-foreground">{counterpartName || "Your ride partner"}</p>
        <StarRating value={stars} onChange={setStars} size="lg" className="mt-3" label="Trip rating" />
        {stars > 0 && <p className="mt-2 text-sm text-muted">{HEADLINE[stars]}</p>}
      </div>

      {stars > 0 && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {tagOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  tags.includes(tag)
                    ? "border-primary bg-primary-subtle text-primary-subtle-fg"
                    : "border-border bg-surface text-muted hover:text-foreground"
                )}
              >
                {tag}
              </button>
            ))}
          </div>

          <Textarea
            className="mt-4"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a note (optional)"
            aria-label="Comment"
            maxLength={400}
          />

          {canTip && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground">Add a tip</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {TIPS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={tip === amount}
                    onClick={() => setTip(amount)}
                    className={cn(
                      "rounded-xl border py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      tip === amount
                        ? "border-primary bg-primary-subtle text-primary-subtle-fg"
                        : "border-border bg-surface text-muted hover:text-foreground"
                    )}
                  >
                    {amount === 0 ? "None" : formatCurrency(amount)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
