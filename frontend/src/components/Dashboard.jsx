import React, { useEffect, useState } from "react";
import RightPanel from "./RightPanel";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase";

export default function Dashboard(props) {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uuid = localStorage.getItem("user_uuid");
    if (!uuid) {
      navigate("/");
      return;
    }
    fetchUser(uuid);
  }, []);

  async function fetchUser(uuid) {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", uuid)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
    } else {
      setUserData(data);
    }
    setLoading(false);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      props.setLogIn(false);
      localStorage.removeItem("user_uuid");
      navigate("/");
    }
  }

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      {/* Left Panel */}
      <div className="w-full sm:w-[550px] h-screen p-8 bg-gradient-to-b from-white to-gray-50 overflow-auto border-r border-gray-200 flex flex-col justify-between">
        {/* Top Content */}
        <div>
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
              Dashboard
            </h1>
            <button
              onClick={handleLogout}
              className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
            >
              Log Out
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center items-center h-full text-gray-500">
              Loading...
            </div>
          ) : userData ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              {/* Profile Header */}
              <div className="flex items-center space-x-5 border-b border-gray-100 pb-4">
                <div className="h-16 w-16 bg-blue-500 text-white rounded-full flex items-center justify-center text-2xl font-bold shadow">
                  {userData.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {userData.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {userData.email || "No email provided"}
                  </p>
                </div>
              </div>

              {/* Details (compact spacing) */}
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Mobile</span>
                  <span className="text-gray-900">{userData.mobile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Joined</span>
                  <span className="text-gray-900">
                    {new Date(userData.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Driver</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      userData.is_driver
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {userData.is_driver ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Rating</span>
                  <span className="text-yellow-500">
                    {"⭐".repeat(userData.user_rating)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-red-500 text-center">User not found</p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-xs text-gray-400 text-center">
          @ gol-gol r - All rights reserved
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel />
    </div>
  );
}
