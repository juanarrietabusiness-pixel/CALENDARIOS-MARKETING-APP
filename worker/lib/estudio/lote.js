// ============================================================
// La producción en lote: la IA escribe las piezas (texto)
//
// Lo puro (las casillas, la forma de cada pieza, el pedido, la lectura) en
// src/lib/loteAnuncios.js y src/lib/loteMes.js. Aquí se junta lo que vive en
// la base: el catálogo (con su precio EXACTO y su inventario), el estudio de
// mercado aprobado (los deseos y perfiles de la matriz, y lo de cada
// producto), el ritmo y las fechas especiales del cliente (el mes) y el
// cerebro para escribir (nunca lo interno).
//
// Cuatro modos, el mismo camino:
//   · niveles  { productoId?, cuantas: { nivel: n } }
//   · matriz   { productoId?, deseos: [..], perfiles: [..], niveles: [..] } (los del estudio aprobado)
//   · tipos    { tipos: { educativo: 3, … } }
//   · mes      { mes: "AAAA-MM", dias: [0–6], omitir?: ["AAAA-MM-DD"] } (omitir: los días que ya tienen publicación)
//   · plan     { casillas: [{ clave, fecha, formato, pilar, pilarSub?, productoId?, nivel?, deseo?, perfil?, semana?, idea? }],
//                estrategia?: { objetivo, campana, foco, ofertas, codigo, semanas: [..] } }: el plan del mes YA decidido por la
//                pantalla («Planificar mes» y «Mes completo» con la plantilla del cliente): formatos MEZCLADOS (post,
//                carrusel, reel, historia), varias por día, la campaña y el concepto de cada semana. Cada idea vuelve con
//                su `clave` para ponerla en su sitio.
//   · publicacion { publicacion: { fecha?, pilar?, pilarSub?, productoId?, nivel?, deseo?, perfil? }, nota? }: UNA pieza,
//     la de una publicación del calendario («Generar» de su Idea / Brief), con lo que ya trae y la misma calidad del lote
// Comunes: { formato, semilla?, usados?, composiciones? } (las que funcionan con este cliente).
// Por TANDAS: { desde, tamano } escribe sólo esas piezas del plan (el plan sale igual con la misma semilla), y la
// pantalla las pide una tras otra pasando lo que ya salió en `usados`. Escribir 30 en una sola llamada daba ideas
// planas: cada pieza recibía muy poca atención. Sin tanda, todas (como antes).
//
// No pide nada al motor de imagen: eso lo hace la pantalla, pieza a pieza,
// después de que una persona revisa las ideas y ve el costo.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { aprenderComposiciones } from "../../../src/lib/loteAnuncios.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, productosParaPlan, lineaDeProducto, notaDeProducto, resumenGeneral, limpiarEstudio } from "../../../src/lib/estudioMercado.js";
import {
  pedidoDeProduccion, leerProduccion, limpiarCuantas, totalDeCuantas, celdasPorNiveles, celdasMatriz, celdasPorTipos, darForma,
  textoDeIdea, FORMATOS_LOTE, COMPOSICIONES,
} from "../../../src/lib/loteAnuncios.js";
import { asignarMatriz, pilarDe, idDePilar } from "../../../src/lib/pilares.js";
import { diasDelLote, planDelMes, mesDe, textoMes } from "../../../src/lib/loteMes.js";
import { fechasDelMes } from "../../../src/lib/fechasEspeciales.js";
import { fechaEnZona } from "../../../src/lib/agenda.js";
import { CLAVES_NIVEL } from "../../../src/lib/consciencia.js";

const fallo = (mensaje, estado = 400) => Object.assign(new Error(mensaje), { estado });
const leerJSON = (t) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t); } catch { return null; }
};
const MODOS = ["niveles", "matriz", "tipos", "mes", "publicacion", "plan"];
/** Cuántas casillas puede traer un plan como mucho (un mes de cuatro por día). */
export const MAX_CASILLAS = 124;
const corto = (t, max = 80) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Las casillas del plan que manda la pantalla, limpias: sólo fechas, formatos, tipos, niveles y productos que existen;
 * el producto, sólo si está activo. Pura salvo por `activos`.
 */
