// ============================================================
// «Primeros pasos» de un cliente: lo que conviene dejar listo al empezar (puro)
//
// No había recorrido inicial (docs/analisis-mejoras-2026-11.md, punto 5): un cliente nuevo se creaba y nadie decía que
// sin logo las piezas salen sin firma, que sin fotos el motor se imagina el producto o que sin ficha técnica la IA
// escribe a ciegas. Es el SEMÁFORO del kit (lib/semaforoKit.js) visto como una lista de tareas de arranque, con lo que
// no es del diseño: el plan semanal, las redes y el primer mes.
//
// El servidor lo cuenta con lo que YA tiene cada fila (GET /api/primeros-pasos/<cliente>, worker/rutas/primerosPasos.js:
// el cliente, su catálogo, si su cerebro tiene ficha técnica, sus cuentas y si algún mes tiene publicaciones) con
// `estadoDePrimerosPasos`, y la pantalla lo convierte en pasos con `pasosDelCliente`. Las dos sin importaciones: el
// Worker no arrastra la pantalla y la pantalla no arrastra el estudio de mercado.
// ============================================================

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t) ?? d; } catch { return d; }
};
const lleno = (t) => String(t ?? "").trim().length > 0;

/**
 * Lo que dice cada fila, en banderas. `cliente`: la fila de `clients`; `productos`: los productos ACTIVOS del catálogo
 * ([{ fotos }]); `estudio`: el JSON aprobado del estudio de mercado; `conFicha`: el cerebro tiene ficha técnica;
 * `redes`: las redes de sus cuentas conectadas; `conMes`: algún mes tiene publicaciones. Pura.
 */
export function estadoDePrimerosPasos({ cliente = {}, productos = [], estudio = null, conBorrador = false, conFicha = false, redes = [], conMes = false } = {}) {
  const kit = leerJSON(cliente.kit_marca, {}) ?? {};
  const conFotos = productos.filter((p) => Array.isArray(p?.fotos) && p.fotos.length).length;
  return {
    ficha: lleno(cliente.industry) && (lleno(cliente.descripcion) || lleno(cliente.audiencia)),
    logo: lleno(kit.logo),
    productos: productos.length,
    conFotos,
    estudio: Boolean(leerJSON(estudio, null)?.aprobadoAt),
    conBorrador: Boolean(conBorrador),
    fichaTecnica: Boolean(conFicha),
    plan: Boolean(cliente.plan_semanal || cliente.plan_contenido || cliente.ritmo_contenido),
    redes: [...new Set(redes.filter(Boolean))],
    mes: Boolean(conMes),
  };
}

const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };

/**
 * Los pasos, en el orden en que conviene hacerlos: [{ id, nombre, hecho, texto, arreglo }]. `arreglo`: a dónde ir
 * (`ir`: [pestaña, sub-sección] del cliente; `ruta`: una dirección de la aplicación) o qué hacer (`accion: "mes"`, abrir
 * «Preparar el mes»). Sin estado, lista vacía. Pura.
 */
export function pasosDelCliente(e = null) {
  if (!e) return [];
  const sinFotos = Math.max(0, Number(e.productos ?? 0) - Number(e.conFotos ?? 0));
  const redes = (e.redes ?? []).map((r) => NOMBRE_RED[r] ?? r);
  return [
    {
      id: "ficha", nombre: "La ficha del cliente", hecho: Boolean(e.ficha),
      texto: e.ficha ? "Su rubro y de qué va: la IA lo lee en todo." : "Escribe su rubro y de qué va: la IA lo lee en todo lo que escribe.",
      arreglo: { etiqueta: "Abrir la ficha", ir: ["marca", "ficha"] },
    },
    {
      id: "logo", nombre: "El logo", hecho: Boolean(e.logo),
      texto: e.logo ? "En el kit: va en cada pieza." : "Sin logo, las piezas salen sin firma.",
      arreglo: { etiqueta: "Subir el logo", ir: ["marca", "kit"] },
    },
    {
      id: "fotos", nombre: "Las fotos de lo que vende", hecho: e.conFotos > 0,
      texto: !e.productos
        ? "Sin catálogo: el motor no sabe qué vende ni cómo es."
        : !e.conFotos
          ? "Ningún producto tiene fotos: el motor se imagina cómo son."
          : sinFotos ? `${e.conFotos} con fotos; ${sinFotos} todavía sin ellas.` : "Cada producto tiene sus fotos reales.",
      arreglo: { etiqueta: e.productos ? "Subir las fotos" : "Escribir el catálogo", ir: ["marca", "cerebro"], mercado: "catalogo" },
    },
    {
      id: "estudio", nombre: "El estudio de mercado", hecho: Boolean(e.estudio),
      texto: e.estudio ? "Aprobado: los anuncios y los textos lo usan." : e.conBorrador ? "Hay un borrador sin aprobar: hasta aprobarlo, la IA no lo usa." : "A quién se le vende, qué le duele y las 7 maletas de cada producto.",
      arreglo: { etiqueta: e.conBorrador ? "Revisarlo y aprobarlo" : "Hacer el estudio", ir: ["marca", "cerebro"], mercado: "estudio" },
    },
    {
      id: "cerebro", nombre: "El cerebro con su ficha técnica", hecho: Boolean(e.fichaTecnica),
      texto: e.fichaTecnica ? "La IA la lee en todo lo que escribe." : "Sube lo que se sabe del cliente y prepara su ficha técnica con IA.",
      arreglo: { etiqueta: "Abrir el cerebro", ir: ["marca", "cerebro"] },
    },
    {
      id: "plan", nombre: "El plan semanal", hecho: Boolean(e.plan),
      texto: e.plan ? "Lo que sale cada día de la semana está fijado." : "Qué sale cada día (formato, tipo y hora), igual todos los meses.",
      arreglo: { etiqueta: "Fijar el plan", ir: ["marca", "plan"] },
    },
    {
      id: "redes", nombre: "Sus redes conectadas", hecho: redes.length > 0,
      texto: redes.length ? `${redes.join(", ")}: se programa desde aquí.` : "Sin redes conectadas, nada sale solo: hay que publicarlo a mano.",
      arreglo: { etiqueta: "Conectar en Ajustes", ruta: "/ajustes#integraciones" },
    },
    {
      id: "mes", nombre: "El primer mes preparado", hecho: Boolean(e.mes),
      texto: e.mes ? "Ya tiene publicaciones en el calendario." : "De la estrategia al envío, con el asistente del mes.",
      arreglo: { etiqueta: "Preparar el mes", accion: "mes" },
    },
  ];
}

/** { hechos, total, completo } de la lista. Pura. */
export function resumenDePasos(pasos = []) {
  const hechos = pasos.filter((p) => p.hecho).length;
  return { hechos, total: pasos.length, completo: pasos.length > 0 && hechos === pasos.length };
}
