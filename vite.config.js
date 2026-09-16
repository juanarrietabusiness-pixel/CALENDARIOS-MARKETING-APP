import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Siempre '/'. Antes esto era
  //   process.env.GITHUB_ACTIONS ? '/CALENDARIOS-MARKETING-APP/' : '/'
  // porque el sitio se publicaba en GitHub Pages bajo un subdirectorio, y
  // quien construía para allí era Actions. Ahora Actions construye para
  // Cloudflare, donde los recursos cuelgan de la raíz.
  //
  // Dejarlo condicionado a CI era una trampa perfecta: en local salía
  // bien y sólo se rompía en el build que se publica. El HTML pedía
  // /CALENDARIOS-MARKETING-APP/assets/index-*.js, el respaldo de la SPA
  // devolvía index.html con content-type text/html, y el navegador se
  // negaba a ejecutar HTML como módulo. Página en blanco, sin un error
  // que mirar y con el título correcto en la pestaña.
  base: '/',
  build: {
    target: 'es2020',
    cssMinify: 'lightningcss',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react';
          }
        },
      },
    },
  },
})
