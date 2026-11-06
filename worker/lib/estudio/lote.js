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
//   · niveles  { productoId?, cuantas: { nivel: n }, pauta? } (pauta: { etapa } del plan de campañas: cada pieza va a pauta)
//   · matriz   { productoId?, deseos: [..], perfiles: [..], niveles: [..] } (los del estudio aprobado)
//   · tipos    { tipos: { educativo: 3, … } }
//   · mes      { mes: "AAAA-MM", dias: [0–6], omitir?: ["AAAA-MM-DD"] } (omitir: los días que ya tienen publicación)
//   · plan     { casillas: [{ clave, fecha, formato, pilar, pilarSub?, productoId?, nivel?, deseo?, perfil?, semana?, idea? }],
//                estrategia?: { objetivo, campana, foco, ofertas, codigo, semanas: [..] } }: el plan del mes YA decidido por la
//                pantalla («Planificar mes» y «Mes completo» con la plantilla del cliente): formatos MEZCLADOS (post,
//                carrusel, reel, historia), varias por día, la campaña y el concepto de cada semana. Cada idea vuelve con
//                su `clave` para ponerla en su sitio.
//   · publicacion { publicacion: { fecha?, pilar?, pilarSub?, productoId?, nivel?, deseo?, perfil?, rostro?, pauta? }, nota? }: UNA pieza,
//     la de una publicación del calendario («Generar» de su Idea / Brief), con lo que ya trae y la misma calidad del lote
//   · campos     { publicaciones: [casilla + { escrito, campos, antes, formulaUgc?, duracionUgc? }] }: lo que LE FALTA a
//     publicaciones que ya están en el calendario (los botones «IA» de cada campo, «Completar los textos que faltan»,
//     «Generar con IA» de la lista, el banco de ideas, «Escribir guiones y descripciones» de «Planificar mes»): sólo los
//     campos pedidos, con lo ya escrito delante (src/lib/camposTexto.js). Vuelve `textos` en vez de `ideas`.
// En TODOS los modos van la ficha del cliente (sus instrucciones obligatorias, su estilo, sus hashtags y su contacto:
// `textoDelCliente`) y la estrategia del mes: la que manda la pantalla o, si no la manda, la guardada en el calendario
// de ese mes (`estrategiaDelCalendario`).
// Comunes: { formato, semilla?, usados?, composiciones? } (las que funcionan con este cliente).
// Por TANDAS: { desde, tamano } escribe sólo esas piezas del plan (el plan sale igual con la misma semilla), y la
// pantalla las pide una tras otra pasando lo que ya salió en `usados`. Escribir 30 en una sola llamada daba ideas
// planas: cada pieza recibía muy poca atención. Sin tanda, todas (como antes).
//
// LO QUE VA A PAUTA (lib/pauta.js): una casilla con `pauta` (modos «plan», «campos» y «publicacion») lleva su etapa y su caption se
// escribe como ANUNCIO, con el tipo de negocio y el destino del cliente (sus números del negocio, worker/lib/negocio.js:
// una lectura, sólo si alguna va a pauta); en «campos», además, el campo «anuncio» (los textos aparte) cuando se pide,
// y en «plan» y «publicacion» lo trae cada una que va a pauta. 3 hashtags como mucho. Y lo que se aprendió de sus
// anuncios (worker/lib/enPauta.js, `preferenciasDelCliente`: qué tipo de arte, nivel y composición salen más baratos),
// en una línea y sólo si hay muestra: otra lectura, sólo si alguna va a pauta.
//
// No pide nada al motor de imagen: eso lo hace la pantalla, pieza a pieza,
// después de que una persona revisa las ideas y ve el costo.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { pedidoDeCampos, leerCampos, pideCampo, FORMATOS_CAMPOS, ORDEN_CAMPOS, MAX_ESCRITO, MAX_PUBLICACIONES_CAMPOS } from "../../../src/lib/camposTexto.js";
import { limpiarPauta, bloqueDeAnuncio, lineaDePauta, anunciosDeRespuesta, recortarHashtags } from "../../../src/lib/pauta.js";
import { leerNegocio } from "../negocio.js";
import { preferenciasDelCliente } from "../enPauta.js";
import { estrategiaDelCalendario } from "../../../src/lib/estrategiaMes.js";
import { duracionUgc } from "../../../src/lib/ugc.js";
import { aprenderComposiciones } from "../../../src/lib/loteAnuncios.js";
import { contexto as contextoCerebro, textoParaEscribir, buscar as buscarCerebro, leerNota as leerNotaCerebro } from "../cerebro/cerebro.js";
import { consultaDelPlan, materialDelPlan, conEducativo, lineaDeLoQueFalta, MATERIAL, RUTA_RUBRO, TITULO_RUBRO } from "../../../src/lib/materialTipo.js";
import { leerMercado } from "../mercado.js";
import { vozUgcDe } from "../cerebro/vozUgc.js";
import { lineaDeVozUgc } from "../../../src/lib/ugc.js";
import { bloqueDeFormulas, formulaUsada, lineaDeFormula } from "../../../src/lib/formulasUgc.js";
import { leerEstructuras } from "../estructurasGuion.js";
import { productosActivos, productosParaPlan, lineaDeProducto, notaDeProducto, resumenGeneral, limpiarEstudio } from "../../../src/lib/estudioMercado.js";
import {
  pedidoDeProduccion, leerProduccion, limpiarCuantas, totalDeCuantas, celdasPorNiveles, celdasMatriz, celdasPorTipos, darForma, estructurasDeCalendarios,
  textoDeIdea, FORMATOS_LOTE, COMPOSICIONES, TACTICAS, estructuraDe, textoDelCliente,
} from "../../../src/lib/loteAnuncios.js";
import { asignarMatriz, pilarDe, idDePilar } from "../../../src/lib/pilares.js";
import { diasDelLote, planDelMes, mesDe, textoMes } from "../../../src/lib/loteMes.js";
import { fechasDelMes } from "../../../src/lib/fechasEspeciales.js";
import { fechaEnZona } from "../../../src/lib/agenda.js";
import { conNotasDelDia, notaDelDia, productoDeNota } from "../../../src/lib/notasSemana.js";
import { planSemanalDeFila } from "../../../src/lib/planSemanal.js";
import { CLAVES_NIVEL } from "../../../src/lib/consciencia.js";
import { bloqueDeMarca, kitVacio } from "../../../src/lib/kitMarca.js";
import { lineaDeTiposArte, nombresDeSesgos } from "../../../src/lib/tiposArte.js";
import { lineaDePlantilla, bloqueDeDisenoPorTipo } from "../../../src/lib/director.js";
import { manualDelEspacio } from "./fichas.js";
import { kitDe } from "./kit.js";

