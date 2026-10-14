import { describe, it, expect } from "vitest";
import { crc32, crearZip, leerZip } from "./zip.js";

describe("zip", () => {
  it("el CRC-32 es el de siempre", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("guarda los archivos en orden y se vuelven a leer iguales", () => {
    const a = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const b = new TextEncoder().encode("lámina dos");
    const zip = crearZip([{ nombre: "01.png", datos: a }, { nombre: "02 · lámina.jpg", datos: b }], { fecha: new Date(2026, 9, 14, 10, 30) });
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034b50);
    const dentro = leerZip(zip);
    expect(dentro.map((x) => x.nombre)).toEqual(["01.png", "02 · lámina.jpg"]);
    expect([...dentro[0].datos]).toEqual([...a]);
    expect(new TextDecoder().decode(dentro[1].datos)).toBe("lámina dos");
    expect(dentro[1].crc).toBe(crc32(b));
  });

  it("no deja nombres repetidos ni rutas", () => {
    const d = new Uint8Array([1]);
    const dentro = leerZip(crearZip([{ nombre: "x.png", datos: d }, { nombre: "x.png", datos: d }, { nombre: "../a/b.png", datos: d }]));
    expect(dentro.map((x) => x.nombre)).toEqual(["x.png", "2-x.png", "..-a-b.png"]);
  });

  it("un ZIP vacío también es un ZIP", () => {
    expect(leerZip(crearZip([]))).toEqual([]);
  });
});
