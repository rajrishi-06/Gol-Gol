import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import {Routes,Route} from 'react-router-dom'
import Getride from './components/getride'
import Login from './components/login'
import Setride from './components/setride'
import Navbar from './components/Navbar'


function App() {

  return (
<div>
  <Navbar/>
<Routes>
    <Route path ="/" element ={<Getride/>}/>
    <Route path ="/setride" element ={<Setride/>}/>
    <Route path ="/login" element ={<Login/>}/>
   </Routes>

</div>
   
  )
}

export default App;
