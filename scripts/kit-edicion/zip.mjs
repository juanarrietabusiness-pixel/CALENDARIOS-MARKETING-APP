// ============================================================
// Un ZIP mínimo y DETERMINISTA (mismo contenido → mismos bytes): deflate de Node, fecha fija, orden fijo, permisos de
// Unix (los .sh y .mjs ejecutables). Para empaquetar el kit de edición sin dependencias nuevas.
// ============================================================

import { deflateRawSync } from "node:zlib";
import { crc32 } from "../../src/lib/zip.js";

// 2026-01-01 00:00 en formato DOS.
const HORA = 0;
const DIA = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** archivos: [{ ruta, datos: Buffer, ejecutable? }] → Buffer del ZIP. */
export function armarZip(archivos) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const a of [...archivos].sort((x, y) => x.ruta.localeCompare(y.ruta))) {
    const nombre = Buffer.from(a.ruta, "utf8");
    const comprimido = deflateRawSync(a.datos, { level: 9 });
    const crc = crc32(a.datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(HORA, 10);
    local.writeUInt16LE(DIA, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(a.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombre, comprimido);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // hecho en Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(HORA, 12);
    central.writeUInt16LE(DIA, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(a.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(((a.ejecutable ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nombre);
    offset += 30 + nombre.length + comprimido.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}
