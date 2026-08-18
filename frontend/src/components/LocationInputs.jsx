import { useEffect, useState } from "react";
import { ChevronDown, MapPin, Clock, ArrowUpDown } from "lucide-react";
import { Select } from "./ui/Field";
import { cn } from "../lib/cn";

const WHEN_OPTIONS = ["Now", "In 30 minutes", "Schedule…"];

function LocationRow({ label, value, placeholder, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          tone === "from" ? "bg-primary-subtle text-primary-subtle-fg" : "bg-danger-subtle text-danger-fg"
        )}
      >
        {tone === "from" ? (
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
          {label}
        </span>
        <span className={cn("block truncate text-sm", value ? "text-foreground" : "text-subtle")}>
          {value || placeholder}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 -rotate-90 text-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * From / To / When trip inputs.
 *
 * "Schedule…" now actually schedules: the resolved timestamp is handed up to
 * the booking context and sent with the ride, where a DB trigger parks it in
 * the `scheduled` state until its dispatch window opens. Previously the picker
 * computed a departure time that instant bookings simply ignored.
 */
export default function LocationInputs({
  fromValue,
  toValue,
  whenValue = "Now",
  onWhenChange = () => {},
  setDateOfDeparture = () => {},
  onPickFrom,
  onPickTo,
  onSwap,
  activeTab,
}) {
  const [customTime, setCustomTime] = useState("");
  const [dateValue, setDateValue] = useState("");

  useEffect(() => {
    const now = new Date();
    if (whenValue === "Now") {
      setDateOfDeparture(null);
    } else if (whenValue === "In 30 minutes") {
      setDateOfDeparture(new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    } else if (dateValue && customTime) {
      const at = new Date(`${dateValue}T${customTime}:00`);
      setDateOfDeparture(Number.isNaN(at.getTime()) ? null : at.toISOString());
    } else {
      setDateOfDeparture(null);
    }
  }, [dateValue, customTime, whenValue, setDateOfDeparture]);

  // Default the schedule date to today the first time it's needed.
  useEffect(() => {
    if (whenValue === "Schedule…" && !dateValue) {
      setDateValue(new Date().toISOString().split("T")[0]);
    }
  }, [whenValue, dateValue]);

  const todayStr = new Date().toISOString().split("T")[0];
  const scheduling = whenValue === "Schedule…";
  const needsDate = scheduling;

  return (
    <div className="space-y-3">
      {/* Connected From → To card with a route rail. */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        <span
          aria-hidden="true"
          className="absolute left-[27px] top-[38px] h-[26px] w-px border-l border-dashed border-border-strong"
        />
        <LocationRow
          label="Pickup"
          value={fromValue}
          placeholder="Enter your location"
          tone="from"
          onClick={onPickFrom}
        />
        <div className="mx-3.5 border-t border-border" />
        <LocationRow
          label="Drop"
          value={toValue}
          placeholder="Search for a locality or landmark"
          tone="to"
          onClick={onPickTo}
        />
        {onSwap && (
          <button
            type="button"
            onClick={onSwap}
            aria-label="Swap pickup and drop"
            className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg border border-border bg-surface text-muted shadow-soft transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* When */}
      <div className="relative flex items-center rounded-xl border border-border bg-surface shadow-soft">
        <span className="grid h-8 w-8 shrink-0 place-items-center pl-2.5 text-subtle">
          <Clock className="h-4 w-4" />
        </span>
        <span className="pl-1 pr-1 text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
          When
        </span>
        <Select
          value={whenValue}
          onChange={(e) => onWhenChange(e.target.value)}
          aria-label="When do you want to travel"
          className="border-0 bg-transparent pl-2 shadow-none focus:ring-0"
        >
          {WHEN_OPTIONS.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </Select>
        <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-subtle" />
      </div>

      {/* Scheduling controls */}
      {scheduling && (
        <div className="grid grid-cols-2 gap-3">
          {needsDate && (
            <label className="flex flex-col gap-1">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
                Date
              </span>
              <input
                type="date"
                min={todayStr}
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
              Time
            </span>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
            />
          </label>
        </div>
      )}

      {scheduling && activeTab === "DAILY RIDES" && (
        <p className="text-xs text-muted">
          We&apos;ll start looking for a driver about 10 minutes before your pickup time.
        </p>
      )}
    </div>
  );
}
