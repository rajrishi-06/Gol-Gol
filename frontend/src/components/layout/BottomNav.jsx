import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";

/**
 * Mobile tab bar. Four destinations, thumb-reachable, with a real `nav`
 * landmark and `aria-current` so screen readers announce the active tab.
 * Sits inside the safe area on notched phones.
 */
export default function BottomNav({ tabs, badges = {} }) {
  return (
    <nav
      aria-label="Primary"
      className="glass z-30 shrink-0 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {tabs.map(({ to, label, icon: Icon, end }) => {
          const badge = badges[to];
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "group relative flex h-full flex-col items-center justify-center gap-1 text-[0.68rem] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive ? "text-primary" : "text-muted hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary transition-opacity duration-200",
                        isActive ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="relative">
                      <Icon
                        className={cn("h-[22px] w-[22px] transition-transform", isActive && "scale-105")}
                        strokeWidth={isActive ? 2.4 : 2}
                      />
                      {badge > 0 && (
                        <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
