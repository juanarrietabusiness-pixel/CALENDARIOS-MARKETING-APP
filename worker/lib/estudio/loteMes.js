// ============================================================
// El lote del MES completo: la IA escribe una pieza por día (texto)
//
// Lo puro (qué días, el ritmo con la temporada, la matriz, la forma de cada
// pieza, el pedido, la lectura) en src/lib/loteMes.js. Aquí se junta lo que
// vive en la base: el ritmo y las fechas especiales del cliente (su fila),
// el catálogo con su inventario, lo general del estudio de mercado (deseos
// y perfiles para la matriz) y el cerebro para escribir (nunca lo interno).
// No pide nada al motor de imagen: eso lo hace la pantalla, pieza a pieza,
// después de que una persona revisa las ideas y ve el costo.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { productosParaPlan, lineaDeProducto, resumenGeneral, limpiarEstudio } from "../../../src/lib/estudioMercado.js";
import { fechasDelMes } from "../../../src/lib/fechasEspeciales.js";
import { fechaEnZona } from "../../../src/lib/agenda.js";
import { FORMATOS_LOTE } from "../../../src/lib/loteAnuncios.js";
import { diasDelLote, planDelMes, pedidoDelMes, leerIdeasDelMes, mesDe, textoMes } from "../../../src/lib/loteMes.js";

const leerJSON = (t) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t); } catch { return null; }
};

/**
 * `datos`: { mes: "AAAA-MM", dias: [0–6], formato, semilla?, usados? } → { ideas, productos }.
 * Del mes en curso sólo entran los días desde hoy (Panamá).
 */
export async function ideasDelMes(env, acceso, cliente, datos = {}) {
  const m = mesDe(datos.mes);
  if (!m) throw Object.assign(new Error("Escoge el mes."), { estado: 400 });
  const hoy = fechaEnZona();
  if (textoMes(m.year, m.month) < hoy.slice(0, 7)) throw Object.assign(new Error("Ese mes ya pasó."), { estado: 400 });
  const formato = FORMATOS_LOTE[datos.formato] ? datos.formato : "post";
  const fechas = fechasDelMes(m.year, m.month, leerJSON(cliente.fechas_especiales));
  const dias = diasDelLote({
    ...m, ritmo: leerJSON(cliente.ritmo_contenido), fechas,
    dias: (Array.isArray(datos.dias) ? datos.dias : []).map(Number).filter((d) => d >= 0 && d <= 6),
    desde: textoMes(m.year, m.month) === hoy.slice(0, 7) ? hoy : "",
  });
  if (!dias.length) throw Object.assign(new Error("Ese mes no tiene días con tipo de contenido en los días escogidos (revisa el ritmo del cliente)."), { estado: 400 });

  const { catalogo, estudio, inventario } = await leerMercado(acceso, cliente.id);
  const productos = productosParaPlan(catalogo, inventario);
  const general = limpiarEstudio(estudio)?.general ?? null;
  const plan = planDelMes(dias, { productos, deseos: general?.deseos ?? [], perfiles: general?.perfiles ?? [], semilla: datos.semilla, formato });
  const usados = new Set(plan.map((r) => r.productoId).filter(Boolean));

  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, "contenido del mes beneficios objeciones público", { para: "texto", presupuesto: 5000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro, con el catálogo y el estudio */ }

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDelMes({
      marca: cliente.name, plan, formato, contexto,
      productos: Object.fromEntries(productos.filter((p) => usados.has(p.id)).map((p) => [p.id, lineaDeProducto(p, { inventario }).slice(2)])),
      estudio: general ? resumenGeneral(general) : "",
      fechasEspeciales: fechas.map((f) => `${f.fecha} · ${f.nombre}${f.delicada ? " (delicada: sin promociones)" : ""}`),
      usados: (Array.isArray(datos.usados) ? datos.usados : []).map((t) => String(t ?? "").slice(0, 80)).filter(Boolean).slice(0, 30),
    }),
    salida: 380 * plan.length + 800,
    funcion: "lote del mes",
  });
  const ideas = leerIdeasDelMes(r.texto, plan);
  if (!ideas.length) throw Object.assign(new Error("La IA no devolvió ideas que se puedan leer. Inténtalo otra vez."), { estado: 502 });
  return { ideas, productos: productos.map((p) => ({ id: p.id, nombre: p.nombre })), conEstudio: Boolean(general), modelo: r.modelo, aviso: r.aviso ?? null };
}
