import { cn } from "../../lib/cn";

/**
 * Self-contained brand mark — a route pin inside a soft gradient tile — plus an
 * optional wordmark. Inline SVG so it stays crisp, themeable and free of the
 * external globe asset the app used before.
 */
export function LogoMark({ className, size = 36 }) {
  const id = "gg-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="Gol-Gol"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-brand-400)" />
          <stop offset="1" stopColor="var(--color-brand-700)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
      {/* Route dashes */}
      <path
        d="M12 27c4.2 0 4.2-6 8.4-6s4.2-6 8.4-6"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.2 5.2"
        opacity="0.85"
      />
      {/* Pin */}
      <circle cx="12" cy="27" r="2.7" fill="white" />
      <path
        d="M28.8 8.5c2.7 0 4.7 2 4.7 4.6 0 3.2-4.7 7.4-4.7 7.4s-4.7-4.2-4.7-7.4c0-2.6 2-4.6 4.7-4.6Z"
        fill="white"
      />
      <circle cx="28.8" cy="13" r="1.7" fill="var(--color-brand-700)" />
    </svg>
  );
}

export default function Logo({ className, markSize, showWord = true }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} />
      {showWord && (
        <span className="text-[1.1rem] font-semibold tracking-tight text-foreground">
          Gol<span className="text-primary">·</span>Gol
        </span>
      )}
    </span>
  );
}
