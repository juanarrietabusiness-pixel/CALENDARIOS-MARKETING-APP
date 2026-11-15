import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// ============================================================
// Las páginas del CLIENTE FINAL, sin la aplicación de la agencia (src/publico.js)
//
// Un SEGUNDO build, detrás del de vite.config.js y en el mismo dist/ (`npm run build` hace los dos). Va aparte a
// propósito: en el mismo build, los módulos que comparten las dos entradas (los iconos, las fechas, la publicación…)
// salían del trozo grande de la agencia a trozos sueltos, y la carga inicial de la agencia crecía 1 kB comprimido sin
// que cambiara nada suyo. Así cada una se trocea a su manera y la de la agencia queda como estaba.
//
// Construye publico.html y lo copia con el nombre de cada página: Cloudflare (html_handling «auto-trailing-slash», el
// de por defecto; ya lo usaban privacidad.html y terminos.html) contesta /aprobar con aprobar.html ANTES del respaldo
// de la SPA, que sigue sirviendo index.html para todo lo demás. publico.html no se publica: /publico no es ninguna
// página. Si alguien abre una de estas páginas con index.html (`npm run dev`, un enlace viejo con `#/aprobar`), App.jsx
// sigue sabiendo pintarla.
// ============================================================

const RAIZ = fileURLToPath(new URL('.', import.meta.url))
export const PAGINAS_PUBLICAS = ['aprobar', 'informe', 'informe-anuncios', 'ventas', 'voz', 'auditoria']

function paginasPublicas() {
  let salida = ''
  return {
    name: 'paginas-publicas',
    apply: 'build',
    configResolved(c) { salida = resolve(c.root, c.build.outDir) },
    writeBundle() {
      const origen = resolve(salida, 'publico.html')
      if (!existsSync(origen)) return
      for (const p of PAGINAS_PUBLICAS) copyFileSync(origen, resolve(salida, `${p}.html`))
      rmSync(origen)
    },
  }
}

export default defineConfig({
  plugins: [react(), paginasPublicas()],
  base: '/',
  // public/ ya lo copió el build de la agencia.
  publicDir: false,
  build: {
    target: 'es2020',
    cssMinify: 'lightningcss',
    // El build de la agencia acaba de escribir dist/: no se borra.
    emptyOutDir: false,
    rollupOptions: {
      input: { publico: resolve(RAIZ, 'publico.html') },
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
