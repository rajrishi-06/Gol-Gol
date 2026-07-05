import { ShieldCheck, Sparkles } from "lucide-react";

// Sphere wireframe, computed once. Latitude rings flatten toward the poles;
// longitude arcs narrow toward the limb — reads as a globe head-on.
const CX = 170;
const CY = 170;
const R = 150;

const LATITUDES = [
  { dy: 0, ry: 46 },
  { dy: 44, ry: 32 },
  { dy: 84, ry: 20 },
  { dy: 118, ry: 11 },
].flatMap(({ dy, ry }) => {
  const rx = Math.sqrt(R * R - dy * dy);
  return dy === 0
    ? [{ cy: CY, rx, ry }]
    : [
        { cy: CY - dy, rx, ry },
        { cy: CY + dy, rx, ry },
      ];
});

const LONGITUDES = [150, 120, 80, 34]; // rx of each meridian ellipse (ry = R)

// Orbiting dots: [tiltDeg, ringRx, flattenY, durationS, reverse]
const ORBITS = [
  { tilt: -18, rx: 196, flat: 0.36, dur: 15, rev: false },
  { tilt: 14, rx: 214, flat: 0.28, dur: 23, rev: true },
];

export default function IdleGlobe() {
  return (
    <div
      className="relative hidden flex-1 overflow-hidden sm:block"
      style={{ background: "radial-gradient(120% 120% at 70% 10%, #0f7a63 0%, #0b5c4b 45%, #083b31 100%)" }}
    >
      <div className="bg-grid absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      {/* Faint starfield */}
      <div aria-hidden="true" className="absolute inset-0">
        {[
          [12, 22],
          [82, 16],
          [68, 74],
          [24, 66],
          [90, 52],
          [45, 12],
          [8, 84],
          [58, 40],
        ].map(([l, t], i) => (
          <span
            key={i}
            className="anim-twinkle absolute h-1 w-1 rounded-full bg-white/70"
            style={{ left: `${l}%`, top: `${t}%`, animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>

      {/* Globe */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="anim-float relative" aria-hidden="true">
          {/* glow + radar ping */}
          <div
            className="absolute left-1/2 top-1/2 h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(120,255,220,0.45), transparent 70%)" }}
          />
          <span className="anim-ping-soft absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />

          <svg viewBox="0 0 340 340" style={{ height: "min(58vh, 440px)", width: "min(58vh, 440px)" }} role="img" aria-label="Animated globe">
            <defs>
              <radialGradient id="sphereShade" cx="38%" cy="32%" r="80%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.34)" />
                <stop offset="42%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="100%" stopColor="rgba(3,32,26,0.5)" />
              </radialGradient>
              <clipPath id="globeClip">
                <circle cx={CX} cy={CY} r={R} />
              </clipPath>
            </defs>

            {/* body */}
            <circle cx={CX} cy={CY} r={R} fill="rgba(255,255,255,0.04)" />

            <g clipPath="url(#globeClip)" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1">
              {LATITUDES.map((l, i) => (
                <ellipse key={`lat${i}`} cx={CX} cy={l.cy} rx={l.rx} ry={l.ry} />
              ))}
              {LONGITUDES.map((rx, i) => (
                <ellipse key={`lon${i}`} cx={CX} cy={CY} rx={rx} ry={R} />
              ))}
              <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} />
              <circle cx={CX} cy={CY} r={R} fill="url(#sphereShade)" stroke="none" />
            </g>

            {/* rim */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />

            {/* orbit rings + travelling dots */}
            {ORBITS.map((o, i) => (
              <g key={`orb${i}`} transform={`rotate(${o.tilt} ${CX} ${CY})`}>
                <ellipse
                  cx={CX}
                  cy={CY}
                  rx={o.rx}
                  ry={o.rx * o.flat}
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="1"
                  strokeDasharray="1 9"
                />
                <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `scaleY(${o.flat})` }}>
                  <g
                    className={o.rev ? "anim-spin-rev" : "anim-spin-slow"}
                    style={{ transformOrigin: `${CX}px ${CY}px`, animationDuration: `${o.dur}s` }}
                  >
                    <circle cx={CX + o.rx} cy={CY} r={12} fill="#eafff8" />
                    <circle cx={CX + o.rx} cy={CY} r={5.5} fill="#ffffff" />
                  </g>
                </g>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Copy */}
      <div className="absolute inset-x-0 bottom-0 p-10">
        <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white text-balance">
          Every ride, a little smoother.
        </h2>
        <p className="mt-2 max-w-sm text-sm text-white/70">
          Set your pickup to see live cars and your route on the map.
        </p>
      </div>

      {/* Chips */}
      <div className="glass absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/90">
        <Sparkles className="h-3.5 w-3.5" />
        City mobility, reimagined
      </div>
      <div className="absolute bottom-6 right-6 inline-flex items-center gap-1.5 text-xs font-medium text-white/55">
        <ShieldCheck className="h-3.5 w-3.5" />
        Encrypted &amp; secure
      </div>
    </div>
  );
}
