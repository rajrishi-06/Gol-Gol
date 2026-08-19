import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import PageLoader from "./PageLoader";

/**
 * Admin-only surface. The server enforces this too (`is_admin()` gates every
 * admin RPC); this is purely so non-admins never see a broken screen.
 */
export default function AdminRoute({ children }) {
  const { loading, profileLoaded, isAuthenticated, isAdmin } = useAuth();

  // Wait for the profile: `is_admin` lives on it, and gating on a role that
  // hasn't loaded yet would bounce a legitimate admin straight back out.
  if (loading || (isAuthenticated && !profileLoaded)) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/account" replace />;
  return children;
}
