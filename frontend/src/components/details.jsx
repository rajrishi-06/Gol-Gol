import React, { useState } from "react";

import { useNavigate } from "react-router-dom";

import RightPanel from "./RightPanel";

import { useLocation } from "react-router-dom";




function Details(props) {

    const location = useLocation();
const navigate = useNavigate();

const phone = location.state?.phone;

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    rePassword: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };



  // sending data to backend to create user

  const handleSubmit = async (e) => {
  e.preventDefault();

  if (formData.password !== formData.rePassword) {
    alert("Passwords do not match!");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: formData.name,
        username: formData.username,
        password: formData.password,
        phone: phone
      }),
    });

    if (response.ok) {
      props.setLogIn(true);
      navigate("/");
    } else {
      const error = await response.json();
      alert("Error: " + error.error);
    }
  } catch (error) {
    console.error(error);
    alert("Something went wrong");
  }
};


  return (
  <div>
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md"
      >
        <h2 className="text-2xl font-semibold text-center mb-6">User Details</h2>

        <div className="mb-4">
          <label className="block text-gray-700">Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter your name"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700">Username</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter a username"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700">Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter password"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700">Re-enter Password</label>
          <input
            type="password"
            name="rePassword"
            value={formData.rePassword}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Re-enter password"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition duration-200"
        >
          Submit
        </button>
      </form>
    </div>
    <RightPanel/>  </div>
  );
}

export default Details;
