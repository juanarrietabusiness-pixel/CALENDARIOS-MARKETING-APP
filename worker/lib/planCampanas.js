// ============================================================
// EL PLAN DE CAMPAÑAS de un cliente y un mes: lo que lee de la base, y lo que se guarda de la guía
//
//   GET  /api/anuncios/clientes/:c/ciclo?mes=AAAA-MM          El plan (campañas, públicos, anuncios, avisos) y lo guardado
//   PUT  /api/anuncios/clientes/:c/ciclo { mes, marcar?, ajustes?, anuncios?, reparto? }
//        `marcar`: { idDelPaso: true | false } — se FUNDE con lo guardado (dos personas que marcan pasos distintos no
//        se pisan); `ajustes`: { temporada: { incluir, diario }, inversion, que } — se reemplazan y el plan se rehace
//        (`que`: «¿Qué vas a hacer?», src/lib/anunciosPlan.js); `anuncios`: { "<campaña>:a<n>": { pieza | nuevo, como,
//        textos } | null } — lo decidido de cada hueco de anuncio, fundido hueco a hueco (null: vuelve a lo sugerido);
//        los textos que escribe una persona van también a `post.anuncio` de su publicación; `reparto`: el reparto A MANO
//        del cliente ({ presentacion, evaluacion, conversion, ascension } que suma 100, o null para volver al estándar),
//        en `anuncios_clientes.reparto` (0078) con `actualizar` y sólo esa columna: la fila tiene muchos dueños.
//   POST /api/anuncios/clientes/:c/ciclo { mes, escribir: ["<campaña>:a<n>", …], reescribir? }
//        Los TEXTOS de esos anuncios por la IA (`pedidoDeTextosPlan`): la etapa y su nivel de consciencia con cómo
//        hablarle, los productos con su precio, lo que dice la publicación escogida y lo que la agencia quiere lograr.
//        Con la publicación ya subida, sólo título y descripción (el texto principal es su caption). Se guardan con el
//        plan y en `post.anuncio` de su publicación SIN pisar lo que ya tenía; lo que una persona escribió en el plan no
//        se reescribe salvo con `reescribir` (el botón de ese anuncio).
//
// Las cuentas son de src/lib/planCiclo.js (las mismas en la pantalla, el Excel y lo que lee Claude): aquí sólo se lee
// lo que hace falta —los números del negocio y el Manual, el catálogo y el estudio de mercado, el kit (sus tipos de
// arte), las fechas especiales, el calendario del mes y los tres anteriores (las piezas), la cola de lo publicado (el
// enlace de cada publicación) y las métricas de lo propio (su «rinde»)— y se guarda el progreso de la guía. NO toca
// Meta: el plan se monta en el Ads Manager (la creación por la API está congelada), así que no pide cuenta publicitaria.
// La moneda, la de la cuenta si la tiene.
//
// Lo guardado va en `planes_campana` (el de los planes del estratega) con `datos.tipo = "ciclo"`, una fila por cliente
// y mes con id fijo (`ciclo-<cliente>-<mes>`): el estratega no las enseña entre sus planes (worker/lib/estratega.js).
// ============================================================

