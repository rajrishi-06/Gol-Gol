import { useRef } from "react";
import { cn } from "../../lib/cn";

/**
 * Accessible segmented OTP input. Handles auto-advance, backspace, arrow keys
 * and paste — the polished pattern used by Stripe/Clerk-style auth.
 */
export default function OtpInput({ value, onChange, length = 6, disabled, invalid }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  const setAt = (i, char) => {
    const next = value.split("");
    next[i] = char;
    onChange(next.join("").replace(/\s/g, "").slice(0, length));
  };

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) return;
    setAt(i, char);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) setAt(i, "");
      else if (i > 0) {
        refs.current[i - 1]?.focus();
        setAt(i - 1, "");
      }
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time passcode">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d.trim()}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-14 w-full min-w-0 flex-1 rounded-xl border bg-surface text-center text-lg font-semibold text-foreground transition-all",
            "focus:outline-none focus:ring-4 focus:ring-primary/15",
            invalid ? "border-danger" : "border-border-strong focus:border-primary"
          )}
        />
      ))}
    </div>
  );
}
