import { describe, it, expect } from "vitest";
import {
  limpiarQue, queDeSiempre, limpiarAnunciosPlan, fundirAnunciosPlan, faltanTextos, casillaDeTextos, pedidoDeTextosPlan, leerTextosPlan,
  rellenarAnuncioDelPost, textosATexto, huecoDeId, idDeHueco, limpiarTextosPlan,
} from "./anunciosPlan";
import { nivelesParaHuecos, tablaDeNiveles, tipoParaNivel, cuentaDeNiveles, REGLA_DE_100, nombreNivelTexto } from "./textosNivel";

describe("cómo se le habla a cada nivel y la regla de 100", () => {
  it("la regla de 100 reparte los anuncios de cada campaña entre sus niveles, alternados", () => {
    expect(REGLA_DE_100).toEqual({ inconsciente: 30, problema: 30, solucion: 25, producto: 10, decision: 5 });
    expect(nivelesParaHuecos("presentacion", 3)).toEqual(["inconsciente", "problema", "solucion"]);
    expect(nivelesParaHuecos("presentacion", 4)).toEqual(["inconsciente", "problema", "solucion", "inconsciente"]);
    expect(cuentaDeNiveles(nivelesParaHuecos("presentacion", 5))).toEqual({ inconsciente: 2, problema: 2, solucion: 1 });
    expect(cuentaDeNiveles(nivelesParaHuecos("presentacion", 6))).toEqual({ inconsciente: 2, problema: 2, solucion: 2 });
    expect(cuentaDeNiveles(nivelesParaHuecos("evaluacion", 4))).toEqual({ solucion: 3, producto: 1 });
    expect(nivelesParaHuecos("ascension", 3)).toEqual(["decision", "decision", "decision"]);
    expect(nivelesParaHuecos("temporada", 2)).toEqual(["producto", "decision"]);
    expect(cuentaDeNiveles(nivelesParaHuecos("conversion", 3))).toEqual({ producto: 2, decision: 1 });
    expect(nivelesParaHuecos("conversion", 0)).toEqual([]);
  });

  it("«Decisión» es quien sólo necesita el empujón, y la tabla le dice a la IA cómo hablarle a cada nivel", () => {
    expect(nombreNivelTexto("decision")).toBe("Decisión (listo para comprar)");
    const t = tablaDeNiveles(["inconsciente", "decision"]);
    expect(t).toMatch(/Inconsciente: No sabe que tiene un problema\. Cómo hablarle: Con un dato o una historia/);
    expect(t).toMatch(/Decisión \(listo para comprar\): Lo sabe todo .* sólo le falta el empujón\. .*Cómo hablarle: Con el empujón: la oferta/);
    expect(t).not.toMatch(/Consciente del producto/);
    expect(t).toMatch(/no se empieza por el producto ni por el precio/);
  });

  it("el tipo de lo que se produce para un nivel: nunca venta directa en uno frío", () => {
    expect(["inconsciente", "problema", "solucion", "producto", "decision"].map(tipoParaNivel)).toEqual(["educativo", "educativo", "servicios", "anuncio", "anuncio"]);
  });
});

