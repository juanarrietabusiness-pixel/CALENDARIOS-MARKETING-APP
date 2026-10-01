// ============================================================
// «Escribir el prompt»: de lo que dice la persona al prompt final
//
// La persona escribe la idea con sus palabras y escoge imágenes de
// referencia; la IA las MIRA y escribe el prompt que va al motor. Dos
// deslizadores deciden cuánto pesa cada cosa:
//
//   · memoria (0–100 %): cuánto del cerebro del cliente entra. Sale de
//     `contexto()` con `para: "imagen"` —la ficha, los pasajes que tocan y
//     el resumen de sus vecinas en el grafo—, sin notas internas; el
//     porcentaje escala su presupuesto. 0 es «nada de la marca».
//   · referencias (0–100 %): de «sólo inspiración» a «replicar composición
//     y estilo».
//
// Un CARRUSEL son varias diapositivas de la misma serie: sale un bloque de
// estilo común y un prompt por diapositiva, cada uno ya con el estilo
// dentro (cada uno va a un trabajo aparte y el motor no ve los demás).
//
// Lo que sale es TEXTO que la persona revisa antes de pedir nada: no gasta
// en el motor de imagen. Lo que se manda luego al motor es lo que quedó en
// el campo, igual que siempre (ver herramientas.js: la marca no se cuela
// por detrás).
// ============================================================

import { contexto } from "../cerebro/cerebro.js";
import { llamarIA } from "../cerebro/ia.js";
import { claveDelCliente } from "./archivos.js";
import { aBase64 } from "./gemini.js";

export const MAX_REFERENCIAS_PROMPT = 4;
export const MAX_DIAPOSITIVAS = 10;
const MAX_IDEA = 2_000;
const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"];
const CONSULTA_VISUAL = "estilo visual identidad paleta colores fotografía iluminación composición tipografía evitar negativos";

const recortar = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** Qué hacer con las referencias, según el deslizador. Pura. */
export function instruccionApego(apego) {
  const a = recortar(apego);
  if (a < 34) return `APEGO A LAS REFERENCIAS: ${a} %. Úsalas sólo como inspiración: el ambiente, la paleta y la luz. La composición, el encuadre y los elementos son libres.`;
  if (a < 67) return `APEGO A LAS REFERENCIAS: ${a} %. Toma su estilo, su paleta, su luz y su tipo de composición; el contenido concreto (objetos, personas, texto) sigue la idea.`;
  return `APEGO A LAS REFERENCIAS: ${a} %. Replica su composición, su encuadre, su estilo y su paleta lo más fielmente posible; cambia sólo lo que la idea pide cambiar. Describe con precisión qué hay que conservar de cada referencia.`;
}

/** Cuánto del cerebro entra, según el deslizador: `null` si nada. Pura. */
export function presupuestoMemoria(memoria) {
  const m = recortar(memoria);
  if (!m) return null;
  return { presupuesto: Math.round(800 + (m / 100) * 7_200), n: 1 + Math.round((m / 100) * 4) };
}

/** Lo que se le pide a la IA, en texto. Pura. */
export function pedidoDePrompt({ idea, tipo = "imagen", diapositivas = 1, apego = 50, memoria = 50, guia = null, cliente = {}, referencias = 0 }) {
  const n = Math.max(1, Math.min(MAX_DIAPOSITIVAS, Math.round(Number(diapositivas) || 1)));
  const partes = [
    `Eres director de arte de la agencia Juancito Ads. Escribe el prompt FINAL para un modelo que genera ${tipo === "video" ? "video" : "imágenes"}${cliente.name ? `, para la marca ${cliente.name}` : ""}.`,
    "Un buen prompt describe: el sujeto y la acción, el entorno, la composición y el encuadre, la luz, la paleta, el estilo (fotografía, ilustración…), el texto que deba verse dentro (entre comillas, exacto) y lo que hay que evitar. Concreto y visual, sin adjetivos vacíos.",
    "",
    `LA IDEA, CON LAS PALABRAS DE QUIEN LA PIDE:\n${String(idea).slice(0, MAX_IDEA)}`,
  ];
  if (referencias) partes.push("", `HAY ${referencias} IMAGEN${referencias === 1 ? "" : "ES"} DE REFERENCIA ADJUNTA${referencias === 1 ? "" : "S"} (en este orden: referencia 1, 2…). Míralas y describe lo que haga falta de ellas.`, instruccionApego(apego));
  if (guia) partes.push("", `APEGO A LA MEMORIA DE LA MARCA: ${recortar(memoria)} %. Lo que se sabe de su identidad visual (úsalo en esa medida; no lo copies como texto dentro de la imagen):`, guia);
  else partes.push("", "No uses nada de la identidad de la marca que no esté en la idea o en las referencias.");
  if (n > 1) {
    partes.push(
      "",
      `ES UN CARRUSEL DE ${n} DIAPOSITIVAS que tienen que verse de la misma serie: misma paleta, misma tipografía, misma luz y mismo tratamiento. Escribe primero el BLOQUE DE ESTILO común y después un prompt por diapositiva, en orden, cada uno COMPLETO (con el estilo dentro: cada diapositiva se genera por separado y el modelo no ve las demás).`,
      'Devuelve SOLO este JSON: {"estilo": "...", "prompts": ["diapositiva 1…", "diapositiva 2…"]}',
    );
  } else {
    partes.push("", 'Devuelve SOLO este JSON: {"prompts": ["el prompt"]}');
  }
  return partes.join("\n");
}

