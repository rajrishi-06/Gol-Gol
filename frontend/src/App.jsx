import React, { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import { Routes,Route } from 'react-router-dom'
import Getride from './components/getride'
import Login from './components/Login'
import Setride from './components/setride'
import Dashboard from './components/Dashboard'
import SendOTP from './pages/SendOTP'

function App() {
  let [logIn, setLogIn] = useState(false);
  return (
  <div>
  <Routes>
    <Route path ="/" element ={<Getride logIn={logIn}/>}/>
    <Route path ="/setride" element ={<Setride/>}/>
    {/* <Route path ="/login" element ={<Login setLogIn={setLogIn} />}/> */}
    <Route path ="/login" element ={<SendOTP />}/>
    <Route path ="/dashboard" element ={<Dashboard setLogIn={setLogIn}/>}/>
  </Routes>

</div>
   
  )
}

export default App;
