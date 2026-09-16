import { describe, it, expect } from "vitest";
import { leer, rel } from "../utils/repo";
import { migraciones } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";
import { TABLAS_CON_DUENO } from "../../worker/lib/acceso.js";

// ============================================================
// El esquema de D1
//
// Antes esto vigilaba dieciséis políticas RLS. D1 no las tiene: quien
// acota es worker/lib/acceso.js, y eso lo comprueba
// tests/despliegue/acceso.test.js.
//
// Lo que queda aquí es lo que sigue viviendo en el SQL: que las tablas
// tengan sus índices, que el JSON sea JSON, que el upsert de las
// aprobaciones tenga el UNIQUE que lo sostiene, y que ninguna migración
// destruya datos sin decirlo.
//
// Y uno nuevo, que es el techo con el que se tropieza esta aplicación:
// **D1 corta la fila a 2.000.000 bytes**. Un calendario con 12 de 25
// publicaciones ilustradas ya ocupa 501.884 caracteres porque las
// imágenes van en base64 dentro del JSON.
// ============================================================

const FICHEROS = migraciones();
const SQL = FICHEROS.map((abs) => leer(rel(abs))).join("\n");

/** Las tablas del esquema con sus columnas, tal como se declaran. */
function tablas() {
  const salida = {};
  for (const m of SQL.matchAll(/create table (?:if not exists )?(\w+) \(([\s\S]*?)\n\);/g)) {
    salida[m[1]] = {
      cuerpo: m[2],
      columnas: [...m[2].matchAll(/^\s{2}(\w+)\s/gm)].map((c) => c[1]),
    };
  }
  return salida;
}

const T = tablas();
const INDICES = [...SQL.matchAll(/create (?:unique )?index\s+(?:if not exists )?(\w+)\s+on\s+(\w+)\(([^)]+)\)/g)]
  .map((m) => ({ nombre: m[1], tabla: m[2], columnas: m[3].split(",").map((c) => c.trim().split(" ")[0]) }));

describe("el esquema se lee y tiene lo que debe", () => {
  it("hay migraciones que comprobar", () => {
    expect(FICHEROS.length, "no se encuentra ninguna migración en migraciones/d1/").toBeGreaterThan(0);
    expect(Object.keys(T).length, "no se encuentra ninguna tabla").toBeGreaterThan(5);
  });

  it("están las ocho tablas de datos, más identidad", () => {
    const esperadas = [...TABLAS_CON_DUENO, "approvals", "users", "sessions"];
    const faltan = esperadas.filter((t) => !T[t]);
    expect(faltan, `faltan tablas en el esquema: ${faltan.join(", ")}`).toEqual([]);
  });
});

