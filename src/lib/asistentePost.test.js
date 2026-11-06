import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_POST, herramientasDelPost, guardaDelPost, bloqueDelPost } from "./asistentePost.js";
import { getChatTools } from "./herramientasChat.js";
import { HERRAMIENTAS_DISENO } from "./herramientasDiseno.js";

describe("el asistente dentro de una publicación sólo cambia ESA", () => {
  it("se queda sin las herramientas que crean, borran, mueven o editan en lote", () => {
    const nombres = herramientasDelPost([...getChatTools(true), ...HERRAMIENTAS_DISENO]).map((t) => t.name);
    for (const fuera of ["crear_publicacion", "eliminar_publicaciones", "editar_publicaciones_lote", "crear_tarea", "agregar_banco_ideas", "borrar_memoria"]) {
      expect(nombres).not.toContain(fuera);
    }
    for (const dentro of ["editar_publicacion", "corregir_pieza", "disenar_piezas", "poner_en_publicacion"]) expect(nombres).toContain(dentro);
    // Toda herramienta permitida existe de verdad (un nombre mal escrito la dejaría fuera sin avisar).
    for (const n of HERRAMIENTAS_POST) expect(nombres, n).toContain(n);
  });

  it("una herramienta que no es de aquí se rechaza aunque el modelo la pida", () => {
    expect(guardaDelPost("p1", "eliminar_publicaciones", { post_ids: ["p1"] }).error).toMatch(/no puedes usar/);
  });

  it("nombrar OTRA publicación se rechaza; sin nombrarla, va a ésta", () => {
    expect(guardaDelPost("p1", "editar_publicacion", { post_id: "p2", descripcion: "x" }).error).toMatch(/p1/);
    expect(guardaDelPost("p1", "editar_publicacion", { descripcion: "x" }).entrada).toEqual({ post_id: "p1", descripcion: "x" });
    expect(guardaDelPost("p1", "poner_en_publicacion", { post_id: "p2", carrusel_id: "c" }).error).toBeTruthy();
    expect(guardaDelPost("p1", "corregir_pieza", { archivo_id: "a", indicacion: "más grande" }).entrada).toEqual({ archivo_id: "a", indicacion: "más grande" });
  });

  it("lo que diseña va a esta publicación: el carrusel entero, o cada pieza suelta", () => {
    expect(guardaDelPost("p1", "disenar_piezas", { carrusel: true, piezas: [{ ficha: "a" }, { ficha: "b" }] }).entrada.post_id).toBe("p1");
    expect(guardaDelPost("p1", "disenar_piezas", { piezas: [{ ficha: "a" }] }).entrada.piezas).toEqual([{ ficha: "a", post_id: "p1" }]);
    expect(guardaDelPost("p1", "disenar_piezas", { piezas: [{ ficha: "a", post_id: "p9" }] }).error).toBeTruthy();
  });

  it("el sistema sabe lo que tiene la publicación ahora, con las claves de sus imágenes en orden", () => {
    const t = bloqueDelPost({
      id: "p1", format: "carrusel", title: "Camas", descripcion: "Texto", hashtagsFinales: "#a",
      medios: [{ src: "/api/media/clientes/c/posts/1.jpg", tipo: "imagen", ancho: 1080, alto: 1350 }, { src: "/api/media/clientes/c/posts/2.jpg", tipo: "imagen" }],
    }, "2026-11-10");
    expect(t).toMatch(/post_id p1, del 2026-11-10/);
    expect(t).toMatch(/1\. imagen · clave clientes\/c\/posts\/1\.jpg · 1080×1350\n2\. imagen · clave clientes\/c\/posts\/2\.jpg/);
    expect(t).toMatch(/Descripción: Texto/);
    expect(t).not.toMatch(/VA A PAUTA/);
  });

  it("si va a pauta, lo sabe y sabe cómo escribirla (lib/pauta.js)", () => {
    const t = bloqueDelPost({ id: "p1", format: "post", descripcion: "Texto", pauta: { etapa: "conversion" }, anuncio: { textos: ["a", "b", "c"] } });
    expect(t).toMatch(/VA A PAUTA \(etapa Conversión\): su descripción ES el texto principal del anuncio/);
    expect(t).toMatch(/Ya tiene 3 textos de anuncio aparte/);
    expect(bloqueDelPost({ id: "p1", format: "post", pauta: false })).not.toMatch(/VA A PAUTA/);
  });
});
