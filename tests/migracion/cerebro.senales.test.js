import { describe, it, expect } from "vitest";
import {
  TIPOS_SENAL, PESO_SENAL, resultadoDeRespuesta, atenuar, claveDeSenal, fuenteDeRespuesta, resumenDePublicacion,
  notaDeRespuesta, senalDeRespuesta, mismoTitulo,
  MIN_MEDIDAS, MIN_DEL_FORMATO, DIAS_DE_MADURACION, percentil, resultadoDePercentil, puntuarPublicaciones, senalDeMetricas,
  MIN_CAMBIO, textoDe, cambioElTexto, similitud, intensidadDeCambio, describirCambio, llegoDeGolpe, evaluarEdicion,
  resultadoDeCorreccion, senalDeCorreccion,
} from "../../worker/lib/cerebro/senales.js";

// ============================================================
// Las señales: lo que pasa DESPUÉS de escribir (puro)
// ============================================================

const pub = { titulo: "Reel de sofás", formato: "reel", categoria: "Producto", idea: "Mostrar el sofá seccional armado", fecha: "2026-10-12" };

describe("qué resultado tiene una respuesta", () => {
  it("aprobar es salir bien; pedir cambios, no ser lo que quería sin llegar a un rechazo del todo", () => {
    expect(resultadoDeRespuesta("aprobado")).toBe(1);
    expect(resultadoDeRespuesta("cambios")).toBe(0.2);
    expect(resultadoDeRespuesta("otra cosa")).toBe(0.2);
  });

  it("cada clase de señal se acerca al neutro según lo que pesa: la respuesta del cliente es lo más claro", () => {
    expect(PESO_SENAL.respuesta).toBe(1);
    expect(atenuar(1, "respuesta")).toBe(1);
    expect(atenuar(1, "metricas")).toBeCloseTo(0.8, 9);
    expect(atenuar(0, "correccion")).toBeCloseTo(0.2, 9);
    expect(atenuar(0.5, "metricas")).toBe(0.5);
  });

  it("un resultado que no es un número, o se sale de 0–1, no rompe nada", () => {
    expect(atenuar(NaN, "respuesta")).toBe(0.5);
    expect(atenuar(7, "respuesta")).toBe(1);
    expect(atenuar(-3, "respuesta")).toBe(0);
    expect(atenuar(0.9, "inventada")).toBeCloseTo(0.9, 9);
  });

  it("las clases de señal son las que el resto del código espera", () => {
    expect(TIPOS_SENAL).toEqual(["respuesta", "metricas", "correccion"]);
    for (const t of TIPOS_SENAL) expect(PESO_SENAL[t]).toBeGreaterThan(0);
  });
});

describe("las claves", () => {
  it("una señal por publicación y clase: cambiar de opinión la reemplaza", () => {
    expect(claveDeSenal("respuesta", "p1")).toBe("respuesta:p1");
    expect(claveDeSenal("metricas", "p1")).not.toBe(claveDeSenal("respuesta", "p1"));
    expect(fuenteDeRespuesta("p1")).toBe("respuesta:p1");
  });
});

describe("de qué publicación se habla", () => {
  it("el título, si lo hay; si no, la primera frase de la idea", () => {
    expect(resumenDePublicacion({ title: "Sofás en oferta", idea: "otra cosa" }).titulo).toBe("Sofás en oferta");
    expect(resumenDePublicacion({ idea: "Mostrar el sofá armado. Con música." }).titulo).toBe("Mostrar el sofá armado");
    expect(resumenDePublicacion({}).titulo).toBe("una publicación");
    expect(resumenDePublicacion(null).titulo).toBe("una publicación");
  });

  it("lleva formato, categoría y fecha; la categoría, la del día si la publicación no la trae", () => {
    const r = resumenDePublicacion({ title: "T", format: "reel", category: "" }, { category: "Producto", date: "2026-10-12" });
    expect(r).toMatchObject({ formato: "reel", categoria: "Producto", fecha: "2026-10-12" });
  });

  it("un título kilométrico se recorta", () => {
    expect(resumenDePublicacion({ title: "x".repeat(500) }).titulo.length).toBeLessThanOrEqual(80);
  });
});

