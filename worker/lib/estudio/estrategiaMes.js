// ============================================================
// «Proponer la estrategia con IA» de «Planificar mes» (texto)
//
// Lo puro (el pedido y la lectura) en src/lib/estrategiaMes.js. Aquí se junta
// lo que la IA necesita: el catálogo (precios EXACTOS, con su id para escoger
// el foco), lo general del estudio de mercado aprobado, el cerebro para
// escribir (nunca lo interno), las fechas especiales del mes según lo que
// eligió el cliente, las semanas de la rejilla y lo que mejor funcionó el mes
// anterior (`metricas_publicacion`, por interacciones). No pide nada al motor
// y no guarda nada: propone, y una persona decide en la pantalla.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { productosParaPlan, lineaDeProducto, resumenGeneral, limpiarEstudio } from "../../../src/lib/estudioMercado.js";
import { fechasDelMes } from "../../../src/lib/fechasEspeciales.js";
import { semanasDelMes } from "../../../src/lib/campanas.js";
import { pedidoDeEstrategia, leerEstrategia, mejoresDelPeriodo, objetivoDe } from "../../../src/lib/estrategiaMes.js";
import { MONTHS } from "../../../src/constants.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const dos = (n) => String(n).padStart(2, "0");
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** `datos`: { year, month (0-11), objetivo?, focoId?, ofertas?, semanas?: [{ desde, hasta }] } → la estrategia propuesta (`leerEstrategia`) y `mejores`. */
export async function estrategiaDelMes(env, acceso, cliente, datos = {}) {
  const year = Number(datos.year);
  const month = Number(datos.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 0 || month > 11) {
    throw Object.assign(new Error("Mes no válido."), { estado: 400 });
  }
  let productos = [];
  let lineas = [];
  let estudio = "";
  try {
    const { catalogo, estudio: e, inventario } = await leerMercado(acceso, cliente.id);
    productos = productosParaPlan(catalogo, inventario);
    lineas = productos.map((p) => `- [${p.id}] ${lineaDeProducto(p, { inventario }).replace(/^- /, "")}`);
    const general = limpiarEstudio(e)?.general;
    if (general) estudio = resumenGeneral(general);
  } catch { /* sin catálogo ni estudio */ }
  const foco = productos.find((p) => p.id === datos.focoId);
  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, "estrategia campaña objetivo público beneficios temporada", { para: "texto", presupuesto: 4000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro */ }
  // Lo que mejor funcionó el mes anterior (una lectura: sólo columnas).
  const ant = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const desde = `${ant.y}-${dos(ant.m + 1)}-01`;
  const hasta = `${ant.y}-${dos(ant.m + 1)}-31`;
  let mejores = [];
  try {
    const filas = await acceso.leerColumnas("metricas_publicacion", ["red", "tipo", "texto", "interacciones", "publicada_at"], { client_id: cliente.id }, "publicada_at desc");
    mejores = mejoresDelPeriodo(filas, { desde, hasta }, 5);
  } catch { /* sin métricas */ }
  // Las semanas que usa la pantalla (en «Planificar mes», bloques de siete días desde el 1); sin ellas, las filas de la rejilla.
  const prefijo = `${year}-${dos(month + 1)}-`;
  const propias = (Array.isArray(datos.semanas) ? datos.semanas : []).slice(0, 6)
    .filter((x) => FECHA.test(x?.desde ?? "") && FECHA.test(x?.hasta ?? "") && x.desde.startsWith(prefijo) && x.hasta >= x.desde)
    .map((x, i) => ({ n: i + 1, desde: x.desde, hasta: x.hasta }));
  const semanas = propias.length ? propias : semanasDelMes(year, month).map((x) => ({ n: x.numero, desde: x.desde, hasta: x.hasta }));
  const fechas = fechasDelMes(year, month, leerJSON(cliente.fechas_especiales, {}));
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeEstrategia({
      marca: cliente.name, rubro: cliente.industry ?? "", mes: `${MONTHS[month]} ${year}`,
      objetivo: objetivoDe(datos.objetivo)?.id ?? "", foco: foco ? lineaDeProducto(foco).replace(/^- /, "") : "",
      productos: lineas, estudio, contexto, semanas, fechas, mejores, ofertas: String(datos.ofertas ?? "").slice(0, 400),
    }),
    salida: 2200,
    funcion: "estrategia del mes",
  });
  const estrategia = leerEstrategia(r.texto, { semanas: semanas.length, productos: productos.map((p) => p.id), objetivo: datos.objetivo });
  if (!estrategia) throw Object.assign(new Error("La IA no devolvió una estrategia que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  if (foco) estrategia.focoId = foco.id;
  const elegido = productos.find((p) => p.id === estrategia.focoId);
  return { estrategia: { ...estrategia, foco: elegido?.nombre ?? "" }, mejores, semanas, modelo: r.modelo, aviso: r.aviso ?? null };
}
