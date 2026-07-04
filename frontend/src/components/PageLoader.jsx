import { LogoMark } from "./ui/Logo";

/** Suspense fallback shown while a lazily-loaded route chunk downloads. */
export default function PageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="animate-float">
        <LogoMark size={44} />
      </div>
      <div className="h-1 w-28 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/2 animate-[slide-in-right_1s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
