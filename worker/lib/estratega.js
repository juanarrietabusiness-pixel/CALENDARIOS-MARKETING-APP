// ============================================================
// El estratega de campañas: lo que toca la base y la IA
//
// Lee lo que la aplicación sabe del cliente —su cerebro (también lo
// interno: costos y márgenes sirven para las cuentas, y esto lo ve sólo
// la agencia), el catálogo, el estudio de mercado y las campañas que ya
// se crearon— y el «Manual de campañas de la agencia», y le pide el plan a
// la IA (con búsqueda en internet si la cuenta la tiene). Para alguien que
// no es cliente, con lo que se escriba. Las cuentas (costo máximo por
// resultado, escenarios) las hace src/lib/estratega.js, no la IA.
//
// Nada de esto gasta en Meta: el plan se lleva a «Nueva campaña», que crea
// en pausa.
// ============================================================

import { contexto as contextoCerebro } from "./cerebro/cerebro.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { leerMercado } from "./mercado.js";
import { HERRAMIENTAS_WEB } from "./herramientasServidor.js";
import { ahora, uuid } from "./ids.js";
import { pedidoEstratega, leerPlan, economia, limpiarManual } from "../../src/lib/estratega.js";
import { productosActivos, catalogoATexto, limpiarEstudio, resumenGeneral, lineaDeProducto } from "../../src/lib/estudioMercado.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
// La misma búsqueda que el estudio de mercado, con menos vueltas: el plan no es un estudio.
const BUSQUEDA_WEB = HERRAMIENTAS_WEB.map((h) => ({ ...h, max_uses: 3 }));
const MAX_PLANES = 40;

export class ErrorEstratega extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.name = "ErrorEstratega";
    this.estado = estado;
  }
}

// ------------------------------------------------------------
// El manual de la agencia
// ------------------------------------------------------------

export async function leerManual(acceso) {
  const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
  return limpiarManual(leerJSON(fila?.manual_campanas, {}));
}

export async function guardarManual(acceso, entrada) {
  const manual = limpiarManual(entrada ?? {});
  const previa = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
  await acceso.guardar("ajustes_espacio", {
    id: acceso.ownerId, manual_campanas: JSON.stringify(manual), created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
  });
  return manual;
}

// ------------------------------------------------------------
// Lo que se sabe
// ------------------------------------------------------------

/** El cliente: ficha, cerebro (con lo interno), catálogo, el estudio general y las campañas que ya se hicieron. */
async function contextoDelCliente(env, acceso, cliente, consulta, mercado) {
  let c = null;
  try {
    c = await contextoCerebro(env, acceso, cliente.id, consulta, { para: "chat", presupuesto: 14_000 });
  } catch (e) {
    console.warn("estratega: el cerebro no respondió, se usa la ficha", e?.message);
  }
  const ficha = [
    cliente.industry && `Rubro: ${cliente.industry}`,
    cliente.descripcion && `Descripción: ${String(cliente.descripcion).slice(0, 1500)}`,
    cliente.audiencia && `Público: ${String(cliente.audiencia).slice(0, 600)}`,
    cliente.diferenciador && `Diferenciador: ${String(cliente.diferenciador).slice(0, 600)}`,
    cliente.whatsapp && `WhatsApp: ${String(cliente.whatsapp).slice(0, 40)}`,
  ].filter(Boolean).join("\n");
  const catalogo = catalogoATexto(mercado.catalogo, { inventario: mercado.inventario });
  const general = resumenGeneral(limpiarEstudio(mercado.estudio)?.general);
  const campanas = (await acceso.leer("campanas_anuncios", { client_id: cliente.id }, "created_at desc", 8).catch(() => []))
    .map((x) => `- ${x.nombre} (${x.objetivo}, ${x.estado}, ${String(x.created_at).slice(0, 10)})`);
  return [
    c?.ficha && `FICHA:\n${c.ficha}`,
    c?.cifras && `CIFRAS (pueden ser internas: no se dicen en un anuncio):\n${c.cifras}`,
    c?.pasajes && `NOTAS:\n${c.pasajes}`,
    ficha && `DE LA FICHA DEL CLIENTE:\n${ficha}`,
    catalogo && `CATÁLOGO (los precios, EXACTOS):\n${catalogo}`,
    general && `ESTUDIO DE MERCADO:\n${general}`,
    campanas.length && `CAMPAÑAS QUE YA SE CREARON DESDE LA APLICACIÓN:\n${campanas.join("\n")}`,
  ].filter(Boolean).join("\n\n");
}

/** Alguien que no es cliente: lo que se escribió. */
const contextoDeFuera = (f = {}) => [
  f.nombre && `Negocio: ${String(f.nombre).slice(0, 120)}`,
  f.rubro && `Rubro: ${String(f.rubro).slice(0, 120)}`,
  f.lugar && `Dónde vende: ${String(f.lugar).slice(0, 200)}`,
  f.enlaces && `Instagram o web: ${String(f.enlaces).slice(0, 300)}`,
  f.info && `Lo que sabemos:\n${String(f.info).slice(0, 6000)}`,
].filter(Boolean).join("\n");

// ------------------------------------------------------------
// El plan
// ------------------------------------------------------------

