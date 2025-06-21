import React, { useState, useEffect } from "react";
import RightPanel from "./RightPanel";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase"; // ensure correct path

export default function Login(props) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [validotp, setvalidotp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const phoneIsValid = phone.length === 10;
  const otpIsValid = otp.length === 4;

  const navigate = useNavigate();

  const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

  const checkUserExists = async () => {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("mobile", phone)
      .single();
    return data;
  };

  const handlePhoneSubmit = async () => {

    const user = await checkUserExists();
    if (user) {
      setStep(3); // existing user → OTP verification
    } else {
      setStep(2); // new user → registration
    }
  };

  useEffect(() => {
    if (step === 3) {
      const otpp = generateOTP();
      setvalidotp(otpp);
      console.log("OTP generated for Step 3:", otpp);
      // here you would also trigger your SMS-sending logic
    }
  }, [step]);

  const getUUID = async (phone) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("mobile", phone)
        .single();

      if (error) {
        console.error("Failed to fetch UUID:", error.message);
        return null;
      }

      return data.id; // ✅ The user's UUID
    } catch (err) {
      console.error("Unexpected error:", err);
      return null;
    }
  };

  // Example inside your Verify OTP button handler
  const handleVerify = async () => {
    if (otp === validotp) {
      // Wait for getUUID to resolve:
      const uuid = await getUUID(phone);
      console.log("User UUID:", uuid);
      localStorage.setItem("user_uuid", uuid);
      props.setLogIn?.(true);
      navigate("/", { state: { uuid } });
    } else {
      alert("Wrong OTP");
    }
  };


  const handleRegistrationSubmit = async () => {
    const { error } = await supabase
      .from("users")
      .insert([{ mobile: phone, name, email }]);

    if (error) {
      alert("Error creating account: " + error.message);
      return;
    }

    setStep(3); // proceed to OTP after registration
  };

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <div className="w-full max-w-md bg-white rounded-xl shadow-md overflow-hidden">
          {/* Header */}
          <div className="relative flex items-center justify-center p-4">
            <button
              onClick={() => {
                if (step === 1) return window.history.back();
                setStep(1);
                setOtp("");
              }}
              className="absolute left-4 p-2 hover:bg-gray-200 rounded-full"
              aria-label="Go back"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {/* Brand logo + text (centered) */}
  <div className="flex items-center space-x-2">
    <img src="/src/assets/logo.svg" alt="Logo" className="h-8 w-8" />
    <span className="font-bold text-xl text-gray-800">Gol-Gol</span>
  </div>
          </div>

          {/* === Step 1: Phone Number Entry === */}
          {step === 1 && (
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold text-gray-900">Enter your mobile number</h2>
              <p className="mt-2 text-center text-sm text-gray-500">A 4‑digit OTP will be sent on SMS</p>
              <div className="mt-6 flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 text-gray-700 font-medium">+91</div>
                <div className="w-px h-6 bg-gray-300" />
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 px-4 py-3 text-base placeholder-gray-400 focus:outline-none"
                />
              </div>
              <button
                disabled={!phoneIsValid}
                onClick={handlePhoneSubmit}
                className={`
                  mt-6 w-full rounded-lg py-3 text-base font-medium
                  ${phoneIsValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-200 text-gray-400"}
                `}
              >
                Next
              </button>
            </div>
          )}

          {/* === Step 2: New User Registration === */}
          {step === 2 && (
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold text-gray-900">Create your Ola account</h2>
              <p className="mt-2 text-center text-sm text-gray-500">Enter your details to create an account</p>
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Enter email address (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none"
                />
                <button
                  onClick={handleRegistrationSubmit}
                  className="mt-6 w-full rounded-lg py-3 bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                >
                  Continue
                </button>
              </div>
              <p className="text-xs text-center text-gray-400 mt-4">
                By registering, you are agreeing to Ola's Terms & Conditions
              </p>
            </div>
          )}

          {/* === Step 3: OTP Verification === */}
          {step === 3 && (
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold text-gray-900">Verify and log in</h2>
              <p className="mt-2 text-center text-sm text-gray-500">
                Enter the OTP sent to your mobile <span className="font-medium">+91{phone}</span>
              </p>
              <div className="mt-6 flex items-center border border-gray-300 rounded-lg overflow-hidden px-4 py-3">
                <svg className="w-5 h-5 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 11c0-1.105.895-2 2-2s2 .895 2 2v3m-8 0v-3c0-1.105.895-2 2-2s2 .895 2 2v3M6 18V9a6 6 0 1112 0v9"/>
                </svg>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Enter 4 digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="flex-1 text-base placeholder-gray-400 focus:outline-none"
                />
              </div>
              <button
                disabled={!otpIsValid}
                onClick={handleVerify}
                className={`
                  mt-6 w-full rounded-lg py-3
                  ${otpIsValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-200 text-gray-400"}
                `}
              >
                Verify OTP
              </button>
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    const newOtp = generateOTP();
                    setOtp("");
                    setvalidotp(newOtp);
                    alert("OTP resent! " + newOtp);
                  }}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Resend OTP
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <RightPanel />
    </div>
  );
}