const fallo = (mensaje, estado = 400) => Object.assign(new Error(mensaje), { estado });
const leerJSON = (t) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t); } catch { return null; }
};
const MODOS = ["niveles", "matriz", "tipos", "mes", "publicacion", "plan", "campos"];
/** Cuántas casillas puede traer un plan como mucho (un mes de cuatro por día). */
export const MAX_CASILLAS = 124;
const corto = (t, max = 80) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Las casillas del plan que manda la pantalla, limpias: sólo fechas, formatos, tipos, niveles y productos que existen;
 * el producto, sólo si está activo. Pura salvo por `activos`.
 */
export function limpiarCasillas(lista, activos = [], { formatos = null } = {}) {
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_CASILLAS).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const formato = (formatos ? formatos.includes(c.formato) : FORMATOS_LOTE[c.formato]) ? c.formato : "";
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
      // La estructura de un video de la competencia que sigue su guion («Planificar mes»: «Estructura del guion»).
      ...((formato === "reel" || formato === "carrusel" || formato === "live") && corto(c.estructuraRef, 900) ? { estructuraRef: corto(c.estructuraRef, 900) } : {}),
      // «Otra»: lo que pide la agencia para esta (y la que había, para no repetirla).
      ...(corto(c.pide, 300) ? { pide: corto(c.pide, 300) } : {}),
      ...(corto(c.antes, 200) ? { antes: corto(c.antes, 200) } : {}),
      ...(corto(c.cambio, 160) ? { cambio: corto(c.cambio, 160) } : {}),
      // Un video con rostro (UGC): lo graba una persona; el guion es para grabarlo.
      ...(formato === "reel" && c.rostro === true ? { rostro: true } : {}),
      // Va a pauta: su caption se escribe como anuncio (lib/pauta.js). Un directo no se pauta.
      ...(formato !== "live" && limpiarPauta(c.pauta) ? { pauta: limpiarPauta(c.pauta) } : {}),
    }];
  });
}

