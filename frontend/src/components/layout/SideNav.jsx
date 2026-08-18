import { NavLink, Link } from "react-router-dom";
import { cn } from "../../lib/cn";
import { LogoMark } from "../ui/Logo";
import { SECONDARY_LINKS, ADMIN_LINK } from "./navItems";

function RailLink({ to, label, icon: Icon, end, badge }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        title={label}
        className={({ isActive }) =>
          cn(
            "group relative flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[0.65rem] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive ? "bg-primary-subtle text-primary-subtle-fg" : "text-muted hover:bg-surface-2 hover:text-foreground"
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
                isActive ? "opacity-100" : "opacity-0"
              )}
            />
            <span className="relative">
              <Icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.4 : 2} />
              {badge > 0 && (
                <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span className="leading-none">{label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

/**
 * Desktop side rail. Same destinations as the mobile tab bar plus the
 * secondary account links, so nothing on desktop is buried behind a drawer.
 */
export default function SideNav({ tabs, badges = {}, isAdmin = false }) {
  return (
    <aside className="hidden w-[84px] shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <Link
        to="/"
        aria-label="Gol·Gol home"
        className="mx-auto mt-4 grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogoMark size={28} />
      </Link>

      <nav aria-label="Primary" className="mt-4 px-3">
        <ul className="space-y-1">
          {tabs.map((tab) => (
            <RailLink key={tab.to} {...tab} badge={badges[tab.to]} />
          ))}
        </ul>
      </nav>

      <div className="mx-3 my-3 border-t border-border" />

      <nav aria-label="Secondary" className="min-h-0 flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {SECONDARY_LINKS.map((link) => (
            <RailLink key={link.to} {...link} />
          ))}
          {isAdmin && <RailLink {...ADMIN_LINK} />}
        </ul>
      </nav>

      <p className="px-2 pb-4 pt-2 text-center text-[0.6rem] leading-tight text-subtle">
        © {new Date().getFullYear()}
        <br />
        Gol·Gol
      </p>
    </aside>
  );
}
