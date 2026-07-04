import { ShieldCheck, Clock3, IndianRupee, Star } from "lucide-react";

/** Per-route copy for the aside. */
const CONTENT = {
  default: {
    eyebrow: "City mobility, reimagined",
    title: "Every ride, a little smoother.",
    subtitle: "Book instantly, share the commute, or drive to earn — all on one map.",
  },
  login: {
    eyebrow: "Welcome back",
    title: "Your ride is one tap away.",
    subtitle: "Sign in securely with your phone. No passwords, ever.",
  },
  dashboard: {
    eyebrow: "Your account",
    title: "Everything in its place.",
    subtitle: "Manage trips, profile and driver status from a single home.",
  },
  driver: {
    eyebrow: "Drive with Gol·Gol",
    title: "Turn your seat into earnings.",
    subtitle: "Accept nearby requests, navigate turn-by-turn, and get paid.",
  },
};

const STATS = [
  { icon: Clock3, label: "Avg. pickup", value: "3 min" },
  { icon: IndianRupee, label: "Upfront fares", value: "No surge tricks" },
  { icon: Star, label: "Rated drivers", value: "4.9 / 5" },
];

/** Animated route illustration — self-contained, no external assets. */
function RouteCard() {
  return (
    <div className="glass w-full max-w-sm rounded-3xl border border-white/15 p-5 shadow-floating">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-white/70">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-300" />
          </span>
          Live trip
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
          ETA 12 min
        </span>
      </div>

      <svg viewBox="0 0 320 150" className="mt-4 w-full" role="img" aria-label="Route from pickup to destination">
        <defs>
          <linearGradient id="routeLine" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-brand-300)" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <path
          d="M28 118 C 90 118, 92 40, 150 40 S 232 96, 292 30"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M28 118 C 90 118, 92 40, 150 40 S 232 96, 292 30"
          fill="none"
          stroke="url(#routeLine)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="6 10"
        >
          <animate attributeName="stroke-dashoffset" from="160" to="0" dur="3s" repeatCount="indefinite" />
        </path>
        <circle cx="28" cy="118" r="7" fill="white" />
        <circle cx="28" cy="118" r="3" fill="var(--color-brand-600)" />
        <g transform="translate(292 30)">
          <path d="M0-11c5 0 9 4 9 9 0 6-9 15-9 15S-9 4-9-2c0-5 4-9 9-9Z" fill="white" />
          <circle cy="-2" r="3.4" fill="var(--color-brand-700)" />
        </g>
      </svg>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-lg">🚗</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">Prime Sedan · MH 12 AB 3456</p>
          <p className="text-xs text-white/60">Rahul · 4.9 ★ · arriving now</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-height brand panel shown beside app forms on large screens. Replaces the
 * hot-linked Unsplash promo (which broke on restricted networks) with a
 * self-contained, animated, theme-independent visual.
 */
export default function BrandAside({ variant = "default" }) {
  const content = CONTENT[variant] ?? CONTENT.default;

  return (
    <aside className="relative hidden flex-1 overflow-hidden bg-brand-950 lg:flex">
      {/* Ambient gradient + grid + glow, all CSS. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 15% 10%, oklch(0.45 0.10 172) 0%, transparent 55%)," +
            "radial-gradient(90% 80% at 90% 100%, oklch(0.40 0.11 200) 0%, transparent 50%)," +
            "linear-gradient(160deg, oklch(0.30 0.07 174), oklch(0.20 0.045 220))",
        }}
      />
      <div className="bg-grid absolute inset-0 opacity-[0.08]" />
      <div className="absolute -left-24 top-1/3 h-72 w-72 animate-float rounded-full bg-brand-500/25 blur-3xl" />

      <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
        <div className="animate-fade-in text-white/70">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide">
            {content.eyebrow}
          </span>
        </div>

        <div className="max-w-md">
          <h2 className="animate-fade-up text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-5xl">
            {content.title}
          </h2>
          <p className="animate-fade-up mt-4 text-lg leading-relaxed text-white/70 [animation-delay:80ms]">
            {content.subtitle}
          </p>
          <div className="animate-fade-up mt-8 [animation-delay:160ms]">
            <RouteCard />
          </div>
        </div>

        <div className="animate-fade-up grid grid-cols-3 gap-3 [animation-delay:240ms]">
          {STATS.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
              <Icon className="h-4 w-4 text-brand-300" />
              <p className="mt-2 text-sm font-semibold text-white">{value}</p>
              <p className="text-xs text-white/55">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-5 right-6 z-10 inline-flex items-center gap-1.5 text-xs text-white/45">
        <ShieldCheck className="h-3.5 w-3.5" /> Encrypted &amp; secure
      </div>
    </aside>
  );
}
