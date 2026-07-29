import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Repo de proyecto en GitHub Pages: el sitio se sirve bajo
  // https://<usuario>.github.io/CALENDARIOS-MARKETING-APP/
  // Sin este `base`, los assets se piden a la raíz del dominio y dan 404.
  base: '/CALENDARIOS-MARKETING-APP/',
})
