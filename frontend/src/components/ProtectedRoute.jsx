import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import PageLoader from "./PageLoader";

/**
 * Requires a signed-in user. Remembers where they were headed so login can send
 * them back there instead of dumping everyone on the home screen.
 */
export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
