import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";

const sizes = { sm: "h-9 w-9 text-xs", md: "h-11 w-11 text-sm", lg: "h-16 w-16 text-xl" };

/** Initial-based avatar with a deterministic brand gradient. */
export default function Avatar({ name, size = "md", className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-primary-fg",
        "bg-gradient-to-br from-brand-400 to-brand-700 shadow-soft ring-2 ring-surface",
        sizes[size],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
