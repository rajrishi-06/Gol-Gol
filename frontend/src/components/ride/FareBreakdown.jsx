import { formatCurrency, formatDistance } from "../../lib/format";
import { paymentLabel } from "../../lib/payments";
import Badge from "../ui/Badge";

function Row({ label, value, strong = false, muted = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={strong ? "font-semibold text-foreground" : muted ? "text-subtle" : "text-muted"}>
        {label}
      </dt>
      <dd className={strong ? "text-lg font-bold text-foreground" : "font-medium text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

const STATUS_TONE = {
  paid: "success",
  pending: "warning",
  failed: "danger",
  refunded: "neutral",
  waived: "neutral",
};

/**
 * The receipt. Works from a settled `payments` row when there is one, and falls
 * back to the estimate on the ride so a trip in progress still shows a fare.
 */
export default function FareBreakdown({ ride, payment, title = "Fare breakdown" }) {
  if (!ride) return null;

  const settled = Boolean(payment);
  const total = Number(payment?.amount ?? ride.final_fare ?? ride.fare ?? 0);
  const status = payment?.status ?? ride.payment_status ?? "pending";

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge tone={STATUS_TONE[status] ?? "neutral"}>
          {status === "waived" ? "No charge" : status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      <dl className="mt-3 space-y-0.5 text-sm">
        {settled ? (
          <>
            <Row label="Base fare" value={formatCurrency(payment.base_fare)} />
            <Row
              label={`Distance · ${formatDistance(ride.distance_km)}`}
              value={formatCurrency(payment.distance_fare)}
            />
            {Number(payment.surge_amount) > 0 && (
              <Row label="Peak pricing" value={formatCurrency(payment.surge_amount)} />
            )}
            {Number(payment.waiting_fee) > 0 && (
              <Row label="Waiting time" value={formatCurrency(payment.waiting_fee)} />
            )}
            {Number(payment.cancellation_fee) > 0 && (
              <Row label="Cancellation fee" value={formatCurrency(payment.cancellation_fee)} />
            )}
            {Number(payment.tip_amount) > 0 && (
              <Row label="Tip" value={formatCurrency(payment.tip_amount)} />
            )}
          </>
        ) : (
          <>
            <Row label="Estimated fare" value={formatCurrency(ride.fare)} />
            <Row label="Distance" value={formatDistance(ride.distance_km)} muted />
          </>
        )}
      </dl>

      <div className="mt-3 border-t border-border pt-3">
        <Row label="Total" value={formatCurrency(total)} strong />
        <p className="mt-1 text-xs text-subtle">
          Paid by {paymentLabel(payment?.method ?? ride.payment_method)}
          {!settled && " · estimate, tolls and surcharges may apply"}
        </p>
      </div>
    </section>
  );
}
