// ============================================================
// El SISTEMA DE DISEÑO de un carrusel, sacado de su portada (puro)
//
// Las láminas se crean una a una con la anterior y la portada de
// referencia, y aun así el titular cambia de tamaño, el texto salta de
// arriba abajo y los márgenes bailan: una imagen de referencia dice «algo
// así», no «exactamente esto». Con la portada aprobada, la IA la MIRA y
// escribe su sistema —tamaño y peso del titular, mayúsculas, dónde va el
// texto, márgenes, fondo, colores, elementos que se repiten, dónde va el
// logo— y ese sistema viaja en palabras en el pedido de cada lámina
// (`lineaDeSistema`) y en el control de calidad, que dice lo que se sale
// de la serie (`serie` en src/lib/control.js).
//
// Lo usan el Worker (worker/lib/estudio/control.js) y la pantalla
// (src/lib/carruselEstudio.js, FlujoCarrusel.jsx).
// ============================================================

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const HEX = /^#[0-9a-f]{6}$/i;

/** Lo que se le pide a la IA, con la portada como imagen aparte. `texto`: el que lleva la portada (para no confundirlo). Pura. */
export function pedidoDeSistema({ marca = "la marca", texto = "", para = "portada" } = {}) {
  return [
    para === "plantilla"
      ? `Eres director de arte. Esta pieza de redes de ${marca} quedó muy bien y la agencia la guarda como PLANTILLA: las próximas piezas repetirán su diseño con otro contenido (otra foto, otro texto, otro producto).`
      : `Eres director de arte. Esta es la PORTADA aprobada de un carrusel de Instagram de ${marca}. Las demás láminas se van a generar una a una y tienen que parecer de la MISMA serie.`,
    texto ? `El texto de la portada es: "${corto(texto, 200).replace(/"/g, "'")}".` : "",
    "Describe su sistema de diseño con medidas aproximadas que un generador de imágenes pueda seguir (porcentajes del alto o del ancho de la imagen, no píxeles):",
    "- titular: tamaño (≈ % del alto de la imagen que ocupa una línea), peso (fina, regular, negrita, extra negrita), si va en MAYÚSCULAS, color (hex), alineación y tipo de letra (serif, sans, script, display…);",
    "- apoyo: lo mismo para el texto secundario (vacío si no hay);",
    "- zona del texto: dónde va el bloque de texto (tercio superior, centro, tercio inferior; izquierda, centro, derecha) y si va sobre una banda, una caja o directo sobre la imagen;",
    "- márgenes: ≈ % del ancho que se deja libre en los bordes;",
    "- fondo: cómo es (foto a sangre, color plano, degradado, textura) y su tratamiento;",
    "- colores: los 2 a 5 que mandan, en hex;",
    "- elementos: lo que se repite y tiene que repetirse (formas, líneas, iconos, numeración, flechas, marco);",
    "- logo: dónde está y de qué tamaño (o \"no lleva\").",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"titular":{"tamano":"≈8 % del alto","peso":"extra negrita","mayusculas":true,"color":"#ffffff","alineacion":"izquierda","letra":"sans geométrica"},"apoyo":{"tamano":"","peso":"","mayusculas":false,"color":"","alineacion":"","letra":""},"zonaTexto":"…","margenes":"≈6 % del ancho","fondo":"…","colores":["#…"],"elementos":["…"],"logo":"…"}',
  ].filter(Boolean).join("\n");
}

const limpiarTexto = (t) => {
  if (!t || typeof t !== "object") return null;
  const salida = {
    tamano: corto(t.tamano, 40), peso: corto(t.peso, 30), mayusculas: t.mayusculas === true,
    color: HEX.test(String(t.color ?? "").trim()) ? String(t.color).trim().toLowerCase() : "",
    alineacion: corto(t.alineacion, 30), letra: corto(t.letra, 50),
  };
  return salida.tamano || salida.peso || salida.letra || salida.color ? salida : null;
};

/** La respuesta de la IA (o un sistema guardado) → el sistema limpio, o null si no trae nada que seguir. Pura. */
export function leerSistema(entrada) {
  let d = entrada;
  if (typeof entrada === "string") {
    const m = entrada.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { d = JSON.parse(m[0]); } catch { return null; }
  }
  if (!d || typeof d !== "object") return null;
  const s = {
    titular: limpiarTexto(d.titular),
    apoyo: limpiarTexto(d.apoyo),
    zonaTexto: corto(d.zonaTexto, 160),
    margenes: corto(d.margenes, 60),
    fondo: corto(d.fondo, 160),
    colores: (Array.isArray(d.colores) ? d.colores : []).map((c) => String(c ?? "").trim().toLowerCase()).filter((c) => HEX.test(c)).slice(0, 5),
    elementos: (Array.isArray(d.elementos) ? d.elementos : []).map((e) => corto(e, 80)).filter(Boolean).slice(0, 5),
    logo: corto(d.logo, 80),
  };
  return s.titular || s.zonaTexto || s.fondo || s.colores.length ? s : null;
}

const textoDe = (t) => t && [t.tamano, t.peso, t.mayusculas ? "en MAYÚSCULAS" : "", t.letra, t.color, t.alineacion && `alineado a la ${t.alineacion.replace(/^a la /, "")}`].filter(Boolean).join(", ");

/**
 * El sistema en una línea para el pedido de una lámina (y para el control). Vacío sin sistema. Pura.
 */
export function lineaDeSistema(sistema) {
  const s = leerSistema(sistema);
  if (!s) return "";
  const partes = [
    s.titular && `titular ${textoDe(s.titular)}`,
    s.apoyo && `apoyo ${textoDe(s.apoyo)}`,
    s.zonaTexto && `el texto va ${s.zonaTexto}`,
    s.margenes && `márgenes ${s.margenes}`,
    s.fondo && `fondo: ${s.fondo}`,
    s.colores.length && `colores ${s.colores.join(", ")}`,
    s.elementos.length && `se repite: ${s.elementos.join("; ")}`,
    s.logo && `logo: ${s.logo}`,
  ].filter(Boolean);
  return `SISTEMA DE DISEÑO DE LA SERIE (sale de la portada aprobada; esta lámina lo respeta igual, sólo cambia el contenido): ${partes.join("; ")}.`;
}

/** Lo que se enseña en la pantalla: tres o cuatro rasgos que mandan. Pura. */
export function resumenSistema(sistema) {
  const s = leerSistema(sistema);
  if (!s) return "";
  return [
    s.titular && `Titular ${[s.titular.tamano, s.titular.peso, s.titular.mayusculas ? "mayúsculas" : ""].filter(Boolean).join(", ")}`,
    s.zonaTexto && `texto ${s.zonaTexto}`,
    s.margenes && `márgenes ${s.margenes}`,
    s.colores.length && `colores ${s.colores.join(" ")}`,
  ].filter(Boolean).join(" · ");
}
