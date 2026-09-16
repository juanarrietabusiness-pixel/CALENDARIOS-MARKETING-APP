// ============================================================
// La regla que sustituye a las políticas RLS
//
// Supabase tenía dieciséis políticas haciendo de segunda red. D1 no
// tiene ninguna: una consulta a la que se le olvide el `owner_id` no
// falla, devuelve filas de otro dueño. Con una sola cuenta de agencia
// eso es invisible —ya pasó una vez con el banco de contenido—, así
// que la red pasa a ser este test.
// ============================================================

import { describe, it, expect } from "vitest";
import { leer, listar, buscar, rel, hay } from "../utils/repo.js";
import { fallo, fallos } from "../utils/fallo.js";
import { TABLAS_CON_DUENO, TABLAS_POR_CALENDARIO } from "../../worker/lib/acceso.js";

const CAPA = "worker/lib/acceso.js";
const ESQUEMA = "migraciones/d1/0001_esquema.sql";

/**
 * Los únicos ficheros que pueden hablar con D1. No es «uno solo» porque
 * hay tres clases de consulta y las tres necesitan revisarse aparte:
 *
 *   acceso.js   las tablas con dueño. Acota por owner_id siempre.
 *   sesion.js   users y sessions. No tienen dueño: LO DEFINEN.
 *   publico.js  el enlace de aprobación, sin sesión. Acota por testigo.
 *
 * Añadir un cuarto es una decisión, no un descuido: hay que escribirlo
 * aquí y explicar por qué sus consultas no caben en ninguno de los tres.
 */
const MODULOS_CON_ACCESO = [
  CAPA,
  "worker/lib/sesion.js",
  "worker/lib/publico.js",
];

/** Tablas del esquema de D1 y sus columnas. */
function tablasDelEsquema() {
  const sql = leer(ESQUEMA);
  const tablas = {};
  for (const m of sql.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g)) {
    tablas[m[1]] = [...m[2].matchAll(/^\s{2}(\w+)\s/gm)].map((c) => c[1]);
  }
  return tablas;
}

