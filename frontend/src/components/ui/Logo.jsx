import { cn } from "../../lib/cn";

/**
 * Brand mark — the original Gol·Gol globe. Kept as an <img> so the same asset
 * powers the favicon, nav, loaders and error states.
 */
export function LogoMark({ className, size = 36 }) {
  return (
    <img
      src="/logo.svg"
      width={size}
      height={size}
      alt="Gol-Gol"
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

export default function Logo({ className, markSize = 32, showWord = true }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} />
      {showWord && (
        <span className="text-[1.15rem] font-bold tracking-tight text-foreground">
          Gol<span className="text-primary"> </span>Gol
        </span>
      )}
    </span>
  );
}
