import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';

function App() {

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      <LeftPanel />
      <RightPanel />
    </div>
  )
}

export default App;
