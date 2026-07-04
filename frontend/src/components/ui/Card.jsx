import { cn } from "../../lib/cn";

/** Surface container with consistent radius, border and elevation. */
export default function Card({ as: Comp = "div", className, interactive = false, ...props }) {
  return (
    <Comp
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-soft",
        interactive &&
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated",
        className
      )}
      {...props}
    />
  );
}
