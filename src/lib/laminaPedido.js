// ============================================================
// El pedido de UNA lámina de carrusel, completo: modelo, referencias y texto
//
// Puro. Lo usan la pantalla (`crearLamina` en lib/carruselEstudio.js) y el
// servidor, que lleva el carrusel entero sin la pantalla (worker/lib/estudio/
// encargos.js): la misma lámina se pide igual por los dos caminos.
// ============================================================

import { pedidoDeLamina, referenciasDeLamina } from "./carrusel.js";
import { lineaDeSistema } from "./sistemaCarrusel.js";
import { ajustesDe, modeloQueRespeta } from "./estudioCatalogo.js";

/**
 * → { modelo, prompt, n, ajustes, medios } para pedir la lámina. `anterior` y `portada` son CLAVES de las crudas ya
 * hechas (sin texto de plantilla); `personajes` [{ clave, nota }], `tipografia` { clave, nota } (sólo si escribe el
 * modelo), `fotos` claves del producto, `logo` la clave del logo si lo pone el modelo. Una lámina es 4:5 SIEMPRE: si el
 * modelo escogido no lo respeta con esas referencias, va con otro (`activos`: { motor: bool }).
 */
export function armarLamina({
  modelo, activos = {}, lamina, total, idea = "", preset = "", modo = "ia", plantilla = "banda", hilo = "", personajes = [],
  tipografia = null, fotos = [], logo = "", anterior = "", portada = "", sistema = null,
}) {
  const letra = modo === "plantilla" ? null : tipografia;
  const deLamina = (m) => referenciasDeLamina({
    anterior, portada, fotos: [...personajes.map((p) => p.clave), ...(letra ? [letra.clave] : []), ...fotos], logo, max: m.referencias || 0,
  });
  const m = modeloQueRespeta(modelo, activos, "4:5", deLamina(modelo).length);
  const reference = deLamina(m);
  const quienes = [...personajes, ...(letra ? [letra] : [])].filter((p) => reference.includes(p.clave)).map((p) => p.nota).filter(Boolean);
  const prompt = pedidoDeLamina({
    lamina, total, idea, preset, modo, plantilla, hilo,
    personajes: [...new Set(quienes)].map((n) => `Una de las referencias ${n}.`).join(" "),
    conAnteriores: Boolean(anterior || portada), conFotos: fotos.some((f) => reference.includes(f)), conLogo: Boolean(logo) && reference.includes(logo),
    sistema: lamina.n > 1 ? lineaDeSistema(sistema) : "",
  });
  const medios = reference.length ? { reference } : {};
  return { modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: "4:5", imageSize: "2K" }, medios), medios };
}