describe("la nota con las palabras del cliente", () => {
  it("sin palabras no hay nota: una aprobación a secas no le enseña nada a nadie", () => {
    expect(notaDeRespuesta({ publicacion: pub, estado: "aprobado" })).toBeNull();
    expect(notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "   " })).toBeNull();
    expect(notaDeRespuesta({})).toBeNull();
  });

  it("pidió cambios: dice qué publicación, qué dijo el cliente y con su nombre", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "No me gustan los emojis, es muy informal.", revisor: "Ana" });
    expect(n.titulo).toBe("Pidió cambios: Reel de sofás");
    expect(n.texto).toContain("# Ana pidió cambios en «Reel de sofás»");
    expect(n.texto).toContain("Publicación: reel · Producto · 2026-10-12.");
    expect(n.texto).toContain("Lo que escribió: «No me gustan los emojis, es muy informal.»");
    expect(n.resumen).toMatch(/emojis/);
  });

  it("sin nombre, «el cliente»", () => {
    expect(notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "más corto" }).texto).toContain("# El cliente pidió cambios");
  });

  it("aprobó con un comentario: se guarda también, es una preferencia", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "aprobado", comentario: "Me encanta que salga el precio." });
    expect(n.titulo).toBe("Aprobó con un comentario: Reel de sofás");
    expect(n.texto).toContain("# El cliente aprobó «Reel de sofás»");
  });

  it("lo que propuso cambiar en el texto y en el guion entra tal cual", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", sugeridaDescripcion: "Sofás desde $450, envío gratis.", sugeridoGuion: "Hook: el precio primero." });
    expect(n.texto).toContain("Cambio que propuso en la descripción: «Sofás desde $450, envío gratis.»");
    expect(n.texto).toContain("Cambio que propuso en el guion: «Hook: el precio primero.»");
  });

  it("lo que añadió en la conversación va aparte, sin repetir lo que ya dijo al responder, y sólo lo más reciente", () => {
    const n = notaDeRespuesta({
      publicacion: pub, estado: "cambios", comentario: "más corto",
      comentarios: ["más corto", "1", "2", "3", "4", "5", "6"],
    });
    expect(n.texto.match(/- «/g)).toHaveLength(4);
    expect(n.texto).not.toContain("- «más corto»");
    expect(n.texto).toContain("- «6»");
    expect(n.texto).not.toContain("- «1»");
  });

  it("sólo comentó, sin responder: nota de un comentario", () => {
    const n = notaDeRespuesta({ publicacion: pub, comentarios: ["¿Y el precio?"] });
    expect(n.titulo).toBe("Comentó: Reel de sofás");
    expect(n.texto).toContain("«¿Y el precio?»");
  });

  it("nada se pasa de largo: una pared de texto se recorta", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "palabra ".repeat(1000) });
    expect(n.texto.length).toBeLessThan(2000);
    expect(n.titulo.length).toBeLessThanOrEqual(140);
  });

  it("los espacios y saltos de línea del comentario se aplanan: una nota no se rompe por lo que escribió el cliente", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "línea uno\n\n\n# Un encabezado falso\n\nlínea dos" });
    expect(n.texto).toContain("«línea uno # Un encabezado falso línea dos»");
    expect(n.texto.split("\n").filter((l) => l.startsWith("# "))).toHaveLength(1);
  });
});

describe("la señal de una respuesta", () => {
  it("lleva su clave, su resultado y una línea legible con lo que dijo", () => {
    const s = senalDeRespuesta({ postId: "p1", publicacion: pub, estado: "cambios", comentario: "No me gustan los emojis", revisor: "Ana", fecha: "2026-10-12" });
    expect(s).toMatchObject({ clave: "respuesta:p1", tipo: "respuesta", postId: "p1", resultado: 0.2 });
    expect(s.resumen).toBe("Pidió cambios en «Reel de sofás»: No me gustan los emojis");
    expect(s.detalle).toMatchObject({ estado: "cambios", revisor: "Ana", fecha: "2026-10-12", publicacion: pub });
  });

  it("aprobar sin nada que decir: el resumen no lleva dos puntos colgando", () => {
    const s = senalDeRespuesta({ postId: "p1", publicacion: pub, estado: "aprobado" });
    expect(s.resumen).toBe("Aprobó «Reel de sofás»");
    expect(s.resultado).toBe(1);
  });
});

