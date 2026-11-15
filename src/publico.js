// ============================================================
// La entrada de las páginas del CLIENTE FINAL: /aprobar, /informe, /informe-anuncios, /ventas, /voz y /auditoria
//
// Quien abre el enlace de su calendario desde WhatsApp no necesita la aplicación de la agencia (el armazón, el
// calendario, la sesión, el tiempo real): antes la descargaba entera —unos 177 kB comprimidos— antes de pintar nada.
// Esta entrada decide la página por la dirección ANTES de cargar nada y descarga sólo React, los estilos base y esa
// página, todo a la vez (el `import()` precarga sus dependencias en paralelo).
//
// La sirve publico.html, que vite.config.js copia a aprobar.html y compañía: Cloudflare contesta /aprobar con
// aprobar.html antes de caer en el respaldo de la SPA. Si algo sirve index.html en su lugar (`npm run dev`, un enlace
// viejo con `#/aprobar`), App.jsx sigue sabiendo pintar estas páginas.
// ============================================================

import { esFalloDeCarga, recargarUnaVez, vigilarDespliegue } from "./lib/recargaDespliegue.js";

vigilarDespliegue();

const PAGINAS = {
  aprobar: () => import("./pages/Aprobar.jsx"),
  informe: () => import("./pages/Informe.jsx"),
  "informe-anuncios": () => import("./pages/InformeAnuncios.jsx"),
  ventas: () => import("./pages/VentasCliente.jsx"),
  voz: () => import("./pages/VozCliente.jsx"),
  auditoria: () => import("./pages/AuditoriaPublica.jsx"),
};

const nombre = decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[0] ?? "");
const pagina = PAGINAS[nombre];

if (!pagina) {
  // No es una página pública: a la aplicación.
  window.location.replace("/");
} else {
  Promise.all([import("./publicoMontar.js"), pagina()])
    .then(([{ montar }, { default: Pagina }]) => montar(Pagina))
    .catch((e) => {
      if (esFalloDeCarga(e) && recargarUnaVez()) return;
      const raiz = document.getElementById("root");
      if (raiz) raiz.textContent = "No se pudo abrir la página. Revisa tu conexión y vuelve a cargarla.";
    });
}
