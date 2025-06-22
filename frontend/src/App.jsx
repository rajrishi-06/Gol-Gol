import React, { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import { Routes,Route } from 'react-router-dom'
import Getride from './components/getride'
import Login from './components/login'
import Setride from './components/setride'
import Dashboard from './components/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'
import Map from './components/Map'
function App() {
  let [logIn, setLogIn] = useState(false);
  return (
  <div>
  <Routes>
    <Route path ="/" element ={<Getride logIn={logIn}/>}/>

    <Route path ="/setride" element ={<Setride/>}/>

    <Route path ="/login" element ={<Login setLogIn={setLogIn} />}/>

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
