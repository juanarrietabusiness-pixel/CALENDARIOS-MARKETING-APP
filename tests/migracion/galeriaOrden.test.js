import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearCarpeta, cambiarArchivo } from "../../worker/lib/estudio/galeria.js";
import { carpetaDelVideo, alFrenteDelOrden } from "../../worker/lib/estudio/carpetaVideo.js";

// ============================================================
// La galería ordenada: cada video animado con su carpeta (sus fondos y sus renders juntos), dos reels con el mismo
// título no comparten carpeta, y «Hacer la principal» de una versión
// ============================================================

const JEFE = "u-jefe";
let db;
let acceso;
beforeEach(() => {
  db = d1EnMemoria();
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Uno");
  acceso = crearAcceso(db, JEFE);
});
const archivo = (id, extra = {}) => db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt, ajustes, origen) values (?,?,?,?,?,?,?,?,?,?)")
  .run(id, JEFE, "c1", `clientes/c1/${id}`, extra.tipo ?? "imagen", "image/png", extra.modelo ?? "muse-image", id, JSON.stringify(extra.ajustes ?? {}), extra.origen ?? "estudio");
const carpetaDe = (id) => db.sqlite.prepare("select carpeta_id from estudio_archivos where id = ?").get(id).carpeta_id;

describe("las carpetas de los reels y los videos", () => {
  it("dos reels con el mismo título el mismo día: carpetas distintas (antes se mezclaban); una carpeta normal repetida, 409", async () => {
    const a = await crearCarpeta(acceso, "c1", "Reel · Sofá · 10 nov", { tipo: "reel" });
    const b = await crearCarpeta(acceso, "c1", "Reel · Sofá · 10 nov", { tipo: "reel" });
    expect(a.id).not.toBe(b.id);
    expect(b.nombre).toBe("Reel · Sofá · 10 nov (2)");
    await crearCarpeta(acceso, "c1", "Mías");
    await expect(crearCarpeta(acceso, "c1", "Mías")).rejects.toThrow(/Ya hay una carpeta/);
  });

  it("un video animado recibe su carpeta con sus fondos y sus renders sueltos; la segunda vez, la misma", async () => {
    const guion = { escenas: [{ capas: [{ tipo: "imagen", archivo: "fondo1" }, { tipo: "imagen", archivo: "logo" }] }] };
    db.sqlite.prepare("insert into videos_proyectos (id, owner_id, client_id, titulo, guion, origen) values (?,?,?,?,?,?)").run("v1", JEFE, "c1", "Mi video", JSON.stringify(guion), "{}");
    archivo("fondo1");
    archivo("logo", { origen: "app", modelo: "" });
    archivo("r1", { tipo: "video", modelo: "video-animado", ajustes: { videoId: "v1" } });
    archivo("r2", { tipo: "video", modelo: "video-animado", ajustes: { videoId: "otro" } });
    const fila = db.sqlite.prepare("select * from videos_proyectos where id = 'v1'").get();
    expect(await carpetaDelVideo(acceso, "c1", fila)).toBeNull();
    const id = await carpetaDelVideo(acceso, "c1", fila, { crear: true });
    expect(id).toBeTruthy();
    expect([carpetaDe("fondo1"), carpetaDe("r1"), carpetaDe("logo"), carpetaDe("r2")]).toEqual([id, id, null, null]);
    const otra = db.sqlite.prepare("select * from videos_proyectos where id = 'v1'").get();
    expect(JSON.parse(otra.origen).carpetaId).toBe(id);
    expect(await carpetaDelVideo(acceso, "c1", otra)).toBe(id);
    // Lo nuevo va delante en su orden (si la carpeta tiene orden).
    db.sqlite.prepare("update estudio_carpetas set orden = ? where id = ?").run(JSON.stringify(["fondo1"]), id);
    await alFrenteDelOrden(acceso, "c1", id, "r1");
    expect(JSON.parse(db.sqlite.prepare("select orden from estudio_carpetas where id = ?").get(id).orden)).toEqual(["r1", "fondo1"]);
  });

  it("«Hacer la principal» lo apunta en la ficha (y se puede quitar)", async () => {
    archivo("x");
    const f = await cambiarArchivo(acceso, "c1", "x", { principal: true });
    expect(f.ajustes.principalAt).toBeTruthy();
    expect((await cambiarArchivo(acceso, "c1", "x", { principal: false })).ajustes.principalAt).toBeUndefined();
  });
});
