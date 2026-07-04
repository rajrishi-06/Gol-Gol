import { Component } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "./ui/Button";
import Logo from "./ui/Logo";

/**
 * App-level error boundary. Previously any thrown render error produced a blank
 * white screen; now users get a branded recovery surface.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Hook point for a real error-reporting service (Sentry, etc.).
    console.error("Uncaught UI error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <Logo markSize={40} />
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-danger-subtle text-danger-fg">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted">
            An unexpected error interrupted the page. Reloading usually fixes it.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload the app</Button>
      </div>
    );
  }
}