import { json, error, cuerpo, noEncontrado } from "./respuesta.js";
import { difundir, firma } from "./vivo.js";
import { ahora, uuid } from "./ids.js";
import { llamarIA } from "./cerebro/ia.js";
import { contexto as contextoCerebro, textoParaEscribir } from "./cerebro/cerebro.js";
import { clienteYCuenta } from "./anuncios.js";
import { leerMercado } from "./mercado.js";
import { leerNegocio } from "./negocio.js";
import { leerManual } from "./estratega.js";
import { preferenciasDelCliente } from "./enPauta.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import {
  planDelCiclo, conPiezas, candidatasDelCalendario, temporadaDelMes, guiaDeMontaje, limpiarProgreso, avanceDeGuia, planATextoCiclo,
  mesDelPlan, anunciosQueFuncionaron, MESES_DE_PIEZAS,
} from "../../src/lib/planCiclo.js";
import {
  limpiarQue, limpiarAnunciosPlan, fundirAnunciosPlan, casillaDeTextos, pedidoDeTextosPlan, leerTextosPlan, rellenarAnuncioDelPost,
  limpiarTextosPlan, huecoDeId, MAX_TEXTOS_POR_LLAMADA,
} from "../../src/lib/anunciosPlan.js";
import { limpiarReparto, sumaDelReparto, errorDelCiclo } from "../../src/lib/manualCiclo.js";
import { limpiarAnuncio, limpiarPauta, vaAPauta, bloqueDeAnuncio } from "../../src/lib/pauta.js";
import { productosActivos, lineaDeProducto } from "../../src/lib/estudioMercado.js";
import { textoDelCliente } from "../../src/lib/loteAnuncios.js";
import { tipoArteDe, limpiarTiposArte } from "../../src/lib/tiposArte.js";
import { numeroMagicoDelCliente } from "../../src/lib/numerosNegocio.js";

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t ?? "") ?? d; } catch { return d; }
};
const MAX_PASOS = 400;
const MAX_MARCAR = 60;

/** El id de la fila guardada del plan de un cliente y un mes. */
export const idDelCiclo = (clientId, mes) => `ciclo-${clientId}-${mes}`;

/** «2026-11» del texto o, si no vale, el mes de hoy en Panamá. */
const mesPedido = (texto) => mesDelPlan(texto)?.texto ?? fechaEnZona().slice(0, 7);

