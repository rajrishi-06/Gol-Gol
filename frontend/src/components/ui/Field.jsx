import { forwardRef, useId } from "react";
import { cn } from "../../lib/cn";

const controlBase =
  "w-full rounded-xl border border-border-strong bg-surface text-foreground " +
  "placeholder:text-subtle transition-[border-color,box-shadow,background] duration-200 " +
  "focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** Bare styled input for compositions that manage their own layout. */
export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(controlBase, "h-11 px-3.5 text-sm", invalid && "border-danger focus:border-danger focus:ring-danger/15", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, "min-h-[84px] px-3.5 py-2.5 text-sm", invalid && "border-danger", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(controlBase, "h-11 px-3.5 text-sm appearance-none", className)} {...props}>
      {children}
    </select>
  );
});

/**
 * Labelled field wrapper: associates label + hint + error with the control and
 * announces validation via `aria-describedby`. Fixes the app's unlabelled
 * inputs and `alert()`-style error reporting.
 */
export default function Field({ label, hint, error, required, children, className, htmlFor }) {
  const generatedId = useId();
  const id = htmlFor || generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cn(hint && hintId, error && errorId) || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {typeof children === "function"
        ? children({ id, "aria-describedby": describedBy })
        : children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
