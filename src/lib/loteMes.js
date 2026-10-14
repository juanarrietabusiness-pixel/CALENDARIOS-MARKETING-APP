// ============================================================
// El lote del MES completo (puro)
//
// Lo que ya camina en el calendario, en una tanda del Estudio: se escoge el
// mes y qué días de la semana se publica, y cada día toma su tipo de
// contenido del RITMO del cliente (lunes Anuncio, martes Beneficios…), con
// los ajustes de temporada de sus fechas especiales (`sugerenciasDeTemporada`:
// sin promociones en un día delicado, promoción en una fecha comercial). La
// MATRIZ del mes (`asignarMatriz`) le da a cada uno su producto, su nivel de
// consciencia, su deseo y su perfil, rotando como en «Planificar mes».
//
// Encima, lo que hace que no salgan iguales (como el lote por niveles): una
// composición, un fondo y una puerta de entrada por pieza. La IA escribe la
// idea, el texto de la pieza y la descripción; una persona las revisa; se
// crean, y van al calendario como IDEAS PARA APROBAR, cada una en su día.
//
// Lo usan la pantalla (EstudioLote.jsx) y el Worker (worker/lib/estudio/loteMes.js).
// ============================================================

import { ritmoDelMes, sugerenciasDeTemporada, asignarMatriz, pilarDe, nombreDePilar } from "./pilares.js";
import { nombreDeNivel } from "./consciencia.js";
import { COMPOSICIONES, PUERTAS, FONDOS, FORMATOS_LOTE, MAX_TITULAR, MAX_APOYO, MAX_ESCENA, textoDeIdea } from "./loteAnuncios.js";

export const MAX_MES = 31;
export const MAX_DESCRIPCION = 600;
/** Lunes primero, como la rejilla del calendario. [día de la semana (0 = domingo), nombre corto]. */
export const DIAS_LOTE = Object.freeze([[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]]);

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const dos = (n) => String(n).padStart(2, "0");
const diaDeSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/**
 * Los días del lote → [{ fecha, pilar, cambio? }]: los del mes cuyo día de la semana esté en `dias`, con su tipo del
 * ritmo y los cambios de temporada aplicados (`cambio`: por qué). Los días sin tipo (el domingo libre) no entran, ni
 * los anteriores a `desde` (hoy, si es el mes en curso). Pura.
 */
export function diasDelLote({ year, month, ritmo = null, fechas = [], dias = [], desde = "" }) {
  const cambios = sugerenciasDeTemporada({ year, month, ritmo, fechas });
  const porFecha = ritmoDelMes(year, month, ritmo, cambios);
  const motivos = new Map(cambios.map((c) => [c.fecha, c.motivo]));
  const quiere = new Set((dias ?? []).map(Number));
  return Object.entries(porFecha)
    .filter(([fecha, pilar]) => pilar && quiere.has(diaDeSemana(fecha)) && (!desde || fecha >= desde))
    .slice(0, MAX_MES)
    .map(([fecha, pilar]) => ({ fecha, pilar, ...(motivos.has(fecha) ? { cambio: motivos.get(fecha) } : {}) }));
}

/** Los días de la semana que tienen tipo en el ritmo: los que se marcan solos. Pura. */
export function diasConTipo(ritmo, year, month) {
  const porFecha = ritmoDelMes(year, month, ritmo);
  return DIAS_LOTE.map(([d]) => d).filter((d) => Object.entries(porFecha).some(([f, p]) => p && diaDeSemana(f) === d));
}

/**
 * El plan: la matriz del mes (producto, nivel, deseo, perfil, la maleta que toca) y la forma de cada pieza
 * (composición, fondo, puerta y dónde va el texto). `productos`: los del plan (`productosParaPlan`). Pura.
 */
export function planDelMes(dias, { productos = [], deseos = [], perfiles = [], semilla = 0, formato = "post" } = {}) {
  const s = Math.abs(Math.floor(Number(semilla) || 0));
  return asignarMatriz(dias.map((d) => ({ fecha: d.fecha, pilar: d.pilar, ...(d.cambio ? { cambio: d.cambio } : {}) })), { productos, deseos, perfiles })
    .map((p, i) => {
      const comp = COMPOSICIONES[(s + i * 4) % COMPOSICIONES.length];
      return {
        n: i + 1,
        ...p,
        composicion: comp.id,
        plantilla: formato === "historia" && comp.plantilla === "banda" ? "centro" : comp.plantilla,
        fondo: FONDOS[(s + i) % FONDOS.length][0],
        puerta: PUERTAS[(s + i * 3) % PUERTAS.length][0],
      };
    });
}

const fechaLegible = (fecha) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Lo que se le pide a la IA: una pieza por día, con todo ya decidido. `productos`: { id → línea del catálogo (precio
 * EXACTO) }; `fechasEspeciales`: las del mes, en una línea cada una. Pura.
 */
