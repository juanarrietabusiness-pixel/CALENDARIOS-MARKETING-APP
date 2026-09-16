import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fallo, fallos } from "../utils/fallo.js";
import {
  texto, textoONulo, entero, booleano, json, instante,
  esDataUri, extensionDe, extraerImagenes, base64SinConvertir,
  filaCliente, filaCalendario, filaAprobacion,
  pesoDeFila, cabeEnD1, LIMITE_FILA_D1,
} from "../../scripts/migracion/convertir.js";

// Claves predecibles: sin esto no se puede afirmar nada sobre el resultado.
const claves = () => {
  let n = 0;
  return () => `k${++n}`;
};

describe("tipos: Postgres no guarda lo mismo que espera la aplicación", () => {
  it("null se vuelve cadena vacía, no la palabra «null»", () => {
    expect(texto(null)).toBe("");
    expect(texto(undefined)).toBe("");
    expect(texto("")).toBe("");
    expect(texto(0)).toBe("0");
  });

  it("textoONulo conserva el null de las columnas que sí lo admiten", () => {
    expect(textoONulo(null)).toBe(null);
    expect(textoONulo("")).toBe(null);
    expect(textoONulo("algo")).toBe("algo");
  });

  it("boolean se vuelve 0/1, que es como lo guarda SQLite", () => {
    expect(booleano(true)).toBe(1);
    expect(booleano(false)).toBe(0);
    expect(booleano(null)).toBe(0);
  });

  it("entero tolera texto y se queda con el valor por defecto ante basura", () => {
    expect(entero("8")).toBe(8);
    expect(entero(null, 0)).toBe(0);
    expect(entero("ocho", 3)).toBe(3);
  });
});

describe("json: el jsonb puede llegar de dos formas y sólo una se serializa", () => {
  it("un objeto se serializa", () => {
    expect(json({ a: 1 })).toBe('{"a":1}');
    expect(json([1, 2])).toBe("[1,2]");
  });

  it("una cadena que YA es JSON válido se deja tal cual", () => {
    // Volver a serializarla la convertiría en una cadena dentro de una
    // cadena —'"[1,2]"'— y json_valid() lo daría por bueno: el dato se
    // corrompe sin que nada falle.
    expect(json("[1,2]")).toBe("[1,2]");
    expect(json('{"a":1}')).toBe('{"a":1}');
  });

  it("una cadena que no es JSON cae al valor por defecto", () => {
    // Si llegara a D1, el check json_valid() rechazaría la fila entera
    // y se perdería el calendario, no sólo el campo.
    expect(json("no soy json")).toBe("[]");
    expect(json(null, "{}")).toBe("{}");
  });
});

describe("instante: fechas", () => {
  it("convierte a ISO-8601 UTC", () => {
    expect(instante("2026-09-15T18:58:31Z")).toBe("2026-09-15T18:58:31.000Z");
  });

  it("null y basura devuelven null, no «Invalid Date»", () => {
    expect(instante(null)).toBe(null);
    expect(instante("")).toBe(null);
    expect(instante("cuando sea")).toBe(null);
  });
});

