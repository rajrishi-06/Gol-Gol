import React from "react";

export default function LocationInputs({
  fromValue,
  toValue,
  whenValue,
  whenOptions = ["Now"],
  onWhenChange = () => {},
  setClickedFrom,
  setClickedTo,
}) {
  return (
    <div className="space-y-4 mb-6">
      <div
        className="flex items-center bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
        onClick={() => setClickedFrom(true)}
      >
        <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
          From
        </span>
        <input
          type="text"
          value={fromValue}
          placeholder="Enter your location"
          readOnly
          className="flex-1 bg-transparent p-3 text-sm placeholder-gray-500 focus:outline-none"
        />
      </div>

      <div
        className="flex items-center bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
        onClick={() => setClickedTo(true)}
      >
        <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
          To
        </span>
        <input
          type="text"
          value={toValue}
          placeholder="Search for a locality or landmark"
          readOnly
          className="flex-1 bg-transparent p-3 text-sm placeholder-gray-500 focus:outline-none"
        />
      </div>

      <div className="relative flex items-center bg-gray-200 rounded-lg overflow-hidden">
        <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
          When
        </span>
        <select
          value={whenValue}
          onChange={(e) => onWhenChange(e.target.value)}
          className="flex-1 appearance-none bg-transparent p-3 text-sm focus:outline-none"
        >
          {whenOptions.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
        <svg
          className="w-4 h-4 absolute right-3 text-gray-500 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
}
