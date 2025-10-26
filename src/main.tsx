import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import psdUrl from './ccchu.psd?url'
import PsdTool from './PsdTool.tsx'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import './main.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PsdTool url={psdUrl} />
  </StrictMode>,
)
