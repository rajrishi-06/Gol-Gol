import React, { useState } from 'react';
import DriverLeftPanel from './DriverLeftPanel';
import RightPanel from '../RightPanel'; // assume this exists

export default function DriverActivate() {
  return (
    <div className="flex flex-col sm:flex-row h-screen">
        <DriverLeftPanel />
        <RightPanel />
    </div>
  );
}