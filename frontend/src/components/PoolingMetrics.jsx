import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { poolingMetrics } from "../lib/pooling";
import { cn } from "../lib/cn";
import Card from "./ui/Card";
import Skeleton from "./ui/Skeleton";

const LABEL = {
  match_rate: "Match rate",
  detour_breach_rate: "Detour promise breached",
  pool_fill_rate: "Pool fill rate",
  pooled_cancel_rate: "Pooled cancellations",
  redispatch_rate: "Re-dispatched",
  driver_earnings_per_hour: "Driver earnings / hour",
};

/**
 * The six numbers that say whether pooling is working.
 *
 * They are here rather than on a chart because what matters is the threshold,
 * not the trend: a breach rate above two percent means riders are learning not
 * to trust the toggle, and no amount of sparkline makes that clearer than the
 * sentence next to the number.
 */
export default function PoolingMetrics({ days = 7 }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await poolingMetrics(days);
    setRows(data ?? []);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4" /> Pooling health · last {days} days
        </h2>
        <button
          type="button"
          onClick={load}
          aria-label="Refresh metrics"
          disabled={loading}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows?.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.metric} className="p-3.5">
              <p className="text-xs text-muted">{LABEL[r.metric] ?? r.metric}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {r.value == null ? "—" : `${r.value}${r.unit === "%" ? "%" : ""}`}
                {r.unit === "INR" && r.value != null && <span className="text-sm font-medium"> ₹/h</span>}
              </p>
              <p className="mt-1 text-[0.7rem] leading-snug text-subtle">{r.watch}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-4 text-sm text-muted">Nothing to measure yet.</Card>
      )}
    </section>
  );
}
