import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import PageLoader from "../PageLoader";

/**
 * Guards driver-only routes.
 *
 * It no longer flips the driver online as a side effect of navigation — that
 * quietly overrode an explicit "go off duty" every time the dashboard mounted.
 * Duty is now only ever changed by the driver, through the duty switch.
 */
export default function ProtectedDriverRoute({ children }) {
  const { loading, profileLoaded, isAuthenticated, driver, isApprovedDriver } = useAuth();
  const location = useLocation();

  // The driver row arrives after the session does; redirecting before it lands
  // would send an approved driver to the onboarding form on every reload.
  if (loading || (isAuthenticated && !profileLoaded)) return <PageLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // No application yet, or still pending/rejected → the onboarding screen
  // explains exactly where they stand.
  if (!driver || !isApprovedDriver) return <Navigate to="/driver/activate" replace />;

  return children;
}
