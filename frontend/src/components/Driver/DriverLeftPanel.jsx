import React, { useEffect, useState } from 'react';
import { supabase } from '../../server/supabase'; // Assuming this path is correct
import { useNavigate } from 'react-router-dom';

export default function DriverLeftPanel() {
  const [userData, setUserData] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null); // For success/info messages

  // Form states
  const [isRegistering, setIsRegistering] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState(''); // YYYY-MM-DD
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [documentUrlInput, setDocumentUrlInput] = useState('');

  const navigate = useNavigate();

  const VEHICLE_TYPES = ['car', 'bike', 'auto', 'van', 'truck'];

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const userUuid = localStorage.getItem('user_uuid');

        if (!userUuid) {
          setError("User ID not found in local storage. Please log in.");
          setLoading(false);
          return;
        }

        // Fetch user data
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('is_driver')
          .eq('id', userUuid)
          .single();

        if (userError) {
          throw userError;
        }

        setUserData(user);

        // If user is a driver, fetch driver data
        if (user?.is_driver) {
          const { data: driver, error: driverError } = await supabase
            .from('drivers')
            .select('verification_status, license_number, license_expiry, vehicle_registration, vehicle_type, document_url')
            .eq('user_id', userUuid)
            .single();

          // It's possible for a user to have is_driver=true but no driver record if something went wrong.
          // We don't throw an error here, as the UI will let them register.
          if (driverError && driverError.code !== 'PGRST116') { // Ignore "no rows found" error
            throw driverError;
          }
          setDriverData(driver);

          // Redirect if driver is approved
          if (driver?.verification_status === 'approved') {
            navigate('/driver/dashboard');
          } else if (driver?.verification_status === 'rejected') {
            // Pre-fill form for reapplication if rejected
            setLicenseNumber(driver.license_number || '');
            setLicenseExpiry(driver.license_expiry || '');
            setVehicleRegistration(driver.vehicle_registration || '');
            setVehicleType(driver.vehicle_type || '');
            setDocumentUrlInput(driver.document_url || '');
          }
        }
      } catch (err) {
        console.error("Error fetching data:", err.message);
        setError("Failed to load data. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [navigate]);


  const handleSubmitDriverDetails = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (!licenseNumber || !licenseExpiry || !vehicleRegistration || !vehicleType || !documentUrlInput) {
      setError("Please fill in all required fields, including the document URL.");
      setLoading(false);
      return;
    }
    if (!VEHICLE_TYPES.includes(vehicleType)) {
        setError("Invalid vehicle type selected.");
        setLoading(false);
        return;
    }

    try {
        new URL(documentUrlInput);
    } catch (urlError) {
        setError("Please enter a valid URL for your document.");
        setLoading(false);
        return;
    }


    try {
      const userUuid = localStorage.getItem('user_uuid');
      if (!userUuid) {
        throw new Error("User ID not found.");
      }

      const documentUrl = documentUrlInput;

      const driverDetails = {
        user_id: userUuid,
        license_number: licenseNumber,
        license_expiry: licenseExpiry,
        vehicle_registration: vehicleRegistration,
        vehicle_type: vehicleType,
        document_url: documentUrl,
        verification_status: 'pending', // Always set to pending upon submission/re-submission
      };

      // Check if driver entry exists (for reapplication)
      const { data: existingDriver, error: existingDriverError } = await supabase
        .from('drivers')
        .select('user_id')
        .eq('user_id', userUuid)
        .single();

      if (existingDriverError && existingDriverError.code !== 'PGRST116') { // PGRST116 means "no rows found"
          throw existingDriverError;
      }

      if (existingDriver) {
        // Update existing driver record for re-application
        const { error: updateError } = await supabase
          .from('drivers')
          .update(driverDetails)
          .eq('user_id', userUuid);

        if (updateError) throw updateError;
        setMessage("Driver details updated successfully. Verification is pending.");

      } else {
        // This block runs for a user's FIRST submission.
        // Step 1: Insert new driver record
        const { error: insertError } = await supabase
          .from('drivers')
          .insert([driverDetails]);

        if (insertError) throw insertError;

        // Step 2: CRITICAL - Update the 'users' table to set is_driver = true.
        // If this step fails, the app won't recognize the user as a driver on future visits.
        // COMMON ISSUE: Check your Row Level Security (RLS) policies on the 'users' table.
        // The authenticated user needs permission to update their own 'is_driver' column.
        const { error: updateUserError } = await supabase
          .from('users')
          .update({ is_driver: true })
          .eq('id', userUuid);

        if (updateUserError) {
          console.error("CRITICAL: Failed to update is_driver flag for user:", userUuid, updateUserError);
          throw new Error(`Driver profile was created, but failed to mark you as a driver. Please contact support. Error: ${updateUserError.message}`);
        }
        
        setMessage("Driver details submitted successfully. Verification is pending.");
      }

      // Re-fetch all data to ensure UI is in sync with the database
      const { data: updatedUser, error: updatedUserError } = await supabase
        .from('users')
        .select('is_driver')
        .eq('id', userUuid)
        .single();

      if (updatedUserError) throw updatedUserError;
      setUserData(updatedUser);

      if (updatedUser?.is_driver) {
        const { data: updatedDriver, error: updatedDriverError } = await supabase
          .from('drivers')
          .select('verification_status, license_number, license_expiry, vehicle_registration, vehicle_type, document_url')
          .eq('user_id', userUuid)
          .single();

        if (updatedDriverError) throw updatedDriverError;
        setDriverData(updatedDriver);
      }

      setIsRegistering(false); // Go back to the info view after submission

    } catch (err) {
      console.error("Error submitting driver details:", err.message);
      setError(`Submission failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200 flex items-center justify-center">
        <p>Loading user data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <h3 className="text-xl font-semibold mb-2 text-red-600">Error</h3>
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
        >
          Reload
        </button>
      </div>
    );
  }

  // --- Render based on user/driver status ---

  // Show registration/reapplication form if user is not a driver OR if their application was rejected.
  if ((userData && !userData.is_driver) || (driverData && driverData.verification_status === 'rejected')) {
    const isReapplying = driverData && driverData.verification_status === 'rejected';
    const formTitle = isReapplying ? "Reapply as a Driver" : "Register as a Driver";
    const submitButtonText = isReapplying ? "Resubmit Application" : "Submit Application";

    return (
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <h3 className="text-xl font-semibold mb-4">{formTitle}</h3>
        
        {/* --- NEW: Added clear message for rejected applications --- */}
        {isReapplying && (
            <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 rounded-md" role="alert">
                <p className="font-bold">Action Required</p>
                <p>Your previous application was not approved. Please review your details, correct any errors, and resubmit.</p>
            </div>
        )}

        {message && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">{message}</div>}
        {/* Error message from form submission will appear here */}
        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}

        <p className="text-gray-700 mb-4">
          Please fill in the details below to join our driver network. For document submission, upload your license or vehicle documents to a cloud service (e.g., Google Drive, Dropbox) and provide the **shareable link** below.
        </p>

        <form onSubmit={handleSubmitDriverDetails} className="space-y-4">
          <div>
            <label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700">License Number</label>
            <input
              type="text"
              id="licenseNumber"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="licenseExpiry" className="block text-sm font-medium text-gray-700">License Expiry Date</label>
            <input
              type="date"
              id="licenseExpiry"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="vehicleRegistration" className="block text-sm font-medium text-gray-700">Vehicle Registration Number</label>
            <input
              type="text"
              id="vehicleRegistration"
              value={vehicleRegistration}
              onChange={(e) => setVehicleRegistration(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="vehicleType" className="block text-sm font-medium text-gray-700">Vehicle Type</label>
            <select
              id="vehicleType"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              required
            >
              <option value="">Select a type</option>
              {VEHICLE_TYPES.map(type => (
                <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="documentUrl" className="block text-sm font-medium text-gray-700">Document Shareable Link (Google Drive, Dropbox, etc.)</label>
            <input
              type="url"
              id="documentUrl"
              value={documentUrlInput}
              onChange={(e) => setDocumentUrlInput(e.target.value)}
              placeholder="e.g., https://drive.google.com/..."
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              required
            />
            {driverData?.document_url && (
                <p className="mt-2 text-sm text-gray-500">
                    Existing document URL:
                    <a href={driverData.document_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">View Current Document</a>
                </p>
            )}
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Submitting...' : submitButtonText}
          </button>
        </form>
      </div>
    );
  }

  // Driver verification pending
  if (userData?.is_driver && driverData?.verification_status === 'pending') {
    return (
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <h3 className="text-xl font-semibold mb-4">Verification in Progress</h3>
        {message && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">{message}</div>}
        <p className="text-gray-700 mb-4">
          Thanks for submitting your driver details! Our team is currently reviewing your application. We'll notify you once your verification is complete. This usually takes 1-2 business days.
        </p>
        <p className="text-gray-700">
          In the meantime, please ensure all your submitted documents (provided via URL) are clear and accessible to our team.
        </p>
        <h3 className="text-xl font-semibold mb-2 mt-6">Driver Guidelines</h3>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>Ensure your documents are valid and legible.</li>
          <li>Vehicle should be in good working condition.</li>
          <li>Keep track of your trips in dashboard.</li>
          <li>Contact support if you face any issues.</li>
        </ul>
      </div>
    );
  }

  // Default fallback view
  return (
    <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
      <h3 className="text-xl font-semibold mb-2">Driver Guidelines</h3>
      <ul className="list-disc pl-5 space-y-1 text-gray-700">
        <li>Ensure your documents are valid and legible.</li>
        <li>Vehicle should be in good working condition.</li>
        <li>Keep track of your trips in dashboard.</li>
        <li>Contact support if you face any issues.</li>
      </ul>
    </div>
  );
}