import react, { useState } from "react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import Map from "./Map.jsx";


function Getride (props){
    const [clickedLoc, setclickedLoc] = useState(false);
    return (
        <div className="flex flex-col sm:flex-row h-screen">
            <LeftPanel logIn={props.logIn} setclickedLoc={setclickedLoc} />
            {clickedLoc ? <Map /> : <RightPanel />}
        </div>
    )
};

export default Getride ;