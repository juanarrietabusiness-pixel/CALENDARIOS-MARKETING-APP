// ============================================================
// «Voz UGC»: cómo habla CADA marca en sus videos UGC, como nota del cerebro
//
// La fórmula del video es de la agencia (formulas_ugc); la VOZ es de cada
// cliente: quién graba, tú o usted, cómo empieza y cierra, qué no dice
// nunca. La IA la PROPONE leyendo los guiones UGC de ese cliente —los
// aprobados y los corregidos por la agencia primero— y la nota de ahora;
// no guarda: se abre en el editor de notas y la persona la guarda con la
// ruta fija (`RUTA_VOZ_UGC`). La leen el guion UGC del panel y el lote.
// ============================================================

import { llamarIA, ErrorIA } from "./ia.js";
import { contexto as contextoCerebro, textoParaEscribir, leerNota } from "./cerebro.js";
import { pedidoDeVozUgc, leerVozUgc, guionesUgcDe, RUTA_VOZ_UGC, TITULO_VOZ_UGC } from "../../../src/lib/ugc.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

/** La nota de la voz (si hay y no es interna) → { id, texto } | null. */
export async function notaDeVozUgc(acceso, clienteId) {
  const n = await acceso.leerUno("cerebro_notas", { client_id: clienteId, ruta: RUTA_VOZ_UGC }).catch(() => null);
  return n?.texto && !n.interna ? { id: n.id, texto: String(n.texto) } : null;
}

/** Igual, y si alguien la creó a mano con otro nombre de ruta, por su título (como «Saber del rubro»). */
export async function vozUgcDe(env, acceso, clienteId) {
  const n = await notaDeVozUgc(acceso, clienteId);
  if (n) return n;
  const t = await leerNota(env, acceso, clienteId, TITULO_VOZ_UGC, { para: "texto" }).catch(() => null);
  return t?.texto && !t.interna ? { id: t.id ?? null, texto: String(t.texto) } : null;
}

/** → { titulo, texto, existente: { id } | null, guiones (cuántos leyó), aviso }. No guarda nada. */
export async function proponerVozUgc(env, acceso, cliente) {
  const actual = await acceso.leerUno("cerebro_notas", { client_id: cliente.id, ruta: RUTA_VOZ_UGC });
  const calendarios = (await acceso.leer("calendars", { client_id: cliente.id }))
    .map((c) => ({ days: Array.isArray(c.days) ? c.days : leerJSON(c.days, []) }));
  const guiones = guionesUgcDe(calendarios);
  let contexto = "";
  try {
    contexto = textoParaEscribir(await contextoCerebro(env, acceso, cliente.id, "videos guion tono voz quién habla clientes", { para: "texto", presupuesto: 4000 }));
  } catch { /* sin cerebro: con los guiones */ }
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeVozUgc({ marca: cliente.name, guiones, actual: actual?.texto ?? "", contexto }),
    salida: 2500,
    funcion: "voz UGC",
  });
  const texto = leerVozUgc(r.texto);
  if (!texto) throw new ErrorIA("La IA no devolvió la nota. Inténtalo otra vez.", 502);
  return { titulo: TITULO_VOZ_UGC, texto, existente: actual ? { id: actual.id } : null, guiones: guiones.length, aviso: r.aviso ?? null };
}