export function pedidoDelMes({ marca = "la marca", plan = [], productos = {}, estudio = "", contexto = "", fechasEspeciales = [], usados = [], formato = "post", campana = "" }) {
  return [
    `Escribe el contenido de ${plan.length} publicaciones de una imagen (${FORMATOS_LOTE[formato]?.nombre ?? "post"}) de ${marca} para el mes, una por día. Cada una tiene YA decidido su tipo de contenido (lo que comunica), su nivel de consciencia, su puerta de entrada y su composición: respétalos.`,
    campana ? `La campaña del mes: ${corto(campana, 300)}` : "",
    fechasEspeciales.length ? `Fechas especiales del mes:\n${fechasEspeciales.map((f) => `- ${f}`).join("\n")}` : "",
    "",
    ...plan.map((r) => {
      const p = pilarDe(r.pilar);
      return [
        `${r.n}. ${fechaLegible(r.fecha)} · ${nombreDePilar(r.pilar, r.pilarSub)}: ${p?.regla ?? ""}`,
        `   nivel: ${nombreDeNivel(r.nivel) || "—"} · puerta: ${PUERTAS.find(([id]) => id === r.puerta)?.[1] ?? ""} · composición: ${COMPOSICIONES.find((c) => c.id === r.composicion)?.nombre ?? ""}`,
        r.productoId && productos[r.productoId] ? `   producto: ${productos[r.productoId]}` : "",
        r.deseo || r.perfil ? `   le habla a: ${[r.perfil, r.deseo && `deseo de ${r.deseo}`].filter(Boolean).join(", ")}` : "",
        r.cambio ? `   ojo: ${r.cambio}` : "",
      ].filter(Boolean).join("\n");
    }),
    "",
    "Cada publicación tiene:",
    `- "titular": el texto grande de la pieza, de 8 palabras como mucho (${MAX_TITULAR} caracteres).`,
    `- "apoyo": una línea corta debajo (${MAX_APOYO} caracteres). Puede ir vacía.`,
    `- "escena": qué se VE en la imagen, en una o dos frases, SIN texto, con su composición. Con el producto real si aparece.`,
    `- "descripcion": el texto de la publicación (caption), de 2 a 4 frases, con un llamado a la acción si el tipo lo pide; sin hashtags (${MAX_DESCRIPCION} caracteres).`,
    "",
    "Reglas:",
    "- Todo el mes junto debe sentirse variado: ni dos titulares parecidos, ni dos escenas en el mismo lugar con la misma acción.",
    "- Precios, ofertas, garantías y cifras: sólo los del catálogo y EXACTOS como allí. No inventes testimonios, personas ni descuentos.",
    "- Un día marcado «sin promociones» no vende ni da precios.",
    "- No copies literal frases de lo que se sabe de la marca, y no nombres a la competencia.",
    usados.length ? `- Estos titulares ya salieron: no repitas ninguno ni su idea:\n${usados.slice(0, 30).map((t) => `  · ${corto(t, MAX_TITULAR)}`).join("\n")}` : "",
    "",
    estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 7000)}\n` : "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
    'Responde SOLO con JSON, una por número, así: {"ideas":[{"n":1,"titular":"…","apoyo":"…","escena":"…","descripcion":"…"}]}',
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

/** La respuesta de la IA → una idea por día del plan (por su número; si no lo trae, por orden). Pura. */
export function leerIdeasDelMes(texto, plan = []) {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  const porNumero = new Map();
  lista.forEach((x, i) => {
    const n = Number(x?.n) || i + 1;
    if (!porNumero.has(n)) porNumero.set(n, x);
  });
  return plan.flatMap((r) => {
    const x = porNumero.get(r.n);
    const titular = corto(x?.titular, MAX_TITULAR).replace(/^["«“]|["»”]$/g, "");
    const escena = corto(x?.escena, MAX_ESCENA);
    if (!titular || !escena) return [];
    return [{
      id: `mes-${r.fecha}-${r.n}`, ...r, titular, apoyo: corto(x?.apoyo, MAX_APOYO), escena,
      descripcion: String(x?.descripcion ?? "").trim().slice(0, MAX_DESCRIPCION), elegida: true,
    }];
  });
}

/**
 * La publicación de una pieza del mes: en su día, como IDEA PARA APROBAR (pendiente), con su tipo, su matriz, el
 * texto de la pieza, la descripción y la imagen. Pura.
 */
export function publicacionDelMes({ id, idea, archivo, formato = "post" }) {
  return {
    id,
    format: FORMATOS_LOTE[formato]?.format ?? "post",
    title: idea.titular,
    idea: idea.escena,
    textoPieza: textoDeIdea(idea),
    ...(idea.descripcion ? { descripcion: idea.descripcion } : {}),
    pilar: idea.pilar,
    ...(idea.pilarSub ? { pilarSub: idea.pilarSub } : {}),
    ...(idea.nivel ? { nivel: idea.nivel } : {}),
    ...(idea.productoId ? { productoId: idea.productoId, producto: idea.producto ?? "" } : {}),
    ...(idea.deseo ? { deseo: idea.deseo } : {}),
    ...(idea.perfil ? { perfil: idea.perfil } : {}),
    status: "pending",
    medios: [{ src: archivo.src, tipo: "imagen", ...(archivo.ancho && archivo.alto ? { ancho: archivo.ancho, alto: archivo.alto } : {}) }],
  };
}

/** «Lote octubre 2026». Pura. */
export const carpetaDelMes = (year, month) =>
  `Lote ${new Date(Date.UTC(year, month, 15)).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" })}`;

/** «lun 12 oct». Pura. */
export const fechaCortaLote = (fecha) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** El año y el mes (0–11) de una «AAAA-MM». */
export const mesDe = (texto) => {
  const [y, m] = String(texto ?? "").split("-").map(Number);
  return Number.isInteger(y) && m >= 1 && m <= 12 ? { year: y, month: m - 1 } : null;
};
export const textoMes = (year, month) => `${year}-${dos(month + 1)}`;
