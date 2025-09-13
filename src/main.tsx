import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PsdTool from './PsdTool.tsx'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PsdTool />
  </StrictMode>,
)
