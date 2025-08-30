import React, { useState } from "react";
import RightPanel from "./RightPanel";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase"; // ensure correct path

export default function Login(props) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);

  const phoneIsValid = phone.length === 10;
  const otpIsValid = otp.length === 6; // Supabase OTPs are 6-digit
  const navigate = useNavigate();

  // Step 1 → check if new/existing user
  const handlePhoneSubmit = async () => {
  try {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("mobile", phone)
      .single();

    if (existing) {
      setIsNewUser(false);
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+91${phone}`,
      });
      if (error) throw error;
      setStep(3);
    } else {
      setIsNewUser(true);
      setStep(2); // show form for name/email
    }
  } catch (err) {
    if (err.code === "PGRST116") {
      setIsNewUser(true);
      setStep(2);
    } else {
      console.error("Error checking user:", err);
      alert("Something went wrong. Please try again.");
    }
  }
};

  // Step 2 → collect profile info and then send OTP
  const handleRegistrationContinue = async () => {
    if (!name.trim()) return alert("Name is required");

    console.log("Sending OTP with metadata:", { name, email, phone: `+91${phone}` });
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+91${phone}`,
      options: { data: { name, email } }
    });

    if (error) {
      console.error("OTP send error:", error);
      return alert("Failed to send OTP: " + (error.message || 'unknown'));
    }
    setStep(3);
  };


  // Step 3 → verify OTP, then insert profile if new
  const handleVerify = async () => {
  const { data: { session }, error } = await supabase.auth.verifyOtp({
    phone: `+91${phone}`,
    token: otp,
    type: "sms",
  });

  if (error || !session) {
    console.error("OTP verification failed:", error);
    return alert("Wrong OTP. Please try again.");
  }

  // ✅ user row in public.users will be created by trigger automatically
  props.setLogIn?.(true);
  navigate("/");
};


  // Back button
  const handleBack = () => {
    if (step === 1) return window.history.back();
    if (step === 3 && isNewUser) return setStep(2);
    setStep(1);
  };

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <div className="w-full max-w-md bg-white rounded-xl shadow-md overflow-hidden">
          {/* Header */}
          <div className="relative flex items-center justify-center p-4">
            <button
              onClick={handleBack}
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
            <div className="flex items-center space-x-2">
              <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
              <span className="font-bold text-xl text-gray-800">Gol-Gol</span>
            </div>
          </div>

          {/* Step 1: Phone Entry */}
          {step === 1 && (
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold">Enter your mobile number</h2>
              <p className="mt-2 text-center text-sm text-gray-500">
                A 6-digit OTP will be sent via SMS
              </p>
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
                className={
                  "mt-6 w-full rounded-lg py-3 text-base font-medium " +
                  (phoneIsValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-200 text-gray-400")
                }
              >
                Next
              </button>
            </div>
          )}

          {/* Step 2: Registration */}
          {step === 2 && isNewUser && (
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold">Create your account</h2>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded p-3 mb-4"
                required
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded p-3 mb-4"
              />
              <button
                onClick={handleRegistrationContinue}
                className="w-full bg-indigo-600 text-white p-3 rounded"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 3: OTP Verification */}
          {step === 3 && (
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold">Verify and log in</h2>
              <p className="mt-2 text-center text-sm text-gray-500">
                Enter the OTP sent to <span className="font-medium">+91{phone}</span>
              </p>
              <div className="mt-6 flex items-center border border-gray-300 rounded-lg overflow-hidden px-4 py-3">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6 digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="flex-1 text-base placeholder-gray-400 focus:outline-none"
                />
              </div>
              <button
                disabled={!otpIsValid}
                onClick={handleVerify}
                className={
                  "mt-6 w-full rounded-lg py-3 " +
                  (otpIsValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-200 text-gray-400")
                }
              >
                Verify OTP
              </button>
            </div>
          )}
        </div>
      </div>
      <RightPanel />
    </div>
  );
}