/** La respuesta de la IA → { estilo, prompts }. Tolera texto alrededor del JSON. Pura. */
export function leerPrompts(texto, diapositivas = 1) {
  const bruto = String(texto ?? "");
  const desde = bruto.indexOf("{");
  const hasta = bruto.lastIndexOf("}");
  let datos = null;
  if (desde >= 0 && hasta > desde) { try { datos = JSON.parse(bruto.slice(desde, hasta + 1)); } catch { /* sigue abajo */ } }
  const prompts = (Array.isArray(datos?.prompts) ? datos.prompts : [])
    .map((p) => String(p ?? "").trim()).filter(Boolean).slice(0, Math.max(1, diapositivas));
  if (!prompts.length) {
    // Sin JSON: si el texto es un prompt a secas, vale.
    const limpio = bruto.replace(/```[a-z]*|```/g, "").trim();
    if (limpio && !limpio.startsWith("{")) prompts.push(limpio);
  }
  return { estilo: String(datos?.estilo ?? "").trim(), prompts };
}

/**
 * Escribe el prompt (o los de un carrusel). `datos`: { idea, tipo, diapositivas,
 * apego, memoria, referencias: [src] }. Las referencias son del MISMO cliente:
 * el src llega del navegador y no se cree.
 */
export async function escribirPrompt(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim();
  if (!idea) throw Object.assign(new Error("Escribe primero la idea, con tus palabras."), { estado: 400 });
  const diapositivas = Math.max(1, Math.min(MAX_DIAPOSITIVAS, Math.round(Number(datos.diapositivas) || 1)));

  const imagenes = [];
  for (const src of (Array.isArray(datos.referencias) ? datos.referencias : []).slice(0, MAX_REFERENCIAS_PROMPT)) {
    const clave = claveDelCliente(src, cliente.id);
    if (!clave) throw Object.assign(new Error("Una de las referencias no es de este cliente."), { estado: 400 });
    const obj = await env.MEDIA.get(clave);
    if (!obj) throw Object.assign(new Error("Una de las referencias ya no existe."), { estado: 404 });
    const mime = obj.httpMetadata?.contentType || "image/jpeg";
    // Una tarjeta de prueba (SVG) o un video no se le enseñan a la IA.
    if (!TIPOS_IMAGEN.includes(mime)) continue;
    imagenes.push({ type: "image", source: { type: "base64", media_type: mime, data: aBase64(await obj.arrayBuffer()) } });
  }

  const cuanto = presupuestoMemoria(datos.memoria);
  let guia = null;
  if (cuanto) {
    try {
      const c = await contexto(env, acceso, cliente.id, `${idea} ${CONSULTA_VISUAL}`, { para: "imagen", n: cuanto.n, per: 1, presupuesto: cuanto.presupuesto });
      guia = [c.ficha && `FICHA:\n${c.ficha.slice(0, cuanto.presupuesto)}`, c.pasajes].filter(Boolean).join("\n\n") || null;
    } catch (e) {
      // Sin cerebro (o con el índice roto) se escribe igual: la memoria es un extra.
      console.warn("prompt: sin memoria del cliente", e?.message);
    }
  }

  const texto = pedidoDePrompt({
    idea, tipo: datos.tipo === "video" ? "video" : "imagen", diapositivas,
    apego: datos.apego ?? 50, memoria: datos.memoria ?? 50, guia, cliente, referencias: imagenes.length,
  });
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [...imagenes, { type: "text", text: texto }], salida: 1_500 + diapositivas * 700, funcion: "prompt de imagen",
  });
  const { estilo, prompts } = leerPrompts(r.texto, diapositivas);
  if (!prompts.length) throw Object.assign(new Error("La IA no devolvió ningún prompt. Inténtalo otra vez."), { estado: 502 });
  return { estilo, prompts, modelo: r.modelo, aviso: r.aviso, conMemoria: Boolean(guia), referencias: imagenes.length };
}
