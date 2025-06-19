import React, { useState } from "react";
import RightPanel from "./RightPanel";
import { useNavigate } from "react-router-dom";

export default function Login(props) {
  // === shared state ===
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  // phone step:
  const [phone, setPhone] = useState("");
  const phoneIsValid = phone.length === 10;

  // otp step:
  const [otp, setOtp] = useState("");
  const otpIsValid = /^\d{4}$/.test(otp);

  // === render ===
  return (
    <>
    <div className="flex flex-col sm:flex-row h-screen">
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <div className="w-full max-w-md bg-white rounded-xl shadow-md overflow-hidden">
          
          {/* --- HEADER (common back arrow + logo) --- */}
          <div className="relative flex items-center justify-center p-4">
            <button
              onClick={() => {
                if (step === 1) return window.history.back();
                setStep(1);
                setOtp("");
              }}
              className="absolute left-4 p-2 hover:bg-gray-200 rounded-full focus:outline-none"
              aria-label="Go back"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <img src="/your-logo.svg" alt="Logo" className="h-8 w-auto" />
          </div>

          {step === 1 ? (
            /* ===== STEP 1: PHONE ENTRY ===== */
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold text-gray-900">
                Enter your mobile number
              </h2>
              <p className="mt-2 text-center text-sm text-gray-500">
                A 4‑digit OTP will be sent on SMS
              </p>

              {/* phone input */}
              <div className="mt-6 flex items-center border border-gray-300 rounded-lg overflow-hidden">
                {/* Fixed +91 */}
                <div className="px-4 py-3 bg-gray-100 text-gray-700 font-medium">
                  +91
                </div>
                <div className="w-px h-6 bg-gray-300" />
                {/* User types only the 10 digits */}
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setPhone(digits.slice(0, 10));
                  }}
                  className="flex-1 px-4 py-3 text-base placeholder-gray-400 focus:outline-none"
                />
              </div>

              {/* Next button */}
              <button
                disabled={!phoneIsValid}
                onClick={() => setStep(2)}
                className={`
                  mt-6 w-full rounded-lg py-3 text-base font-medium
                  ${
                    phoneIsValid
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                `}
              >
                Next
              </button>
            </div>
          ) : (
            /* ===== STEP 2: OTP ENTRY ===== */
            <div className="px-6 pb-6">
              <h2 className="text-center text-xl font-semibold text-gray-900">
                Verify and log in
              </h2>
              <p className="mt-2 text-center text-sm text-gray-500">
                Enter the OTP sent to your mobile <span className="font-medium">+91{phone}</span>
              </p>

              {/* OTP input */}
              <div className="mt-6 flex items-center border border-gray-300 rounded-lg overflow-hidden px-4 py-3">
                <svg
                  className="w-5 h-5 text-gray-400 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11c0-1.105.895-2 2-2s2 .895 2 2v3m-8 0v-3c0-1.105.895-2 2-2s2 .895 2 2v3M6 18V9a6 6 0 1112 0v9"
                  />
                </svg>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Enter 4 digit OTP"
                  value={otp}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setOtp(digits.slice(0, 4));
                  }}
                  className="flex-1 text-base placeholder-gray-400 focus:outline-none"
                />
              </div>

              {/* Log In button */}
              <button
                disabled={!otpIsValid}
                onClick={() => {props.setLogIn(true);
                  navigate("/");
                }}
                className={`
                  mt-6 w-full rounded-lg py-3 text-base font-medium
                  ${
                    otpIsValid
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                `}
              >
                Log In
              </button>

              {/* Resend OTP */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    setOtp("");
                    // trigger your resend logic here
                    alert("OTP resent!");
                  }}
                  className="text-sm text-indigo-600 hover:underline focus:outline-none"
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
    </>
  );
}