describe("¿la misma regla?", () => {
  it("sin tildes, mayúsculas ni puntuación", () => {
    expect(mismoTitulo("No usar emojis", "no usar  EMOJIS.")).toBe(true);
    expect(mismoTitulo("Precio en dólares", "Precio en pesos")).toBe(false);
    expect(mismoTitulo("Garantía", "garantia")).toBe(true);
  });
});

// ------------------------------------------------------------
// Resultados en redes
// ------------------------------------------------------------

const AHORA = Date.parse("2026-10-20T15:00:00.000Z");
const haceDias = (n) => new Date(AHORA - n * 86_400_000).toJSON();
const medida = (n, extra = {}) => ({ red: "instagram", tipo: "reel", externo_id: `ig${n}`, interacciones: n * 10, alcance: n * 100, texto: `Texto ${n}`, enlace: "", publicada_at: haceDias(10 + n), ...extra });
const medidas = (cuantas, extra = {}) => Array.from({ length: cuantas }, (_, i) => medida(i + 1, extra));

describe("dónde queda una cifra entre las demás", () => {
  it("de 0 a 100, con las iguales contando la mitad", () => {
    expect(percentil(10, [10, 20, 30, 40])).toBe(12.5);
    expect(percentil(40, [10, 20, 30, 40])).toBe(87.5);
    expect(percentil(25, [10, 20, 30, 40])).toBe(50);
    expect(percentil(5, [5, 5, 5, 5])).toBe(50); // un empate general no favorece a nadie
  });

  it("sin con qué comparar, el punto medio; lo que no es número cuenta como cero", () => {
    expect(percentil(7, [])).toBe(50);
    expect(percentil("x", [0, 10])).toBe(25);
  });

  it("el resultado de la señal no llega a los extremos: una sola cifra no merece decir «lo mejor» ni «lo peor»", () => {
    expect(resultadoDePercentil(0)).toBeCloseTo(0.1, 9);
    expect(resultadoDePercentil(100)).toBeCloseTo(0.9, 9);
    expect(resultadoDePercentil(50)).toBeCloseTo(0.5, 9);
    expect(resultadoDePercentil(300)).toBeCloseTo(0.9, 9);
    expect(resultadoDePercentil(NaN)).toBeCloseTo(0.1, 9);
  });
});

