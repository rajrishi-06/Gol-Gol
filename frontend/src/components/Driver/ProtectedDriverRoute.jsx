import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../../server/supabase'; // Adjust the import path as needed

/**
 * A protected route component for drivers.
 * It ensures that only users who are logged in (checked via `logIn` prop and a `user_uuid` 
 * in localStorage) AND have a 'drivers' record with a 'verification_status' of 'approved' 
 * can access the child components.
 *
 * It also marks the driver as 'online' in the 'active_drivers' table upon successful access.
 */
export default function ProtectedDriverRoute({ logIn, children }) {
  // 1. Perform the initial authentication check using the `logIn` prop.
  // If the user is not logged in, redirect them to the homepage ('/').
  if (!logIn) {
    return <Navigate to="/" replace />;
  }

  // If the user is logged in, proceed with driver-specific verification.
  // 'loading': The driver check is in progress.
  // 'approved': The user is an approved driver.
  // 'unauthorized': The user is not an approved driver.
  const [status, setStatus] = useState('loading');
  const navigate = useNavigate();

  useEffect(() => {
    // This effect runs only for users who are already logged in (due to the check above).
    async function checkDriverStatus() {
      // Get the current user's UUID from local storage.
      const user_uuid = localStorage.getItem('user_uuid');

      if (!user_uuid) {
        // If no user_uuid is found in local storage, the user is not properly authenticated.
        // Redirect to a safe page.
        setStatus('unauthorized');
        navigate('/');
        return;
      }

      // 2. Fetch the driver's record from the 'drivers' table using the user_uuid.
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('verification_status')
        .eq('user_id', user_uuid) // Use the UUID from local storage.
        .maybeSingle(); // .maybeSingle() prevents an error if no record is found.

      if (driverError) {
        console.error('Error fetching driver status:', driverError);
        // On error, redirect to a safe default page.
        setStatus('unauthorized');
        navigate('/');
        return;
      }

      // 3. Check the verification status.
      if (driver?.verification_status === 'approved') {
        // SUCCESS: The user is an approved driver.
        setStatus('approved');

        // As a side-effect, update their status in the 'active_drivers' table.
        try {
          await supabase.from('active_drivers').upsert(
            {
              user_id: user_uuid, // Use the UUID from local storage.
              is_online: true,
              last_active_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
        } catch (upsertError) {
            console.error('Error updating active driver status:', upsertError);
        }

      } else {
        // FAILURE: The user is not an approved driver.
        // This covers cases where the record doesn't exist, is 'pending', or 'rejected'.
        setStatus('unauthorized');
        // Redirect them to the driver activation page to see their status.
        navigate('/driver/activate');
      }
    }

    checkDriverStatus();
  }, [navigate]); // Dependency array is correct as navigate function is stable.

  // Render content based on the driver verification status
  if (status === 'approved') {
    // Only render the protected content if the driver is approved.
    return <>{children}</>;
  }

  // For 'loading' or 'unauthorized' states, show a full-screen loading indicator.
  // This is shown while checking driver status and during the redirect.
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-800">Verifying Access</h2>
        <p className="mt-2 text-gray-600">Please wait while we check your driver credentials.</p>
        {/* You can add a spinner or any loading animation here */}
      </div>
    </div>
  );
}