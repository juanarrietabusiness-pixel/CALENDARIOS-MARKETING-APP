// ============================================================
// La ESTRATEGIA del mes y su BALANCE (puro)
//
// Antes de escribir ideas, el mes tiene un objetivo (vender, crecer, lanzar,
// marca), un producto foco (o la marca entera), una campaña y una narrativa
// por semanas que recorre el embudo: atraer → considerar → convertir →
// fidelizar. La IA la PROPONE con lo que la aplicación ya sabe —el catálogo,
// el estudio de mercado, las fechas especiales del mes y lo que mejor
// funcionó el mes anterior— y una persona la ajusta. Lo propuesto entra en
// el motor de ideas como `estrategia` (`textoEstrategiaDelMes`) y el foco
// pesa en la rotación de productos (`asignarMatriz({ foco })`).
//
// El BALANCE mira el mes ya planeado y avisa de lo que se descompensa: un
// tipo de contenido que se come el mes, un producto que acapara, un mes que
// no vende (o que sólo vende), sin reels, el mismo formato muchos días
// seguidos, una semana vacía. Son reglas: no cuestan nada.
//
// Lo usan la pantalla («Planificar mes», «Revisar el mes») y el Worker
// (worker/lib/estudio/estrategiaMes.js).
// ============================================================

import { nombreDePilar, pilarDe } from "./pilares.js";
import { nombreDeNivel } from "./consciencia.js";

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** Lo que el mes persigue. `embudo`: cómo se reparten las semanas por defecto (la IA puede cambiarlo). */
export const OBJETIVOS_MES = Object.freeze([
  { id: "ventas", nombre: "Vender", ayuda: "Llevar a la compra: más piezas que convierten, con precio y llamado a la acción.", embudo: ["atraer", "considerar", "convertir", "convertir", "fidelizar"] },
  { id: "seguidores", nombre: "Crecer en seguidores", ayuda: "Alcance y comunidad: contenido que se comparte y que trae gente nueva.", embudo: ["atraer", "atraer", "considerar", "atraer", "fidelizar"] },
  { id: "lanzamiento", nombre: "Lanzar un producto", ayuda: "Expectativa, presentación y primeras ventas de algo nuevo.", embudo: ["atraer", "considerar", "convertir", "convertir", "fidelizar"] },
  { id: "marca", nombre: "Marca y confianza", ayuda: "Que la conozcan y confíen: diferenciador, proceso, garantías, testimonios.", embudo: ["atraer", "considerar", "fidelizar", "considerar", "fidelizar"] },
]);
export const objetivoDe = (id) => OBJETIVOS_MES.find((o) => o.id === id) ?? null;

/** Las etapas del embudo y los niveles de consciencia que tocan. */
export const ETAPAS = Object.freeze({
  atraer: { nombre: "Atraer", niveles: ["inconsciente", "problema"], ayuda: "gente nueva: el problema, curiosidad, contenido que se comparte" },
  considerar: { nombre: "Considerar", niveles: ["solucion", "producto"], ayuda: "la solución y por qué esta marca: beneficios, diferenciador, prueba" },
  convertir: { nombre: "Convertir", niveles: ["producto", "decision"], ayuda: "la compra: oferta, precio exacto, garantía, llamado a la acción" },
  fidelizar: { nombre: "Fidelizar", niveles: ["producto", "decision"], ayuda: "quien ya compró o ya sigue: testimonios, comunidad, detrás de cámaras" },
});
const IDS_ETAPA = Object.keys(ETAPAS);

/** El reparto por defecto de las semanas según el objetivo (sin objetivo, el de vender). Pura. */
export function embudoDelMes(objetivo, semanas = 5) {
  const base = (objetivoDe(objetivo) ?? OBJETIVOS_MES[0]).embudo;
  return Array.from({ length: Math.max(0, semanas) }, (_, i) => base[Math.min(i, base.length - 1)]);
}

/**
 * Lo que mejor funcionó en un periodo, de las filas de `metricas_publicacion`: las `n` con más interacciones
 * publicadas entre `desde` y `hasta` (AAAA-MM-DD). → [{ texto, tipo, red, interacciones }]. Pura.
 */
