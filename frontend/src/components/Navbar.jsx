import React, { useState } from 'react';
import {Link} from 'react-router-dom';
import { useNavigate } from "react-router-dom";

export default function Navbar(props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // navigate to login page used in login button on navbar
  function handelClickLogin(){
    navigate("/login");
  };
  function handelClickDashboard(){
    navigate("/dashboard");
  };

  return (
    <>
      {/* Navbar */}
      <nav className="relative flex items-center p-4 bg-white shadow">
        {/* Toggle Button */}
        <button
          className="absolute left-4 p-2 focus:outline-none"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          {/* Hamburger icon */}
          <svg
            className="h-6 w-6 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Brand (centered) */}
        <div className="mx-auto flex items-center space-x-2 font-bold text-xl text-gray-900">
          <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
          <span>Gol Gol</span>
        </div>


        {/* Login Button */}
        {!props.UserId ? <div className="absolute right-4">
          <button onClick={handelClickLogin}  className="text-sm text-gray-600 hover:text-black focus:outline-none">
            LOG IN
          </button>
        </div> : 
        <div className="absolute right-4">
          <button onClick={handelClickDashboard} className="text-sm text-gray-600 hover:text-black focus:outline-none">
            Dashboard
          </button>
        </div>
        }
        
      </nav>

      {/* Overlay & Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black opacity-50"
            onClick={() => setOpen(false)}
          />

          {/* Side Drawer */}
          <div className="relative w-64 bg-white h-full shadow-xl overflow-auto">
            {/* Close button */}
          <div className="flex justify-end p-4 pb-0">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg
                className="w-6 h-6 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

            {/* Drawer Content */}
            <div className="p-6 ">
              <ul className="space-y-6 text-gray-800">
                <li className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded">
                  <Link to="/"  onClick={() => setOpen(false)} > <span>🚗</span> <span>Book your ride</span> </Link> <Link/>
                </li>
                <li className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded">
                  <Link to="/setride"  onClick={() => setOpen(false)} > <span>🚗</span> <span>Activate as Driver</span> </Link>
                </li>
                 <li className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded">
                  <Link to="/findride"  onClick={() => setOpen(false)} > <span>🚗</span> <span>Find a Ride</span> </Link>
                </li>
                 <li className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded">
                  <Link to="/publishride"  onClick={() => setOpen(false)} > <span>🚗</span> <span>Publish a Ride</span> </Link>
                </li>
                <li className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded">
                  <span>💳</span>
                  <span>Rate card</span>
                </li>
                <li className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded">
                  <span>🛟</span>
                  <span>Support</span>
                </li>
              </ul>

              {/* Footer links */}
              <div className="absolute bottom-6 left-6 text-xs text-gray-500">
                <a href="#" className="hover:underline">
                  Terms of Service
                </a>
                <div className="mt-2">© 2025</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