/** El mes y los `n` anteriores («2026-11», 1 → [«2026-11», «2026-10»]). */
function mesesHasta(mes, n) {
  const m = mesDelPlan(mes);
  const salida = [];
  for (let k = 0; k <= n; k++) {
    const t = m.year * 12 + m.month - k;
    salida.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  return salida;
}

/** Lo guardado del plan de un mes: { progreso, ajustes, actualizado, por }. */
export async function leerGuardado(acceso, clientId, mes) {
  const f = await acceso.leerUno("planes_campana", { id: idDelCiclo(clientId, mes) });
  const d = leerJSON(f?.datos, {});
  return {
    progreso: limpiarProgreso(d.progreso),
    ajustes: limpiarAjustes(d.ajustes),
    anuncios: limpiarAnunciosPlan(d.anuncios),
    actualizado: f?.updated_at ?? null,
    por: f?.creado_por ?? null,
  };
}

/** Lo que la agencia decide del plan de un mes, limpio: la temporada (incluirla o no, su diario), la inversión y «¿Qué vas a hacer?». */
export function limpiarAjustes(a) {
  const x = a && typeof a === "object" ? a : {};
  const t = x.temporada && typeof x.temporada === "object" ? x.temporada : {};
  const diario = Number(t.diario);
  const inversion = Number(x.inversion);
  return {
    temporada: {
      ...(typeof t.incluir === "boolean" ? { incluir: t.incluir } : {}),
      ...(diario > 0 && diario < 1e7 ? { diario: Math.round(diario * 100) / 100 } : {}),
    },
    ...(inversion > 0 && inversion < 1e9 ? { inversion: Math.round(inversion * 100) / 100 } : {}),
    que: limpiarQue(x.que),
  };
}

/**
 * Lo que se lee para armar el plan de un mes, y el plan. Pocas consultas y todas acotadas por el cliente: los números y
 * el Manual, el mercado, lo de los anuncios del cliente (su reparto a mano y lo que ya corrió: `en_pauta`), hasta 8
 * calendarios (el del mes y los de antes) más los de las publicaciones escogidas a mano o que ya funcionaron como
 * anuncio (de cualquier mes), la cola publicada y las métricas. → { plan, guardado, avance, candidatas, mercado }
 */
async function armarCiclo(env, acceso, cliente, mes, { cuenta = null } = {}) {
  const hoy = fechaEnZona();
  const meses = new Set(mesesHasta(mes, MESES_DE_PIEZAS));
  const [negocio, manual, mercado, guardado, cals, cola, metricas, aprendido, filaAnuncios] = await Promise.all([
    leerNegocio(acceso, cliente.id),
    leerManual(acceso),
    leerMercado(acceso, cliente.id),
    leerGuardado(acceso, cliente.id, mes),
    acceso.leerColumnas("calendars", ["id", "year", "month", "days", "offers", "promo_code", "campaign", "opciones"], { client_id: cliente.id }, "year desc, month desc", 8).catch(() => []),
    acceso.leerColumnas("publicaciones_programadas", ["calendar_id", "post_id", "red", "estado", "variante", "externo_id", "enlace"], { client_id: cliente.id, estado: "publicada" }, "created_at desc", 600).catch(() => []),
    acceso.leerColumnas("metricas_publicacion", ["id", "cuenta_id", "red", "externo_id", "interacciones", "guardados", "compartidos"], { client_id: cliente.id }, "publicada_at desc", 3000).catch(() => []),
    // Lo que se aprendió de sus anuncios (lo que ya corrió en el Ads Manager): null sin muestra o si falla.
    preferenciasDelCliente(acceso, cliente.id),
    acceso.leerColumnas("anuncios_clientes", ["reparto", "en_pauta"], { client_id: cliente.id }, "created_at asc", 1).then((f) => f[0] ?? null).catch(() => null),
  ]);
  const deMes = (c) => `${c.year}-${String(Number(c.month) + 1).padStart(2, "0")}`;
  const aCalendario = (c) => ({
    id: c.id, year: c.year, month: c.month, mes: deMes(c), days: leerJSON(c.days, []),
    offers: c.offers ?? "", promoCode: c.promo_code ?? "", campaign: c.campaign ?? "", opciones: leerJSON(c.opciones, {}),
  });
  const calendarios = cals.filter((c) => meses.has(deMes(c))).map(aCalendario);
  // Lo que ya funcionó como anuncio y lo que escogió una persona puede ser de cualquier mes: esos calendarios se leen
  // aparte (sólo esas publicaciones).
  const funcionaron = anunciosQueFuncionaron(filaAnuncios?.en_pauta);
  const incluir = new Set([
    ...funcionaron.map((f) => f.clave),
    ...Object.values(guardado.anuncios).filter((e) => e.pieza).map((e) => `${e.pieza.calendarId}|${e.pieza.postId}`),
  ]);
  const leidos = new Set(calendarios.map((c) => String(c.id)));
  const faltan = [...new Set([...incluir].map((k) => k.split("|")[0]).filter((id) => !leidos.has(id)))].slice(0, 50);
  if (faltan.length) {
    const otros = await acceso.leerVarios("calendars", ["id", "year", "month", "days"], "id", faltan, { client_id: cliente.id }).catch(() => []);
    for (const c of otros) calendarios.push({ ...aCalendario(c), soloClaves: new Set([...incluir].filter((k) => k.startsWith(`${c.id}|`))) });
  }
  const delMes = calendarios.find((c) => c.mes === mes && !c.soloClaves) ?? null;
  const kit = leerJSON(cliente.kit_marca, {});
  const estudio = mercado.estudio ?? mercado.borrador;
  const temporada = temporadaDelMes({ mes, calendario: delMes, fechasEspeciales: leerJSON(cliente.fechas_especiales, null), hoy });
  const base = planDelCiclo({
    negocio, numeros: { tasaDefecto: manual.tasaCierre, inversion: guardado.ajustes.inversion }, manual, reparto: filaAnuncios?.reparto ?? null, mes, hoy,
    calendario: delMes, kit: { tiposArte: limpiarTiposArte(kit?.tiposArte) }, estudio, catalogo: mercado.catalogo, temporada, ajustes: guardado.ajustes,
    cliente: { nombre: cliente.name, rubro: cliente.industry ?? "" }, moneda: cuenta?.moneda || "USD",
  });
  const candidatas = candidatasDelCalendario({ calendarios, cola, metricas, destino: base.destino, artesMarca: kit?.tiposArte, incluir });
  const plan = conPiezas(base, candidatas, { ofertas: delMes?.offers ?? "", codigo: delMes?.promoCode ?? "", hoy, aprendido, funcionaron, elegidos: guardado.anuncios });
  const guia = guiaDeMontaje(plan);
  const progreso = limpiarProgreso(guardado.progreso, guia);
  // EL número mágico del cliente (lib/numerosNegocio.js): la MISMA cifra de la ficha, la revisión, el aviso diario y el
  // estratega, para todas las etapas del plan (decisión del 14-nov).
  const numeroMagico = numeroMagicoDelCliente(negocio, { tasaDefecto: manual.tasaCierre, nombre: cliente.name ?? "", moneda: cuenta?.moneda || "USD" });
  return { plan, guardado: { ...guardado, progreso }, avance: avanceDeGuia(guia, progreso), candidatas, mercado, numeroMagico };
}

/** El plan del cliente para un mes, con sus piezas y lo guardado. → { plan, guardado, avance, numeroMagico } */
export async function cicloDelCliente(env, acceso, cliente, mes, opciones = {}) {
  const { plan, guardado, avance, numeroMagico } = await armarCiclo(env, acceso, cliente, mes, opciones);
  return { plan, guardado, avance, numeroMagico };
}

/**
 * Guarda lo marcado (fundido con lo de antes), los ajustes del plan de un mes y lo decidido de sus anuncios (fundido
 * hueco a hueco). Sólo ids con forma de paso; lo desmarcado se quita. → lo guardado.
 */
export async function guardarCiclo(acceso, cliente, mes, { marcar = null, ajustes = undefined, anuncios = undefined } = {}, usuario = null) {
  const id = idDelCiclo(cliente.id, mes);
  const previa = await acceso.leerUno("planes_campana", { id });
  const d = leerJSON(previa?.datos, {});
  const progreso = limpiarProgreso(d.progreso);
  const t = ahora();
  const por = String(usuario?.nombre ?? usuario?.id ?? "").slice(0, 80);
  if (marcar && typeof marcar === "object") {
    for (const [paso, hecho] of Object.entries(marcar).slice(0, MAX_MARCAR)) {
      if (!/^[\w:-]{3,60}$/.test(paso)) continue;
      if (hecho === true) progreso[paso] = { por, at: t };
      else delete progreso[paso];
    }
  }
  const llenos = Object.fromEntries(Object.entries(progreso).slice(0, MAX_PASOS));
  const datos = {
    tipo: "ciclo", mes, progreso: llenos,
    ajustes: ajustes === undefined ? limpiarAjustes(d.ajustes) : limpiarAjustes(ajustes),
    anuncios: anuncios === undefined ? limpiarAnunciosPlan(d.anuncios) : fundirAnunciosPlan(d.anuncios, anuncios, { por, at: t }),
  };
  const fila = { nombre: `Plan de campañas · ${mes}`, datos: JSON.stringify(datos), creado_por: por || null, updated_at: t };
  if (previa) await acceso.actualizar("planes_campana", { id }, fila);
  else await acceso.insertar("planes_campana", { id, client_id: cliente.id, ...fila, created_at: t });
  return { progreso: llenos, ajustes: datos.ajustes, anuncios: datos.anuncios, actualizado: t, por: por || null };
}

/**
 * El reparto A MANO del cliente (`anuncios_clientes.reparto`, 0078): uno que suma 100 o null («Volver al estándar»).
 * Con `actualizar` y sólo esa columna (la fila tiene muchos dueños); si el cliente no tiene fila, se crea.
 */
export async function guardarReparto(acceso, clientId, reparto) {
  const valor = reparto === null ? null : JSON.stringify(limpiarReparto(reparto));
  const t = ahora();
  const previa = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (previa) await acceso.actualizar("anuncios_clientes", { id: previa.id }, { reparto: valor, updated_at: t });
  else if (valor !== null) await acceso.insertar("anuncios_clientes", { id: uuid(), client_id: clientId, reparto: valor, created_at: t, updated_at: t });
}

/**
 * Cambia varias publicaciones del cliente a la vez, una escritura por calendario, sin pisar a nadie (el `updated_at`
 * como condición, dos vueltas) y como el PUT del calendario: mover la cola y avisar al espacio (SIN pestaña: también la
 * que lo pidió relee, que si no su guardado de después lo pisaría). `cambios`: [{ calendarId, postId, cambiar(post) →
 * post | null }]. → cuántas quedaron escritas.
 */
async function cambiarPublicaciones(env, acceso, clienteId, cambios, por) {
  const porCal = new Map();
  for (const c of cambios) {
    if (!porCal.has(c.calendarId)) porCal.set(c.calendarId, []);
    porCal.get(c.calendarId).push(c);
  }
  let escritas = 0;
  for (const [calId, lista] of porCal) {
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      const cal = await acceso.leerUno("calendars", { id: calId, client_id: clienteId });
      if (!cal) break;
      const dias = leerJSON(cal.days, []);
      let n = 0;
      for (const d of Array.isArray(dias) ? dias : []) {
        d.posts = (d.posts ?? []).map((p) => {
          const c = lista.find((x) => x.postId === p?.id);
          const nuevo = c ? c.cambiar(p) : null;
          if (nuevo) n += 1;
          return nuevo ?? p;
        });
      }
      if (!n) break;
      const hecho = await acceso.actualizar("calendars", { id: cal.id, client_id: clienteId, updated_at: cal.updated_at }, { days: JSON.stringify(dias), updated_at: ahora() });
      if (!hecho) continue;
      escritas += n;
      try {
        const { resincronizarCalendario } = await import("./publicador.js");
        await resincronizarCalendario(env, acceso, await acceso.leerUno("calendars", { id: cal.id }), por);
      } catch (e) { console.error("plan de campañas: resincronizar", e); }
      difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: cal.id, clientId: clienteId, por });
      break;
    }
  }
  return escritas;
}

