import { useId } from "react";
import { cn } from "../../lib/cn";

/** Labelled on/off switch. Used for duty state and every notification toggle. */
export default function Switch({ checked, onChange, label, description, disabled, className }) {
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <span className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-surface-3"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
