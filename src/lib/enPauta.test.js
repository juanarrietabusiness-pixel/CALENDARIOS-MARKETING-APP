import { describe, it, expect } from "vitest";
import {
  creativoDe, codigoInstagram, indiceDeSalidas, casarCreativo, tipoSinCasar, externosDe, juntarEnPauta, limpiarEnPauta,
  lineaEnPauta, textoDePublicacionDeAnuncio, entradaPublica, fotoDePublicacion, paraPautar, fraseParaPautar, mediana,
  direccionDePublicacion, DIAS_SIN_PAUTA, TEXTO_SIN_PUBLICACION,
} from "./enPauta.js";
import { sumarDias } from "./agenda.js";

// La cola: lo que salió desde el calendario, con el id que Meta le dio a cada publicación.
const SALIDAS = [
  { calendar_id: "cal1", post_id: "p1", red: "instagram", externo_id: "17900001", enlace: "https://www.instagram.com/p/ABCdef123/", variante: "post" },
  { calendar_id: "cal1", post_id: "p1", red: "instagram", externo_id: "17900099", enlace: "", variante: "historia" },
  { calendar_id: "cal1", post_id: "p2", red: "facebook", externo_id: "555_777", enlace: "", variante: "post" },
  { calendar_id: "cal2", post_id: "p3", red: "facebook", externo_id: "888", enlace: "", variante: "post" },
  { calendar_id: "cal2", post_id: "p4", red: "instagram", externo_id: "", enlace: "https://www.instagram.com/reel/XyZ987abc/", variante: "post" },
];
const cifra = (gasto, resultados) => ({ gasto, resultados, costoPorResultado: resultados ? Math.round((gasto / resultados) * 100) / 100 : null });
const anuncio = (id, creativo, extra = {}) => ({
  id, nombre: `Anuncio ${id}`, campanaId: "800", campana: "Café · Presentación", conjuntoId: "901", etapa: "presentacion", nombreEtapa: "Presentación",
  tipoResultado: "conversacion", nombreResultado: "conversaciones", objetivo: "OUTCOME_ENGAGEMENT",
  enlace: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=111&selected_ad_ids=${id}`,
  d7: cifra(12, 10), d30: cifra(40, 25), creativo: creativoDe(creativo), ...extra,
});

describe("el creativo y la cola", () => {
  it("lee del creativo sólo ids de Meta, y el código de un enlace de Instagram", () => {
    expect(creativoDe({ id: "1", effective_object_story_id: "555_777", effective_instagram_media_id: "17900001", object_story_id: "x<y", instagram_permalink_url: "https://www.instagram.com/reel/XyZ987abc/" }))
      .toEqual({ id: "1", historia: "555_777", objeto: "", instagram: "17900001", origen: "", codigo: "XyZ987abc" });
    expect(creativoDe(null)).toBeNull();
    expect(codigoInstagram("https://instagram.com/cafeluna/p/AbC_-12345/?img=1")).toBe("AbC_-12345");
    expect(codigoInstagram("https://example.com/p/AbC")).toBe("");
  });

  it("casa un anuncio con su publicación por el id de Instagram, por el enlace o por la publicación de la página", () => {
    const i = indiceDeSalidas(SALIDAS);
    expect(casarCreativo(creativoDe({ effective_instagram_media_id: "17900001" }), i)).toEqual({ calendarId: "cal1", postId: "p1", red: "instagram", por: "ig" });
    expect(casarCreativo(creativoDe({ source_instagram_media_id: "17900001" }), i)).toMatchObject({ postId: "p1" });
    expect(casarCreativo(creativoDe({ instagram_permalink_url: "https://www.instagram.com/reel/XyZ987abc/" }), i)).toMatchObject({ postId: "p4", por: "ig-codigo" });
    expect(casarCreativo(creativoDe({ effective_object_story_id: "555_777" }), i)).toMatchObject({ postId: "p2", por: "fb" });
    // Un video de la página se guarda con su id suelto; el anuncio lo nombra «<página>_<video>».
    expect(casarCreativo(creativoDe({ effective_object_story_id: "555_888" }), i)).toMatchObject({ postId: "p3", por: "fb-post" });
    // La historia de un post no se pauta como publicación.
    expect(casarCreativo(creativoDe({ effective_instagram_media_id: "17900099" }), i)).toBeNull();
    expect(casarCreativo(creativoDe({ effective_object_story_id: "555_000" }), i)).toBeNull();
  });

  it("dice por qué un anuncio no tiene publicación del calendario", () => {
    expect(tipoSinCasar(creativoDe({ effective_object_story_id: "555_000" }))).toBe("nuevo");
    expect(tipoSinCasar(creativoDe({ object_story_id: "555_000" }))).toBe("otra");
    expect(tipoSinCasar(creativoDe({ source_instagram_media_id: "123" }))).toBe("otra");
    expect(tipoSinCasar(null)).toBe("sin-dato");
    expect(externosDe(creativoDe({ effective_object_story_id: "555_000", effective_instagram_media_id: "42" }))).toEqual(["instagram:42", "facebook:555_000"]);
  });
});

describe("lo que se guarda (`en_pauta`)", () => {
  const indice = indiceDeSalidas(SALIDAS);
  const posts = new Map([["cal1|p1", fotoDePublicacion({ id: "p1", title: "Receta", format: "post", image: "/api/media/clientes/c1/a.jpg", pilar: "educativo", composicion: "uso", nivel: "problema" }, "2026-10-12")]]);

  it("junta los anuncios de una misma publicación, con la etapa y las cifras del que más gastó", () => {
    const { enPauta, porAnuncio } = juntarEnPauta({
      anuncios: [
        anuncio("9011", { effective_instagram_media_id: "17900001" }),
        anuncio("9012", { effective_instagram_media_id: "17900001" }, { d7: cifra(8, 2), d30: cifra(60, 20), etapa: "evaluacion", nombreEtapa: "Evaluación" }),
        anuncio("9021", { effective_object_story_id: "555_000" }),
      ],
      indice, posts, hoy: "2026-11-06", leidoAt: "2026-11-06T15:00:00.000Z", cuenta: "act_111", moneda: "USD", referencia: 0.5,
    });
    const e = enPauta.publicaciones["cal1|p1"];
    expect(e).toMatchObject({ calendarId: "cal1", postId: "p1", red: "instagram", activo: true, desde: "2026-11-06", visto: "2026-11-06", etapa: "evaluacion", nombreEtapa: "Evaluación" });
    expect(e.d7).toEqual({ gasto: 20, resultados: 12, costo: 1.67 });
    expect(e.d30).toEqual({ gasto: 100, resultados: 45, costo: 2.22 });
    expect(e.anuncios.map((a) => a.id)).toEqual(["9012", "9011"]);
    expect(e.post).toMatchObject({ fecha: "2026-10-12", titulo: "Receta", miniatura: "/api/media/clientes/c1/a.jpg", composicion: "uso" });
    expect(enPauta.sinPublicacion).toMatchObject({ nuevo: 1, otra: 0, sinDato: 0 });
    expect(enPauta.externos).toEqual(["instagram:17900001", "facebook:555_000"]);
    expect(porAnuncio.get("9021")).toEqual({ sinPublicacion: { tipo: "nuevo", texto: TEXTO_SIN_PUBLICACION.nuevo } });
    expect(textoDePublicacionDeAnuncio(porAnuncio.get("9011"))).toMatch(/^Publicación del calendario del 12 oct «Receta» \(ID p1\)$/);
    expect(enPauta.referencia).toBe(0.5);
  });

  it("lo que deja de correr queda con sus últimas cifras (inactivo) y se olvida a los 120 días", () => {
    const { enPauta: primero } = juntarEnPauta({ anuncios: [anuncio("9011", { effective_instagram_media_id: "17900001" })], indice, posts, hoy: "2026-11-06" });
    const { enPauta: luego } = juntarEnPauta({ anuncios: [], indice, previo: JSON.stringify(primero), hoy: "2026-11-20" });
    expect(luego.publicaciones["cal1|p1"]).toMatchObject({ activo: false, visto: "2026-11-06", desde: "2026-11-06", d30: { gasto: 40, resultados: 25 } });
    // Los ids que se pautaron se recuerdan: «Para pautar» no los vuelve a sugerir.
    expect(luego.externos).toContain("instagram:17900001");
    const tarde = sumarDias("2026-11-06", DIAS_SIN_PAUTA + 1);
    expect(juntarEnPauta({ anuncios: [], indice, previo: primero, hoy: tarde }).enPauta.publicaciones).toEqual({});
    // Si vuelve a correr, conserva desde cuándo.
    const { enPauta: otraVez } = juntarEnPauta({ anuncios: [anuncio("9011", { effective_instagram_media_id: "17900001" })], indice, previo: luego, hoy: "2026-12-01" });
    expect(otraVez.publicaciones["cal1|p1"]).toMatchObject({ activo: true, desde: "2026-11-06", visto: "2026-12-01" });
  });

  it("limpia lo guardado: una clave que no es la de su publicación no pasa, ni un id raro en los externos", () => {
    const l = limpiarEnPauta({ publicaciones: { "cal1|p1": { calendarId: "cal1", postId: "p1", activo: 1 }, "x|y": { calendarId: "cal1", postId: "p1" } }, externos: ["instagram:1", "web:2", "facebook:3_4"] });
    expect(Object.keys(l.publicaciones)).toEqual(["cal1|p1"]);
    expect(l.publicaciones["cal1|p1"].activo).toBe(false);
    expect(l.externos).toEqual(["instagram:1", "facebook:3_4"]);
    expect(limpiarEnPauta("{roto").publicaciones).toEqual({});
  });
});

describe("cómo se dice", () => {
  const e = { calendarId: "cal1", postId: "p1", activo: true, visto: "2026-11-06", nombreEtapa: "Presentación", nombreResultado: "conversaciones", d7: { gasto: 12, resultados: 10, costo: 1.2 }, d30: { gasto: 40, resultados: 25, costo: 1.6 }, anuncios: [] };

  it("«En pauta · etapa · costo por resultado (7 días)», y el de 30 si en 7 no hubo resultados", () => {
    expect(lineaEnPauta(e)).toMatch(/^En pauta · Presentación · 1,20\sUS\$ por conversación \(7 días\)$/);
    expect(lineaEnPauta({ ...e, d7: { gasto: 5, resultados: 0, costo: null } })).toMatch(/1,60\sUS\$ por conversación \(30 días\)$/);
    expect(lineaEnPauta({ ...e, d7: { gasto: 5, resultados: 0, costo: null }, d30: { gasto: 5, resultados: 0, costo: null } })).toMatch(/5,00\sUS\$ en 7 días sin conversaciones$/);
    expect(lineaEnPauta({ ...e, nombreResultado: "compras", activo: false })).toMatch(/^Estuvo en pauta hasta el 6 nov · Presentación · 1,20\sUS\$ por compra \(7 días\)$/);
    expect(entradaPublica(e)).toMatchObject({ calendarId: "cal1", postId: "p1", activo: true, linea: lineaEnPauta(e) });
  });

  it("la dirección de una publicación y la frase de «Para pautar»", () => {
    expect(direccionDePublicacion("cafe-luna", "cal 1", "p1")).toBe("/cliente/cafe-luna/cal%201?publicacion=p1");
    expect(fraseParaPautar(3.42, "Evaluación")).toBe("Rindió 3,4× su promedio: páutala en Evaluación.");
  });
});

describe("«Para pautar»: lo orgánico que rindió y no se ha pautado", () => {
  const medida = (externo, valor, fecha, extra = {}) => ({
    cuenta_id: "cta-ig", red: "instagram", externo_id: externo, tipo: "imagen", enlace: `https://www.instagram.com/p/${externo}/`, texto: `Texto ${externo}`,
    miniatura: "https://scontent.cdninstagram.com/x.jpg", publicada_at: `${fecha}T15:00:00.000Z`, interacciones: valor, guardados: 0, compartidos: 0, ...extra,
  });
  const MEDIDAS = [
    medida("17900001", 400, "2026-10-12"), // p1 del calendario, 4×
    medida("17900002", 100, "2026-10-01"),
    medida("17900003", 100, "2026-09-25"),
    medida("17900004", 90, "2026-10-20"),
    medida("17900005", 350, "2026-10-28", { tipo: "historia" }), // historia: no se pauta
    medida("17900006", 300, "2026-07-01"), // fuera de los 60 días
    medida("17900007", 250, "2026-10-30"), // fuera del calendario
    // Las viejas no se sugieren, pero cuentan para lo normal de la cuenta (la mediana: 105).
    medida("17900008", 100, "2026-09-01"),
    medida("17900009", 110, "2026-08-20"),
  ];

  it("lo que rinde 1,5× la mediana de su cuenta, del calendario o no, la que más rindió primero", () => {
    const l = paraPautar({ medidas: MEDIDAS, salidas: SALIDAS, hoy: "2026-11-06" });
    expect(l.map((x) => x.externoId)).toEqual(["17900001", "17900007"]);
    expect(l[0]).toMatchObject({ clave: "cal1|p1", calendarId: "cal1", postId: "p1", rinde: 3.8 });
    expect(l[1]).toMatchObject({ clave: "instagram:17900007", rinde: 2.4 });
    expect(l[1].calendarId).toBeUndefined();
  });

  it("no sugiere lo que ya corre o corrió (por su publicación o por el id de Meta que usó un anuncio)", () => {
    const enPauta = { publicaciones: { "cal1|p1": { calendarId: "cal1", postId: "p1", activo: false } }, externos: ["instagram:17900007"] };
    expect(paraPautar({ medidas: MEDIDAS, salidas: SALIDAS, enPauta, hoy: "2026-11-06" })).toEqual([]);
  });

  it("sin 3 medidas en la cuenta no hay con qué comparar", () => {
    expect(paraPautar({ medidas: MEDIDAS.slice(0, 2), salidas: SALIDAS, hoy: "2026-11-06" })).toEqual([]);
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });
});
