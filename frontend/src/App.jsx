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

import AcceptRide from './components/acceptride' ;

import Findride from './matchingcomp/findride';
import Publishride from './matchingcomp/publishride';



function App() {
  const [logIn, setLogIn] = useState(() => {
  return localStorage.getItem("logIn") === "true";
});

const [UserId, setUserId] = useState(() => {
  return localStorage.getItem("UserId");
});


   

  return (
  <div>

  <Routes>
     <Route path ="/" element ={<Getride logIn={logIn} UserId={UserId} />}/>

    <Route path ="/setride" element ={<Setride  logIn={logIn} UserId={UserId} />}/>

    <Route path="/findride" element={<Findride logIn={logIn} UserId={UserId} />} />

<Route path="/publishride" element={<Publishride logIn={logIn} UserId={UserId} />} />

    <Route path="/login" element={<Login setLogIn={setLogIn} setUserId={setUserId} />} />

<Route path ="/conformride" element ={<ConformRide  logIn={logIn} UserId={UserId}/>}/>

<Route path ="/acceptride" element ={<AcceptRide UserId={UserId} logIn={logIn}  />}/>


 
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
   
  );
}

export default App;
