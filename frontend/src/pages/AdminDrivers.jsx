import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Check, X, RefreshCw, UserCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { adminPendingDrivers, setDriverVerification } from "../lib/rides";
import { formatDate } from "../lib/format";
import { signedDocumentUrl } from "../lib/storage";
import { cn } from "../lib/cn";
import Page from "../components/layout/Page";
import PoolingMetrics from "../components/PoolingMetrics";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import { Input, Textarea } from "../components/ui/Field";

const TONE = { pending: "warning", approved: "success", rejected: "danger" };
const FILTERS = ["pending", "approved", "rejected", "all"];

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-xs">
      <dt className="text-subtle">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Driver verification console.
 *
 * The app has always had an `approved`-only gate on going online, but no way to
 * actually approve anyone — every launch required someone to hand-edit the
 * `drivers` table in the Supabase dashboard. Both actions here go through
 * `set_driver_verification()`, which is admin-gated server-side and notifies
 * the applicant either way.
 */
export default function AdminDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminPendingDrivers();
    if (error) toast.error("Couldn't load driver applications.");
    setDrivers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return drivers.filter((d) => {
      if (filter !== "all" && d.verification_status !== filter) return false;
      if (!term) return true;
      return [d.name, d.mobile, d.vehicle_registration, d.license_number]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term));
    });
  }, [drivers, filter, query]);

  /**
   * Documents are private, so verification opens a link that expires. Nothing
   * durable is handed out and nothing has to be revoked afterwards.
   */
  const openDocument = async (path) => {
    const { url, error: signErr } = await signedDocumentUrl(path);
    if (signErr || !url) return toast.error("Couldn't open that document.");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const decide = async (driver, status, why = null) => {
    setBusyId(driver.user_id);
    const { error } = await setDriverVerification(driver.user_id, status, why);
    setBusyId(null);
    if (error) {
      toast.error(error.message || "Couldn't update this application.");
      return;
    }
    toast.success(status === "approved" ? `${driver.name} approved` : `${driver.name} rejected`);
    setDrivers((prev) =>
      prev.map((d) => (d.user_id === driver.user_id ? { ...d, verification_status: status } : d))
    );
    setRejecting(null);
    setReason("");
  };

  const counts = useMemo(
    () =>
      drivers.reduce((acc, d) => {
        acc[d.verification_status] = (acc[d.verification_status] ?? 0) + 1;
        return acc;
      }, {}),
    [drivers]
  );

  return (
    <Page
      title="Driver verification"
      subtitle={`${counts.pending ?? 0} awaiting review`}
      back
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className={cn("h-[18px] w-[18px]", loading && "animate-spin")} />
        </button>
      }
    >
      <div className="mb-6">
        <PoolingMetrics />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="group" aria-label="Filter" className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                filter === f ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              {f}
              {f !== "all" && counts[f] ? ` (${counts[f]})` : ""}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, mobile or registration"
            aria-label="Search applications"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Nothing to review"
            description={
              filter === "pending"
                ? "Every application has been decided. New ones show up here."
                : "No applications match this filter."
            }
          />
        ) : (
          visible.map((d) => (
            <Card key={d.user_id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-foreground">{d.name}</h2>
                  <p className="text-xs text-muted">
                    {d.mobile} · applied {formatDate(d.created_at)}
                  </p>
                </div>
                <Badge tone={TONE[d.verification_status] ?? "neutral"}>{d.verification_status}</Badge>
              </div>

              <dl className="mt-3 divide-y divide-border">
                <Row label="Licence" value={d.license_number} />
                <Row label="Licence expiry" value={d.license_expiry ? formatDate(d.license_expiry) : null} />
                <Row label="Registration" value={d.vehicle_registration} />
                <Row label="Vehicle" value={d.vehicle_type} />
                <Row label="Service class" value={d.vehicle_class} />
              </dl>

              {/* A stored document is opened through a link that expires in a few
                  minutes; only applications predating private storage still carry
                  a permanent URL of their own. */}
              {d.document_path ? (
                <button
                  type="button"
                  onClick={() => openDocument(d.document_path)}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View licence
                </button>
              ) : d.document_url ? (
                <a
                  href={d.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View documents (external link)
                </a>
              ) : (
                <p className="mt-3 text-sm text-warning-fg">No document on this application.</p>
              )}

              {d.verification_status !== "approved" && (
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    loading={busyId === d.user_id}
                    onClick={() => decide(d, "approved")}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  {d.verification_status !== "rejected" && (
                    <Button size="sm" variant="danger" onClick={() => setRejecting(d)}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  )}
                </div>
              )}
              {d.verification_status === "approved" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  loading={busyId === d.user_id}
                  onClick={() => decide(d, "pending")}
                >
                  Move back to pending
                </Button>
              )}
            </Card>
          ))
        )}
      </div>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.name ?? "application"}?`}
        description="They'll be told why and can fix it and reapply."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={!reason.trim()}
              loading={busyId === rejecting?.user_id}
              onClick={() => decide(rejecting, "rejected", reason.trim())}
            >
              Reject
            </Button>
          </div>
        }
      >
        <Textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The licence photo is unreadable — please upload a clearer scan."
          aria-label="Rejection reason"
          maxLength={300}
        />
      </Modal>
    </Page>
  );
}
