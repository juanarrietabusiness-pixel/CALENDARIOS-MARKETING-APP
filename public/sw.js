// ============================================================
// El ÚNICO service worker: lo que se comparte con la app y los avisos en el teléfono
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
//
// Y los AVISOS EN EL TELÉFONO (Web Push, worker/lib/push.js): el servidor
// manda los importantes cifrados, el navegador los descifra y aquí se
// enseñan como notificación ({ titulo, texto, enlace, etiqueta }). Tocarla
// abre (o trae al frente) la aplicación en su enlace, que siempre es de
// este sitio. En el iPhone sólo llegan con la app instalada en la pantalla
// de inicio.
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

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { texto: e.data ? e.data.text() : "" }; }
  const titulo = String(d.titulo || "Juancito Ads").slice(0, 80);
  e.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.texto || "").slice(0, 300),
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: d.etiqueta ? String(d.etiqueta).slice(0, 40) : undefined,
    lang: "es",
    data: { enlace: typeof d.enlace === "string" ? d.enlace : "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let destino = new URL("/", self.location.origin);
  try {
    const u = new URL(e.notification.data?.enlace || "/", self.location.origin);
    if (u.origin === self.location.origin) destino = u;
  } catch { /* el inicio */ }
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const propia = ventanas.find((c) => new URL(c.url).origin === self.location.origin);
    if (propia) {
      await propia.focus();
      if ("navigate" in propia) await propia.navigate(destino.href).catch(() => {});
      return;
    }
    await self.clients.openWindow(destino.href);
  })());
});
