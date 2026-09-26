// ============================================================
// Lo que encuentra el buscador (Ctrl+K) (puro)
//
// Busca sin tildes ni mayúsculas —«cafe» encuentra «Café»— en tres
// sitios a la vez: clientes, calendarios y publicaciones. Sin texto,
// ofrece las acciones de siempre y los clientes. Cada resultado dice
// QUÉ hacer (`accion`), y quien lo pinta no decide nada.
// ============================================================

export const normalizarBusqueda = (t) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const MAX_POR_GRUPO = 6;

export function buscarEnEspacio({ clients = [], client = null, texto = "", meses = [] }) {
  const q = normalizarBusqueda(texto);
  const casa = (...campos) => !q || campos.some((c) => normalizarBusqueda(c).includes(q));
  const salida = [];

  const acciones = [
    { clave: "mi-dia", titulo: "Mi día", icono: "clipboardCheck", accion: { tipo: "ruta", ruta: "/tareas" } },
    { clave: "auditorias", titulo: "Auditar un perfil de Instagram", icono: "search", accion: { tipo: "ruta", ruta: "/auditorias" } },
    { clave: "tablero", titulo: "Tablero: en qué etapa está cada publicación", icono: "grid", accion: { tipo: "ruta", ruta: "/tablero" } },
    { clave: "programacion", titulo: "Programación: lo que sale y lo que falló", icono: "clock", accion: { tipo: "ruta", ruta: "/programacion" } },
    { clave: "subir", titulo: "Subir contenido: publicar o programar", icono: "upload", accion: { tipo: "subir" } },
    { clave: "asistente", titulo: "Abrir el asistente", icono: "messageCircle", accion: { tipo: "asistente" } },
    ...(client ? [{ clave: "nuevo-cal", titulo: `Nuevo calendario de ${client.name}`, icono: "plus", accion: { tipo: "nuevo-calendario" } }] : []),
    { clave: "nuevo-cliente", titulo: "Nuevo cliente", icono: "building", accion: { tipo: "nuevo-cliente" } },
    { clave: "ajustes", titulo: "Ajustes: IA, presupuesto e integraciones", icono: "settings", accion: { tipo: "ruta", ruta: "/ajustes" } },
    { clave: "equipo", titulo: "Equipo", icono: "users", accion: { tipo: "ruta", ruta: "/equipo" } },
  ];
  for (const a of acciones.filter((a) => casa(a.titulo))) salida.push({ ...a, grupo: "Acciones" });

  for (const c of clients.filter((c) => casa(c.name, c.industry, c.instagram)).slice(0, MAX_POR_GRUPO)) {
    salida.push({
      grupo: "Clientes", clave: c.id, titulo: c.name, detalle: c.industry || "", icono: "building",
      accion: { tipo: "cliente", clienteId: c.id },
    });
  }

  if (!q) return salida;

  const cals = [];
  const posts = [];
  for (const c of clients) {
    for (const cal of c.calendars ?? []) {
      const nombre = cal.name || `${meses[cal.month] ?? ""} ${cal.year ?? ""}`.trim();
      if (casa(nombre, `${meses[cal.month] ?? ""} ${cal.year ?? ""}`, cal.campaign, c.name)) {
        cals.push({
          grupo: "Calendarios", clave: cal.id, titulo: nombre, detalle: c.name, icono: "calendar",
          accion: { tipo: "calendario", clienteId: c.id, calId: cal.id },
        });
      }
      for (const day of cal.days ?? []) {
        for (const p of day.posts ?? []) {
          if (posts.length >= MAX_POR_GRUPO * 2) continue;
          if (!casa(p.title, p.idea, p.descripcion, p.hashtagsFinales)) continue;
          posts.push({
            grupo: "Publicaciones",
            clave: `${cal.id}-${p.id}`,
            titulo: p.title || p.idea || "Publicación sin título",
            detalle: `${c.name} · ${day.date ?? ""}`,
            icono: "file",
            accion: { tipo: "publicacion", clienteId: c.id, calId: cal.id, postId: p.id },
          });
        }
      }
    }
  }
  return [...salida, ...cals.slice(0, MAX_POR_GRUPO), ...posts.slice(0, MAX_POR_GRUPO)];
}
