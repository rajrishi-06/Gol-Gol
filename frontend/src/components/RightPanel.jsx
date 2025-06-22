import React from "react";

import Map from "./Map";
function RightPanel() {
    return(
        <>
            <div className="hidden sm:block flex-1 h-screen relative">
 
                {/* <img
                src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?fit=crop&w=1200&q=80"
                alt="Promo"
                className="w-full h-full object-cover"
                />
                <div className="absolute top-1/3 left-8 text-white">
               <h2 className="text-3xl font-bold">Everyday city commute</h2>
                <p className="mt-2 text-lg">Affordable AC cab rides at your doorstep</p>
                <p className="mt-2 text-yellow-400 font-semibold">#OlaForWeb</p> 
                </div> */}
           
  {/*     <GoogleMapComponent/>  */}   
            
<div style={{ width: "100%", height: "100vh" }}><Map /></div>
                
            </div>
        </>
    );
}

export default RightPanel;
