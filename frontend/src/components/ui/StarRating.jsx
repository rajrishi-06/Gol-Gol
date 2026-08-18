import { Star } from "lucide-react";
import { cn } from "../../lib/cn";

const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-9 w-9" };

/**
 * Star rating — read-only when `onChange` is omitted, an accessible radio group
 * when it isn't.
 */
export default function StarRating({ value = 0, onChange, size = "md", className, label = "Rating" }) {
  const interactive = typeof onChange === "function";
  const rounded = Math.round(Number(value) || 0);

  if (!interactive) {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5", className)}
        role="img"
        aria-label={`${label}: ${Number(value || 0).toFixed(1)} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(sizes[size], i <= rounded ? "fill-warning text-warning" : "text-border-strong")}
          />
        ))}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center gap-1.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={rounded === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          onClick={() => onChange(i)}
          className="rounded-lg p-1 transition-transform hover:scale-110 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              sizes[size],
              "transition-colors",
              i <= rounded ? "fill-warning text-warning" : "text-border-strong"
            )}
          />
        </button>
      ))}
    </div>
  );
}
