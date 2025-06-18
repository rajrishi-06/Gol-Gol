import react from "react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
 


function Getride (){
    return (
<div className="flex flex-col sm:flex-row h-screen">
      <LeftPanel />
      <RightPanel />
    </div>
    )
};

export default Getride ;