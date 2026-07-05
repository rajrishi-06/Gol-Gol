import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, Car, Navigation, LifeBuoy, FileText, Sparkles } from "lucide-react";
import Button from "./ui/Button";
import Logo from "./ui/Logo";
import ThemeToggle from "./ui/ThemeToggle";
import NotificationBell from "./NotificationBell";
import { cn } from "../lib/cn";

const NAV_LINKS = [
  { to: "/", label: "Book a ride", icon: Car },
  { to: "/driver/activate", label: "Drive with Gol·Gol", icon: Navigation },
];

export default function Navbar({ logIn }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  // Accessible drawer: lock scroll, close on Escape, trap + restore focus.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = "hidden";
    const firstFocusable = drawerRef.current?.querySelector("a, button");
    firstFocusable?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const nodes = drawerRef.current?.querySelectorAll("a, button");
        if (!nodes?.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused instanceof HTMLElement && previouslyFocused.focus();
    };
  }, [open]);

  return (
    <>
      <nav className="glass sticky top-0 z-40 -mx-6 flex items-center justify-between border-b border-border px-6 py-3.5">
        <Link to="/" className="rounded-lg" aria-label="Gol-Gol home">
          <Logo />
        </Link>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {logIn && <NotificationBell />}
          <Button
            variant={logIn ? "secondary" : "primary"}
            size="sm"
            onClick={() => navigate(logIn ? "/dashboard" : "/login")}
          >
            {logIn ? "Dashboard" : "Log in"}
          </Button>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-haspopup="dialog"
            className="ml-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:z-50",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className={cn(
            "absolute left-0 top-0 flex h-full w-[86%] max-w-xs flex-col bg-surface shadow-floating transition-transform duration-300 ease-[var(--ease-out-quart)]",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Logo />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-subtle">
              Navigate
            </p>
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={label}
                to={to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-fg">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {label}
              </Link>
            ))}
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-subtle">
              Help
            </p>
            <a
              href="mailto:support@gol-gol.app"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-muted">
                <LifeBuoy className="h-[18px] w-[18px]" />
              </span>
              Support
            </a>
          </nav>

          <div className="border-t border-border p-5">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Sparkles className="h-4 w-4 text-primary" />
              City mobility, reimagined
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-subtle">
              <a href="#" className="inline-flex items-center gap-1 hover:text-foreground">
                <FileText className="h-3.5 w-3.5" /> Terms
              </a>
              <span>© {new Date().getFullYear()} Gol·Gol</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
