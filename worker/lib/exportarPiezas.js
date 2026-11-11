// ============================================================
// `exportar_piezas`: piezas de la galería en un ZIP, para que Claude se las dé a la persona
//
// Lo más simple que aguanta 150 MB:
//   · La herramienta COMPRUEBA (que cada ID sea de la galería de ESE cliente, los topes) y devuelve una dirección
//     firmada, sin sesión, que vale 15 minutos: `/api/exportar/<testigo>/<nombre>.zip`. El testigo lleva el espacio,
//     el cliente y los IDs por carpeta; nada se guarda en R2 (sin `exports/` ni reglas de ciclo de vida que limpiar).
//   · Al abrir la dirección, el ZIP se ARMA POR FLUJO desde R2: cada archivo pasa trozo a trozo, sin estar entero en
//     memoria (el Worker tiene 128 MB; un ZIP de 150 MB en memoria no cabría). Sin comprimir (PNG, JPEG, WEBP y MP4 no
//     ganan nada), con el CRC-32 calculado mientras pasan los bytes y un «descriptor de datos» detrás de cada archivo
//     (bit 3): el formato estándar para cuando el CRC no se sabe antes. Lo abren Windows, macOS y el teléfono.
//   · Se puede abrir varias veces mientras no caduque: el iPhone y algunos gestores piden el archivo dos veces.
//   · Al abrirla se vuelve a leer cada ficha por la capa de acceso del espacio: lo borrado entretanto no sale.
//
// No gasta IA.
// ============================================================

import { crearAcceso } from "./acceso.js";
import { firmarCon, leerFirmado } from "./firmas.js";
import { secretoDeVista } from "./medioVista.js";
import { crc32Seguir, fechaDos } from "../../src/lib/zip.js";

export const MAX_ARCHIVOS_ZIP = 60;
export const MAX_BYTES_ZIP = 150 * 1024 * 1024;
export const VIDA_ZIP_MS = 15 * 60_000;
export const RUTA_EXPORTAR = "/api/exportar/";
const USO = "exportar-zip";

export class ErrorExportar extends Error {}

const enc = new TextEncoder();

export const DEFINICION_EXPORTAR = Object.freeze({
  name: "exportar_piezas",
  description:
    "Junta piezas de la galería de un cliente en un ZIP para DESCARGARLAS (una carpeta por grupo, los archivos numerados en su orden: 01-titulo.png, 02-…) y devuelve un enlace que funciona sin iniciar sesión durante 15 minutos: dáselo a la persona tal cual. Úsala cuando pidan descargar, bajar o pasar las piezas (un carrusel, las del mes, los fondos de un video). Los IDs salen de ver_estudio, estado_encargo o ver_pieza. Como mucho 60 archivos y 150 MB por ZIP. Sólo lee: no gasta IA ni cambia nada.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." },
      grupos: {
        type: "array",
        description: "Una carpeta del ZIP por grupo, en este orden.",
        items: {
          type: "object",
          properties: {
            carpeta: { type: "string", description: "El nombre de la carpeta dentro del ZIP (p. ej. «Carrusel octubre»)." },
            archivo_ids: { type: "array", items: { type: "string" }, description: "Los IDs de la galería, EN EL ORDEN en que se numeran." },
          },
          required: ["archivo_ids"],
        },
      },
      nombre_zip: { type: "string", description: "El nombre del ZIP (sin «.zip»). Si se omite, el del cliente y la fecha." },
    },
    required: ["cliente", "grupos"],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

/** Un nombre que sirve de archivo en cualquier sistema: sin tildes raras, sin barras, corto. Puro. */
export function nombreSeguro(texto, largo = 40) {
  return String(texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _.-]+/g, " ")
    .trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, largo).replace(/[.-]+$/, "")
    .toLowerCase();
}

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** El título de una pieza para su nombre: el que tenga, la línea «Pieza:» de su ficha o las primeras palabras del pedido. Puro. */
export function tituloDePieza(f) {
  const aj = leerJSON(f?.ajustes, {}) ?? {};
  const propio = aj.titulo ?? aj.nombre;
  if (propio) return nombreSeguro(propio);
  const pedido = String(f?.prompt ?? "");
  const linea = /^\s*Pieza:\s*(.+)$/m.exec(pedido)?.[1];
  const base = (linea ?? pedido).replace(/\.[a-z0-9]{2,4}$/i, "").split(/\s+/).slice(0, 6).join(" ");
  return nombreSeguro(base) || "pieza";
}

const EXT_POR_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a" };

/** «01-titulo.png»: el número en su orden, el título y la extensión de su archivo. Pura. */
export function nombreEnZip(f, i, total) {
  const ancho = Math.max(2, String(total).length);
  const ext = /\.([a-z0-9]{2,5})$/i.exec(String(f?.clave ?? ""))?.[1]?.toLowerCase() ?? EXT_POR_MIME[f?.mime] ?? "bin";
  return `${String(i + 1).padStart(ancho, "0")}-${tituloDePieza(f)}.${ext}`;
}

