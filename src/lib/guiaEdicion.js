// ============================================================
// La GUÍA DE EDICIÓN (puro): lo que quien edita un video grabado lee ANTES de empezar, en una sola llamada
//
// La arma `guia_de_edicion` (worker/lib/estudio/guiaEdicion.js) con el manual del editor (lo común y lo del tipo), la marca
// resumida, los estilos de edición del cliente, la lista de control y la versión vigente del kit. Aquí lo que no toca D1:
//   · el CONTACTO de verdad (decisión de la agencia 10): sale de la nota «Datos del negocio» del cerebro, no de la Ficha
//     técnica (un resumen que no se rehace al corregir una nota) ni del campo de la ficha del cliente. Si no coinciden, se
//     dice (en Rofer la ficha seguía con 61562010 y la nota decía 6086-6581);
//   · la lista de control antes de entregar, con los números del oficio (src/lib/oficioEdicion.js).
// ============================================================

import { OFICIO, db, coma } from "./oficioEdicion.js";

/** La nota de los datos del negocio: «Brand guidelines — Datos del negocio», «Datos del negocio»… */
export const esNotaDeDatos = (titulo) => /datos\s+del\s+negocio/i.test(String(titulo ?? ""));

/** Los teléfonos de un texto, cada uno con sus cifras (para comparar) y como se escribió. Puro. */
export function telefonosDe(texto) {
  const out = [];
  for (const m of String(texto ?? "").matchAll(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3,4}\)?[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/g)) {
    const cifras = m[0].replace(/\D/g, "");
    if (cifras.length < 7 || cifras.length > 13) continue;
    // Los últimos 8 dígitos bastan para saber si es el mismo número (con o sin el +507).
    const clave = cifras.slice(-8);
    if (!out.some((t) => t.clave === clave)) out.push({ clave, escrito: m[0].trim() });
  }
  return out;
}

/** Los @usuarios de un texto (sin el @, en minúsculas). Puro. */
export const usuariosDe = (texto) => [...new Set([...String(texto ?? "").matchAll(/(?:^|[\s(«"'])@([a-z0-9._]{2,30})/gi)].map((m) => m[1].toLowerCase().replace(/\.$/, "")))];

/**
 * El contacto para el video: el de la nota de datos del negocio, con lo que NO coincide en la Ficha técnica y en la ficha
 * del cliente. → { telefonos, usuarios, avisos, fuente }. Sin nota, lo de la ficha del cliente y un aviso. Puro.
 */
export function contactoParaElVideo({ notaDatos = null, fichaTecnica = "", cliente = {} } = {}) {
  const avisos = [];
  const deLaFicha = String(cliente.whatsapp ?? "");
  const usuarioCliente = String(cliente.instagram ?? "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!notaDatos) {
    avisos.push("No hay nota «Datos del negocio» en el cerebro: el contacto sale de la ficha del cliente, que puede estar vieja. Pregúntale a la persona el WhatsApp antes de escribirlo en el video.");
    return { telefonos: telefonosDe(deLaFicha), usuarios: usuarioCliente ? [usuarioCliente] : [], avisos, fuente: "la ficha del cliente" };
  }
  const telefonos = telefonosDe(notaDatos.texto);
  const usuarios = usuariosDe(notaDatos.texto);
  const claves = new Set(telefonos.map((t) => t.clave));
  const distintos = (otros) => otros.filter((t) => !claves.has(t.clave));
  if (telefonos.length) {
    const enFicha = distintos(telefonosDe(fichaTecnica));
    if (enFicha.length) avisos.push(`La Ficha técnica dice ${enFicha.map((t) => t.escrito).join(", ")} y la nota de datos del negocio ${telefonos.map((t) => t.escrito).join(", ")}: manda la nota. Dile a la persona que la ficha está vieja (Marca → Cerebro → «Preparar ficha con IA»).`);
    const enCliente = distintos(telefonosDe(deLaFicha));
    if (enCliente.length) avisos.push(`El WhatsApp de la ficha del cliente (${enCliente.map((t) => t.escrito).join(", ")}) no es el de la nota: manda la nota. Que lo corrijan en Editar ficha.`);
  } else {
    avisos.push("La nota de datos del negocio no trae ningún teléfono: pregúntale a la persona el WhatsApp antes de escribirlo.");
  }
  if (usuarios.length && usuarioCliente && !usuarios.includes(usuarioCliente)) {
    avisos.push(`El Instagram de la ficha del cliente (@${usuarioCliente}) no es el de la nota (@${usuarios.join(", @")}): manda la nota.`);
  }
  return { telefonos, usuarios: usuarios.length ? usuarios : usuarioCliente ? [usuarioCliente] : [], avisos, fuente: `la nota «${notaDatos.titulo}»` };
}

/** La lista de control antes de entregar, con los números del oficio. Pura. */
export function listaDeControl() {
  const z = OFICIO.zonas;
  return [
    "El cuadro 0 ya trae el gancho completo (nada que esperar para entenderlo).",
    `Nada importante en la franja de arriba (${Math.round(z.arriba * 100)} %) ni en la de abajo (${Math.round(z.abajo * 100)} %), y nada que tape la cara.`,
    "Los textos detrás de la persona, con aire sobre la cabeza (el tope REAL del casco o del pelo) y que se lean enteros.",
    `Subtítulos de una línea y hasta ${OFICIO.subtitulos.maxPalabras} palabras; ocultos donde un gráfico ya dice lo mismo.`,
    `Sonido: ${db(OFICIO.master.lufs)} LUFS, pico ≤ ${db(OFICIO.master.picoDbtp)} dBTP medido en el MP4 final, la voz ${OFICIO.musica.debajoDeLaVoz.join("–")} dB sobre la música y la música que se oiga.`,
    `Los silencios a ${coma(OFICIO.silencio.queda)} s y el llamado con fuerza (si sale flojo, se rescata).`,
    "El contacto, el de la nota de datos del negocio; los precios, los del catálogo; la música, de su biblioteca o de Suno.",
    "La hoja de contactos del final, MIRADA cuadro a cuadro, y el video subido a la galería del cliente (subir_a_galeria).",
  ];
}
