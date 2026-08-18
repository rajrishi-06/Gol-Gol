import { lazy, Suspense, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./lib/auth.jsx";
import { useActiveRide } from "./lib/activeRide.jsx";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedDriverRoute from "./components/Driver/ProtectedDriverRoute";
import AdminRoute from "./components/AdminRoute";
import AppLayout from "./components/layout/AppLayout";
import PageLoader from "./components/PageLoader";
import NotificationsListener from "./components/NotificationsListener";

// Route-level code splitting: heavy map + driver flows load on demand, so the
// first paint (landing + login) stays small.
const Home = lazy(() => import("./components/GetRide"));
const Login = lazy(() => import("./components/Login"));
const Book = lazy(() => import("./components/Book"));
const Account = lazy(() => import("./pages/Account"));
const Activity = lazy(() => import("./pages/Activity"));
const TripDetail = lazy(() => import("./pages/TripDetail"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Settings = lazy(() => import("./pages/Settings"));
const SavedPlaces = lazy(() => import("./pages/SavedPlaces"));
const Safety = lazy(() => import("./pages/Safety"));
const Help = lazy(() => import("./pages/Help"));
const Earnings = lazy(() => import("./pages/Earnings"));
const AdminDrivers = lazy(() => import("./pages/AdminDrivers"));
const SharedTrip = lazy(() => import("./pages/SharedTrip"));
const DriverActivate = lazy(() => import("./components/Driver/DriverActivate"));
const DriverDashboard = lazy(() => import("./components/Driver/DriverDashboard"));
const DriverActiveRide = lazy(() => import("./components/Driver/DriverActiveRide"));
const RiderActiveRide = lazy(() => import("./components/Driver/RiderActiveRide"));
const NotFound = lazy(() => import("./components/NotFound"));

/**
 * Drop someone straight back into a ride they're already on — but only once,
 * on the first load, and only from the home screen. The persistent ride strip
 * in the shell handles every other case, so navigation is never hijacked
 * mid-session.
 */
function RideResume() {
  const { ride, role, loading } = useActiveRide();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || loading) return;
    done.current = true;
    if (!ride || pathname !== "/") return;
    navigate(role === "driver" ? `/driver/ride/${ride.id}` : `/rider/ride/${ride.id}`, {
      replace: true,
    });
  }, [ride, role, loading, pathname, navigate]);

  return null;
}

export default function App() {
  const { loading } = useAuth();

  // Hold the first paint until the session resolves, so protected routes don't
  // flash the login screen for a signed-in user.
  if (loading) return <PageLoader />;

  return (
    <>
      <NotificationsListener />
      <RideResume />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            {/* public */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/help" element={<Help />} />
            <Route path="/t/:token" element={<SharedTrip />} />

            {/* riding */}
            <Route
              path="/book"
              element={
                <ProtectedRoute>
                  <Book />
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity"
              element={
                <ProtectedRoute>
                  <Activity />
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity/:rideId"
              element={
                <ProtectedRoute>
                  <TripDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wallet"
              element={
                <ProtectedRoute>
                  <Wallet />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rider/ride/:rideId"
              element={
                <ProtectedRoute>
                  <RiderActiveRide />
                </ProtectedRoute>
              }
            />

            {/* account */}
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <Account />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account/places"
              element={
                <ProtectedRoute>
                  <SavedPlaces />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account/safety"
              element={
                <ProtectedRoute>
                  <Safety />
                </ProtectedRoute>
              }
            />

            {/* driving */}
            <Route
              path="/driver/activate"
              element={
                <ProtectedRoute>
                  <DriverActivate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver/dashboard"
              element={
                <ProtectedDriverRoute>
                  <DriverDashboard />
                </ProtectedDriverRoute>
              }
            />
            <Route
              path="/driver/trips"
              element={
                <ProtectedDriverRoute>
                  <Activity defaultRole="driver" />
                </ProtectedDriverRoute>
              }
            />
            <Route
              path="/driver/earnings"
              element={
                <ProtectedDriverRoute>
                  <Earnings />
                </ProtectedDriverRoute>
              }
            />
            <Route
              path="/driver/ride/:rideId"
              element={
                <ProtectedRoute>
                  <DriverActiveRide />
                </ProtectedRoute>
              }
            />

            {/* admin */}
            <Route
              path="/admin/drivers"
              element={
                <AdminRoute>
                  <AdminDrivers />
                </AdminRoute>
              }
            />

            {/* legacy paths */}
            <Route path="/dashboard" element={<Navigate to="/account" replace />} />
            <Route path="/rides" element={<Navigate to="/activity" replace />} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
