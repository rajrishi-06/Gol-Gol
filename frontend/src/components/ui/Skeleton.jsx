import { cn } from "../../lib/cn";

/**
 * Content-shaped loading placeholder with a shimmer sweep. Replaces bare
 * "Loading…" text so perceived performance stays high.
 */
export default function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-lg bg-surface-2",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer",
        "before:bg-gradient-to-r before:from-transparent before:via-black/[0.045] before:to-transparent",
        "dark:before:via-white/[0.06]",
        className
      )}
    />
  );
}