describe("puntuar lo que rindió cada publicación", () => {
  it("compara con las demás del mismo cliente y de la misma red", () => {
    const { puntuadas, pocas } = puntuarPublicaciones(medidas(MIN_MEDIDAS), { ahora: AHORA });
    expect(pocas).toEqual({});
    expect(puntuadas).toHaveLength(MIN_MEDIDAS);
    const mejor = puntuadas.find((p) => p.externo_id === `ig${MIN_MEDIDAS}`);
    const peor = puntuadas.find((p) => p.externo_id === "ig1");
    expect(mejor.percentil).toBeGreaterThan(90);
    expect(peor.percentil).toBeLessThan(10);
  });

  it("con menos de las que hacen falta en una red, esa red no se compara — y se dice cuántas hay", () => {
    const { puntuadas, pocas } = puntuarPublicaciones([...medidas(MIN_MEDIDAS - 1), ...medidas(MIN_MEDIDAS, { red: "facebook" })], { ahora: AHORA });
    expect(pocas).toEqual({ instagram: MIN_MEDIDAS - 1 });
    expect(puntuadas.every((p) => p.red === "facebook")).toBe(true);
  });

  it("las que todavía están madurando no cuentan —ni para compararse ni de vara—, pero se cuentan aparte", () => {
    const recientes = medidas(3, { publicada_at: haceDias(DIAS_DE_MADURACION - 1) }).map((m, i) => ({ ...m, externo_id: `nuevo${i}`, interacciones: 9999 }));
    const { puntuadas, madurando } = puntuarPublicaciones([...medidas(MIN_MEDIDAS), ...recientes], { ahora: AHORA });
    expect(madurando).toBe(3);
    expect(puntuadas).toHaveLength(MIN_MEDIDAS);
    // Las recientes, con 9999 interacciones, no movieron a las demás de sitio.
    expect(puntuadas.find((p) => p.externo_id === `ig${MIN_MEDIDAS}`).percentil).toBeGreaterThan(90);
  });

  it("una sin fecha no se sabe si maduró: fuera", () => {
    const { puntuadas } = puntuarPublicaciones([...medidas(MIN_MEDIDAS), medida(99, { publicada_at: null })], { ahora: AHORA });
    expect(puntuadas.find((p) => p.externo_id === "ig99")).toBeUndefined();
  });

  it("un formato con bastantes se compara sólo con los suyos; con pocos, con toda la red", () => {
    const reels = medidas(MIN_DEL_FORMATO, { tipo: "reel" }).map((m) => ({ ...m, interacciones: m.interacciones + 1000 })); // los reels rinden 1000 más
    const fotos = Array.from({ length: MIN_MEDIDAS }, (_, i) => medida(i + 50, { tipo: "imagen", externo_id: `foto${i}`, interacciones: (i + 1) * 10 }));
    const { puntuadas } = puntuarPublicaciones([...reels, ...fotos], { ahora: AHORA });
    const mejorFoto = puntuadas.find((p) => p.externo_id === "foto7");
    expect(mejorFoto.base).toBe("formato");
    expect(mejorFoto.percentil).toBeGreaterThan(90); // la mejor FOTO, aunque los reels rindan más
    const unaSola = puntuarPublicaciones([...fotos, medida(1, { tipo: "carrusel", externo_id: "car1", interacciones: 5 })], { ahora: AHORA }).puntuadas.find((p) => p.externo_id === "car1");
    expect(unaSola.base).toBe("red");
    expect(unaSola.de).toBe(MIN_MEDIDAS + 1);
  });
});

describe("la señal de una publicación medida", () => {
  const puntuada = (extra = {}) => ({ ...medida(1), percentil: 90, base: "formato", de: 12, texto: "Sofás desde $450\nEscríbenos", publicada_at: "2026-10-12T23:30:00.000Z", ...extra });

  it("una buena dice qué tanto y lo dice con sus cifras; la hora es la de Panamá", () => {
    const s = senalDeMetricas("p1", [puntuada()]);
    expect(s.clave).toBe("metricas:p1");
    expect(s.tipo).toBe("metricas");
    expect(s.resultado).toBeCloseTo(resultadoDePercentil(90), 9);
    expect(s.resumen).toBe("Rindió mejor que casi todas: «Sofás desde $450» — 10 interacciones, mejor que el 90 % de sus reels");
    expect(s.detalle).toMatchObject({ percentil: 90, interacciones: 10, alcance: 100, fecha: "2026-10-12", hora: "18:30", redes: ["instagram"], base: "formato", comparadas: 12 });
    expect(s.detalle.publicacion).toMatchObject({ titulo: "Sofás desde $450", formato: "reel" });
  });

  it("una mala y una del montón se dicen distinto", () => {
    expect(senalDeMetricas("p1", [puntuada({ percentil: 10 })]).resumen).toMatch(/^Rindió por debajo de casi todas/);
    expect(senalDeMetricas("p1", [puntuada({ percentil: 50 })]).resumen).toMatch(/^Rindió como las demás/);
  });

  it("si salió en dos redes cuenta UNA vez: percentil medio y cifras sumadas, con Instagram de portada", () => {
    const s = senalDeMetricas("p1", [puntuada({ red: "facebook", percentil: 20, interacciones: 4, alcance: 50, texto: "otro" }), puntuada({ percentil: 80, interacciones: 10 })]);
    expect(s.detalle.percentil).toBe(50);
    expect(s.detalle.interacciones).toBe(14);
    expect(s.detalle.alcance).toBe(150);
    expect(s.detalle.redes).toEqual(["facebook", "instagram"]);
    expect(s.detalle.publicacion.titulo).toBe("Sofás desde $450");
  });

  it("sin texto, no se inventa un título", () => {
    expect(senalDeMetricas("p1", [puntuada({ texto: "" })]).detalle.publicacion.titulo).toBe("una publicación");
  });
});