describe("imágenes: distinguir un data: URI de todo lo demás", () => {
  it("reconoce un data: URI", () => {
    expect(esDataUri("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(esDataUri("data:image/png;base64,iVBOR")).toBe(true);
  });

  it("NO confunde con un enlace ni con una clave ya convertida", () => {
    expect(esDataUri("https://ejemplo.com/foto.jpg")).toBe(false);
    expect(esDataUri("clientes/c1/posts/abc.jpg")).toBe(false);
    expect(esDataUri(null)).toBe(false);
    expect(esDataUri("")).toBe(false);
  });

  it("jpeg se abrevia a jpg y lo desconocido cae a bin", () => {
    expect(extensionDe("data:image/jpeg;base64,x")).toBe("jpg");
    expect(extensionDe("data:image/png;base64,x")).toBe("png");
    expect(extensionDe("data:image/webp;base64,x")).toBe("webp");
    expect(extensionDe("no es nada")).toBe("bin");
  });
});

describe("extraerImagenes: el paso donde se pierden datos sin avisar", () => {
  const calendario = () => ({
    days: [
      {
        date: "2026-08-01",
        posts: [
          { id: "p1", idea: "Una idea", image: "data:image/jpeg;base64,AAAA", format: "post" },
          { id: "p2", idea: "Sin imagen", format: "reel" },
        ],
      },
    ],
    visualReferences: [
      { id: "r1", url: "data:image/png;base64,BBBB", name: "subida.png", format: "post" },
      { id: "r2", url: "https://ejemplo.com/inspiracion", name: "ejemplo.com", format: "reel", type: "link" },
    ],
  });

  it("saca la imagen de la publicación y deja una clave de R2", () => {
    const { days, imagenes } = extraerImagenes(calendario(), "c1", claves());
    expect(days[0].posts[0].image).toBe("clientes/c1/posts/k1.jpg");
    expect(imagenes).toContainEqual({
      clave: "clientes/c1/posts/k1.jpg",
      dataUri: "data:image/jpeg;base64,AAAA",
    });
  });

  it("conserva TODOS los demás campos de la publicación", () => {
    // Reescribir el post entero en vez de su campo `image` no da ningún
    // error: da una idea o un guion que desaparece.
    const { days } = extraerImagenes(calendario(), "c1", claves());
    expect(days[0].posts[0]).toMatchObject({ id: "p1", idea: "Una idea", format: "post" });
    expect(days[0].posts[1]).toEqual({ id: "p2", idea: "Sin imagen", format: "reel" });
  });

  it("NO toca una referencia visual que es un enlace externo", () => {
    // Convertirla en clave de R2 rompe la referencia: el enlace apunta
    // a un sitio real que no está —ni va a estar— en el bucket.
    const { visualReferences, imagenes } = extraerImagenes(calendario(), "c1", claves());
    const enlace = visualReferences.find((r) => r.id === "r2");
    expect(enlace.url).toBe("https://ejemplo.com/inspiracion");
    expect(imagenes.every((i) => i.dataUri.startsWith("data:"))).toBe(true);
  });

  it("sí saca la referencia visual que se subió como data: URI", () => {
    // k2 y no k1: el contador de claves es único para todo el calendario.
    // Si se reiniciara por carpeta, una publicación y una referencia
    // podrían generar la misma clave y la segunda pisaría a la primera
    // en R2 —la imagen no se pierde al convertir, se pierde al subir—.
    const { visualReferences, imagenes } = extraerImagenes(calendario(), "c1", claves());
    expect(visualReferences.find((r) => r.id === "r1").url).toBe("clientes/c1/referencias/k2.png");
    expect(imagenes).toHaveLength(2);
    expect(new Set(imagenes.map((i) => i.clave)).size).toBe(2);
  });

  it("es idempotente: repetirlo no duplica objetos en R2", () => {
    const uno = extraerImagenes(calendario(), "c1", claves());
    const dos = extraerImagenes({ days: uno.days, visualReferences: uno.visualReferences }, "c1", claves());
    expect(dos.imagenes).toHaveLength(0);
    expect(dos.days[0].posts[0].image).toBe("clientes/c1/posts/k1.jpg");
  });

  it("aguanta un calendario vacío o a medio hacer", () => {
    expect(extraerImagenes({}, "c1", claves()).imagenes).toHaveLength(0);
    expect(extraerImagenes({ days: [{}] }, "c1", claves()).days[0].posts).toEqual([]);
  });
});

describe("filas: ninguna columna de la base viva se queda por el camino", () => {
  // Tomadas de la introspección del proyecto en producción
  // (lwkepnrprcyabyhhorrc), no de supabase/migrations/: el registro
  // remoto y el repositorio no coinciden. Ver docs/migracion-cloudflare.md § 5.4.
  const COLUMNAS = {
    clients: ["id","owner_id","name","industry","instagram","phone","whatsapp","sucursales",
      "direcciones","primary_color","secondary_color","accent_color","logo","descripcion",
      "valores","audiencia","competencia","estilo_guion","estilo_locucion","hashtags",
      "notas_inspeccion","github_repo","github_folder","github_context","ideas_bank",
      "saved_categories","weekly_structure","created_at","updated_at","ai_instructions",
      "meta_recipe","meta_recipe_sha","meta_recipe_at"],
    calendars: ["id","client_id","owner_id","name","month","year","campaign","week_concepts",
      "days","approval_id","generated_at","created_at","updated_at","share_token",
      "share_enabled","share_expires_at","allow_editing","visual_references","day_labels",
      "offers","promo_code"],
    approvals: ["id","calendar_id","post_id","estado","comentario","created_at","updated_at",
      "reviewer_name","suggested_descripcion","suggested_guion"],
  };

  const casos = [
    ["clients", filaCliente],
    ["calendars", filaCalendario],
    ["approvals", filaAprobacion],
  ];

  for (const [tabla, convertir] of casos) {
    it(`${tabla}: el conversor produce exactamente sus 
        ${COLUMNAS[tabla].length} columnas`.replace(/\s+/g, " "), () => {
      const salida = Object.keys(convertir({}));
      const faltan = COLUMNAS[tabla].filter((c) => !salida.includes(c));
      const sobran = salida.filter((c) => !COLUMNAS[tabla].includes(c));

      expect(
        [...faltan, ...sobran],
        fallos([
          ...faltan.map((c) => fallo({
            que: `la columna «${c}» de ${tabla} no la convierte nadie`,
            donde: "scripts/migracion/convertir.js",
            porque: "La columna existe en producción y llegaría vacía a D1. No falla nada: el dato simplemente no está, y sólo se nota cuando alguien lo busca.",
            arreglo: `Añadir «${c}» al conversor de ${tabla} con el tipo que le toque (texto / json / booleano / instante).`,
          })),
          ...sobran.map((c) => fallo({
            que: `el conversor de ${tabla} inventa la columna «${c}»`,
            donde: "scripts/migracion/convertir.js",
            porque: "D1 rechaza la inserción entera con «no such column», así que no se pierde el dato: se pierde la tabla.",
            arreglo: `Quitar «${c}» del conversor, o añadirla a migraciones/d1/0001_esquema.sql si de verdad hace falta.`,
          })),
        ]),
      ).toEqual([]);
    });
  }

  it("una fila real de cliente sale con los tipos que D1 espera", () => {
    const fila = filaCliente({
      id: "c1", owner_id: "u1", name: "D'CASA Panamá",
      industry: null, ideas_bank: [], saved_categories: null,
      meta_recipe: null, logo: "data:image/jpeg;base64,x",
      created_at: "2026-08-07T21:11:01Z", updated_at: null,
    });
    expect(fila.industry).toBe("");
    expect(fila.ideas_bank).toBe("[]");
    expect(fila.saved_categories).toBe("[]");
    expect(fila.meta_recipe).toBe(null);
    expect(fila.primary_color).toBe("#1E90FF");
    expect(fila.created_at).toBe("2026-08-07T21:11:01.000Z");
    expect(fila.updated_at).toBe(null);
  });

  it("una fila real de calendario convierte los booleanos y el jsonb", () => {
    const fila = filaCalendario({
      id: "cal1", client_id: "c1", owner_id: "u1", month: 7, year: 2026,
      days: [{ posts: [] }], week_concepts: null, day_labels: null,
      share_enabled: true, allow_editing: false, share_token: null,
    });
    expect(fila.share_enabled).toBe(1);
    expect(fila.allow_editing).toBe(0);
    expect(fila.days).toBe('[{"posts":[]}]');
    expect(fila.week_concepts).toBe("[]");
    expect(fila.day_labels).toBe("{}");
    expect(fila.share_token).toBe(null);
  });
});

describe("el techo de 2 MB de D1", () => {
  it("el calendario más pesado que hay hoy cabe", () => {
    // 501.884 caracteres medidos en producción: el de agosto, con 12 de
    // 25 publicaciones ilustradas.
    const fila = filaCalendario({
      id: "cal1", client_id: "c1", owner_id: "u1", month: 7, year: 2026,
      days: [{ posts: [{ id: "p1", image: "x".repeat(501_884) }] }],
    });
    expect(cabeEnD1(fila)).toBe(true);
  });

  it("veinticinco publicaciones ilustradas NO caben", () => {
    // El motivo por el que las imágenes salen a R2 durante la migración
    // y no después: se llega al muro usando la aplicación como está
    // pensada, sin hacer nada raro.
    const posts = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`, image: "x".repeat(84_000),
    }));
    const fila = filaCalendario({
      id: "cal1", client_id: "c1", owner_id: "u1", month: 7, year: 2026,
      days: [{ posts }],
    });
    expect(pesoDeFila(fila)).toBeGreaterThan(LIMITE_FILA_D1);
    expect(cabeEnD1(fila)).toBe(false);
  });

  it("pesoDeFila mide bytes, no caracteres", () => {
    // «ñ» y las tildes ocupan dos bytes en UTF-8, y el límite de D1 es
    // en bytes: medir con .length se queda corto justo en español.
    expect(pesoDeFila({ a: "ñ" })).toBe(2);
    expect(pesoDeFila({ a: "Panamá" })).toBe(7);
  });
});

describe("el esquema de D1 y el conversor no se contradicen", () => {
  it("toda columna del conversor existe en migraciones/d1/0001_esquema.sql", () => {
    const sql = readFileSync(new URL("../../migraciones/d1/0001_esquema.sql", import.meta.url), "utf8");
    const bloque = (tabla) => {
      const m = new RegExp(`create table ${tabla} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
      return m ? m[1] : "";
    };

    const lista = [];
    for (const [tabla, convertir] of [["clients", filaCliente], ["calendars", filaCalendario], ["approvals", filaAprobacion]]) {
      const cuerpo = bloque(tabla);
      for (const col of Object.keys(convertir({}))) {
        if (!new RegExp(`^\\s+${col}\\s`, "m").test(cuerpo)) {
          lista.push(fallo({
            que: `«${col}» se convierte para ${tabla} pero no está en el esquema`,
            donde: "migraciones/d1/0001_esquema.sql",
            porque: "La importación entera falla con «no such column» en la primera fila. Es el fallo bueno —ruidoso— pero aparece a mitad del corte, con el panel ya parado.",
            arreglo: `Añadir «${col}» a la tabla ${tabla} del esquema, o quitarla del conversor.`,
          }));
        }
      }
    }
    expect(lista, fallos(lista)).toEqual([]);
  });
});

describe("base64SinConvertir: el campo que nadie mira", () => {
  it("no señala nada cuando sólo image y url llevan data: URIs", () => {
    // Comprobado contra la base viva: una publicación tiene además
    // creativo, referenceLink, status, category, comment, title, script y
    // hashtagsFinales, y ninguno pasa de 24 caracteres.
    const cal = {
      days: [{ posts: [{
        id: "p1", image: "data:image/jpeg;base64,AAAA",
        creativo: "carrusel-3", referenceLink: "https://ejemplo.com",
        status: "pending", category: "venta", title: "Un título",
      }] }],
      visualReferences: [{ id: "r1", url: "data:image/png;base64,BBBB" }],
    };
    expect(base64SinConvertir(cal)).toEqual([]);
  });

  it("señala un campo nuevo que traiga base64", () => {
    // Si una versión de la interfaz empieza a guardar la miniatura en
    // `creativo`, el campo viaja a D1 con sus 40 kB dentro y la fila
    // engorda sin que nada avise hasta que D1 la rechaza.
    const cal = {
      days: [{ posts: [{ id: "p1", creativo: "data:image/png;base64," + "x".repeat(40_000) }] }],
    };
    const hallazgos = base64SinConvertir(cal);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0].campo).toBe("days[0].posts[0].creativo");
    expect(hallazgos[0].bytes).toBeGreaterThan(40_000);
  });

  it("mira también los días y las referencias visuales", () => {
    const cal = {
      days: [{ portada: "data:image/png;base64,AAAA", posts: [] }],
      visualReferences: [{ id: "r1", url: "https://ok", miniatura: "data:image/png;base64,BBBB" }],
    };
    expect(base64SinConvertir(cal).map((h) => h.campo)).toEqual([
      "days[0].portada", "visualReferences[0].miniatura",
    ]);
  });
});
