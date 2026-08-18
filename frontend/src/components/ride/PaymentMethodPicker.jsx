import { cn } from "../../lib/cn";
import { PAYMENT_METHODS } from "../../lib/payments";

/**
 * How the trip gets paid for. Cash and UPI settle between rider and driver
 * today; card and wallet are surfaced but disabled until a payment gateway is
 * connected — the `payments` row already models both.
 */
export default function PaymentMethodPicker({ value = "cash", onChange, className }) {
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
        {PAYMENT_METHODS.map(({ id, label, icon: Icon, hint, disabled }) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange?.(id)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary-subtle"
                  : "border-border bg-surface hover:bg-surface-2",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-primary" : "text-subtle")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="block text-xs text-muted">{disabled ? "Coming soon" : hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