// ------------------------------------------------------------
// Correcciones del equipo
// ------------------------------------------------------------

const CON_EMOJIS = "¡Hola! 😊 Descubre nuestros sofás seccionales 🛋️ con espuma de alta densidad. Escríbenos y agenda tu visita hoy 🚀 y llévate el mejor precio.";
const SIN_EMOJIS = "Descubre nuestros sofás seccionales con espuma de alta densidad. Escríbenos y agenda tu visita hoy y llévate el mejor precio.";
const OTRO = "Comedores de roble macizo, entregados armados en tu casa. Elige el tamaño que necesitas y te lo llevamos esta misma semana sin costo.";

describe("cuánto se parecen dos textos", () => {
  it("iguales, 1; sin nada en común, 0; vacíos, lo uno o lo otro", () => {
    expect(similitud(CON_EMOJIS, CON_EMOJIS)).toBe(1);
    expect(similitud(CON_EMOJIS, OTRO)).toBeLessThan(0.15);
    expect(similitud("", "")).toBe(1);
    expect(similitud("hola", "")).toBe(0);
  });

  it("no le importan las mayúsculas, las tildes ni la puntuación", () => {
    expect(similitud("Garantía de DOS años", "garantia de dos años!")).toBe(1);
  });

  it("una errata o un retoque casi no lo mueve", () => {
    const retoque = CON_EMOJIS.replace("mejor precio", "mejor precio del mercado");
    expect(intensidadDeCambio(CON_EMOJIS, retoque)).toBeLessThan(MIN_CAMBIO * 2);
    expect(intensidadDeCambio(CON_EMOJIS, CON_EMOJIS.replace("Hola", "Hola,"))).toBe(0);
  });

  it("quitar los emojis se nota aunque en palabras casi no cambie nada", () => {
    expect(intensidadDeCambio(CON_EMOJIS, SIN_EMOJIS)).toBeGreaterThanOrEqual(0.4);
    // Uno solo, no: es un retoque.
    expect(intensidadDeCambio(CON_EMOJIS, CON_EMOJIS.replace("🚀 ", ""))).toBeLessThan(MIN_CAMBIO);
  });

  it("reescribirlo entero es la mayor intensidad", () => {
    expect(intensidadDeCambio(CON_EMOJIS, OTRO)).toBeGreaterThan(0.85);
  });
});

describe("el cambio, en palabras", () => {
  it("dice lo que se ve a simple vista", () => {
    expect(describirCambio(CON_EMOJIS, SIN_EMOJIS, 0.4)).toBe("se quitaron los emojis");
    expect(describirCambio(SIN_EMOJIS, CON_EMOJIS + " 🎉🎉🎉", 0.5)).toContain("se añadieron emojis");
    expect(describirCambio(OTRO.repeat(2), "Corto y al grano, sin más adorno.", 0.9)).toBe("quedó mucho más corto");
    expect(describirCambio(SIN_EMOJIS, SIN_EMOJIS + " " + SIN_EMOJIS, 0.5)).toBe("quedó mucho más largo");
  });

  it("y si no hay nada tan claro, cuánto se tocó", () => {
    expect(describirCambio(SIN_EMOJIS, OTRO, 0.9)).toBe("se reescribió casi entero");
    expect(describirCambio(SIN_EMOJIS, SIN_EMOJIS.replace("Descubre", "Conoce"), 0.2)).toBe("se cambiaron varias frases");
  });
});

