import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IndianRupee, TrendingUp, Route as RouteIcon, HandCoins, Receipt } from "lucide-react";
import { earningsDaily, earningsSummary } from "../lib/rides";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { formatCurrency, formatDate, formatDistance } from "../lib/format";
import { cn } from "../lib/cn";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

const RANGES = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "This week", days: 7 },
  { id: "month", label: "30 days", days: 30 },
];

function startOf(days) {
  const d = new Date();
  if (days === 1) d.setHours(0, 0, 0, 0);
  else d.setTime(d.getTime() - days * 864e5);
  return d.toISOString();
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </Card>
  );
}

/** Simple, dependency-free daily payout bars. */
function EarningsChart({ rows }) {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => Number(r.payout) || 0)), [rows]);
  if (!rows.length) return null;

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-foreground">Daily payout</h2>
      <div className="mt-4 flex h-32 items-end gap-1.5" role="img" aria-label="Daily payout for the last two weeks">
        {rows.map((r) => {
          const value = Number(r.payout) || 0;
          const pct = Math.max(3, Math.round((value / max) * 100));
          return (
            <div key={r.day} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[0.6rem] font-medium text-muted opacity-0 transition-opacity group-hover:opacity-100">
                {formatCurrency(value)}
              </span>
              <div
                className={cn(
                  "w-full rounded-t-md bg-primary transition-all duration-300",
                  value === 0 && "bg-border"
                )}
                style={{ height: `${pct}%` }}
                title={`${formatDate(r.day)} · ${formatCurrency(value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[0.65rem] text-subtle">
        <span>{rows.length ? formatDate(rows[0].day) : ""}</span>
        <span>{rows.length ? formatDate(rows[rows.length - 1].day) : ""}</span>
      </div>
    </Card>
  );
}

/**
 * Driver earnings — trips, gross, payout after platform fee, tips and distance,
 * with a per-trip breakdown. Drivers previously had no way to see what they'd
 * made at all.
 */
export default function Earnings() {
  const { userId } = useAuth();
  const [range, setRange] = useState("week");
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const days = RANGES.find((r) => r.id === range)?.days ?? 7;
    const from = startOf(days);

    const [{ data: sum }, { data: chart }, { data: rows }] = await Promise.all([
      earningsSummary({ from }),
      earningsDaily(14),
      supabase
        .from("payments")
        .select("*, rides(from_address, to_address, distance_km, completed_at)")
        .eq("payee_id", userId)
        .gte("created_at", from)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    setSummary(Array.isArray(sum) ? sum[0] ?? null : sum ?? null);
    setDaily(chart ?? []);
    setTrips(rows ?? []);
    setLoading(false);
  }, [userId, range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Page
      title="Earnings"
      subtitle="What you've made and where it came from"
      actions={
        <Button as={Link} to="/driver/trips" variant="ghost" size="sm">
          <Receipt className="h-4 w-4" />
          <span className="hidden sm:inline">Trips</span>
        </Button>
      }
    >
      <div role="group" aria-label="Date range" className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={range === r.id}
            onClick={() => setRange(r.id)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              range === r.id ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric
              icon={IndianRupee}
              label="Your payout"
              value={formatCurrency(summary?.payout ?? 0)}
              hint={`After ${formatCurrency(summary?.platform_fee ?? 0)} platform fee`}
            />
            <Metric icon={TrendingUp} label="Gross fares" value={formatCurrency(summary?.gross ?? 0)} />
            <Metric icon={RouteIcon} label="Trips" value={summary?.trips ?? 0} hint={formatDistance(summary?.distance_km ?? 0)} />
            <Metric icon={HandCoins} label="Tips" value={formatCurrency(summary?.tips ?? 0)} />
          </div>

          <EarningsChart rows={daily} />

          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Trip breakdown</h2>
            {trips.length === 0 ? (
              <EmptyState
                icon={IndianRupee}
                title="No earnings in this period"
                description="Go online from the driver dashboard to start receiving requests."
                action={<Button as={Link} to="/driver/dashboard">Go to dashboard</Button>}
              />
            ) : (
              <div className="space-y-2">
                {trips.map((p) => (
                  <Card key={p.id} className="p-3.5">
                    <Link
                      to={`/activity/${p.ride_id}`}
                      className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {p.rides?.to_address || "Trip"}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDate(p.created_at)} · {formatDistance(p.rides?.distance_km)}
                          {Number(p.tip_amount) > 0 && ` · ${formatCurrency(p.tip_amount)} tip`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-foreground">
                          {formatCurrency(p.driver_payout)}
                        </span>
                        <span className="block text-[0.65rem] text-subtle">
                          of {formatCurrency(p.amount)}
                        </span>
                      </span>
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