/** Las carpetas sin repetir nombre («Fondos», «Fondos-2»). Pura. */
function carpetasUnicas(nombres) {
  const vistos = new Map();
  return nombres.map((n, i) => {
    const base = nombreSeguro(n, 60) || `grupo-${i + 1}`;
    const k = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, k);
    return k > 1 ? `${base}-${k}` : base;
  });
}

/** Lo pedido, limpio: [{ carpeta, ids }]. Lanza ErrorExportar si no hay nada o pasa del tope de archivos. Pura. */
export function gruposPedidos(grupos) {
  const lista = (Array.isArray(grupos) ? grupos : [])
    .map((g) => ({ carpeta: String(g?.carpeta ?? "").trim(), ids: (Array.isArray(g?.archivo_ids) ? g.archivo_ids : []).map((x) => String(x ?? "").trim()).filter(Boolean) }))
    .filter((g) => g.ids.length);
  if (!lista.length) throw new ErrorExportar("Dime qué piezas van: al menos un grupo con sus archivo_ids (de ver_estudio, estado_encargo o ver_pieza).");
  const total = lista.reduce((s, g) => s + g.ids.length, 0);
  if (total > MAX_ARCHIVOS_ZIP) throw new ErrorExportar(`Son ${total} archivos y el ZIP admite como mucho ${MAX_ARCHIVOS_ZIP}. Pártelo en varios ZIP.`);
  const nombres = carpetasUnicas(lista.map((g, i) => g.carpeta || (lista.length > 1 ? `grupo-${i + 1}` : "piezas")));
  return lista.map((g, i) => ({ carpeta: nombres[i], ids: g.ids }));
}

