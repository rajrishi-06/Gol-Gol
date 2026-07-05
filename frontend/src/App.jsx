import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedDriverRoute from "./components/Driver/ProtectedDriverRoute";
import PageLoader from "./components/PageLoader";
import NotificationsListener from "./components/NotificationsListener";

// Route-level code splitting: heavy Mapbox + driver flows load on demand,
// keeping the initial bundle (landing + login) small.
const Getride = lazy(() => import("./components/GetRide"));
const Login = lazy(() => import("./components/Login"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Book = lazy(() => import("./components/Book"));
const DriverActivate = lazy(() => import("./components/Driver/DriverActivate"));
const DriverDashboard = lazy(() => import("./components/Driver/DriverDashboard"));
const DriverActiveRide = lazy(() => import("./components/Driver/DriverActiveRide"));
const RiderActiveRide = lazy(() => import("./components/Driver/RiderActiveRide"));
const NotFound = lazy(() => import("./components/NotFound"));

function App() {
  const [logIn, setLogIn] = useState(false);
  const [fromCords, setFromCords] = useState("");
  const [toCords, setToCords] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      setLogIn(true);
      localStorage.setItem("user_uuid", session.user.id);
      const userId = session.user.id;

      // Resume an in-progress ride (rider), then driver, then fall back.
      const { data: riderRide } = await supabase
        .from("rides")
        .select("id, status")
        .eq("rider_id", userId)
        .in("status", ["accepted", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (riderRide) return navigate(`/rider/ride/${riderRide.id}`);

      const { data: activeDriver } = await supabase
        .from("active_drivers")
        .select("current_ride_id, on_ride")
        .eq("user_id", userId)
        .maybeSingle();
      if (activeDriver?.on_ride && activeDriver.current_ride_id) {
        return navigate(`/driver/ride/${activeDriver.current_ride_id}`);
      }

      const { data: driverRide } = await supabase
        .from("rides")
        .select("id, status")
        .eq("driver_id", userId)
        .in("status", ["accepted", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (driverRide) return navigate(`/driver/ride/${driverRide.id}`);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLogIn(!!session);
      if (session) localStorage.setItem("user_uuid", session.user.id);
      else localStorage.removeItem("user_uuid");
    });

    return () => subscription?.unsubscribe();
  }, [navigate]);

  return (
    <>
      <NotificationsListener />
      <Suspense fallback={<PageLoader />}>
        <Routes>
        <Route
          path="/"
          element={
            <Getride
              logIn={logIn}
              fromCords={fromCords}
              toCords={toCords}
              setFromCords={setFromCords}
              setToCords={setToCords}
              from={from}
              to={to}
              setFrom={setFrom}
              setTo={setTo}
            />
          }
        />

        <Route path="/login" element={<Login setLogIn={setLogIn} />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute logIn={logIn}>
              <Dashboard setLogIn={setLogIn} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/driver/activate"
          element={
            <ProtectedRoute logIn={logIn}>
              <DriverActivate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/dashboard"
          element={
            <ProtectedDriverRoute logIn={logIn}>
              <DriverDashboard />
            </ProtectedDriverRoute>
          }
        />
        <Route
          path="/driver/ride/:rideId"
          element={
            <ProtectedRoute logIn={logIn}>
              <DriverActiveRide />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rider/ride/:rideId"
          element={
            <ProtectedRoute logIn={logIn}>
              <RiderActiveRide />
            </ProtectedRoute>
          }
        />

        <Route path="/book" element={<Book fromCords={fromCords} toCords={toCords} />} />

        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
