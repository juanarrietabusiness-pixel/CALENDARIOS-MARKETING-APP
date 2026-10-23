// ============================================================
// Service worker de «Compartir»: SÓLO recibe lo que se comparte con la app
//
// Desde la hoja de compartir del teléfono (Android, la app instalada), el
// manifiesto manda un POST multipart a /compartir con el texto, el enlace
// y los ARCHIVOS (el video que se guardó de Instagram o TikTok). Ese POST no
// puede llegar al servidor —no lleva sesión y el archivo pesa—: lo recibe
// este service worker, guarda los archivos en la caché «compartido» y
// redirige a /compartir?…&archivos=<id>:<n>, que la aplicación abre como
// «Guardar referencia» y sube a la galería del cliente que se escoja.
//
// Todo lo demás pasa de largo (no hay caché de la aplicación ni modo sin
// conexión): sólo se atiende POST /compartir.
// ============================================================

const CACHE = "compartido";
const MAX_ARCHIVOS = 5;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/compartir") return;
  e.respondWith((async () => {
    const q = new URLSearchParams();
    try {
      const datos = await e.request.formData();
      for (const k of ["title", "text", "url"]) {
        const v = datos.get(k);
        if (typeof v === "string" && v.trim()) q.set(k, v.trim().slice(0, 2000));
      }
      const archivos = datos.getAll("archivos").filter((f) => f && typeof f === "object" && f.size > 0).slice(0, MAX_ARCHIVOS);
      if (archivos.length) {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const cache = await caches.open(CACHE);
        await Promise.all(archivos.map((f, i) => cache.put(`/compartido/${id}/${i}`, new Response(f, {
          headers: { "content-type": f.type || "application/octet-stream", "x-nombre": encodeURIComponent(f.name || `archivo-${i + 1}`) },
        }))));
        q.set("archivos", `${id}:${archivos.length}`);
      }
    } catch {
      q.set("error", "archivos");
    }
    return Response.redirect(new URL(`/compartir?${q}`, self.location.origin).href, 303);
  })());
});