/** La publicación con los textos de un anuncio del plan: `reemplazar` (los escribió una persona) o sólo rellenar (la IA). */
function conTextosDelPlan(post, textos, { reemplazar = false, etapa = "", como = "" } = {}) {
  let anuncio;
  if (reemplazar) {
    const antes = limpiarAnuncio(post.anuncio) ?? { textos: [], titulos: [], descripcion: "", boton: "" };
    const t = limpiarTextosPlan(textos);
    if (!t) return null;
    anuncio = limpiarAnuncio({ ...antes, ...t, textos: t.textos.length ? t.textos : antes.textos });
  } else {
    anuncio = rellenarAnuncioDelPost(post.anuncio, textos);
  }
  if (!anuncio || JSON.stringify(anuncio) === JSON.stringify(limpiarAnuncio(post.anuncio))) return null;
  // Va a pauta en su etapa si nadie dijo otra cosa (una que alguien desmarcó, `false`, se respeta).
  const pauta = !vaAPauta(post) && post.pauta !== false && etapa
    ? { pauta: limpiarPauta({ etapa: etapa === "temporada" ? "conversion" : etapa, como: como === "publicacion" ? "publicacion" : "anuncio" }) }
    : {};
  return { ...post, ...pauta, anuncio };
}

/**
 * Los TEXTOS de unos anuncios del plan por la IA (POST …/ciclo { escribir }). Se guardan con el plan (fijando la pieza
 * que tenía el hueco: los textos son de ESA publicación) y en `post.anuncio` sin pisar lo que ya tenía. Lo que una
 * persona escribió en el plan no se reescribe salvo con `reescribir`. → { escritos, enPublicaciones, modelo, aviso }.
 */