/** Un objeto de textos { campo → texto } limpio: sólo campos que existen, en texto y con tope. Pura. */
const textosLimpios = (o, campos = ORDEN_CAMPOS) => Object.fromEntries((o && typeof o === "object" ? Object.entries(o) : [])
  .filter(([k, v]) => campos.includes(k) && typeof v === "string" && v.trim())
  .map(([k, v]) => [k, v.trim().slice(0, MAX_ESCRITO)]));

/**
 * Las publicaciones del modo «campos», limpias: la casilla de siempre (limpiarCasillas, también un directo) más lo ya
 * escrito, los campos que se piden (sólo los que su formato lleva: lib/reglasFormato.js), lo que había en ellos, su
 * forma (estructura, composición y gancho, si ya la tiene) y, en una UGC, su duración y su fórmula. Fuera las que no
 * piden nada. Pura salvo por `activos`.
 */
export function limpiarParaCampos(lista, activos = []) {
  const crudas = (Array.isArray(lista) ? lista : []).slice(0, MAX_CASILLAS).filter((c) => c && typeof c === "object");
  const limpias = limpiarCasillas(crudas, activos, { formatos: FORMATOS_CAMPOS });
  return limpias.flatMap((c) => {
    const o = crudas.find((x) => corto(x.clave, 40) === c.clave) ?? {};
    const campos = ORDEN_CAMPOS.filter((k) => Array.isArray(o.campos) && o.campos.includes(k) && pideCampo(c.formato, k, c.pauta));
    if (!campos.length) return [];
    return [{
      ...c, campos,
      escrito: textosLimpios(o.escrito, [...ORDEN_CAMPOS, "escena"]),
      antes: textosLimpios(o.antes, campos),
      ...(estructuraDe(o.estructura) ? { estructura: estructuraDe(o.estructura).id } : {}),
      ...(COMPOSICIONES.some((x) => x.id === o.composicion) ? { composicionPost: o.composicion } : {}),
      ...(TACTICAS.some(([x]) => x === o.tactica) ? { tacticaPost: o.tactica } : {}),
      ...(c.rostro ? { duracionUgc: duracionUgc(o.duracionUgc), ...(corto(o.formulaUgc, 80) ? { formulaUgc: corto(o.formulaUgc, 80) } : {}) } : {}),
    }];
  });
}

/**
 * La estrategia guardada del mes (`AAAA-MM`) de este cliente, para el motor, cuando la pantalla no la manda (el lote del
 * mes del Estudio, una publicación suelta): la campaña, las ofertas, el código, el concepto de cada semana con su etapa,
 * el objetivo y el foco. Una consulta sin los días. Null si no hay mes o falla.
 */
async function estrategiaGuardada(acceso, clientId, mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ""));
  if (!m) return null;
  try {
    const [fila] = await acceso.leerColumnas("calendars", ["campaign", "week_concepts", "offers", "promo_code", "opciones"],
      { client_id: clientId, year: Number(m[1]), month: Number(m[2]) - 1 }, null, 1);
    if (!fila) return null;
    return estrategiaDelCalendario({
      campaign: fila.campaign, weekConcepts: leerJSON(fila.week_concepts) ?? [], offers: fila.offers, promoCode: fila.promo_code,
      opciones: leerJSON(fila.opciones) ?? {},
    });
  } catch {
    return null;
  }
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
/**
 * Las estructuras de carrusel que este cliente ya usó (sus tres últimos meses), para no repetirlas: una consulta, sólo
 * cuando el lote puede llevar carruseles.
 */
