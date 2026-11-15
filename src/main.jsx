import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import BarreraErrores from './components/BarreraErrores.jsx'
import { vigilarDespliegue } from './lib/recargaDespliegue.js'

// Una pestaña abierta durante un despliegue pide trozos que ya no existen: se recarga una vez (lib/recargaDespliegue.js).
vigilarDespliegue()

// Las páginas del cliente final (/aprobar, /informe, /ventas, /voz…) tienen su propia entrada, sin la aplicación de la
// agencia (src/publico.js; vite.config.js la copia a aprobar.html y compañía). App las sigue sabiendo pintar: es lo que
// se ve con `npm run dev` o con un enlace viejo con `#/aprobar`.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BarreraErrores completa>
      <App />
    </BarreraErrores>
  </StrictMode>,
)

// El service worker de «Compartir» (public/sw.js): sólo recibe lo que se comparte desde el teléfono con sus
// archivos. Sin él, la hoja de compartir sigue funcionando con el enlace, pero el video no llega.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
