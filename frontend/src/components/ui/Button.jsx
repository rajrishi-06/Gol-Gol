import { forwardRef } from "react";
import { cn } from "../../lib/cn";
import Spinner from "./Spinner";

const base =
  "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "rounded-xl transition-[background,box-shadow,transform,color,border-color] duration-200 " +
  "select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 " +
  "active:scale-[0.98]";

const variants = {
  primary:
    "bg-primary text-primary-fg shadow-brand hover:bg-primary-hover hover:-translate-y-px",
  secondary:
    "bg-surface text-foreground border border-border-strong shadow-soft hover:bg-surface-2 hover:-translate-y-px",
  ghost: "text-muted hover:text-foreground hover:bg-surface-2",
  outline: "border border-border-strong text-foreground hover:bg-surface-2 hover:border-primary/50",
  danger: "bg-danger text-white shadow-soft hover:bg-danger-hover hover:-translate-y-px",
  subtle: "bg-primary-subtle text-primary-subtle-fg hover:brightness-[0.97]",
  // For use on a dark/brand-coloured surface, where the primary fill would
  // disappear. A real variant rather than a className override, because
  // Tailwind resolves conflicting utilities by stylesheet order — an override
  // of `bg-*`/`text-*` on top of a variant silently loses.
  inverse: "bg-white text-brand-800 shadow-floating hover:bg-white/90",
};

const sizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

/**
 * Polymorphic, accessible button. `as` lets it render a router `Link` or `a`
 * while keeping identical styling and the loading affordance.
 */
const Button = forwardRef(function Button(
  {
    as: Comp = "button",
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    className,
    children,
    disabled,
    ...props
  },
  ref
) {
  const isNative = Comp === "button";
  return (
    <Comp
      ref={ref}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      disabled={isNative ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      aria-disabled={!isNative && (disabled || loading) ? true : undefined}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-90")}>
        {children}
      </span>
    </Comp>
  );
});

export default Button;
