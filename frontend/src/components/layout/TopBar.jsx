import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Car, Navigation } from "lucide-react";
import { useAuth } from "../../lib/auth.jsx";
import { cn } from "../../lib/cn";
import Logo from "../ui/Logo";
import Button from "../ui/Button";
import ThemeToggle from "../ui/ThemeToggle";
import NotificationBell from "../NotificationBell";
import { isDriverRoute } from "./navItems";

/**
 * Mode switch for people who both ride and drive. Route-derived, so it can
 * never disagree with the screen you're on.
 */
function ModeSwitch({ driving }) {
  const navigate = useNavigate();
  const options = [
    { key: "ride", label: "Ride", icon: Car, to: "/" },
    { key: "drive", label: "Drive", icon: Navigation, to: "/driver/dashboard" },
  ];
  return (
    <div
      role="group"
      aria-label="Switch mode"
      className="hidden items-center gap-0.5 rounded-xl border border-border bg-surface-2 p-0.5 sm:flex"
    >
      {options.map(({ key, label, icon: Icon, to }) => {
        const active = key === (driving ? "drive" : "ride");
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => navigate(to)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shell header. One header for the whole app instead of a bespoke one per
 * screen: page title, back affordance on nested routes, notifications, theme
 * and — for approved drivers — the ride/drive switch.
 */
export default function TopBar({ title, subtitle, back = false, actions }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isApprovedDriver } = useAuth();
  const driving = isDriverRoute(pathname);

  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
      {back ? (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="-ml-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : (
        <Link to="/" aria-label="Gol·Gol home" className="shrink-0 rounded-lg lg:hidden">
          <Logo markSize={26} />
        </Link>
      )}

      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h1>
        )}
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {isApprovedDriver && <ModeSwitch driving={driving} />}
        <ThemeToggle />
        {isAuthenticated ? (
          <NotificationBell />
        ) : (
          <Button size="sm" onClick={() => navigate("/login")}>
            Log in
          </Button>
        )}
      </div>
    </header>
  );
}