export async function estructurasRecientes(acceso, clientId) {
  try {
    const filas = await acceso.leerColumnas("calendars", ["days"], { client_id: clientId }, "year desc, month desc", 3);
    return estructurasDeCalendarios(filas.reverse().map((f) => ({ days: leerJSON(f.days) ?? [] })));
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
  if (modo === "campos" && !(Array.isArray(datos.publicaciones) && datos.publicaciones.length)) throw fallo("No hay publicaciones que escribir.");
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
  // Las notas fijas de cada día de la semana («los lunes, muebles y camas»): el tema del día y, si nombran un producto
  // del plan, ese día va con él (lib/notasSemana.js). No cambian ni el formato ni el tipo.
  const semana = planSemanalDeFila(cliente);
  const notas = semana.notas;
  const perfiles = general?.perfiles ?? [];
  // Sin las composiciones aprendidas de la pantalla, se leen de la galería (lo hace también «Planificar mes»).
  if (!Array.isArray(datos.composiciones)) orden = await composicionesAprendidas(acceso, cliente.id);
  // Los carruseles rotan de estructura sin repetir las últimas de ese tipo (errores, mitos, paso a paso…).
  const puedeCarrusel = formato === "carrusel" || modo === "mes" || (modo === "plan" && datos.casillas.some((c) => c?.formato === "carrusel"))
    || (modo === "campos" && datos.publicaciones.some((c) => c?.formato === "carrusel" && !c?.estructura));
  const estructuras = puedeCarrusel ? await estructurasRecientes(acceso, cliente.id) : [];

  let plan;
  let fechas = [];
  if (modo === "mes") {
    fechas = fechasDelMes(mes.year, mes.month, leerJSON(cliente.fechas_especiales));
    // Los días que ya tienen publicación no se vuelven a llenar (los manda la pantalla, que mira el calendario).
    const omitir = new Set((Array.isArray(datos.omitir) ? datos.omitir : []).map(String).filter((f) => FECHA.test(f)));
    const dias = diasDelLote({
      ...mes, ritmo: semana.ritmo, fechas,
      dias: (Array.isArray(datos.dias) ? datos.dias : []).map(Number).filter((d) => d >= 0 && d <= 6),
      desde: textoMes(mes.year, mes.month) === hoy.slice(0, 7) ? hoy : "",
    }).filter((d) => !omitir.has(d.fecha));
    const conNotas = producto ? conNotasDelDia(dias, notas, []) : conNotasDelDia(dias, notas, rotan);
    if (!dias.length) {
      throw fallo(omitir.size
        ? "Todos los días que escogiste ya tienen publicación. Para diseñarlas, usa «Diseñar las que ya hay»."
        : "Ese mes no tiene días con tipo de contenido en los días escogidos (revisa el ritmo del cliente).");
    }
    plan = planDelMes(conNotas, { productos: rotan, deseos, perfiles, semilla: datos.semilla, formato, orden, estructuras });
  } else if (modo === "plan") {
    // El plan ya viene decidido (formato, tipo, producto, nivel…): la forma de cada pieza la pone darForma.
    const celdas = conNotasDelDia(limpiarCasillas(datos.casillas, productosActivos(catalogo)), notas, rotan);
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
    plan = darForma(conMatriz, { productos: rotan, semilla: datos.semilla, formato, orden, estructuras });
  } else if (modo === "campos") {
    // Lo que le falta a publicaciones que ya están en el calendario: la misma forma que el plan (la matriz y darForma
    // completan lo que no traen, para el pedido), y lo que ya traen se respeta: su estructura, su composición y su gancho.
    const celdas = conNotasDelDia(limpiarParaCampos(datos.publicaciones, productosActivos(catalogo)).slice(0, MAX_PUBLICACIONES_CAMPOS), notas, rotan);
    if (!celdas.length) throw fallo("No hay nada que escribir: esas publicaciones ya tienen sus textos o su formato no los lleva.");
    const meses = [...new Set(celdas.map((c) => c.fecha?.slice(0, 7)).filter(Boolean))];
    for (const m of meses) {
      const [y, mm] = m.split("-").map(Number);
      fechas.push(...fechasDelMes(y, mm - 1, leerJSON(cliente.fechas_especiales)));
    }
    const foco = typeof datos.estrategia?.focoId === "string" ? datos.estrategia.focoId : "";
    const conMatriz = asignarMatriz(celdas, { productos: rotan, deseos, perfiles, foco }).map((c) => (c.pilar ? { ...c, tipo: c.pilar } : c));
    plan = darForma(conMatriz, { productos: rotan, semilla: datos.semilla, formato, orden, estructuras })
      .map(({ composicionPost, tacticaPost, ...r }) => ({ ...r, ...(composicionPost ? { composicion: composicionPost } : {}), ...(tacticaPost ? { tactica: tacticaPost } : {}) }));
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
      // Un UGC: la idea trae su guion para grabar (lib/ugc.js), no uno de reel hecho con IA.
      ...(formato === "reel" && p.rostro === true ? { rostro: true } : {}),
      // Va a pauta: se escribe como anuncio, con sus textos aparte (lib/pauta.js).
      ...(limpiarPauta(p.pauta) ? { pauta: limpiarPauta(p.pauta) } : {}),
    };
    const delPost = p.productoId ? productosActivos(catalogo).find((x) => x.id === p.productoId) : null;
    if (delPost) celda.productoId = delPost.id;
    if (fecha) {
      const [y, m] = fecha.split("-").map(Number);
      fechas = fechasDelMes(y, m - 1, leerJSON(cliente.fechas_especiales)).filter((f) => f.fecha === fecha);
    }
    const nota = fecha ? notaDelDia(notas, fecha) : "";
    if (nota) {
      celda.notaDia = nota;
      const delaNota = delPost ? null : productoDeNota(nota, rotan);
      if (delaNota) { celda.productoId = delaNota.id; celda.producto = delaNota.nombre; }
    }
    plan = darForma([celda], { productos: delPost ? [delPost, ...rotan.filter((x) => x.id !== delPost.id)] : rotan, semilla: datos.semilla, formato, orden, estructuras });
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
      // «Producir los anuncios que faltan» del plan de campañas: todas van a pauta en esa etapa, cada una con su nivel.
      if (limpiarPauta(datos.pauta)) celdas = celdas.map((c) => ({ ...c, pauta: limpiarPauta({ ...datos.pauta, nivel: c.nivel }) }));
    }
    // Con un producto escogido, también las piezas frías saben de qué producto es el problema (aunque no salga).
    if (producto) celdas = celdas.map((c) => ({ ...c, productoId: producto.id }));
    plan = darForma(celdas, { productos: rotan, semilla: datos.semilla, formato, orden, estructuras });
  }

  const total = plan.length;
  const desde = Math.max(0, Math.floor(Number(datos.desde) || 0));
  const tamano = Math.floor(Number(datos.tamano) || 0);
  if (tamano > 0) plan = plan.slice(desde, desde + Math.min(tamano, TANDA_MAX));
  if (!plan.length) return { ideas: [], ...(modo === "campos" ? { textos: [] } : {}), total, productos: rotan.map((p) => ({ id: p.id, nombre: p.nombre })), conEstudio: Boolean(general) };

  const usadosProd = new Set(plan.map((r) => r.productoId).filter(Boolean));
  const textoEstudio = [
    general ? resumenGeneral(general) : "",
    ...rotan.filter((p) => usadosProd.has(p.id) && estudio?.productos?.[p.id]).slice(0, 3).map((p) => notaDeProducto(estudio.productos[p.id], p)),
  ].filter(Boolean).join("\n\n");

  // La estrategia del mes: la que manda la pantalla («Planificar mes» la tiene a medias, sin guardar) o, si no la manda,
  // la guardada en el calendario de ese mes. Así la lee TODO modo, también el lote del Estudio y una publicación suelta.
  const mesDelPlan = mes ? textoMes(mes.year, mes.month) : (plan.find((r) => r.fecha)?.fecha ?? "").slice(0, 7);
  const estrategia = datos.estrategia && typeof datos.estrategia === "object" ? datos.estrategia : await estrategiaGuardada(acceso, cliente.id, mesDelPlan);

  // El cerebro, buscado con las palabras de los TIPOS de esta tanda (lib/materialTipo.js): un educativo y un testimonio
  // no necesitan los mismos pasajes. Lo que un tipo necesita de verdad (testimonios, garantía, equipo…) se busca aparte:
  // si no hay nada, se le dice a la IA que no lo invente y a la persona qué falta (`faltan`).
  let contexto = "";
  const faltan = [];
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, consultaDelPlan(plan, { producto: producto?.nombre ?? "" }), { para: "texto", presupuesto: 5000 });
    contexto = textoParaEscribir(c);
    for (const k of materialDelPlan(plan)) {
      if (!MATERIAL[k]?.buscar) continue;
      const hits = c?.notas ? await buscarCerebro(env, acceso, cliente.id, MATERIAL[k].buscar, { para: "texto", n: 1, per: 1 }) : [];
      if (!hits.length) faltan.push(k);
    }
  } catch { /* sin cerebro, con el catálogo y el estudio */ }
  // El educativo lee entera la nota «Saber del rubro» (la propone la IA y la aprueba una persona en Cerebro).
  if (conEducativo(plan)) {
    // Por su ruta o, si alguien la creó a mano, por su título.
    let rubro = await acceso.leerUno("cerebro_notas", { client_id: cliente.id, ruta: RUTA_RUBRO }).catch(() => null);
    if (!rubro) rubro = await leerNotaCerebro(env, acceso, cliente.id, TITULO_RUBRO, { para: "texto" }).catch(() => null);
    if (rubro?.texto && !rubro.interna) contexto = [contexto, `SABER DEL RUBRO (úsalo en el contenido educativo):\n${String(rubro.texto).slice(0, 4000)}`].filter(Boolean).join("\n\n");
    else faltan.push("rubro");
  }

  // Las UGC: la voz de ESTA marca en sus videos (nota «Voz UGC») y las estructuras de guion de la agencia, para que la
  // IA escoja ENTRE LAS DE UGC (`para`, lib/formulasUgc.js; las de sólo voz en off no se ofrecen aquí). La que escogió
  // una persona en la publicación se busca entre todas: la escogió ella.
  let ugc = "";
  let formulas = [];
  const conUgc = modo === "campos" ? plan.filter((c) => c.rostro && c.campos.includes("guion")) : plan.filter((c) => c.rostro);
  if (conUgc.length) {
    formulas = await leerEstructuras(acceso).catch(() => []);
    const voz = await vozUgcDe(env, acceso, cliente.id);
    // La fórmula que la agencia escogió en la publicación (`formulaUgc`) manda: va en su línea, en su duración.
    if (modo === "campos") {
      plan = plan.map((r) => {
        const f = r.rostro && r.formulaUgc ? formulas.find((x) => x.id === r.formulaUgc) : null;
        return f ? { ...r, formulaLinea: lineaDeFormula(f, r.duracionUgc) } : r;
      });
    }
    const escoge = modo !== "campos" || plan.some((r) => r.rostro && r.campos.includes("guion") && !r.formulaLinea);
    const d = modo === "campos" ? conUgc[0].duracionUgc ?? 30 : 30;
    ugc = [lineaDeVozUgc(voz?.texto), escoge ? bloqueDeFormulas(formulas, d, { uso: "ugc" }).replace(/\nEmpieza tu respuesta[^\n]*$/, "") : ""].filter(Boolean).join("\n\n");
  }

  // Lo que va a pauta: el tipo de negocio y el destino del cliente (sus números del negocio), una lectura y sólo si hace
  // falta. Si falla, la regla va sin ellos (con WhatsApp de destino, el de casi toda la agencia).
  let negocio = null;
  let aprendido = null;
  const enPauta = plan.filter((r) => r.pauta);
  if (enPauta.length) {
    [negocio, aprendido] = await Promise.all([leerNegocio(acceso, cliente.id).catch(() => null), preferenciasDelCliente(acceso, cliente.id)]);
    plan = plan.map((r) => (r.pauta ? { ...r, lineaPauta: lineaDePauta(r.pauta, r) } : r));
  }
  const bloquePauta = (opciones) => (enPauta.length
    ? [bloqueDeAnuncio({ tipo: negocio?.tipo ?? "", destino: negocio?.destino ?? "", etapas: enPauta.map((r) => r.pauta.etapa), ...opciones }), aprendido?.linea ?? ""].filter(Boolean).join("\n")
    : "");

  if (modo === "campos") {
    const pidenGuion = plan.some((r) => r.campos.includes("guion"));
    const salida = plan.reduce((t, r) => t + r.campos.reduce((u, c) => u + ({ guion: 700, descripcion: 350, idea: 150, textoPieza: 80, hashtags: 80, titulo: 30, anuncio: 650 }[c] ?? 100), 0), 0) + 600;
    const r = await llamarIA(env, acceso, cliente, {
      prompt: pedidoDeCampos({
        marca: cliente.name, plan, contexto, estudio: textoEstudio,
        productos: Object.fromEntries(rotan.filter((p) => usadosProd.has(p.id)).map((p) => [p.id, lineaDeProducto(p, { inventario }).slice(2)])),
        perfiles: Object.fromEntries(perfiles.map((p) => [p.nombre, lineaDePerfil(p)])),
        fechasEspeciales: fechas.map((f) => `${f.fecha} · ${f.nombre}${f.delicada ? " (delicada: sin promociones)" : ""}`),
        usados: (Array.isArray(datos.usados) ? datos.usados : []).map((t) => String(t ?? "").slice(0, 80)).filter(Boolean).slice(0, 30),
        estrategia, falta: lineaDeLoQueFalta(faltan), ugc, cliente: textoDelCliente(cliente), pauta: bloquePauta({ conCampo: false }),
      }),
      salida,
      funcion: pidenGuion ? "guiones" : plan.length === 1 ? "publicación" : "descripciones",
    });
    const textos = leerCampos(r.texto, plan, { destino: negocio?.destino ?? "" }).map(({ formula, ...t }) => {
      const id = formula ? formulaUsada(`FÓRMULA: ${formula}`, formulas) : "";
      return id ? { ...t, formulaUgc: id } : t;
    });
    if (!textos.length && !tamano) throw fallo("La IA no devolvió textos que se puedan leer. Inténtalo otra vez.", 502);
    return { textos, total, ...(faltan.length ? { faltan } : {}), modelo: r.modelo, aviso: r.aviso ?? null };
  }

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeProduccion({
      marca: cliente.name, plan, formato, contexto, estudio: textoEstudio, mes: modo === "mes",
      productos: Object.fromEntries(rotan.filter((p) => usadosProd.has(p.id)).map((p) => [p.id, lineaDeProducto(p, { inventario }).slice(2)])),
      perfiles: Object.fromEntries(perfiles.map((p) => [p.nombre, lineaDePerfil(p)])),
      fechasEspeciales: fechas.map((f) => `${f.fecha} · ${f.nombre}${f.delicada ? " (delicada: sin promociones)" : ""}`),
      usados: (Array.isArray(datos.usados) ? datos.usados : []).map((t) => String(t ?? "").slice(0, 80)).filter(Boolean).slice(0, 30),
      nota: modo === "publicacion" ? String(datos.nota ?? "").slice(0, 600) : "",
      estrategia,
      falta: lineaDeLoQueFalta(faltan),
      ugc,
      identidad: identidadParaFichas(cliente, plan, await manualDelEspacio(acceso).catch(() => null)),
      cliente: textoDelCliente(cliente),
      pauta: bloquePauta({ conCampo: true, enJson: true }),
    }),
    // Las de una imagen escriben además su ficha de diseño (unas 350 palabras más cada una); las que van a pauta, sus
    // textos de anuncio.
    salida: plan.reduce((t, r) => t + (FORMATOS_LOTE[r.formato ?? formato]?.guiado ? 850 : 950) + (r.pauta ? 650 : 0), 0) + 800,
    funcion: modo === "mes" || modo === "plan" ? "lote del mes" : modo === "publicacion" ? "publicación" : "ideas de anuncios",
  });
  const nombres = new Map(rotan.map((p) => [p.id, p.nombre]));
  // Lo que va a pauta: sus textos de anuncio (vienen en la misma respuesta) y 3 hashtags como mucho.
  const anuncios = enPauta.length ? anunciosDeRespuesta(r.texto, { destino: negocio?.destino ?? "" }) : new Map();
  const ideas = leerProduccion(r.texto, plan, formato)
    .map(({ lineaPauta: _l, ...i }) => (i.pauta
      ? { ...i, ...(i.hashtags ? { hashtags: recortarHashtags(i.hashtags) } : {}), ...(anuncios.get(i.n) ? { anuncio: anuncios.get(i.n) } : {}) }
      : i))
    .map((i) => (i.productoId ? { ...i, producto: nombres.get(i.productoId) ?? i.producto ?? "" } : i))
    // «Titular\nApoyo»: lo que va escrito en la pieza (el textoPieza de la publicación).
    .map((i) => ({ ...i, textoPieza: textoDeIdea(i) }))
    // La fórmula UGC por su nombre → su id (`formulaUgc`, lo que recuerda la publicación).
    .map(({ formula, ...i }) => {
      const id = formula ? formulaUsada(`FÓRMULA: ${formula}`, formulas) : "";
      return id ? { ...i, formulaUgc: id } : i;
    });
  if (!ideas.length && !tamano) throw fallo("La IA no devolvió ideas que se puedan leer. Inténtalo otra vez.", 502);
  return {
    ideas, total, ...(faltan.length ? { faltan } : {}),
    producto: producto ? { id: producto.id, nombre: producto.nombre, precio: producto.precio } : null,
    productos: rotan.map((p) => ({ id: p.id, nombre: p.nombre })),
    conEstudio: Boolean(general),
    modelo: r.modelo, aviso: r.aviso ?? null,
  };
}

