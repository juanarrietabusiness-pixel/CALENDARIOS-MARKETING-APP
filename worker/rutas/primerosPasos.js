// ============================================================
// /api/primeros-pasos/<cliente> — lo que le falta a un cliente para arrancar
//
//   GET   { estado: { ficha, logo, productos, conFotos, estudio, conBorrador, fichaTecnica, plan, redes, mes } }
//
// La lista «Primeros pasos» de la página de cada cliente (components/PrimerosPasos.jsx, src/lib/primerosPasos.js). Se
// pide cada vez que se abre un cliente que no la tiene completa, así que es LIGERA a propósito: la fila del cliente y
// cuatro lecturas cortas (una fila del estudio de mercado, una nota del cerebro, sus cuentas y los tres meses más
// recientes), nada de la galería ni de las notas enteras, que es lo que leen el semáforo del kit y la pestaña Cerebro.
// Sólo lee; todo por la capa de acceso (un colaborador sólo pregunta por sus clientes).
// ============================================================

import { json, noEncontrado } from "../lib/respuesta.js";
import { productosActivos } from "../../src/lib/estudioMercado.js";
import { estadoDePrimerosPasos } from "../../src/lib/primerosPasos.js";

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t) ?? d; } catch { return d; }
};
/** ¿Algún día de este mes tiene publicaciones? Sin parsear lo que no hace falta: un mes vacío es «[]». */
const conPublicaciones = (days) => (leerJSON(days, []) ?? []).some((d) => Array.isArray(d?.posts) && d.posts.length > 0);

export async function rutaPrimerosPasos(req, env, { acceso, partes, metodo }) {
  const [, clienteId, sobra] = partes;
  if (metodo !== "GET" || !clienteId || sobra) return noEncontrado("Ruta");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  const [mercados, fichas, cuentas, meses] = await Promise.all([
    acceso.leerColumnas("mercado_clientes", ["catalogo", "estudio", "borrador"], { client_id: cliente.id }, "created_at asc", 1),
    acceso.leerColumnas("cerebro_notas", ["id"], { client_id: cliente.id, tipo: "ficha" }, "created_at asc", 1),
    acceso.leerColumnas("cuentas_sociales", ["red"], { client_id: cliente.id }),
    acceso.leerColumnas("calendars", ["days"], { client_id: cliente.id }, "year desc, month desc", 3),
  ]);
  const mercado = mercados[0] ?? null;
  const borrador = leerJSON(mercado?.borrador, null);
  return json({
    estado: estadoDePrimerosPasos({
      cliente,
      productos: mercado ? productosActivos(leerJSON(mercado.catalogo, [])) : [],
      estudio: mercado?.estudio ?? null,
      conBorrador: Boolean(borrador && typeof borrador === "object" && Object.keys(borrador).length),
      conFicha: fichas.length > 0,
      redes: cuentas.map((c) => c.red),
      conMes: meses.some((m) => conPublicaciones(m.days)),
    }),
  });
}
