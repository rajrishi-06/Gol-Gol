import React from "react";
import RightPanel from "./RightPanel";
import { useNavigate } from "react-router-dom";

export default function Dashboard(props){
    const navigate = useNavigate();
    return(
        <>
            <div className="flex flex-col sm:flex-row h-screen">
                <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
                    <h1>Dashboard</h1>
                    <div className="absolute">
                        <button onClick={() => {
                            props.setLogIn(false);
                            navigate('/');
                        }} className="text-sm text-gray-600 hover:text-black focus:outline-none">
                            Log Out
                        </button>
                    </div>
                </div>
                <RightPanel />
            </div>
        </>
    );
};