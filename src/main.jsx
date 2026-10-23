import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// El service worker de «Compartir» (public/sw.js): sólo recibe lo que se comparte desde el teléfono con sus
// archivos. Sin él, la hoja de compartir sigue funcionando con el enlace, pero el video no llega.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
