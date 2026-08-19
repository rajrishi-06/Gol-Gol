import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon, ArrowUpRight, AlertCircle, IndianRupee } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { formatCurrency, formatDate } from "../lib/format";
import { paymentLabel } from "../lib/payments";
import PaymentMethodPicker from "../components/ride/PaymentMethodPicker";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

const TONE = { paid: "success", pending: "warning", failed: "danger", refunded: "neutral", waived: "neutral" };

/**
 * The rider's money view: what's owed, what's been paid, and the default
 * payment method for the next booking.
 */
export default function Wallet() {
  const { userId, settings, updateSettings, isApprovedDriver } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState(settings?.default_payment_method ?? "cash");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select("*, rides(from_address, to_address, vehicle_type, status)")
      .eq("payer_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setPayments(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const outstanding = payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const spent = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const chooseMethod = async (next) => {
    setMethod(next);
    // Persisted as a rider preference; the booking screen reads it as the
    // default and can still be overridden per trip.
    await updateSettings({ default_payment_method: next }).catch(() => {});
  };

  return (
    <Page
      title="Wallet"
      subtitle="Payments, receipts and how you pay"
      actions={
        isApprovedDriver && (
          <Button as={Link} to="/driver/earnings" variant="ghost" size="sm" aria-label="Driver earnings">
            <IndianRupee className="h-4 w-4" />
            <span className="hidden sm:inline">Earnings</span>
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted">Spent (last 30)</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(spent)}</p>
          </Card>
          <Card className={outstanding > 0 ? "border-warning p-4" : "p-4"}>
            <p className="text-xs text-muted">Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(outstanding)}</p>
          </Card>
        </div>

        {outstanding > 0 && (
          <div className="flex gap-2.5 rounded-xl bg-warning-subtle p-3.5 text-sm text-warning-fg">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You have {formatCurrency(outstanding)} pending. Settle it with your driver on your next
              trip — outstanding amounts are collected at the end of a ride.
            </p>
          </div>
        )}

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">Default payment method</h2>
          <p className="mt-0.5 text-xs text-muted">Used for new bookings. You can change it per trip.</p>
          <PaymentMethodPicker value={method} onChange={chooseMethod} className="mt-3" />
        </Card>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Recent payments</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={WalletIcon}
              title="No payments yet"
              description="Receipts appear here once you complete a trip."
            />
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <Card key={p.id} className="p-3.5">
                  <Link
                    to={`/activity/${p.ride_id}`}
                    className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.rides?.to_address || "Trip"}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDate(p.created_at)} · {paymentLabel(p.method)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-foreground">
                        {formatCurrency(p.amount)}
                      </span>
                      <Badge tone={TONE[p.status] ?? "neutral"} className="mt-1">
                        {p.status}
                      </Badge>
                    </span>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