export async function escribirTextosDelPlan(env, acceso, cliente, mes, slots = [], { cuenta = null, reescribir = false, usuario = null, por = null } = {}) {
  const { plan, guardado, candidatas, mercado } = await armarCiclo(env, acceso, cliente, mes, { cuenta });
  const pedidos = [...new Set((Array.isArray(slots) ? slots : []).filter((s) => huecoDeId(s)))].slice(0, MAX_TEXTOS_POR_LLAMADA);
  const todos = plan.campanas.flatMap((c) => c.anuncios.map((a) => ({ a, c })));
  const elegidos = todos.filter(({ a }) => pedidos.includes(a.slot) && (reescribir || !guardado.anuncios[a.slot]?.editado));
  if (!elegidos.length) {
    throw Object.assign(new Error(pedidos.some((s) => !todos.some((x) => x.a.slot === s))
      ? "Escoge primero qué va en ese anuncio: una publicación o «Anuncio nuevo»."
      : "Esos anuncios ya tienen textos escritos por una persona."), { estado: 400 });
  }
  const porClave = new Map(candidatas.map((p) => [`${p.calendarId}|${p.postId}`, p.post]));
  const casillas = elegidos.map(({ a, c }) => casillaDeTextos(a, c, a.pieza ? porClave.get(`${a.pieza.calendarId}|${a.pieza.postId}`) ?? null : null,
    { artes: c.artes.map((x) => tipoArteDe(x)?.nombre).filter(Boolean) }));

  // Los productos: los del plan (o todo el catálogo activo, hasta 8) y los de las piezas, con su precio EXACTO.
  const activos = productosActivos(mercado.catalogo);
  const ids = new Set([...(plan.productos ?? []).map((p) => p.id), ...elegidos.map(({ a }) => a.pieza?.productoId).filter(Boolean)]);
  const productos = (ids.size ? activos.filter((p) => ids.has(p.id)) : activos.slice(0, 8)).map((p) => lineaDeProducto(p, { inventario: mercado.inventario }));
  let contexto = "";
  try {
    const consulta = ["beneficios objeciones garantía testimonios diferencial", ...(plan.productos ?? []).map((p) => p.nombre), plan.que?.logro ?? ""].join(" ");
    contexto = textoParaEscribir(await contextoCerebro(env, acceso, cliente.id, consulta, { para: "texto", presupuesto: 4000 }));
  } catch { /* sin cerebro: con el catálogo y la ficha */ }
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeTextosPlan({
      marca: cliente.name, casillas, productos, logro: plan.que?.logro ?? "", contexto, destino: plan.destino, mes: plan.nombreMes,
      regla: bloqueDeAnuncio({ tipo: plan.tipo, destino: plan.destino, etapas: [...new Set(casillas.map((x) => x.etapa))], conCampo: false }),
      cliente: textoDelCliente(cliente),
    }),
    salida: casillas.length * 550 + 400,
    funcion: "ideas de anuncios",
  });
  const leidos = leerTextosPlan(r.texto, casillas, { destino: plan.destino });
  if (!leidos.size) throw Object.assign(new Error("La IA no devolvió textos que se puedan leer. Inténtalo otra vez."), { estado: 502 });

  // Con el plan: cada hueco fija su pieza (los textos son de ESA publicación) y lleva sus textos.
  const cambios = {};
  for (const { a } of elegidos) {
    const t = leidos.get(a.slot);
    if (!t) continue;
    cambios[a.slot] = { ...(a.pieza ? { pieza: { calendarId: a.pieza.calendarId, postId: a.pieza.postId } } : { nuevo: true }), como: a.como, textos: t, ia: true };
  }
  await guardarCiclo(acceso, cliente, mes, { anuncios: cambios }, usuario);
  // Y en la publicación, sin pisar lo que ya tenía.
  const enPublicaciones = await cambiarPublicaciones(env, acceso, cliente.id, elegidos.filter(({ a }) => a.pieza && leidos.has(a.slot)).map(({ a, c }) => ({
    calendarId: a.pieza.calendarId, postId: a.pieza.postId,
    cambiar: (post) => conTextosDelPlan(post, leidos.get(a.slot), { etapa: c.etapa, como: a.como }),
  })), por).catch((e) => { console.error("plan de campañas: textos en la publicación", e); return 0; });
  return { escritos: Object.keys(cambios).length, enPublicaciones, modelo: r.modelo, aviso: r.aviso ?? null };
}

