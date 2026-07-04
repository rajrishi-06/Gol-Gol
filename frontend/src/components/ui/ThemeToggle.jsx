import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getInitialTheme, setTheme } from "../../lib/theme";
import { cn } from "../../lib/cn";

/** Light/dark switch. Reads the theme applied pre-paint and toggles it. */
export default function ThemeToggle({ className }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    setThemeState(document.documentElement.getAttribute("data-theme") || "light");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors",
        "hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Sun className={cn("h-[18px] w-[18px] transition-all", isDark && "hidden")} />
      <Moon className={cn("h-[18px] w-[18px] transition-all", !isDark && "hidden")} />
    </button>
  );
}
