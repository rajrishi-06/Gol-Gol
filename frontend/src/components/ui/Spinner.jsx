import { cn } from "../../lib/cn";

/** Accessible loading spinner. Replaces the hand-rolled SVG copied per file. */
export default function Spinner({ className, label = "Loading" }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}
