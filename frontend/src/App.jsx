import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Getride from './components/GetRide';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import Book from './components/Book';
import { supabase } from './server/supabase';

// New imports
import ProtectedDriverRoute from './components/Driver/ProtectedDriverRoute';
import DriverActivate from './components/Driver/DriverActivate';
import DriverDashboard from './components/Driver/DriverDashboard';
import DriverActiveRide from './components/Driver/DriverActiveRide';
import RiderActiveRide from './components/Driver/RiderActiveRide';


function App() {
  const [logIn, setLogIn] = useState(false);
  const [fromCords, setFromCords] = useState('');
  const [toCords, setToCords] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setLogIn(true);
        localStorage.setItem('user_uuid', session.user.id);
        const userId = session.user.id;

        // 1. Check if user is a rider with active ride
        let { data: riderRide } = await supabase
          .from('rides')
          .select('id, status')
          .eq('rider_id', userId)
          .in('status', ['accepted', 'ongoing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (riderRide) {
          navigate(`/rider/ride/${riderRide.id}`);
          return;
        }

        // 2. Check if user is a driver in active_drivers
        let { data: activeDriver } = await supabase
          .from('active_drivers')
          .select('current_ride_id, on_ride')
          .eq('user_id', userId)
          .maybeSingle();

        if (activeDriver?.on_ride && activeDriver.current_ride_id) {
          navigate(`/driver/ride/${activeDriver.current_ride_id}`);
          return;
        }

        // 3. Fallback: check rides table for driver_id
        let { data: driverRide } = await supabase
          .from('rides')
          .select('id, status')
          .eq('driver_id', userId)
          .in('status', ['accepted', 'ongoing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (driverRide) {
          navigate(`/driver/ride/${driverRide.id}`);
          return;
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLogIn(!!session);
      if (session) {
        localStorage.setItem('user_uuid', session.user.id);
      } else {
        localStorage.removeItem('user_uuid');
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  return (
    <div>
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
          />} 
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

        {/* Driver activation & dashboard */}
        <Route path="/driver/activate" element={
          <ProtectedRoute logIn={logIn}>
            <DriverActivate />
          </ProtectedRoute>
        } />

        <Route
          path="/driver/dashboard"
          element={
            <ProtectedDriverRoute logIn={logIn}>
              <DriverDashboard />
            </ProtectedDriverRoute>
          }
        />
        <Route path="/driver/ride/:rideId" element={
          <ProtectedRoute logIn={logIn}>
            <DriverActiveRide />
          </ProtectedRoute>
          } />
        <Route path="/rider/ride/:rideId" element={
          <ProtectedRoute logIn={logIn}>
            <RiderActiveRide />
          </ProtectedRoute>} />

        {/* Booking */}
        <Route path="/book" element={<Book fromCords={fromCords} toCords={toCords} />} />
      </Routes>
    </div>
  );
}

export default App;