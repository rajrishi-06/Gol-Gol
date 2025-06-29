import React, { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import { Routes,Route } from 'react-router-dom'
import Getride from './components/getride'
import Login from './components/login'
import Setride from './components/setride'
import Dashboard from './components/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'
import ConformRide from './components/conformride'


function App() {
  let [logIn, setLogIn] = useState(false);
  let[UserId,setUserId] = useState(null);


   

  return (
  <div>

  <Routes>
    <Route path ="/" element ={<Getride logIn={logIn} UserId={UserId} />}/>

    <Route path ="/setride" element ={<Setride  logIn={logIn} UserId={UserId} />}/>

    <Route path="/login" element={<Login setLogIn={setLogIn} setUserId={setUserId} />} />

<Route path ="/conformride" element ={<ConformRide  logIn={logIn} UserId={UserId}/>}/>
    <Route
        path="/dashboard"
        element={
          <ProtectedRoute logIn={logIn}>
            <Dashboard setLogIn={setLogIn} />
          </ProtectedRoute>
        }
      />

  </Routes>


   </div>
  )
}

export default App;
