import React, { useEffect, useState } from "react";

export default function LocationInputs({
  fromValue,
  toValue,
  setMode,
  whenValue,
  whenOptions = ["Now", "In 30 minutes", "Schedule..."],
  setDateOfDeparture,
  onWhenChange = () => {},
  setClickedFrom,
  setClickedTo,
  activeTab, // passed from parent
}) {
  const [customTime, setCustomTime] = useState("");
  const [dateValue, setDateValue] = useState("");

  useEffect(() => {
    const now = new Date();
    if (whenValue === "Now") {
      setDateOfDeparture(now.toISOString());
    } else if (whenValue === "In 30 minutes") {
      setDateOfDeparture(new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    } else if (dateValue && customTime && whenValue === "Schedule...") {
      const isoString = new Date(`${dateValue}T${customTime}:00`).toISOString();
      setDateOfDeparture(isoString);
    } else {
      setDateOfDeparture(null); // Reset if not fully selected
    }
  }, [dateValue, customTime, whenValue, setDateOfDeparture]);


  // today's date (restrict past selection)
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4 mb-6">
      {/* From */}
      <div
        className="flex items-center bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
        onClick={() => {
          setClickedFrom(true);
          setMode("from");
        }}
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

      {/* To */}
      <div
        className="flex items-center bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
        onClick={() => {
          setClickedTo(true);
          setMode("to");
        }}
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

      {/* When */}
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

      {/* Custom time input */}
      {whenValue === "Schedule..." && (
        <div className="flex items-center bg-gray-200 rounded-lg overflow-hidden">
          <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
            Time
          </span>
          <input
            type="time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            className="flex-1 bg-transparent p-3 text-sm focus:outline-none"
            placeholder="Set time (HH:MM)"
          />
        </div>
      )}

      {/* Date of Travel */}
      {(activeTab === "PUBLISH RIDE" || activeTab === "FIND MATCH") &&
        whenValue === "Schedule..." && (
          <div className="flex items-center bg-gray-200 rounded-lg overflow-hidden">
            <span className="w-20 px-4 text-xs font-medium text-gray-500 uppercase">
              Date
            </span>
            <input
              type="date"
              min={todayStr}
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 bg-transparent p-3 text-sm focus:outline-none"
            />
          </div>
        )}
    </div>
  );
}