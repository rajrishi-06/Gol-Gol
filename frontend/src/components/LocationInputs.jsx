// LocationInputs.jsx
import React from "react";

export default function LocationInputs({
  fromValue,
  toValue,
  whenValue,
  whenOptions = ["Now"],
  onFromChange = () => {},
  onToChange = () => {},
  onWhenChange = () => {},
  onClick
}) {
  return (
    <div className="space-y-4 mb-6">
      {/* FROM */}
      <div className="flex items-center bg-gray-200 rounded-lg overflow-hidden" onClick={onClick}>
       {/* give every label the same fixed width */}
        <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
          From
        </span>
        <input
          type="text"
          value={fromValue}
          onChange={e => onFromChange(e.target.value)}
          placeholder="Enter your location"
          className="flex-1 bg-transparent p-3 text-sm placeholder-gray-500 focus:outline-none"
        />
      </div>

      {/* TO */}
      <div className="flex items-center bg-gray-200 rounded-lg overflow-hidden" onClick={onClick}>
        <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
          To
        </span>
        <input
          type="text"
          value={toValue}
          onChange={e => onToChange(e.target.value)}
          placeholder="Search for a locality or landmark"
          className="flex-1 bg-transparent p-3 text-sm placeholder-gray-500 focus:outline-none"
        />
      </div>

      {/* WHEN */}
      <div className="relative flex items-center bg-gray-200 rounded-lg overflow-hidden">
        <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
          When
        </span>
        <select
          value={whenValue}
          onChange={e => onWhenChange(e.target.value)}
          className="flex-1 appearance-none bg-transparent p-3 text-sm focus:outline-none"
        >
          {whenOptions.map(opt => (
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