export function mejoresDelPeriodo(filas = [], { desde = "", hasta = "" } = {}, n = 5) {
  return (filas ?? [])
    .filter((f) => { const d = String(f?.publicada_at ?? "").slice(0, 10); return d && d >= desde && d <= hasta; })
    .sort((a, b) => (Number(b.interacciones) || 0) - (Number(a.interacciones) || 0))
    .slice(0, n)
    .map((f) => ({ texto: corto(f.texto, 160), tipo: corto(f.tipo, 30), red: corto(f.red, 20), interacciones: Number(f.interacciones) || 0 }));
}

/**
 * El pedido de la estrategia. `productos`: líneas del catálogo con su id («- [id] Nombre · $precio»); `semanas`:
 * [{ n, desde, hasta }]; `fechas`: [{ fecha, nombre, delicada }]; `mejores`: lo que mejor funcionó el mes anterior. Pura.
 */
export function pedidoDeEstrategia({
  marca = "la marca", rubro = "", mes = "", objetivo = "", foco = "", productos = [], estudio = "", contexto = "",
  semanas = [], fechas = [], mejores = [], ofertas = "",
} = {}) {
  const obj = objetivoDe(objetivo);
  return [
    `Eres el estratega de contenido de una agencia. Diseña la estrategia de redes de ${marca}${rubro ? ` (${rubro})` : ""} para ${mes || "el mes"}: el objetivo, el producto foco, la campaña y una narrativa por semanas que recorra el embudo.`,
    "",
    obj ? `OBJETIVO (lo decidió la agencia, respétalo): ${obj.nombre} — ${obj.ayuda}` : `OBJETIVO: escoge uno de ${OBJETIVOS_MES.map((o) => `"${o.id}" (${o.nombre})`).join(", ")}, el que más le convenga este mes.`,
    foco ? `PRODUCTO FOCO (lo decidió la agencia): ${corto(foco, 160)}.` : productos.length ? "PRODUCTO FOCO: escoge uno del catálogo (su id) o \"\" para la marca entera." : "",
    productos.length ? `CATÁLOGO (los precios son EXACTOS; no inventes otros):\n${productos.slice(0, 30).join("\n")}` : "",
    estudio ? `ESTUDIO DE MERCADO:\n${corto(estudio, 2500)}` : "",
    contexto ? `LO QUE SABEMOS DE LA MARCA:\n${corto(contexto, 3000)}` : "",
    fechas.length ? `FECHAS ESPECIALES DEL MES (las «delicadas» no venden):\n${fechas.slice(0, 20).map((f) => `- ${f.fecha}: ${corto(f.nombre, 80)}${f.delicada ? " (delicada: sin promociones)" : ""}`).join("\n")}` : "",
    mejores.length ? `LO QUE MEJOR FUNCIONÓ EL MES ANTERIOR (por interacciones; aprende de su tema y su forma, no lo copies):\n${mejores.map((m, i) => `${i + 1}. [${m.red}${m.tipo ? ` · ${m.tipo}` : ""} · ${m.interacciones} interacciones] ${m.texto}`).join("\n")}` : "",
    ofertas ? `OFERTAS QUE YA HAY ESTE MES: ${corto(ofertas, 400)}` : "",
    "",
    `SEMANAS DEL MES (${semanas.length}):\n${semanas.map((s) => `- Semana ${s.n}: del ${s.desde} al ${s.hasta}`).join("\n")}`,
    `Cada semana tiene un CONCEPTO (una frase concreta que guía todas sus piezas, no un eslogan genérico) y una ETAPA del embudo: ${IDS_ETAPA.map((e) => `"${e}" (${ETAPAS[e].ayuda})`).join("; ")}. Reparte las etapas según el objetivo y aprovecha las fechas especiales en su semana.`,
    "La campaña es el hilo del mes: un nombre corto y memorable y de qué va, en una o dos frases.",
    "No inventes descuentos, cifras ni testimonios: una oferta sólo si está en «Ofertas» o en el catálogo.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"objetivo":"${obj ? obj.id : "ventas|seguidores|lanzamiento|marca"}","foco":"id del producto o \\"\\"","campana":"…","razon":"por qué esta estrategia, en dos frases","semanas":[{"concepto":"…","etapa":"atraer|considerar|convertir|fidelizar"}],"ofertas":"sugerencia de oferta si encaja con lo que hay, o \\"\\""}`,
  ].filter((l) => l !== "").join("\n");
}

