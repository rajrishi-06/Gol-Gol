import React from "react";

function Map() {
    return(
        <>
            <div className="hidden sm:block flex-1 h-screen relative">
                <img
                src="https://plus.unsplash.com/premium_photo-1750107641929-18d0023d181c?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxmZWF0dXJlZC1waG90b3MtZmVlZHwyfHx8ZW58MHx8fHx8"
                alt="Promo"
                className="w-full h-full object-cover"
                />
                <div className="absolute top-1/3 left-8 text-white">
                <h2 className="text-3xl font-bold">Everyday city commute</h2>
                <p className="mt-2 text-lg">Affordable AC cab rides at your doorstep</p>
                <p className="mt-2 text-black-400 font-semibold">#This is where map loads.</p>
                </div>
            </div>
        </>
    );
}

export default Map;