describe("¿Qué vas a hacer? y lo decidido de cada anuncio", () => {
  it("limpiar «¿Qué vas a hacer?»", () => {
    expect(limpiarQue(null)).toEqual({ campanas: [], productos: "foco", productoIds: [], logro: "" });
    expect(limpiarQue({ campanas: ["conversion", "otra", "conversion", "temporada"], productos: "varios", productoIds: ["a", "a", ""], logro: "  Vender\\nlos sofás  " }))
      .toEqual({ campanas: ["conversion", "temporada"], productos: "varios", productoIds: ["a"], logro: "Vender\nlos sofás" });
    expect(queDeSiempre({})).toBe(true);
    expect(queDeSiempre({ logro: "x" })).toBe(false);
  });

  it("los huecos tienen el id del paso de la guía", () => {
    expect(idDeHueco("presentacion", 2)).toBe("presentacion:a2");
    expect(huecoDeId("temporada:a4")).toEqual({ campana: "temporada", n: 4 });
    expect(huecoDeId("presentacion:c1")).toBeNull();
  });

  it("lo guardado se limpia: sólo huecos que existen, una pieza o «nuevo», el modo y los textos", () => {
    const g = limpiarAnunciosPlan({
      "presentacion:a1": { pieza: { calendarId: "cal", postId: "p1" }, como: "publicacion", textos: { titulos: ["Uno"], descripcion: "Envío gratis" }, editado: true, por: "Ana", at: "2026-11-14T10:00:00.000Z" },
      "evaluacion:a2": { nuevo: true, como: "otra-cosa" },
      "nada:a1": { nuevo: true },
      "conversion:a1": {},
    });
    expect(Object.keys(g)).toEqual(["presentacion:a1", "evaluacion:a2"]);
    expect(g["presentacion:a1"]).toMatchObject({ pieza: { calendarId: "cal", postId: "p1" }, como: "publicacion", editado: true, textos: { textos: [], titulos: ["Uno"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" } });
    expect(g["evaluacion:a2"]).toEqual({ nuevo: true });
    // Sólo una descripción también vale (con la publicación ya subida, el título se escribe aparte).
    expect(limpiarTextosPlan({ descripcion: "Envío gratis" })).toEqual({ textos: [], titulos: [], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" });
  });

  it("fundir: cambiar el modo conserva los textos; otra publicación los quita; null vuelve a lo sugerido", () => {
    const antes = { "presentacion:a1": { pieza: { calendarId: "cal", postId: "p1" }, textos: { textos: ["Hola"], titulos: [], descripcion: "", boton: "" }, editado: true } };
    const modo = fundirAnunciosPlan(antes, { "presentacion:a1": { como: "subir" } }, { por: "Ana", at: "2026-11-14T10:00:00.000Z" });
    expect(modo["presentacion:a1"]).toMatchObject({ pieza: { postId: "p1" }, como: "subir", textos: { textos: ["Hola"] }, editado: true, por: "Ana" });
    const otra = fundirAnunciosPlan(antes, { "presentacion:a1": { pieza: { calendarId: "cal", postId: "p2" } } });
    expect(otra["presentacion:a1"]).toEqual({ pieza: { calendarId: "cal", postId: "p2" } });
    const nuevo = fundirAnunciosPlan(antes, { "presentacion:a1": { nuevo: true } });
    expect(nuevo["presentacion:a1"]).toEqual({ nuevo: true });
    expect(fundirAnunciosPlan(antes, { "presentacion:a1": null })).toEqual({});
    expect(fundirAnunciosPlan(antes, { "presentacion:a1": { auto: true } })).toEqual({});
  });

  it("qué textos le faltan a un anuncio según cómo se monta", () => {
    expect(faltanTextos({ como: "publicacion", textos: { titulos: ["T"], descripcion: "" } })).toBe(true);
    expect(faltanTextos({ como: "publicacion", textos: { titulos: ["T"], descripcion: "D" } })).toBe(false);
    expect(faltanTextos({ como: "subir", textos: { textos: [], titulos: ["T"], descripcion: "D" } })).toBe(true);
    expect(faltanTextos({ como: "subir", textos: { textos: ["Uno"] } })).toBe(false);
  });
});

describe("el pedido de los textos a la IA", () => {
  const camp = { id: "presentacion", etapa: "presentacion", nombreEtapa: "Presentación" };
  const post = { id: "p1", format: "post", title: "Sofá que se hunde", idea: "El sofá viejo y la visita que se queda.", textoPieza: "¿Visitas sin cama?", descripcion: "¿Tu sofá se hunde? Escríbenos por WhatsApp." };
  const conPub = casillaDeTextos({ slot: "presentacion:a1", nivel: "inconsciente", como: "publicacion", pieza: { titulo: "Sofá" } }, camp, post);
  const subir = casillaDeTextos({ slot: "presentacion:a2", nivel: "problema", como: "subir", pieza: { titulo: "Sofá" } }, camp, post);
  const nuevo = casillaDeTextos({ slot: "presentacion:a3", nivel: "solucion", como: "subir", pieza: null }, camp, null, { artes: ["Demostración"] });

  it("la casilla: con la publicación, sólo título y descripción; sin ella, todo", () => {
    expect(conPub).toMatchObject({ slot: "presentacion:a1", etapa: "presentacion", nivel: "inconsciente", como: "publicacion", pieza: { caption: "¿Tu sofá se hunde? Escríbenos por WhatsApp." } });
    expect(nuevo).toMatchObject({ como: "subir", artes: ["Demostración"] });
    expect(nuevo.pieza).toBeUndefined();
    // «Usar la publicación» sin publicación no existe.
    expect(casillaDeTextos({ slot: "x:a1", como: "publicacion" }, camp, null).como).toBe("subir");
  });

  it("lleva la etapa con su nivel y cómo hablarle, los productos, el caption y lo que la agencia quiere lograr", () => {
    const t = pedidoDeTextosPlan({
      marca: "Dcasa", casillas: [conPub, subir, nuevo], productos: ["- Sofá cama (producto) · precio: $450"], logro: "Vender 20 sofás cama antes de Navidad.",
      regla: "LO QUE VA A PAUTA (regla)", cliente: "LA FICHA DEL CLIENTE", destino: "whatsapp", mes: "Noviembre 2026",
    });
    expect(t).toMatch(/de Dcasa para Noviembre 2026/);
    expect(t).toMatch(/LO QUE LA AGENCIA QUIERE LOGRAR[^\n]*\nVender 20 sofás cama antes de Navidad\./);
    expect(t).toMatch(/CÓMO SE LE HABLA A CADA NIVEL/);
    expect(t).toMatch(/- Inconsciente: No sabe que tiene un problema/);
    expect(t).toMatch(/- Consciente del problema: /);
    expect(t).toMatch(/- Consciente de la solución: /);
    expect(t).not.toMatch(/- Decisión \(listo para comprar\)/);
    expect(t).toMatch(/1\. Campaña de presentación \(Para gente que todavía no te conoce[^)]*\) · nivel Inconsciente\./);
    expect(t).toMatch(/Se monta con la PUBLICACIÓN YA SUBIDA[\s\S]*«¿Tu sofá se hunde\? Escríbenos por WhatsApp\.»[\s\S]*Escribe SÓLO "titulos" y "descripcion"/);
    expect(t).toMatch(/2\. [^\n]*nivel Consciente del problema\.\n {3}Se monta SUBIENDO LA PIEZA/);
    expect(t).toMatch(/3\. [^\n]*\n {3}ANUNCIO NUEVO, sin publicación[^\n]*Demostración/);
    expect(t).toMatch(/- Sofá cama \(producto\) · precio: \$450/);
    expect(t).toMatch(/LO QUE VA A PAUTA \(regla\)/);
    expect(t).toMatch(/LA FICHA DEL CLIENTE/);
    expect(t).toMatch(/"boton":"WHATSAPP_MESSAGE"/);
  });

  it("la respuesta: con la publicación ya subida, sin textos principales; lo que no se lee, fuera", () => {
    const r = JSON.stringify({ anuncios: [
      { n: 1, textos: ["no va"], titulos: ["El sofá que se abre en 10 segundos y no ocupa nada de espacio"], descripcion: "Envío gratis en Panamá", boton: "WHATSAPP_MESSAGE" },
      { n: 2, textos: ["Uno", "Dos", "Tres"], titulos: ["Sofá cama"], descripcion: "Desde $450", boton: "CONTACT_US" },
      { n: 3, titulos: ["Sin textos"] },
    ] });
    const m = leerTextosPlan(`Aquí va:\n${r}`, [conPub, subir, nuevo], { destino: "whatsapp" });
    expect([...m.keys()]).toEqual(["presentacion:a1", "presentacion:a2"]);
    expect(m.get("presentacion:a1").textos).toEqual([]);
    expect(m.get("presentacion:a1").titulos[0].length).toBeLessThanOrEqual(40);
    expect(m.get("presentacion:a2")).toEqual({ textos: ["Uno", "Dos", "Tres"], titulos: ["Sofá cama"], descripcion: "Desde $450", boton: "CONTACT_US" });
    expect(leerTextosPlan("no es JSON", [conPub]).size).toBe(0);
  });

  it("en la publicación sólo rellena: no pisa lo que ya tenía", () => {
    const actual = { textos: ["El mío"], titulos: [], descripcion: "", boton: "WHATSAPP_MESSAGE" };
    expect(rellenarAnuncioDelPost(actual, { textos: ["Otro"], titulos: ["Nuevo título"], descripcion: "Envío gratis" }))
      .toEqual({ textos: ["El mío"], titulos: ["Nuevo título"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" });
    expect(rellenarAnuncioDelPost({ textos: ["El mío"], titulos: ["T"], descripcion: "D", boton: "WHATSAPP_MESSAGE" }, { titulos: ["Otro"] })).toBeNull();
    expect(rellenarAnuncioDelPost(null, { titulos: ["T"], descripcion: "D" })).toEqual({ textos: [], titulos: ["T"], descripcion: "D", boton: "WHATSAPP_MESSAGE" });
  });

  it("los textos para copiar, con el caption de la publicación delante si se usa la publicación", () => {
    const t = textosATexto({ textos: [], titulos: ["Uno", "Dos"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" }, { conCaption: "¿Tu sofá se hunde?" });
    expect(t).toBe("Texto principal (el de la publicación, no se cambia):\n¿Tu sofá se hunde?\n\nTítulos:\n· Uno\n· Dos\n\nDescripción: Envío gratis\n\nBotón: Enviar mensaje de WhatsApp");
  });
});
