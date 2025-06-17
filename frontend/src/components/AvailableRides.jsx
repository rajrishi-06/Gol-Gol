// AvailableRides.jsx
import React from "react";

const rides = [
  {
    id: 1,
    name: "Auto",
    desc: "Get an auto at your doorstep",
    icon: "🚗",
    eta: "…",
  },
  {
    id: 2,
    name: "Mini",
    desc: "Comfy hatchbacks at pocket‑friendly fares",
    icon: "🚘",
    eta: "8 min",
  },
  {
    id: 3,
    name: "Bike",
    desc: "Zip through traffic at affordable fares",
    icon: "🏍️",
    eta: "2 min",
  },
  {
    id: 4,
    name: "Prime Sedan",
    desc: "Sedans with free wifi and top drivers",
    icon: "🚖",
    eta: "3 min",
  },
  {
    id: 5,
    name: "Prime SUV",
    desc: "SUVs with free wifi and top drivers",
    icon: "🚙",
    eta: "3 min",
  },
];

function RideItem({ icon, name, desc, eta }) {
  return (
    <li className="flex items-center px-4 py-3 hover:bg-gray-50 transition-colors">
      {/* Icon + ETA stacked */}
      <div className="flex flex-col items-center justify-center w-12">
        <div className="text-2xl">{icon}</div>
        {eta && (
          <span className="mt-1 text-xs text-gray-500">{eta}</span>
        )}
      </div>

      {/* Text */}
      <div className="ml-4 flex-1">
        <div className="text-base font-medium text-gray-900 mb-1">
          {name}
        </div>
        <div className="text-sm text-gray-500 mt-0.5">
          {desc}
        </div>
      </div>

      {/* Arrow */}
      <svg
        className="w-5 h-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </li>
  );
}

export default function AvailableRides() {
  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">
        Available Rides
      </h2>

      <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200 shadow-sm">
        {rides.map((r) => (
          <RideItem key={r.id} {...r} />
        ))}
      </ul>
    </div>
  );
}