describe("un texto que llega entero, contra uno que se teclea", () => {
  it("a mano llega de a poco: una pausa al teclear no da para sesenta caracteres", () => {
    expect(llegoDeGolpe("Hola", "Hola, buenas tardes a todos")).toBe(false);
    expect(llegoDeGolpe("", "Corto")).toBe(false);
  });

  it("la IA (o un pegado) lo trae entero", () => {
    expect(llegoDeGolpe("", CON_EMOJIS)).toBe(true);
    expect(llegoDeGolpe("Idea suelta", CON_EMOJIS)).toBe(true);
  });

  it("y si ya había un texto y lo reemplazan de golpe por otro distinto, también", () => {
    expect(llegoDeGolpe(CON_EMOJIS, OTRO)).toBe(true);
    expect(llegoDeGolpe(CON_EMOJIS, SIN_EMOJIS)).toBe(false); // el mismo, editado
  });
});

describe("qué dice un guardado sobre lo que escribió la IA", () => {
  const t = (descripcion = "", guion = "") => ({ descripcion, guion });
  const ahora = "2026-10-20T15:00:00.000Z";

  it("cuando el texto llega entero se apunta como la base, y todavía no hay nada que medir", () => {
    const r = evaluarEdicion({}, t(), t(CON_EMOJIS), { ahora });
    expect(r.fijada).toBe(true);
    expect(r.base).toEqual({ descripcion: CON_EMOJIS, en: { descripcion: ahora } });
    expect(r.correccion).toBeNull();
  });

  it("lo que se teclea antes de que llegue nada no es una base", () => {
    const r = evaluarEdicion({}, t("Hol"), t("Hola"));
    expect(r.fijada).toBe(false);
    expect(r.base).toEqual({ en: {} });
    expect(r.correccion).toBeNull();
  });

  it("con la base apuntada, lo que se cambia se mide contra lo que escribió la IA", () => {
    const base = { descripcion: CON_EMOJIS, en: { descripcion: ahora } };
    const r = evaluarEdicion(base, t(CON_EMOJIS), t(SIN_EMOJIS));
    expect(r.fijada).toBe(false);
    expect(r.correccion).toMatchObject({ campo: "descripción", antes: CON_EMOJIS, despues: SIN_EMOJIS });
    expect(r.correccion.intensidad).toBeGreaterThanOrEqual(0.4);
  });

  it("se mide contra la BASE y no contra el guardado anterior: los retoques suman", () => {
    const base = { descripcion: CON_EMOJIS, en: {} };
    const paso1 = evaluarEdicion(base, t(CON_EMOJIS), t(CON_EMOJIS.replace("¡Hola! ", "")));
    const paso2 = evaluarEdicion(base, t(CON_EMOJIS.replace("¡Hola! ", "")), t(SIN_EMOJIS));
    expect(paso2.correccion.intensidad).toBeGreaterThan(paso1.correccion.intensidad);
  });

  it("volver a dejarlo como estaba es una intensidad de cero", () => {
    const base = { descripcion: CON_EMOJIS, en: {} };
    expect(evaluarEdicion(base, t(SIN_EMOJIS), t(CON_EMOJIS)).correccion.intensidad).toBe(0);
  });

  it("un campo vaciado es alguien reescribiéndolo, no una opinión", () => {
    const base = { descripcion: CON_EMOJIS, en: {} };
    expect(evaluarEdicion(base, t(CON_EMOJIS), t("")).correccion).toBeNull();
    expect(evaluarEdicion(base, t(CON_EMOJIS), t("Nuev")).correccion).toBeNull();
  });

  it("el guion que llega más tarde tiene su propia base y no altera lo de la descripción", () => {
    const base = { descripcion: CON_EMOJIS, en: { descripcion: "2026-10-20T10:00:00.000Z" } };
    const r = evaluarEdicion(base, t(CON_EMOJIS, ""), t(CON_EMOJIS, OTRO), { ahora });
    expect(r.fijada).toBe(true);
    expect(r.base).toMatchObject({ descripcion: CON_EMOJIS, guion: OTRO });
    expect(r.base.en).toEqual({ descripcion: "2026-10-20T10:00:00.000Z", guion: ahora });
    expect(r.correccion.campo).toBe("descripción");
    expect(r.correccion.intensidad).toBe(0);
  });

  it("de los campos con base, cuenta el que más se alejó", () => {
    const base = { descripcion: CON_EMOJIS, guion: OTRO, en: {} };
    const r = evaluarEdicion(base, t(CON_EMOJIS, OTRO), t(CON_EMOJIS.replace("¡Hola! ", ""), "Otra cosa totalmente distinta, escrita de cero por una persona de la agencia."));
    expect(r.correccion.campo).toBe("guion");
  });

  it("si se le pidió texto a la IA DESPUÉS de la base y llega otro entero, es la IA regenerando: la base se cambia", () => {
    const base = { descripcion: CON_EMOJIS, en: { descripcion: "2026-10-20T10:00:00.000Z" } };
    const r = evaluarEdicion(base, t(CON_EMOJIS), t(OTRO), { pedidoAt: "2026-10-20T12:00:00.000Z", ahora });
    expect(r.fijada).toBe(true);
    expect(r.base.descripcion).toBe(OTRO);
    expect(r.base.en.descripcion).toBe(ahora);
    expect(r.correccion).toBeNull();
  });

  it("y si NO se le pidió nada, reemplazarlo de golpe es una persona que lo cambió por completo: la mayor corrección", () => {
    const base = { descripcion: CON_EMOJIS, en: { descripcion: "2026-10-20T10:00:00.000Z" } };
    const r = evaluarEdicion(base, t(CON_EMOJIS), t(OTRO), { pedidoAt: "2026-10-20T09:00:00.000Z", ahora });
    expect(r.fijada).toBe(false);
    expect(r.correccion.intensidad).toBeGreaterThan(0.85);
  });
});

