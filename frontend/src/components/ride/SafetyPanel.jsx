import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Share2, PhoneCall, Siren, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  EMERGENCY_NUMBERS,
  createTripShare,
  raiseSos,
  shareTripLink,
} from "../../lib/safety";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

/**
 * Safety toolkit for a live ride: share the trip, call for help, raise an SOS.
 *
 * The share link is a server-issued capability token that expires — it exposes
 * status, route and the driver's live position, and deliberately nothing else
 * (no phone numbers, no fare, no rider identity).
 */
export default function SafetyPanel({ rideId, currentLocation, className }) {
  const [open, setOpen] = useState(false);
  const [confirmSos, setConfirmSos] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    setBusy(true);
    const { url, error } = await createTripShare(rideId);
    setBusy(false);
    if (error || !url) {
      toast.error("Couldn't create a share link.");
      return;
    }
    setShareUrl(url);
    const how = await shareTripLink(url);
    if (how === "copied") {
      setCopied(true);
      toast.success("Trip link copied — send it to someone you trust.");
      setTimeout(() => setCopied(false), 2500);
    } else if (how === "failed") {
      toast.message("Copy the link below and send it to someone you trust.");
    }
  };

  const handleSos = async () => {
    setBusy(true);
    const { error } = await raiseSos({
      rideId,
      lat: currentLocation?.lat ?? null,
      lng: currentLocation?.lng ?? null,
    });
    setBusy(false);
    setConfirmSos(false);
    if (error) {
      toast.error("Couldn't send the alert. Call 112 directly.");
      return;
    }
    toast.success("Alert raised. Your emergency contacts can see this trip.");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label="Safety options"
      >
        <ShieldCheck className="h-5 w-5" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Safety"
        description="Share your trip or get help fast."
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
              {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Share live trip</span>
              <span className="block text-xs text-muted">
                A link that shows your route and driver, expiring in 6 hours
              </span>
            </span>
          </button>

          {shareUrl && (
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2.5">
              <code className="min-w-0 flex-1 truncate text-xs text-muted">{shareUrl}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  toast.success("Link copied");
                  setTimeout(() => setCopied(false), 2500);
                }}
                aria-label="Copy share link"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="pt-2">
            <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Emergency numbers
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EMERGENCY_NUMBERS.map(({ label, number }) => (
                <a
                  key={number}
                  href={`tel:${number}`}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PhoneCall className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted">{number}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmSos(true)}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border-2 border-danger bg-danger-subtle p-3.5 text-left transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger text-white">
              <Siren className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-danger-fg">Raise an SOS</span>
              <span className="block text-xs text-danger-fg/80">
                Records your location and alerts your ride partner
              </span>
            </span>
          </button>

          <p className="pt-2 text-center text-xs text-muted">
            <Link to="/account/safety" className="font-medium text-primary hover:underline">
              Manage emergency contacts
            </Link>
          </p>
        </div>
      </Modal>

      <Modal
        open={confirmSos}
        onClose={() => setConfirmSos(false)}
        title="Raise an emergency alert?"
        description="Use this only if you feel unsafe."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirmSos(false)} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" fullWidth loading={busy} onClick={handleSos}>
              Raise SOS
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          We&apos;ll record your current location against this trip and notify the other person that
          an alert was raised. For an immediate emergency, call{" "}
          <a href="tel:112" className="font-semibold text-primary hover:underline">
            112
          </a>{" "}
          as well.
        </p>
      </Modal>
    </>
  );
}
