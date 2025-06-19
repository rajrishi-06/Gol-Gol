// src/pages/SendOTP.jsx

import React, { useState } from 'react';
import axios from 'axios';

function SendOTP() {
  const [mobile, setMobile] = useState('');
  const [message, setMessage] = useState('');
  const [otp, setOtp] = useState('');
  const [otpVisible, setOtpVisible] = useState(false);

  const handleSendOTP = async () => {
    if (!mobile) {
      setMessage("Please enter your mobile number.");
      return;
    }

    try {
      const res = await axios.post('http://localhost:5000/api/auth/send-otp', { mobile });
      setMessage(res.data.msg);
      setOtpVisible(true); // show OTP input field next
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.msg || "Something went wrong.");
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Sign Up - Step 1: Enter Mobile Number</h2>

      <input
        type="text"
        placeholder="Enter mobile number"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        style={{ padding: "0.5rem", marginRight: "1rem" }}
      />
      <button onClick={handleSendOTP}>Send OTP</button>

      {message && <p>{message}</p>}

      {otpVisible && (
        <div style={{ marginTop: "1rem" }}>
          <p>Now enter the OTP (hardcoded as 123456):</p>
          <input
            type="text"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{ padding: "0.5rem", marginRight: "1rem" }}
          />
          <button onClick={() => alert("Next we'll verify OTP!")}>Verify OTP</button>
        </div>
      )}
    </div>
  );
}

export default SendOTP;