describe("la señal de una corrección", () => {
  it("un texto casi igual es una aceptación; uno reescrito, no", () => {
    expect(resultadoDeCorreccion(0)).toBeCloseTo(0.75, 9);
    expect(resultadoDeCorreccion(1)).toBeCloseTo(0.15, 9);
    expect(resultadoDeCorreccion(0.5)).toBeCloseTo(0.45, 9);
    expect(resultadoDeCorreccion(5)).toBeCloseTo(0.15, 9);
    expect(resultadoDeCorreccion(-1)).toBeCloseTo(0.75, 9);
  });

  it("lleva lo que escribió la IA, en qué quedó y qué se cambió; una por publicación", () => {
    const s = senalDeCorreccion({ postId: "p1", publicacion: pub, campo: "descripción", antes: CON_EMOJIS, despues: SIN_EMOJIS, intensidad: 0.4, quien: "Juan", fecha: "2026-10-20" });
    expect(s).toMatchObject({ clave: "correccion:p1", tipo: "correccion", postId: "p1" });
    expect(s.resultado).toBeCloseTo(0.51, 9);
    expect(s.resumen).toBe("Corrigió la descripción de «Reel de sofás»: se quitaron los emojis");
    expect(s.detalle).toMatchObject({ campo: "descripción", antes: CON_EMOJIS, despues: SIN_EMOJIS, cambio: "se quitaron los emojis", intensidad: 0.4, quien: "Juan", fecha: "2026-10-20" });
  });

  it("un retoque se dice como tal", () => {
    const s = senalDeCorreccion({ postId: "p1", publicacion: pub, campo: "guion", antes: OTRO, despues: OTRO, intensidad: 0.02 });
    expect(s.resumen).toBe("Dejó casi igual el guion de «Reel de sofás»");
  });

  it("el texto de una publicación es su descripción (o el campo heredado) y su guion", () => {
    expect(textoDe({ descripcion: "a", guion: "b" })).toEqual({ descripcion: "a", guion: "b" });
    expect(textoDe({ script: "vieja" })).toEqual({ descripcion: "vieja", guion: "" });
    expect(textoDe(null)).toEqual({ descripcion: "", guion: "" });
    expect(cambioElTexto(textoDe({ descripcion: "a" }), textoDe({ descripcion: "b" }))).toBe(true);
    expect(cambioElTexto(textoDe({ descripcion: "a", hashtagsFinales: "#x" }), textoDe({ descripcion: "a", hashtagsFinales: "#y" }))).toBe(false);
  });
});
