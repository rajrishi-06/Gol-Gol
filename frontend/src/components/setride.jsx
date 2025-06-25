import react from "react"
import Navbar from "./Navbar";

import LiveUserCar from "./LiveUserCar";
function Setride(props){
    return (
        <div className="flex flex-col sm:flex-row h-screen">

        {/* Left Panel */}

           <div className="w-full sm:w-[550px] h-screen p-6 bg-white overflow-auto border-r border-gray-200">
            <Navbar logIn={props.logIn} />

           </div>

        {/* Right Panel */}

            <div className="hidden sm:block flex-1 h-screen relative">
            <LiveUserCar />
            
            </div>

        </div>
    )
};

export default Setride;