/** Compatibilidad con el nombre de antes (anuncios por nivel). */
export const ideasDeLote = (env, acceso, cliente, datos = {}) => produccionDeLote(env, acceso, cliente, { modo: "niveles", ...datos });

/** Un perfil del estudio de mercado en una línea para el motor, con los sesgos que más lo mueven (curso de campañas). */
const lineaDePerfil = (p) => [
  p.quien, p.dolor && `le duele: ${p.dolor}`, p.aspiracion && `quiere: ${p.aspiracion}`,
  p.sesgos?.length && `lo mueve: ${nombresDeSesgos(p.sesgos).toLowerCase()}`,
].filter(Boolean).join("; ");

/**
 * Lo que la ficha de diseño del motor de ideas necesita de la marca: su kit, sus plantillas y cómo se diseña cada tipo
 * del plan (el manual de la agencia o el de la casa). Sin kit, sólo lo de los tipos.
 */
function identidadParaFichas(cliente, plan = [], manual = null) {
  try {
    const kit = kitDe(cliente);
    const porTipo = bloqueDeDisenoPorTipo(plan.map((r) => r.tipo ?? r.pilar), manual);
    // Los tipos de arte de la marca (curso de campañas): de cuál sale cada pieza; van aunque el kit esté sin preparar.
    const artes = lineaDeTiposArte(kit.tiposArte);
    if (kitVacio(kit)) return [artes, porTipo].filter(Boolean).join("\n");
    return [bloqueDeMarca(kit), artes, kit.plantillas.length ? `Plantillas de la marca (si una encaja, la ficha la nombra; la que «ES LA DE» un tipo va en las de ese tipo):\n${kit.plantillas.map(lineaDePlantilla).join("\n")}` : "", porTipo].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}