export function limpiarCasillas(lista, activos = []) {
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_CASILLAS).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const formato = FORMATOS_LOTE[c.formato] ? c.formato : "";
    if (!formato) return [];
    const fecha = FECHA.test(String(c.fecha ?? "")) ? String(c.fecha) : "";
    const pilar = pilarDe(c.pilar) ? idDePilar(c.pilar) : "";
    const prod = c.productoId ? activos.find((x) => x.id === c.productoId) : null;
    return [{
      clave: corto(c.clave, 40) || `${fecha}|${formato}`,
      formato,
      ...(fecha ? { fecha } : {}),
      ...(pilar ? { tipo: pilar, pilar } : {}),
      ...(pilar === "maletas" && c.pilarSub ? { pilarSub: corto(c.pilarSub) } : {}),
      ...(CLAVES_NIVEL.includes(c.nivel) ? { nivel: c.nivel } : {}),
      ...(corto(c.deseo) ? { deseo: corto(c.deseo) } : {}),
      ...(corto(c.perfil) ? { perfil: corto(c.perfil) } : {}),
      ...(prod ? { productoId: prod.id } : {}),
      ...(corto(c.semana, 160) ? { semana: corto(c.semana, 160) } : {}),
      ...(corto(c.especial, 120) ? { especial: corto(c.especial, 120) } : {}),
      ...(corto(c.idea, 400) ? { ideaPersona: corto(c.idea, 400) } : {}),
      // «Otra»: lo que pide la agencia para esta (y la que había, para no repetirla).
      ...(corto(c.pide, 300) ? { pide: corto(c.pide, 300) } : {}),
      ...(corto(c.antes, 200) ? { antes: corto(c.antes, 200) } : {}),
      ...(corto(c.cambio, 160) ? { cambio: corto(c.cambio, 160) } : {}),
    }];
  });
}

/** Qué composiciones funcionan con este cliente, leído de su galería (una consulta): para quien no lo manda. */
async function composicionesAprendidas(acceso, clientId) {
  try {
    const filas = await acceso.leerColumnas("estudio_archivos", ["prompt", "favorito", "usado_en", "subido", "borrado_at"], { client_id: clientId });
    const a = (f) => ({ prompt: f.prompt, favorito: Boolean(f.favorito), subido: Boolean(f.subido), usadoEn: leerJSON(f.usado_en) ?? [] });
    return aprenderComposiciones(filas.filter((f) => !f.borrado_at).map(a), filas.filter((f) => f.borrado_at).map(a)).orden;
  } catch {
    return [];
  }
}
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Cuántas piezas por llamada como mucho (lo que pide la pantalla es 6). */
export const TANDA_MAX = 10;

