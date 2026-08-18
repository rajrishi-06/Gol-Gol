import { Link } from "react-router-dom";
import { Compass, ArrowLeft } from "lucide-react";
import Button from "./ui/Button";
import Logo from "./ui/Logo";

/** Branded 404 — replaces the router silently rendering nothing. */
export default function NotFound() {
  return (
    <main className="relative flex h-full flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10 text-center">
      <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative animate-fade-up">
        <Link to="/" className="inline-flex">
          <Logo markSize={40} />
        </Link>
        <div className="mx-auto mt-10 grid h-20 w-20 place-items-center rounded-3xl bg-primary-subtle text-primary-subtle-fg shadow-soft">
          <Compass className="h-9 w-9" />
        </div>
        <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          This route doesn&apos;t exist
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          The page you&apos;re looking for may have moved, or the link was mistyped. Let&apos;s get
          you back on the map.
        </p>
        <div className="mt-8 flex justify-center">
          <Button as={Link} to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Button>
        </div>
      </div>
    </main>
  );
}