/**
 * La respuesta de la IA → { objetivo, focoId, campana, razon, semanas: [{ concepto, etapa }], ofertas }, o null.
 * `semanas`: cuántas tiene el mes (se rellena con el embudo por defecto); `productos`: ids válidos. Pura.
 */
export function leerEstrategia(texto, { semanas = 5, productos = [], objetivo = "" } = {}) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const obj = objetivoDe(objetivo)?.id ?? objetivoDe(d.objetivo)?.id ?? "ventas";
  const defecto = embudoDelMes(obj, semanas);
  const lista = Array.isArray(d.semanas) ? d.semanas : [];
  const ids = new Set(productos.map(String));
  return {
    objetivo: obj,
    focoId: ids.has(String(d.foco ?? "")) ? String(d.foco) : "",
    campana: corto(d.campana, 300),
    razon: corto(d.razon, 500),
    ofertas: corto(d.ofertas, 400),
    semanas: Array.from({ length: semanas }, (_, i) => ({
      concepto: corto(lista[i]?.concepto ?? (typeof lista[i] === "string" ? lista[i] : ""), 200),
      etapa: IDS_ETAPA.includes(lista[i]?.etapa) ? lista[i].etapa : defecto[i],
    })),
  };
}

/** La estrategia guardada en el calendario (`opciones.estrategia`), limpia. Pura. */
export function limpiarEstrategia(e) {
  if (!e || typeof e !== "object") return null;
  const salida = {
    objetivo: objetivoDe(e.objetivo)?.id ?? "",
    focoId: corto(e.focoId, 80),
    foco: corto(e.foco, 160),
    razon: corto(e.razon, 500),
    etapas: (Array.isArray(e.etapas) ? e.etapas : []).slice(0, 6).map((x) => (IDS_ETAPA.includes(x) ? x : "")),
  };
  return salida.objetivo || salida.focoId || salida.etapas.some(Boolean) ? salida : null;
}

/** Las líneas de la semana con su etapa para el motor: «Semana 2 (Considerar): …». Pura. */
export const semanasConEtapa = (conceptos = [], etapas = []) =>
  conceptos.map((c, i) => (corto(c, 160) && etapas[i] ? `${corto(c, 160)} (etapa: ${ETAPAS[etapas[i]].nombre} — ${ETAPAS[etapas[i]].ayuda})` : corto(c, 160)));

// ---------- El balance ----------

const NIVELES_VENTA = new Set(["producto", "decision"]);
const NOMBRE_FORMATO = { post: "Post", reel: "Reel", carrusel: "Carrusel", historia: "Historia", live: "Directo" };
const cuenta = (lista, clave) => lista.reduce((m, p) => { const k = clave(p); if (k) m[k] = (m[k] ?? 0) + 1; return m; }, {});
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/**
 * El balance de un mes: cuántas de cada formato, tipo, nivel y producto, y los avisos. `days`: los del calendario
 * (o del plan: [{ date, posts: [{ format, pilar, pilarSub, nivel, productoId, producto }] }]); `semanas`: las filas
 * de la rejilla [{ n, desde, hasta }] para ver si alguna queda vacía; `foco`: el nombre del producto foco (no es un aviso
 * que acapare; sí que salga poco). → { total, formatos, tipos, niveles, productos,
 * avisos: [{ tipo: "aviso" | "nota", texto }] }. Pura.
 */