const megas = (b) => `${(b / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;

/** La herramienta. */
export function crearHerramientaExportar({ env, acceso, resolverCliente, usuario }) {
  return {
    async exportar_piezas({ cliente, grupos, nombre_zip: nombreZip }) {
      const c = await resolverCliente(cliente);
      const pedidos = gruposPedidos(grupos);
      const faltan = [];
      let bytes = 0;
      let total = 0;
      for (const g of pedidos) {
        for (const id of g.ids) {
          const f = await acceso.leerUno("estudio_archivos", { id, client_id: c.id });
          if (!f || f.borrado_at) { faltan.push(id); continue; }
          let tam = Number(f.bytes) || 0;
          if (!tam) tam = Number((await env.MEDIA.head(f.clave).catch(() => null))?.size) || 0;
          bytes += tam;
          total++;
        }
      }
      if (faltan.length) throw new ErrorExportar(`Estas piezas no están en la galería de ${c.name}: ${faltan.join(", ")}. No armé el ZIP.`);
      if (bytes > MAX_BYTES_ZIP) throw new ErrorExportar(`Pesan ${megas(bytes)} y el ZIP admite como mucho ${megas(MAX_BYTES_ZIP)}. Pártelo en varios ZIP.`);
      const secreto = await secretoDeVista(env).catch(() => null);
      if (!secreto) throw new ErrorExportar("No pude preparar el enlace de descarga ahora. Inténtalo otra vez.");
      const hoy = new Date().toISOString().slice(0, 10);
      const nombre = nombreSeguro(nombreZip || `${c.name} ${hoy}`, 80) || "piezas";
      const testigo = await firmarCon(secreto, USO, { o: usuario.ownerId ?? usuario.id, c: c.id, g: pedidos.map((g) => [g.carpeta, g.ids]) }, VIDA_ZIP_MS);
      const url = `${RUTA_EXPORTAR}${testigo}/${nombre}.zip`;
      return [
        `Listo: ${total} ${total === 1 ? "archivo" : "archivos"} de ${c.name} en ${pedidos.length} ${pedidos.length === 1 ? "carpeta" : "carpetas"} (${pedidos.map((g) => `${g.carpeta}: ${g.ids.length}`).join(" · ")}), unos ${megas(bytes)}.`,
        `Descarga (vale 15 minutos, sin iniciar sesión): ${url}`,
        "Dale el enlace a la persona tal cual. Si caduca, vuelve a pedirlo con exportar_piezas.",
      ].join("\n");
    },
  };
}

// ------------------------------------------------------------
// El ZIP por flujo
// ------------------------------------------------------------

/** Una cabecera local con el bit 3 (CRC y tamaños en el descriptor de detrás). */
function cabeceraLocal(nombre, hora, dia) {
  const b = new Uint8Array(30 + nombre.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(6, 0x0808, true); // UTF-8 + descriptor de datos
  v.setUint16(8, 0, true);
  v.setUint16(10, hora, true);
  v.setUint16(12, dia, true);
  v.setUint16(26, nombre.length, true);
  b.set(nombre, 30);
  return b;
}

function descriptor(crc, tam) {
  const b = new Uint8Array(16);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x08074b50, true);
  v.setUint32(4, crc, true);
  v.setUint32(8, tam, true);
  v.setUint32(12, tam, true);
  return b;
}

function directorio(entradas, inicio, hora, dia) {
  const tam = entradas.reduce((s, e) => s + 46 + e.nombre.length, 0);
  const b = new Uint8Array(tam + 22);
  const v = new DataView(b.buffer);
  let p = 0;
  for (const e of entradas) {
    v.setUint32(p, 0x02014b50, true);
    v.setUint16(p + 4, 20, true);
    v.setUint16(p + 6, 20, true);
    v.setUint16(p + 8, 0x0808, true);
    v.setUint16(p + 12, hora, true);
    v.setUint16(p + 14, dia, true);
    v.setUint32(p + 16, e.crc, true);
    v.setUint32(p + 20, e.tam, true);
    v.setUint32(p + 24, e.tam, true);
    v.setUint16(p + 28, e.nombre.length, true);
    v.setUint32(p + 42, e.desde, true);
    b.set(e.nombre, p + 46);
    p += 46 + e.nombre.length;
  }
  v.setUint32(p, 0x06054b50, true);
  v.setUint16(p + 8, entradas.length, true);
  v.setUint16(p + 10, entradas.length, true);
  v.setUint32(p + 12, tam, true);
  v.setUint32(p + 16, inicio, true);
  return b;
}

/**
 * El ZIP como flujo: `archivos` = [{ ruta, abrir: () => Promise<ReadableStream|null> }]. Un archivo que ya no está en
 * R2 se salta (el ZIP sigue valiendo). Sin ZIP64: con el tope de 150 MB no hace falta.
 */
export function zipPorFlujo(archivos, { fecha = new Date() } = {}) {
  const { hora, dia } = fechaDos(fecha);
  const entradas = [];
  let p = 0;
  let i = 0;
  return new ReadableStream({
    async pull(control) {
      // Un archivo que falta se salta AQUÍ MISMO: si este paso volviera sin poner nada en el flujo, nadie lo pediría otra vez.
      let a = null;
      let cuerpo = null;
      while (!cuerpo && i < archivos.length) {
        a = archivos[i++];
        cuerpo = await a.abrir().catch(() => null);
      }
      if (!cuerpo) {
        control.enqueue(directorio(entradas, p, hora, dia));
        control.close();
        return;
      }
      const nombre = enc.encode(a.ruta);
      const desde = p;
      const cab = cabeceraLocal(nombre, hora, dia);
      control.enqueue(cab);
      p += cab.length;
      let crc = 0;
      let tam = 0;
      const lector = cuerpo.getReader();
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        const trozo = value instanceof Uint8Array ? value : new Uint8Array(value);
        crc = crc32Seguir(crc, trozo);
        tam += trozo.length;
        control.enqueue(trozo);
      }
      p += tam;
      control.enqueue(descriptor(crc, tam));
      p += 16;
      entradas.push({ nombre, crc, tam, desde });
    },
  });
}

/** GET /api/exportar/<testigo>/<nombre>.zip — sin sesión, mientras el testigo no caduque. */
export async function rutaExportar(req, env, partes) {
  const testigo = String(partes[1] ?? "");
  const noHay = () => new Response("Este enlace de descarga no existe o ya caducó (dura 15 minutos). Pídele a Claude otro.", {
    status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
  if (!testigo || testigo.length > 8000) return noHay();
  const secreto = await secretoDeVista(env).catch(() => null);
  const d = secreto ? await leerFirmado(secreto, USO, testigo) : null;
  if (!d?.o || !d?.c || !Array.isArray(d.g)) return noHay();
  const acceso = crearAcceso(env.DB, d.o);
  const archivos = [];
  for (const [carpeta, ids] of d.g) {
    const fichas = [];
    for (const id of ids) {
      const f = await acceso.leerUno("estudio_archivos", { id, client_id: d.c });
      if (f && !f.borrado_at && String(f.clave ?? "").startsWith(`clientes/${d.c}/`)) fichas.push(f);
    }
    fichas.forEach((f, i) => archivos.push({ ruta: `${carpeta}/${nombreEnZip(f, i, fichas.length)}`, abrir: async () => (await env.MEDIA.get(f.clave))?.body ?? null }));
  }
  if (!archivos.length) return noHay();
  const nombre = nombreSeguro(decodeURIComponent(String(partes[2] ?? "")).replace(/\.zip$/i, ""), 80) || "piezas";
  return new Response(zipPorFlujo(archivos), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nombre}.zip"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