describe("nadie habla con D1 por fuera de la capa de acceso", () => {
  it("sólo los módulos declarados llaman a prepare()", () => {
    const fuentes = listar("worker", /\.(js|ts)$/).filter((f) => !MODULOS_CON_ACCESO.includes(rel(f)));
    const sueltos = buscar(fuentes, /\.prepare\s*\(/);

    const lista = sueltos.map((h) => fallo({
      que: "hay una consulta a D1 fuera de los módulos de acceso",
      donde: `${h.archivo}:${h.linea} — ${h.texto}`,
      porque: "D1 no tiene RLS. Si a esa consulta se le olvida el owner_id no falla nada: devuelve datos de otro cliente, en silencio. Es la misma forma del fallo que tuvo el banco de contenido en Supabase.",
      arreglo: `Sacarla a ${CAPA} —o a sesion.js / publico.js si de verdad es una consulta sin dueño— y llamarla desde aquí.`,
    }));

    expect(lista, fallos(lista)).toEqual([]);
  });

  it("los módulos declarados existen", () => {
    // Una ruta mal escrita en la lista abre un agujero silencioso: el
    // fichero real deja de estar exento… o peor, uno que no lo es pasa
    // a estarlo porque alguien copió mal el nombre.
    const lista = MODULOS_CON_ACCESO.filter((f) => !hay(f)).map((f) => fallo({
      que: `«${f}» está en MODULOS_CON_ACCESO y no existe`,
      donde: "tests/despliegue/acceso.test.js",
      porque: "La exención no protege nada y disimula que la lista está desactualizada.",
      arreglo: "Corregir la ruta o quitarla de la lista.",
    }));
    expect(lista, fallos(lista)).toEqual([]);
  });
});

describe("la lista de tablas con dueño y el esquema dicen lo mismo", () => {
  it("toda tabla del esquema que tiene owner_id está declarada", () => {
    const tablas = tablasDelEsquema();
    const declaradas = new Set([...TABLAS_CON_DUENO, ...TABLAS_POR_CALENDARIO]);

    const olvidadas = Object.entries(tablas)
      .filter(([nombre, cols]) => cols.includes("owner_id") && !declaradas.has(nombre))
      .map(([nombre]) => nombre);

    const lista = olvidadas.map((t) => fallo({
      que: `la tabla «${t}» tiene owner_id y no está en TABLAS_CON_DUENO`,
      donde: `${ESQUEMA} y ${CAPA}`,
      porque: "La capa de acceso no la reconoce, así que se consultará a mano y sin acotar. Una tabla nueva hereda el problema entero el día que se crea.",
      arreglo: `Añadir "${t}" a TABLAS_CON_DUENO en ${CAPA}. El test de tests/migracion/acceso.test.js la cubrirá sola.`,
    }));

    expect(lista, fallos(lista)).toEqual([]);
  });

  it("no se declara ninguna tabla que no exista", () => {
    const tablas = tablasDelEsquema();
    const inventadas = [...TABLAS_CON_DUENO, ...TABLAS_POR_CALENDARIO].filter((t) => !tablas[t]);

    const lista = inventadas.map((t) => fallo({
      que: `«${t}» está declarada en la capa de acceso pero no existe en el esquema`,
      donde: CAPA,
      porque: "Cualquier consulta sobre ella muere con «no such table» en producción, no en los tests.",
      arreglo: `Crearla en ${ESQUEMA}, o quitarla de la capa.`,
    }));

    expect(lista, fallos(lista)).toEqual([]);
  });

  it("approvals se acota por calendario porque no tiene owner_id", () => {
    // Si algún día gana la columna, hay que moverla de lista: acotar por
    // el salto a calendars sería entonces una vuelta innecesaria, y
    // acotar por las dos cosas a medias es peor que por una bien.
    const tablas = tablasDelEsquema();
    for (const t of TABLAS_POR_CALENDARIO) {
      expect(
        tablas[t]?.includes("owner_id"),
        fallo({
          que: `«${t}» ya tiene owner_id y sigue acotándose por calendars`,
          donde: `${ESQUEMA} y ${CAPA}`,
          porque: "La subconsulta a calendars deja de hacer falta y esconde cuál es la condición que de verdad protege la fila.",
          arreglo: `Mover "${t}" de TABLAS_POR_CALENDARIO a TABLAS_CON_DUENO.`,
        }),
      ).toBe(false);
    }
  });
});

describe("el utillaje de la migración está donde dice el plan", () => {
  it("existen el esquema, el conversor y los dos scripts", () => {
    const esperados = [
      ESQUEMA,
      "scripts/migracion/convertir.js",
      "scripts/migracion/volcar.mjs",
      "scripts/migracion/importar.mjs",
    ];
    const faltan = esperados.filter((f) => !hay(f));

    const lista = faltan.map((f) => fallo({
      que: `falta ${f}`,
      donde: "docs/migracion-cloudflare.md § 8",
      porque: "El plan lo da por existente y el corte se apoya en él.",
      arreglo: "Recuperarlo del historial o volver a escribirlo.",
    }));

    expect(lista, fallos(lista)).toEqual([]);
  });

  it("el volcado de datos de clientes no se puede subir al repositorio", () => {
    // Nombres, teléfonos, ADN de marca y logos de clientes reales. Una
    // vez en el historial de git, ya no salen.
    expect(
      leer(".gitignore"),
      fallo({
        que: "scripts/migracion/datos/ no está en .gitignore",
        donde: ".gitignore",
        porque: "El volcado trae clientes reales —nombres, teléfonos, ADN de marca, logos—. Un commit por descuido lo deja en el historial para siempre.",
        arreglo: "Añadir «scripts/migracion/datos/» a .gitignore.",
      }),
    ).toContain("scripts/migracion/datos/");
  });
});
