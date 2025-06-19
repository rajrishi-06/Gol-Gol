import react from "react"

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
function Setride(props){
    return (
        <div className="flex flex-col sm:flex-row h-screen">
            {/* <LeftPanel logIn={props.logIn} /> */}
            <RightPanel />
        </div>
    )
};

export default Setride;