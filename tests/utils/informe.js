// ============================================================
// Informe de fallos para que otro —persona o agente— lo arregle
//
// Vitest imprime los fallos en el orden en que terminan, mezclados con
// el ruido de la ejecución y repartidos por la consola. Eso sirve cuando
// quien mira acaba de escribir el código; no sirve cuando el que mira es
// un registro de CI de hace dos horas, ni cuando quien va a corregir
// empieza sin contexto.
//
// Este reporter recoge los fallos y escribe un archivo con el formato
// fijo de `fallo.js`: qué se rompió, dónde, por qué importa y cuál es el
// arreglo. El resultado se puede leer entero y actuar sobre él sin
// volver a ejecutar nada ni auditar el repositorio otra vez.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SALIDA = process.env.INFORME_DESPLIEGUE || "informe-despliegue.md";

/**
 * Saca los bloques con formato de `fallo()` de un mensaje de error.
 *
 * Los cuatro campos ocupan UNA línea cada uno, así que se capturan con
 * `[^\n]*`. Capturarlos con `.*?` y el flag `s` arrastraba hasta el final
 * del mensaje, y el «: expected 324 to be greater than 400» que vitest
 * pega detrás acababa dentro del arreglo.
 */
export function trocear(mensaje = "") {
  const bloques = [];
  const re = /✗ ([^\n]+)\n\s*dónde:\s*([^\n]*)\n\s*porqué:\s*([^\n]*)\n\s*arreglo:\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(mensaje))) {
    bloques.push({
      que: m[1].trim(),
      donde: m[2].trim(),
      porque: m[3].trim(),
      arreglo: m[4].trim(),
    });
  }
  return bloques;
}

/** La primera línea útil de un error que no usa el formato. */
function resumir(mensaje = "") {
  return mensaje.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "(sin mensaje)";
}

export default class InformeDespliegue {
  /**
   * API de reporter de Vitest 4:
   *   - `modulos` son TestModule; sus casos se recorren con
   *     `children.allTests()`, que baja por los describe anidados.
   *   - `test.result()` es una FUNCIÓN, no una propiedad, y el estado
   *     fallido se llama "failed".
   *
   * Los dos detalles importan: leídos como en la versión anterior, el
   * informe salía siempre vacío y decía «todo en verde» con la
   * ejecución en rojo. Un informe que miente es peor que no tenerlo, así
   * que `informe.test.js` comprueba justamente eso.
   */
  async onTestRunEnd(modulos = [], errores = []) {
    const fallidos = [];

    for (const modulo of modulos) {
      const casos = typeof modulo?.children?.allTests === "function"
        ? [...modulo.children.allTests()]
        : [];
      for (const caso of casos) {
        const resultado = typeof caso.result === "function" ? caso.result() : caso.result;
        if (resultado?.state !== "failed") continue;
        fallidos.push({
          archivo: modulo.moduleId ?? "",
          nombre: caso.fullName ?? caso.name ?? "(sin nombre)",
          errores: resultado.errors ?? [],
        });
      }
    }

    escribir(componer(fallidos, errores));
  }
}

/** Arma el texto del informe. Separado para poder probarlo. */
export function componer(fallidos = [], errores = []) {
    const lineas = [];
    lineas.push("# Informe de los tests de despliegue");
    lineas.push("");
    lineas.push(`Generado el ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`);
    lineas.push("");

    if (!fallidos.length && !errores.length) {
      lineas.push("Todo en verde. No hay nada que corregir.");
      return lineas.join("\n");
    }

    lineas.push(`## ${fallidos.length} ${fallidos.length === 1 ? "caso falla" : "casos fallan"}`);
    lineas.push("");
    lineas.push("Cada punto trae el arreglo. No hace falta volver a auditar el");
    lineas.push("repositorio: lo que hay que cambiar está escrito debajo.");
    lineas.push("");

    let n = 0;
    for (const f of fallidos) {
      n++;
      const rutaCorta = String(f.archivo).split("/").slice(-2).join("/");
      lineas.push(`### ${n}. ${f.nombre}`);
      lineas.push("");
      if (rutaCorta) {
        lineas.push(`Archivo del test: \`${rutaCorta}\``);
        lineas.push("");
      }

      const detalles = (f.errores ?? []).flatMap((e) => trocear(e?.message ?? ""));
      if (detalles.length) {
        for (const d of detalles) {
          lineas.push(`- **${d.que}**`);
          if (d.donde) lineas.push(`  - Dónde: \`${d.donde}\``);
          if (d.porque) lineas.push(`  - Por qué importa: ${d.porque}`);
          if (d.arreglo) lineas.push(`  - Arreglo: ${d.arreglo}`);
        }
      } else {
        for (const e of f.errores ?? []) {
          lineas.push(`- ${resumir(e?.message ?? "")}`);
        }
      }
      lineas.push("");
    }

    for (const e of errores) {
      lineas.push("### Error fuera de los casos");
      lineas.push("");
      lineas.push("```");
      lineas.push(String(e?.message ?? e).slice(0, 2000));
      lineas.push("```");
      lineas.push("");
    }

    lineas.push("---");
    lineas.push("");
    lineas.push("## Cómo reproducirlo");
    lineas.push("");
    lineas.push("```bash");
    lineas.push("npm run verificar   # lint + tests + build con variables + tests de bundle");
    lineas.push("```");
    lineas.push("");
    lineas.push("Los tests de infraestructura en vivo no entran ahí; necesitan llaves:");
    lineas.push("");
    lineas.push("```bash");
    lineas.push("SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run test:infra");
    lineas.push("```");

    return lineas.join("\n");
}

function escribir(texto) {
  try {
    mkdirSync(dirname(SALIDA), { recursive: true });
  } catch { /* la salida está en la raíz */ }
  writeFileSync(SALIDA, texto + "\n", "utf8");
}
