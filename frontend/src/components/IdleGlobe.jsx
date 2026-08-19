import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ShieldCheck, Sparkles, Globe2 } from "lucide-react";
import { createGlobe, GLOBE_PALETTE } from "../lib/globe";
import { useMediaQuery } from "../lib/useMediaQuery";

/**
 * The idle half of the home screen: Earth from orbit, turning.
 *
 * It is not decoration. Choosing a pickup starts here — the globe flies to the
 * coordinate and descends to it, and only then does the map take over. That
 * hand-off is why this exposes an imperative `diveTo`: the parent needs the
 * descent to finish before it swaps in the picker, or the transition cuts.
 *
 * Falls back to a static panel wherever WebGL2 is missing.
 */
const IdleGlobe = forwardRef(function IdleGlobe({ onDiveEnd }, ref) {
  const canvasRef = useRef(null);
  const globeRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [diving, setDiving] = useState(false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const globe = createGlobe(canvas, {
      texture: "/earth.png",
      palette: dark ? GLOBE_PALETTE.dark : GLOBE_PALETTE.light,
      reducedMotion: reduced,
      onFail: () => setFailed(true),
    });
    globeRef.current = globe;
    if (!globe) return undefined;

    // Follow the app's theme without tearing the canvas down and back up.
    const themeWatch = new MutationObserver(() => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      globe.setPalette(isDark ? GLOBE_PALETTE.dark : GLOBE_PALETTE.light);
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      themeWatch.disconnect();
      globe.destroy();
      globeRef.current = null;
    };
  }, [reduced]);

  useImperativeHandle(ref, () => ({
    /** Fly to a coordinate and descend. Resolves when the camera arrives. */
    async diveTo(coords) {
      const globe = globeRef.current;
      if (!globe || !coords) return false;
      setDiving(true);
      await globe.diveTo({ lat: coords.lat, lng: coords.lng });
      onDiveEnd?.();
      return true;
    },
    async ascend() {
      setDiving(false);
      await globeRef.current?.ascend();
    },
    get available() {
      return Boolean(globeRef.current);
    },
  }), [onDiveEnd]);

  return (
    <div
      className="relative hidden flex-1 overflow-hidden sm:block"
      style={{ background: "radial-gradient(120% 120% at 70% 10%, #07231d 0%, #041713 55%, #010a08 100%)" }}
    >
      {failed ? (
        // No WebGL2: a static panel beats a black rectangle.
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 120% at 70% 10%, #0f7a63 0%, #0b5c4b 45%, #083b31 100%)" }}
        >
          <div className="bg-grid absolute inset-0 opacity-[0.06]" aria-hidden="true" />
          <div className="absolute inset-0 grid place-items-center">
            <Globe2 className="h-32 w-32 text-white/15" aria-hidden="true" />
          </div>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="The Earth seen from orbit, turning slowly"
        />
      )}

      {/* Copy lifts away during the descent so the planet is unobstructed. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col justify-end p-10 transition-all duration-700 xl:p-14"
        style={{ opacity: diving ? 0 : 1, transform: diving ? "translateY(-1.5rem)" : "none" }}
      >
        {/* The limb is bright enough to swallow white text where they overlap,
            so the copy sits on its own scrim rather than on the planet. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to top, rgba(2,10,8,.88) 0%, rgba(2,10,8,.62) 38%, rgba(2,10,8,0) 100%)" }}
        />
        <div className="pointer-events-auto relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Pick a point on Earth
          </span>
          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white drop-shadow-lg">
            Anywhere you&apos;re going,
            <br />
            someone&apos;s already headed.
          </h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">
            Set your pickup and we&apos;ll drop straight down to it — then find you a
            ride, or a seat in one already on the road.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 text-xs text-white/55">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified drivers · OTP boarding · live tracking
          </p>
        </div>
      </div>
    </div>
  );
});

export default IdleGlobe;