/** → { ideas, producto, productos, conEstudio, modelo, aviso } */
export async function produccionDeLote(env, acceso, cliente, datos = {}) {
  const modo = MODOS.includes(datos.modo) ? datos.modo : "niveles";
  const formato = FORMATOS_LOTE[datos.formato] ? datos.formato : "post";
  let orden = (Array.isArray(datos.composiciones) ? datos.composiciones : []).map(String).filter((id) => COMPOSICIONES.some((c) => c.id === id)).slice(0, 30);

  // Lo que no cuesta nada se comprueba antes de leer nada más.
  if (modo === "niveles" && !totalDeCuantas(datos.cuantas)) throw fallo("Escoge al menos un nivel con una idea.");
  if (modo === "tipos" && !celdasPorTipos(datos.tipos).length) throw fallo("Escoge al menos un tipo de pieza con una idea.");
  if (modo === "plan" && !(Array.isArray(datos.casillas) && datos.casillas.length)) throw fallo("El plan no trae publicaciones.");
  const mes = modo === "mes" ? mesDe(datos.mes) : null;
  const hoy = fechaEnZona();
  if (modo === "mes") {
    if (!mes) throw fallo("Escoge el mes.");
    if (textoMes(mes.year, mes.month) < hoy.slice(0, 7)) throw fallo("Ese mes ya pasó.");
  }

  const { catalogo, estudio, inventario } = await leerMercado(acceso, cliente.id);
  const general = limpiarEstudio(estudio)?.general ?? null;
  const producto = datos.productoId ? productosActivos(catalogo).find((p) => p.id === datos.productoId) : null;
  if (datos.productoId && !producto) throw fallo("Ese producto no está activo en el catálogo.", 404);
  // Con «la marca en general», rotan los del plan: primero los que tienen fotos (así sale el producto REAL).
  const delPlan = productosParaPlan(catalogo, inventario);
  const rotan = producto ? [producto] : [...delPlan.filter((p) => p.fotos?.length), ...delPlan.filter((p) => !p.fotos?.length)];
  const deseos = general?.deseos ?? [];
  const perfiles = general?.perfiles ?? [];
  // Sin las composiciones aprendidas de la pantalla, se leen de la galería (lo hace también «Planificar mes»).
  if (!Array.isArray(datos.composiciones)) orden = await composicionesAprendidas(acceso, cliente.id);

  let plan;
  let fechas = [];
  if (modo === "mes") {
    fechas = fechasDelMes(mes.year, mes.month, leerJSON(cliente.fechas_especiales));
    // Los días que ya tienen publicación no se vuelven a llenar (los manda la pantalla, que mira el calendario).
    const omitir = new Set((Array.isArray(datos.omitir) ? datos.omitir : []).map(String).filter((f) => FECHA.test(f)));
    const dias = diasDelLote({
      ...mes, ritmo: leerJSON(cliente.ritmo_contenido), fechas,
      dias: (Array.isArray(datos.dias) ? datos.dias : []).map(Number).filter((d) => d >= 0 && d <= 6),
      desde: textoMes(mes.year, mes.month) === hoy.slice(0, 7) ? hoy : "",
    }).filter((d) => !omitir.has(d.fecha));
    if (!dias.length) {
      throw fallo(omitir.size
        ? "Todos los días que escogiste ya tienen publicación. Para diseñarlas, usa «Diseñar las que ya hay»."
        : "Ese mes no tiene días con tipo de contenido en los días escogidos (revisa el ritmo del cliente).");
    }
    plan = planDelMes(dias, { productos: rotan, deseos, perfiles, semilla: datos.semilla, formato, orden });
  } else if (modo === "plan") {
    // El plan ya viene decidido (formato, tipo, producto, nivel…): la forma de cada pieza la pone darForma.
    const celdas = limpiarCasillas(datos.casillas, productosActivos(catalogo));
    if (!celdas.length) throw fallo("El plan no trae publicaciones de un formato que se pueda escribir (post, historia, carrusel o reel).");
    const meses = [...new Set(celdas.map((c) => c.fecha?.slice(0, 7)).filter(Boolean))];
    for (const m of meses) {
      const [y, mm] = m.split("-").map(Number);
      fechas.push(...fechasDelMes(y, mm - 1, leerJSON(cliente.fechas_especiales)));
    }
    // Lo que el plan no trae (producto, nivel, deseo, perfil, la maleta) lo pone la matriz, sobre el plan ENTERO: así
    // la rotación es la misma en cada tanda. Lo que ya trae (lo decidió «Planificar mes» o una persona) se respeta.
    // El producto foco de la estrategia del mes pesa la mitad de la rotación.
    const foco = typeof datos.estrategia?.focoId === "string" ? datos.estrategia.focoId : "";
    const conMatriz = asignarMatriz(celdas, { productos: rotan, deseos, perfiles, foco }).map((c) => (c.pilar ? { ...c, tipo: c.pilar } : c));
    plan = darForma(conMatriz, { productos: rotan, semilla: datos.semilla, formato, orden });
  } else if (modo === "publicacion") {
    // Una sola pieza con lo que la publicación ya decidió (su tipo, producto, nivel, deseo y perfil); lo que falte, lo
    // pone la forma del lote. La fecha especial del día también va.
    const p = datos.publicacion && typeof datos.publicacion === "object" ? datos.publicacion : {};
    const fecha = FECHA.test(String(p.fecha ?? "")) ? String(p.fecha) : "";
    const pilar = pilarDe(p.pilar) ? idDePilar(p.pilar) : "";
    const corto = (t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const celda = {
      ...(pilar ? { tipo: pilar, pilar } : {}),
      ...(pilar === "maletas" && p.pilarSub ? { pilarSub: corto(p.pilarSub) } : {}),
      ...(CLAVES_NIVEL.includes(p.nivel) ? { nivel: p.nivel } : {}),
      ...(corto(p.deseo) ? { deseo: corto(p.deseo) } : {}),
      ...(corto(p.perfil) ? { perfil: corto(p.perfil) } : {}),
      ...(fecha ? { fecha } : {}),
    };
    const delPost = p.productoId ? productosActivos(catalogo).find((x) => x.id === p.productoId) : null;
    if (delPost) celda.productoId = delPost.id;
    if (fecha) {
      const [y, m] = fecha.split("-").map(Number);
      fechas = fechasDelMes(y, m - 1, leerJSON(cliente.fechas_especiales)).filter((f) => f.fecha === fecha);
    }
    plan = darForma([celda], { productos: delPost ? [delPost, ...rotan.filter((x) => x.id !== delPost.id)] : rotan, semilla: datos.semilla, formato, orden });
  } else {
    let celdas;
    if (modo === "matriz") {
      // Sólo los deseos y perfiles del estudio aprobado: la matriz no se inventa a quién le habla.
      const ds = (Array.isArray(datos.deseos) ? datos.deseos : []).filter((d) => deseos.some((x) => x.deseo === d));
      const ps = (Array.isArray(datos.perfiles) ? datos.perfiles : []).filter((n) => perfiles.some((x) => x.nombre === n));
      const ns = (Array.isArray(datos.niveles) ? datos.niveles : []).filter((n) => CLAVES_NIVEL.includes(n));
      if (!ds.length || !ps.length) throw fallo("La matriz necesita los deseos y los perfiles del estudio de mercado aprobado.");
      if (!ns.length) throw fallo("Marca al menos un nivel de consciencia.");
      celdas = celdasMatriz({ deseos: ds, perfiles: ps, niveles: ns });
    } else if (modo === "tipos") {
      celdas = asignarMatriz(celdasPorTipos(datos.tipos).map((c) => ({ pilar: c.tipo })), { productos: rotan, deseos, perfiles })
        .map((p) => ({ ...p, tipo: p.pilar }));
    } else {
      celdas = celdasPorNiveles(limpiarCuantas(datos.cuantas));
    }
    // Con un producto escogido, también las piezas frías saben de qué producto es el problema (aunque no salga).
    if (producto) celdas = celdas.map((c) => ({ ...c, productoId: producto.id }));
    plan = darForma(celdas, { productos: rotan, semilla: datos.semilla, formato, orden });
  }

  const total = plan.length;
  const desde = Math.max(0, Math.floor(Number(datos.desde) || 0));
  const tamano = Math.floor(Number(datos.tamano) || 0);
  if (tamano > 0) plan = plan.slice(desde, desde + Math.min(tamano, TANDA_MAX));
  if (!plan.length) return { ideas: [], total, productos: rotan.map((p) => ({ id: p.id, nombre: p.nombre })), conEstudio: Boolean(general) };

  const usadosProd = new Set(plan.map((r) => r.productoId).filter(Boolean));
  const textoEstudio = [
    general ? resumenGeneral(general) : "",
    ...rotan.filter((p) => usadosProd.has(p.id) && estudio?.productos?.[p.id]).slice(0, 3).map((p) => notaDeProducto(estudio.productos[p.id], p)),
  ].filter(Boolean).join("\n\n");

  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, `${producto?.nombre ?? ""} beneficios objeciones público contenido`, { para: "texto", presupuesto: 5000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro, con el catálogo y el estudio */ }

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeProduccion({
      marca: cliente.name, plan, formato, contexto, estudio: textoEstudio, mes: modo === "mes",
      productos: Object.fromEntries(rotan.filter((p) => usadosProd.has(p.id)).map((p) => [p.id, lineaDeProducto(p, { inventario }).slice(2)])),
      perfiles: Object.fromEntries(perfiles.map((p) => [p.nombre, [p.quien, p.dolor && `le duele: ${p.dolor}`, p.aspiracion && `quiere: ${p.aspiracion}`].filter(Boolean).join("; ")])),
      fechasEspeciales: fechas.map((f) => `${f.fecha} · ${f.nombre}${f.delicada ? " (delicada: sin promociones)" : ""}`),
      usados: (Array.isArray(datos.usados) ? datos.usados : []).map((t) => String(t ?? "").slice(0, 80)).filter(Boolean).slice(0, 30),
      nota: modo === "publicacion" ? String(datos.nota ?? "").slice(0, 600) : "",
      estrategia: datos.estrategia && typeof datos.estrategia === "object" ? datos.estrategia : null,
    }),
    salida: plan.reduce((t, r) => t + (FORMATOS_LOTE[r.formato ?? formato]?.guiado ? 850 : 480), 0) + 800,
    funcion: modo === "mes" || modo === "plan" ? "lote del mes" : modo === "publicacion" ? "publicación" : "ideas de anuncios",
  });
  const nombres = new Map(rotan.map((p) => [p.id, p.nombre]));
  const ideas = leerProduccion(r.texto, plan, formato)
    .map((i) => (i.productoId ? { ...i, producto: nombres.get(i.productoId) ?? i.producto ?? "" } : i))
    // «Titular\nApoyo»: lo que va escrito en la pieza (el textoPieza de la publicación).
    .map((i) => ({ ...i, textoPieza: textoDeIdea(i) }));
  if (!ideas.length && !tamano) throw fallo("La IA no devolvió ideas que se puedan leer. Inténtalo otra vez.", 502);
  return {
    ideas, total,
    producto: producto ? { id: producto.id, nombre: producto.nombre, precio: producto.precio } : null,
    productos: rotan.map((p) => ({ id: p.id, nombre: p.nombre })),
    conEstudio: Boolean(general),
    modelo: r.modelo, aviso: r.aviso ?? null,
  };
}

/** Compatibilidad con el nombre de antes (anuncios por nivel). */
export const ideasDeLote = (env, acceso, cliente, datos = {}) => produccionDeLote(env, acceso, cliente, { modo: "niveles", ...datos });