/** Los textos que escribió una persona en el plan, también en `post.anuncio` de su publicación. */
async function textosDePersonaAlPost(env, acceso, cliente, plan, cambios, por) {
  const lista = [];
  for (const [slot, v] of Object.entries(cambios ?? {})) {
    if (!v || typeof v !== "object" || v.textos === undefined) continue;
    const a = plan.campanas.flatMap((c) => c.anuncios.map((x) => ({ x, c }))).find(({ x }) => x.slot === slot);
    if (!a?.x.pieza) continue;
    lista.push({
      calendarId: a.x.pieza.calendarId, postId: a.x.pieza.postId,
      cambiar: (post) => conTextosDelPlan(post, v.textos, { reemplazar: true, etapa: a.c.etapa, como: a.x.como }),
    });
  }
  return lista.length ? cambiarPublicaciones(env, acceso, cliente.id, lista, por) : 0;
}

/** El plan en texto, para el asistente y Claude (`plan_de_campanas`), con cuánto de la guía va marcado. */
export async function planDeCampanasEnTexto(env, acceso, cliente, mes) {
  const { cuenta } = await clienteYCuenta(acceso, cliente.id, { exigirCuenta: false });
  const { plan, avance } = await cicloDelCliente(env, acceso, cliente, mesPedido(mes), { cuenta });
  return `${planATextoCiclo(plan)}\n\nGuía de montaje: ${avance.hechos} de ${avance.total} pasos marcados (Anuncios → Plan de campañas). ` +
    "Las campañas se montan en el Ads Manager: esta aplicación no las crea.";
}

