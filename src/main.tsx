import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PsdTool from './App.tsx'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PsdTool />
  </StrictMode>,
)