describe("índices", () => {
  it("toda clave ajena tiene un índice que la cubre", () => {
    // SQLite no indexa las claves ajenas por su cuenta. Sin índice, cada
    // borrado en cascada recorre la tabla hija entera.
    const lista = [];
    for (const [tabla, def] of Object.entries(T)) {
      for (const m of def.cuerpo.matchAll(/^\s{2}(\w+)\s+text[^\n]*references (\w+)\(/gm)) {
        const columna = m[1];
        // La clave primaria ya lleva su índice: pedirle otro sería un
        // duplicado. Se comprueba con espaciado libre porque las
        // columnas de este esquema van alineadas en columnas, y un
        // `includes` de un espacio exacto dejaba fuera a las que llevan
        // dos —y entonces el fallo pedía crear un índice que sobra—.
        const esClavePrimaria = new RegExp(`${columna}\\s+text\\s+primary key`).test(def.cuerpo);
        const cubierta = INDICES.some((i) => i.tabla === tabla && i.columnas[0] === columna)
          || esClavePrimaria;
        if (!cubierta) lista.push(fallo({
          que: `${tabla}.${columna} es clave ajena y no tiene índice`,
          donde: rel(FICHEROS[0]),
          porque: "SQLite no indexa las claves ajenas solo. Cada borrado en cascada recorre la tabla hija entera, y con el tiempo el borrado de un cliente se nota.",
          arreglo: `create index if not exists ${tabla}_${columna} on ${tabla}(${columna});`,
        }));
      }
    }
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("el testigo de compartición es único, y sólo cuando existe", () => {
    // Un índice único a secas trataría todos los NULL como iguales en
    // algunos motores; el parcial dice exactamente lo que se quiere.
    const i = INDICES.find((x) => x.tabla === "calendars" && x.columnas.includes("share_token"));
    expect(
      i && /create unique index (?:if not exists )?calendars_share[\s\S]*?where share_token is not null/.test(SQL),
      fallo({
        que: "share_token no tiene índice único parcial",
        donde: "migraciones/d1/0001_esquema.sql",
        porque: "Dos calendarios con el mismo testigo abrirían el mismo enlace, y sin el `where … is not null` los calendarios sin compartir chocarían entre sí.",
        arreglo: "create unique index if not exists calendars_share on calendars(share_token) where share_token is not null;",
      }),
    ).toBe(true);
  });
});

describe("restricciones que sostienen el comportamiento", () => {
  it("approvals tiene el UNIQUE que sostiene su upsert", () => {
    expect(
      T.approvals?.cuerpo,
      fallo({
        que: "approvals no declara unique (calendar_id, post_id)",
        donde: "migraciones/d1/0001_esquema.sql",
        porque: "El `on conflict (calendar_id, post_id) do update` de enviarAprobacion lo necesita. Sin él, cada respuesta del cliente final inserta una fila nueva en vez de corregir la suya.",
        arreglo: "Añade unique (calendar_id, post_id) a la tabla approvals.",
      }),
    ).toMatch(/unique \(calendar_id, post_id\)/);
  });

  it("las columnas JSON comprueban que lo que entra es JSON", () => {
    // En D1 el jsonb es TEXTO: sin el check, una cadena rota entra sin
    // protestar y revienta al leerla, lejos de donde se escribió.
    // Anclado a la columna ENTERA: `meta_recipe_sha` es un SHA y
      // `meta_recipe_at` una fecha, no JSON.
      const COLUMNAS_JSON = new Set([
        "days", "week_concepts", "visual_references", "day_labels",
        "ideas_bank", "saved_categories", "weekly_structure", "meta_recipe",
      ]);
    const lista = [];
    for (const [tabla, def] of Object.entries(T)) {
      for (const columna of def.columnas.filter((c) => COLUMNAS_JSON.has(c))) {
        if (!new RegExp(`json_valid\\(${columna}\\)`).test(def.cuerpo)) {
          lista.push(fallo({
            que: `${tabla}.${columna} guarda JSON y no lo comprueba`,
            donde: "migraciones/d1/0001_esquema.sql",
            porque: "En D1 es una columna de texto. Una cadena rota entra sin protestar y revienta al leerla, lejos de donde se escribió.",
            arreglo: `Añade check (json_valid(${columna})) a la columna.`,
          }));
        }
      }
    }
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("los booleanos sólo aceptan 0 y 1", () => {
    for (const columna of ["share_enabled", "allow_editing"]) {
      expect(
        T.calendars?.cuerpo,
        `calendars.${columna} no acota sus valores`,
      ).toMatch(new RegExp(`${columna}[^\\n]*check \\(${columna} in \\(0,1\\)\\)`));
    }
  });

  it("el estado de una aprobación está acotado en la base", () => {
    // La validación vive en publico.js, pero si mañana otra ruta escribe
    // ahí, la base lo para.
    expect(T.approvals?.cuerpo).toMatch(/estado[^\n]*check \(estado in \('aprobado','cambios'\)\)/);
  });
});

describe("el techo de 2 MB de D1", () => {
  it("ninguna columna documenta que guarde un data: URI", () => {
    // Las imágenes viven en R2 y en el JSON va la CLAVE. Una columna que
    // vuelva a guardar base64 lleva la fila contra el techo: un
    // calendario con 12 de 25 publicaciones ilustradas ya ocupa 501.884
    // caracteres.
    const sospechosas = [...SQL.matchAll(/^\s{2}(\w+)[^\n]*default\s+'data:/gm)].map((m) => m[1]);
    expect(
      sospechosas,
      fallo({
        que: `hay columnas que guardan data: URIs por defecto: ${sospechosas.join(", ")}`,
        donde: "migraciones/d1/0001_esquema.sql",
        porque: "D1 corta la fila a 2.000.000 bytes. Con las imágenes en base64 dentro del JSON se llega al muro usando la aplicación como está pensada.",
        arreglo: "Guarda la clave de R2, no los bytes. Ver docs/migracion-cloudflare.md § 5.2.",
      }),
    ).toEqual([]);
  });

  it("el esquema dice dónde viven las imágenes", () => {
    expect(
      T.clients?.cuerpo,
      fallo({
        que: "clients.logo no documenta que guarda una clave de R2",
        donde: "migraciones/d1/0001_esquema.sql",
        porque: "Sin ese comentario, el siguiente que toque la columna vuelve a meter base64 y la fila crece sin que nada avise hasta que D1 la rechaza.",
        arreglo: "Comenta la columna: «clave de R2; nunca un data: URI».",
      }),
    ).toMatch(/logo\s+text,\s*--\s*clave de R2/);
  });
});

describe("orden y forma de las migraciones", () => {
  it("cada migración tiene un número único y ordenable", () => {
    const numeros = FICHEROS.map((abs) => rel(abs).match(/(\d+)_/)?.[1]).filter(Boolean);
    expect(numeros.length, "alguna migración no lleva número").toBe(FICHEROS.length);
    expect(new Set(numeros).size, "hay números de migración repetidos").toBe(numeros.length);
  });

  it("ninguna migración destruye datos sin decirlo", () => {
    // `drop` y `delete` sin explicación son la forma de perder datos que
    // más tarda en descubrirse: la migración pasa, el despliegue pasa, y
    // el dato ya no está.
    const lista = [];
    for (const abs of FICHEROS) {
      const fuente = leer(rel(abs));
      fuente.split("\n").forEach((linea, i) => {
        if (!/^\s*(drop|delete from|truncate)\b/i.test(linea)) return;
        const contexto = fuente.split("\n").slice(Math.max(0, i - 3), i).join("\n");
        if (!/--/.test(contexto)) lista.push(fallo({
          que: `${rel(abs)}:${i + 1} destruye datos sin explicación`,
          donde: `${rel(abs)}:${i + 1} — ${linea.trim()}`,
          porque: "La migración pasa, el despliegue pasa, y el dato ya no está. Es la pérdida que más tarda en descubrirse.",
          arreglo: "Pon encima un comentario diciendo qué se borra y por qué es seguro.",
        }));
      });
    }
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("toda migración se puede volver a aplicar", () => {
    // El esquema de la fase 1 se aplicó a mano sobre la D1 viva, así que
    // `d1_migrations` quedó vacía: wrangler no sabía que 0001 ya estaba
    // puesto y lo reaplicó al desplegar. Murió en la primera sentencia
    // —«table users already exists»— y el Worker no llegó a subir. El
    // síntoma no se parece a la causa: el SQL era correcto, los tests
    // pasaban, y el despliegue caía igual.
    const lista = [];
    for (const abs of FICHEROS) {
      const fuente = leer(rel(abs));
      fuente.split("\n").forEach((linea, i) => {
        const m = /^create\s+(?:unique\s+)?(table|index)\b/i.exec(linea);
        if (!m || /if not exists/i.test(linea)) return;
        lista.push(fallo({
          que: `${rel(abs)}:${i + 1} crea un ${m[1]} que no se puede reaplicar`,
          donde: `${rel(abs)}:${i + 1} — ${linea.trim()}`,
          porque: "Sobre una base que ya lo tiene, la sentencia aborta la migración entera y el despliegue se para antes de subir el Worker.",
          arreglo: `Añade \`if not exists\` tras \`${m[1]}\`.`,
        }));
      });
    }
    expect(lista, fallos(lista)).toEqual([]);
  });
});
