import { useEffect, useState } from "react";
import { ChevronDown, MapPin, Clock } from "lucide-react";
import { Select } from "./ui/Field";
import { cn } from "../lib/cn";

/**
 * From / To / When trip inputs. The location rows are real buttons (keyboard
 * operable, unlike the previous clickable divs) connected by a route rail.
 */
export default function LocationInputs({
  fromValue,
  toValue,
  setMode,
  whenValue,
  whenOptions = ["Now", "In 30 minutes", "Schedule..."],
  setDateOfDeparture,
  onWhenChange = () => {},
  setClickedFrom,
  setClickedTo,
  activeTab,
}) {
  const [customTime, setCustomTime] = useState("");
  const [dateValue, setDateValue] = useState("");

  useEffect(() => {
    const now = new Date();
    if (whenValue === "Now") {
      setDateOfDeparture(now.toISOString());
    } else if (whenValue === "In 30 minutes") {
      setDateOfDeparture(new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    } else if (dateValue && customTime && whenValue === "Schedule...") {
      setDateOfDeparture(new Date(`${dateValue}T${customTime}:00`).toISOString());
    } else {
      setDateOfDeparture(null);
    }
  }, [dateValue, customTime, whenValue, setDateOfDeparture]);

  const todayStr = new Date().toISOString().split("T")[0];
  const scheduling = whenValue === "Schedule...";

  const LocationRow = ({ label, value, placeholder, onClick, tone }) => (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
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
          onClick={() => {
            setClickedFrom(true);
            setMode("from");
          }}
        />
        <div className="mx-3.5 border-t border-border" />
        <LocationRow
          label="Drop"
          value={toValue}
          placeholder="Search for a locality or landmark"
          tone="to"
          onClick={() => {
            setClickedTo(true);
            setMode("to");
          }}
        />
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
          {whenOptions.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </Select>
        <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-subtle" />
      </div>

      {/* Scheduling controls */}
      {scheduling && (
        <div className="grid grid-cols-2 gap-3">
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
          {(activeTab === "PUBLISH RIDE" || activeTab === "FIND MATCH") && (
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
        </div>
      )}
    </div>
  );
}
