import { cn } from "../../lib/cn";

const tones = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-primary-subtle text-primary-subtle-fg border-transparent",
  success: "bg-success-subtle text-success-fg border-transparent",
  warning: "bg-warning-subtle text-warning-fg border-transparent",
  danger: "bg-danger-subtle text-danger-fg border-transparent",
};

/** Compact status pill used for ride state, driver status, etc. */
export default function Badge({ tone = "neutral", className, children, dot = false }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
