// ============================================================
// Lo que la sección de IA de Ajustes necesita saber
//
//   · /api/ia/modelos: qué modelos tiene la cuenta de Anthropic y cuál
//     se usaría con la configuración actual. Es la respuesta a «¿cuál es
//     el más potente que tengo?», sacada de la cuenta y no supuesta.
//   · /api/ia/consumo: lo que costó la IA en un mes, por función y por
//     modelo, sumando los apuntes de `consumo_ia`.
// ============================================================

import { json, error } from "../lib/respuesta.js";
import { modelosDeLaCuenta, leerConfigIA, resolverIA, etiquetaModelo } from "../lib/configIA.js";

export async function rutaModelos(req, env, { acceso }) {
  if (!env.ANTHROPIC_API_KEY) return error("El servidor no tiene configurada la clave de Anthropic", 503);
  const ids = await modelosDeLaCuenta(env);
  const config = await leerConfigIA(acceso);
  const ia = await resolverIA(env, config);
  return json({
    disponibles: (ids ?? []).map((id) => ({ id, nombre: etiquetaModelo(id) })),
    listaCompleta: Boolean(ids),
    enUso: { id: ia.modelo, nombre: etiquetaModelo(ia.modelo), esfuerzo: ia.esfuerzo, aviso: ia.aviso },
  });
}

export async function rutaConsumo(req, env, { acceso }) {
  const url = new URL(req.url);
  const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get("mes") ?? "")
    ? url.searchParams.get("mes")
    : new Date().toISOString().slice(0, 7);
  const filas = await acceso.leer("consumo_ia", { mes }, "created_at asc");

  const sumar = (clave) => {
    const grupos = new Map();
    for (const f of filas) {
      const k = f[clave] || "otro";
      const g = grupos.get(k) ?? { nombre: clave === "modelo" ? etiquetaModelo(k) : k, llamadas: 0, costo: 0, entrada: 0, salida: 0 };
      g.llamadas += 1;
      g.costo += Number(f.costo_usd ?? 0);
      g.entrada += Number(f.entrada ?? 0) + Number(f.cache_leido ?? 0) + Number(f.cache_escrito ?? 0);
      g.salida += Number(f.salida ?? 0);
      grupos.set(k, g);
    }
    return [...grupos.values()].sort((a, b) => b.costo - a.costo);
  };

  return json({
    mes,
    total: filas.reduce((s, f) => s + Number(f.costo_usd ?? 0), 0),
    llamadas: filas.length,
    porFuncion: sumar("funcion"),
    porModelo: sumar("modelo"),
  });
}