/**
 * Arma (o ajusta, o pasa a limpio desde otro bot) el plan de una campaña.
 * `cliente` es la fila del cliente o null (alguien de fuera, con `externo`).
 * `productoId` es uno del catálogo; `producto` ({ nombre, precio, descripcion }), uno que no está.
 * → { plan, eco, producto, modelo, aviso, conWeb, fuentes }
 */
export async function armarPlan(env, acceso, cliente, datos = {}) {
  const manual = await leerManual(acceso);
  let producto = { nombre: String(datos.producto?.nombre ?? "").slice(0, 120), precio: String(datos.producto?.precio ?? "").slice(0, 60), descripcion: String(datos.producto?.descripcion ?? "").slice(0, 1500) };
  let contexto;
  let marca;
  let rubro;
  if (cliente) {
    const mercado = await leerMercado(acceso, cliente.id);
    if (datos.productoId) {
      const p = productosActivos(mercado.catalogo).find((x) => x.id === datos.productoId);
      if (!p) throw new ErrorEstratega("Ese producto no está en el catálogo (o no está activo).", 404);
      const estudio = limpiarEstudio(mercado.estudio ?? mercado.borrador);
      producto = { nombre: p.nombre, precio: p.precio, descripcion: lineaDeProducto(p, { inventario: mercado.inventario }), elementos: estudio?.productos?.[p.id]?.elementos ?? null };
    }
    contexto = await contextoDelCliente(env, acceso, cliente, `${producto.nombre} ${producto.descripcion} precio margen costo público objeciones garantía`.slice(0, 400), mercado);
    marca = cliente.name;
    rubro = cliente.industry ?? "";
  } else {
    const f = datos.externo ?? {};
    if (!String(f.nombre ?? "").trim()) throw new ErrorEstratega("Escribe el nombre del negocio.");
    contexto = contextoDeFuera(f);
    marca = String(f.nombre).slice(0, 120);
    rubro = String(f.rubro ?? "").slice(0, 120);
  }
  if (!producto.nombre && !datos.planPegado) throw new ErrorEstratega("Escoge o escribe qué se va a anunciar.");

  const eco = economia({
    precio: datos.precio ?? producto.precio, margen: datos.margen, margenTipo: datos.margenTipo === "$" ? "$" : "%",
    tasaCierre: datos.tasaCierre || manual.tasaCierre,
  });
  const conWeb = datos.conWeb === true;
  const r = await llamarIA(env, acceso, cliente ?? { id: null }, {
    prompt: pedidoEstratega({
      marca, rubro, contexto, producto, objetivo: datos.objetivo ?? "", destino: datos.destino === "web" ? "web" : "whatsapp",
      diario: Number(datos.diario) || 0, dias: Number(datos.dias) || 30, notas: datos.notas ?? "", manual, eco,
      conMaletas: datos.conMaletas === true, conWeb, planPegado: datos.planPegado ?? "", anterior: datos.anterior ?? null, cambio: datos.cambio ?? "",
    }),
    salida: 9000, funcion: "estratega de campañas", herramientas: conWeb ? BUSQUEDA_WEB : null,
  });
  const plan = leerPlan(r.texto);
  if (!plan) throw new ErrorIA("La IA no devolvió un plan que se pueda leer. Inténtalo otra vez.", 502);
  return { plan, eco, producto: { nombre: producto.nombre, precio: producto.precio }, modelo: r.modelo, aviso: r.aviso, conWeb: r.conWeb, fuentes: r.fuentes ?? [] };
}

// ------------------------------------------------------------
// Los planes guardados
// ------------------------------------------------------------

export const planPublico = (f) => f && ({
  id: f.id, clientId: f.client_id, nombre: f.nombre, datos: leerJSON(f.datos, {}), creadoPor: f.creado_por, creado: f.created_at, actualizado: f.updated_at,
});

export async function listarPlanes(acceso, clienteId = null) {
  const filas = await acceso.leer("planes_campana", clienteId ? { client_id: clienteId } : {}, "updated_at desc", MAX_PLANES);
  return filas.map(planPublico);
}

export async function guardarPlan(acceso, { id = null, clienteId = null, nombre = "", datos = {} }, usuario) {
  const t = ahora();
  const fila = {
    id: id && /^[\w-]{8,60}$/.test(id) ? id : uuid(), client_id: clienteId || null,
    nombre: String(nombre || datos?.plan?.resumen || "Plan").slice(0, 160),
    datos: JSON.stringify(datos ?? {}).slice(0, 200_000), creado_por: usuario?.nombre ?? usuario?.id ?? null, updated_at: t,
  };
  const previa = id ? await acceso.leerUno("planes_campana", { id }) : null;
  if (previa) await acceso.actualizar("planes_campana", { id: previa.id }, { nombre: fila.nombre, datos: fila.datos, updated_at: t });
  else await acceso.insertar("planes_campana", { ...fila, created_at: t });
  return planPublico({ ...(previa ?? {}), ...fila, created_at: previa?.created_at ?? t });
}

export async function borrarPlan(acceso, id) {
  const previa = await acceso.leerUno("planes_campana", { id });
  if (!previa) return false;
  await acceso.borrar("planes_campana", { id });
  return true;
}
