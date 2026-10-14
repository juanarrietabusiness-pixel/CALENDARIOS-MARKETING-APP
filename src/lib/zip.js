// ============================================================
// Un ZIP sin comprimir, hecho en el navegador (puro)
//
// Para «Descargar el carrusel» (y el reel): las láminas ya son PNG/JPEG,
// que no ganan nada al comprimirse, así que basta con GUARDARLAS (método 0)
// en un ZIP que Windows, macOS y el teléfono abren sin nada más. Sin
// librerías: una de ZIP son 10–30 kB para algo que cabe aquí.
//
// Formato: por archivo, cabecera local + datos; al final, el directorio
// central y su cierre (APPNOTE de PKWARE, sin ZIP64: hasta 4 GB y 65 535
// archivos, de sobra para diez láminas). Los nombres van en UTF-8 (bit 11).
// ============================================================

let TABLA = null;
const tablaCrc = () => {
  if (TABLA) return TABLA;
  TABLA = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLA[n] = c >>> 0;
  }
  return TABLA;
};

/** El CRC-32 de unos bytes (el de ZIP y PNG). */
export function crc32(bytes) {
  const t = tablaCrc();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de MS-DOS que usa ZIP. */
function fechaDos(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

/**
 * `archivos`: [{ nombre, datos: Uint8Array }] → los bytes del ZIP. Los nombres repetidos se numeran («2-…»): un ZIP
 * con dos entradas iguales lo abre cada programa a su manera.
 */
export function crearZip(archivos, { fecha = new Date() } = {}) {
  const cod = new TextEncoder();
  const { hora, dia } = fechaDos(fecha);
  const vistos = new Set();
  const entradas = archivos.map((a, i) => {
    let nombre = String(a.nombre || `archivo-${i + 1}`).replace(/[\\/]+/g, "-");
    if (vistos.has(nombre)) nombre = `${i + 1}-${nombre}`;
    vistos.add(nombre);
    const datos = a.datos instanceof Uint8Array ? a.datos : new Uint8Array(a.datos);
    return { nombre: cod.encode(nombre), datos, crc: crc32(datos) };
  });
  const tamLocal = entradas.reduce((s, e) => s + 30 + e.nombre.length + e.datos.length, 0);
  const tamCentral = entradas.reduce((s, e) => s + 46 + e.nombre.length, 0);
  const salida = new Uint8Array(tamLocal + tamCentral + 22);
  const v = new DataView(salida.buffer);
  let p = 0;
  const desplazamientos = [];
  for (const e of entradas) {
    desplazamientos.push(p);
    v.setUint32(p, 0x04034b50, true);
    v.setUint16(p + 4, 20, true); // versión necesaria
    v.setUint16(p + 6, 0x0800, true); // nombre en UTF-8
    v.setUint16(p + 8, 0, true); // guardado, sin comprimir
    v.setUint16(p + 10, hora, true);
    v.setUint16(p + 12, dia, true);
    v.setUint32(p + 14, e.crc, true);
    v.setUint32(p + 18, e.datos.length, true);
    v.setUint32(p + 22, e.datos.length, true);
    v.setUint16(p + 26, e.nombre.length, true);
    v.setUint16(p + 28, 0, true);
    salida.set(e.nombre, p + 30);
    salida.set(e.datos, p + 30 + e.nombre.length);
    p += 30 + e.nombre.length + e.datos.length;
  }
  const inicioCentral = p;
  entradas.forEach((e, i) => {
    v.setUint32(p, 0x02014b50, true);
    v.setUint16(p + 4, 20, true); // hecho por
    v.setUint16(p + 6, 20, true);
    v.setUint16(p + 8, 0x0800, true);
    v.setUint16(p + 10, 0, true);
    v.setUint16(p + 12, hora, true);
    v.setUint16(p + 14, dia, true);
    v.setUint32(p + 16, e.crc, true);
    v.setUint32(p + 20, e.datos.length, true);
    v.setUint32(p + 24, e.datos.length, true);
    v.setUint16(p + 28, e.nombre.length, true);
    // 30 extra, 32 comentario, 34 disco, 36 atributos internos, 38 externos: todo a 0.
    v.setUint32(p + 42, desplazamientos[i], true);
    salida.set(e.nombre, p + 46);
    p += 46 + e.nombre.length;
  });
  v.setUint32(p, 0x06054b50, true);
  v.setUint16(p + 8, entradas.length, true);
  v.setUint16(p + 10, entradas.length, true);
  v.setUint32(p + 12, p - inicioCentral, true);
  v.setUint32(p + 16, inicioCentral, true);
  return salida;
}

/** Lee un ZIP sin comprimir (el que hace `crearZip`): [{ nombre, datos, crc }]. Para los tests. */
export function leerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const fin = bytes.length - 22;
  if (v.getUint32(fin, true) !== 0x06054b50) throw new Error("No es un ZIP.");
  const n = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const lista = [];
  for (let i = 0; i < n; i++) {
    const largo = v.getUint32(p + 24, true);
    const lNombre = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + lNombre));
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    lista.push({ nombre, datos: bytes.subarray(ini, ini + largo), crc: v.getUint32(p + 16, true) });
    p += 46 + lNombre + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return lista;
}