// ------------------------------------------------------------
// La ruta (la despacha worker/rutas/anuncios.js: va antes de exigir la cuenta publicitaria)
// ------------------------------------------------------------

export async function rutasCiclo(req, env, { acceso, usuario, clientId, metodo }) {
  const { cliente, cuenta } = await clienteYCuenta(acceso, clientId, { exigirCuenta: false });
  const url = new URL(req.url);
  if (metodo === "GET") return json(await cicloDelCliente(env, acceso, cliente, mesPedido(url.searchParams.get("mes")), { cuenta }));
  // Sin pestaña: también la que lo pidió relee lo que cambió en sus calendarios.
  const sinPestana = { ...firma(usuario, req), tab: null };
  if (metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const mes = mesDelPlan(b.mes)?.texto;
    if (!mes) return error("Escoge el mes del plan.");
    if (!Array.isArray(b.escribir) || !b.escribir.length) return error("Escoge qué anuncios escribir.");
    try {
      const r = await escribirTextosDelPlan(env, acceso, cliente, mes, b.escribir, { cuenta, reescribir: b.reescribir === true, usuario, por: sinPestana });
      difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
      return json({ ...r, ...(await cicloDelCliente(env, acceso, cliente, mes, { cuenta })) });
    } catch (e) {
      if (e?.estado) return error(e.message, e.estado);
      throw e;
    }
  }
  if (metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const mes = mesDelPlan(b.mes)?.texto;
    if (!mes) return error("Escoge el mes del plan.");
    const conAjustes = b.ajustes !== undefined;
    const conAnuncios = b.anuncios && typeof b.anuncios === "object";
    const conReparto = b.reparto !== undefined;
    if (!conAjustes && !conAnuncios && !conReparto && !(b.marcar && typeof b.marcar === "object")) return error("No hay nada que guardar.");
    if (conReparto && b.reparto !== null) {
      const fallo = errorDelCiclo({ reparto: b.reparto });
      if (fallo || sumaDelReparto(b.reparto) !== 100) return error(fallo || "El reparto tiene que sumar 100.");
    }
    if (conReparto) await guardarReparto(acceso, cliente.id, b.reparto);
    const guardado = conAjustes || conAnuncios || b.marcar
      ? await guardarCiclo(acceso, cliente, mes, { marcar: b.marcar ?? null, ajustes: conAjustes ? b.ajustes : undefined, anuncios: conAnuncios ? b.anuncios : undefined }, usuario)
      : null;
    // Lo marcado lo ve todo el equipo: el aviso «anuncios» sube el pulso de las demás pestañas, que releen.
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
    if (conAjustes || conAnuncios || conReparto) {
      const r = await cicloDelCliente(env, acceso, cliente, mes, { cuenta });
      // Los textos que escribió una persona van también a su publicación (los reemplaza: los escribió ella).
      const enPublicaciones = conAnuncios ? await textosDePersonaAlPost(env, acceso, cliente, r.plan, b.anuncios, sinPestana).catch(() => 0) : 0;
      return json({ ...r, enPublicaciones });
    }
    return json({ guardado });
  }
  return noEncontrado("Ruta");
}
