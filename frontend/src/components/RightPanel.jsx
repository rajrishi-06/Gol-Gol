import React from "react";
import { useLocation } from "react-router-dom";

function RightPanel() {
  const location = useLocation();

  // Config for different pages
  const pageConfig = {
    "/dashboard": {
      image: "https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?fit=crop&w=1200&q=80",
      title: "Welcome to Your Dashboard",
      subtitle: "Manage your rides and profile effortlessly",
      hashtag: "#YourCityYourRide",
    },
    "/login": {
      image: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?fit=crop&w=1200&q=80",
      title: "Login to Continue",
      subtitle: "Access your account securely",
      hashtag: "#RideWithUs",
    },
    "/signup": {
      image: "https://images.unsplash.com/photo-1538688525198-9b88f6f53126?fit=crop&w=1200&q=80",
      title: "Join Our Community",
      subtitle: "Sign up for affordable, comfortable rides",
      hashtag: "#OlaForEveryone",
    },
  };

  // Get config for current path, fallback to default
  const currentPage = pageConfig[location.pathname] || {
    image: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?fit=crop&w=1200&q=80",
    title: "Everyday city commute",
    subtitle: "Affordable AC cab rides at your doorstep",
    hashtag: "#OlaForWeb",
  };

  return (
    <div className="hidden sm:block flex-1 h-screen relative">
      <img
        src={currentPage.image}
        alt="Promo"
        className="w-full h-full object-cover"
      />
      <div className="absolute top-1/3 left-8 text-white drop-shadow-lg">
        <h2 className="text-3xl font-bold">{currentPage.title}</h2>
        <p className="mt-2 text-lg">{currentPage.subtitle}</p>
        <p className="mt-2 text-yellow-400 font-semibold">{currentPage.hashtag}</p>
      </div>
    </div>
  );
}

export default RightPanel;