export function balanceDelMes(days = [], { semanas = [], objetivo = "", foco = "" } = {}) {
  const posts = [];
  for (const d of days ?? []) for (const p of d?.posts ?? []) if (p && d?.date) posts.push({ ...p, fecha: d.date });
  const total = posts.length;
  const formatos = cuenta(posts, (p) => p.format || "post");
  const tipos = cuenta(posts, (p) => (pilarDe(p.pilar) ? nombreDePilar(p.pilar) : ""));
  const niveles = cuenta(posts, (p) => nombreDeNivel(p.nivel));
  const productos = cuenta(posts, (p) => corto(p.producto, 60));
  const avisos = [];
  if (total < 4) return { total, formatos, tipos, niveles, productos, avisos };

  const [tipoMayor, nTipo] = Object.entries(tipos).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (tipoMayor && nTipo / total > 0.4 && Object.keys(tipos).length > 1) avisos.push({ tipo: "aviso", texto: `«${tipoMayor}» es el ${pct(nTipo, total)} % del mes: el resto de tipos casi no aparece.` });

  const conProducto = Object.values(productos).reduce((t, n) => t + n, 0);
  const [prodMayor, nProd] = Object.entries(productos).sort((a, b) => b[1] - a[1])[0] ?? [];
  const focoNombre = corto(foco, 60);
  if (prodMayor && prodMayor !== focoNombre && Object.keys(productos).length > 1 && conProducto >= 4 && nProd / conProducto > 0.5) {
    avisos.push({ tipo: "nota", texto: `«${prodMayor}» sale en ${nProd} de ${conProducto} publicaciones con producto. Si no es el foco del mes, reparte.` });
  }
  // El foco del mes tiene que verse: si sale en menos de un tercio de las publicaciones con producto, se dice.
  if (focoNombre && conProducto >= 4 && (productos[focoNombre] ?? 0) / conProducto < 0.3) {
    avisos.push({ tipo: "nota", texto: `El foco del mes («${focoNombre}») sale sólo en ${productos[focoNombre] ?? 0} de ${conProducto} publicaciones con producto.` });
  }

  const conNivel = posts.filter((p) => p.nivel);
  const venta = conNivel.filter((p) => NIVELES_VENTA.has(p.nivel)).length;
  if (conNivel.length >= 4 && venta === 0) avisos.push({ tipo: "aviso", texto: "Ninguna publicación va a quien ya conoce el producto: el mes no empuja a comprar." });
  else if (conNivel.length >= 6 && venta / conNivel.length > 0.75 && objetivo !== "lanzamiento") avisos.push({ tipo: "aviso", texto: `El ${pct(venta, conNivel.length)} % vende: faltan piezas que atraigan gente nueva (educativo, contenido humano).` });
  if (objetivo === "ventas" && conNivel.length >= 6 && venta / conNivel.length < 0.3) avisos.push({ tipo: "nota", texto: `El objetivo es vender y sólo el ${pct(venta, conNivel.length)} % de las piezas va a la compra.` });

  if (total >= 8 && !formatos.reel) avisos.push({ tipo: "nota", texto: "Sin reels: es el formato que más gente nueva trae." });

  // El mismo formato muchos días seguidos (las historias no cuentan: acompañan).
  const porDia = Object.entries(posts.reduce((m, p) => { if (p.format !== "historia") (m[p.fecha] ??= new Set()).add(p.format || "post"); return m; }, {}))
    .sort((a, b) => a[0].localeCompare(b[0]));
  let racha = 1;
  for (let i = 1; i < porDia.length; i++) {
    const [f, prev] = [porDia[i][1], porDia[i - 1][1]];
    const seguido = (Date.parse(`${porDia[i][0]}T12:00:00Z`) - Date.parse(`${porDia[i - 1][0]}T12:00:00Z`)) === 86400000;
    const comun = seguido && f.size === 1 && prev.size === 1 && [...f][0] === [...prev][0] ? [...f][0] : null;
    racha = comun ? racha + 1 : 1;
    if (racha === 4) avisos.push({ tipo: "nota", texto: `${NOMBRE_FORMATO[comun] ?? comun} cuatro días seguidos (hasta el ${porDia[i][0].slice(8)}): alterna formatos.` });
  }

  const vacias = semanas.filter((s) => !posts.some((p) => p.fecha >= s.desde && p.fecha <= s.hasta)).map((s) => s.n);
  if (vacias.length && vacias.length < semanas.length) avisos.push({ tipo: "aviso", texto: `${vacias.length === 1 ? `La semana ${vacias[0]} no tiene` : `Las semanas ${vacias.join(", ")} no tienen`} publicaciones.` });

  return { total, formatos, tipos, niveles, productos, avisos };
}

/** Los formatos con su nombre, de más a menos: «Post 6 · Reel 4 · Carrusel 2». Pura. */
export const resumenFormatos = (formatos = {}) =>
  Object.entries(formatos).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${NOMBRE_FORMATO[f] ?? f} ${n}`).join(" · ");
