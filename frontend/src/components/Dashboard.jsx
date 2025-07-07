import React, { useEffect, useState } from "react";
import RightPanel from "./RightPanel";
import { useNavigate } from "react-router-dom";
import { supabase } from "../server/supabase";

export default function Dashboard(props) {
  const navigate = useNavigate();
  const [userName, setUserName] = useState(""); // 🧠 Store user's name
  const UserId=props.UserId || sessionStorage.getItem("UserId"); // 🧠 Get UserId from props or localStorage

  useEffect(() => {
    // 🚀 Fetch user data from 'users' table
    async function fetchUserName() {
      if (!UserId) {
        console.warn("⚠️ No UUID found in localStorage");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("name")
        .eq("id",UserId) // or 'id' depending on your table
        .single();

      if (error) {
        console.error("❌ Error fetching user:", error.message);
      } else {
        setUserName(data.name);
      }
    }

    fetchUserName();
  }, [UserId]);

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold">Welcome, {userName || "User"} 👋</h1>
          <button
            onClick={() => {
              props.setLogIn("");
              localStorage.removeItem("user_uuid");
              navigate("/");
            }}
            className="text-sm text-gray-600 hover:text-black focus:outline-none"
          >
            Log Out
          </button>
        </div>

        {/* Add more dashboard content here */}
      </div>

      <RightPanel />
    </div>
  );
}
