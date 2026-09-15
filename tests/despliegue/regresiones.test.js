import { describe, it, expect } from "vitest";
import { leer, fuentesNavegador, fuentesEdge, buscar } from "../utils/repo";
import { escapeHTML } from "../../src/utils.js";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// Las trampas conocidas
//
// Cada caso de este archivo corresponde a un fallo que ya ocurrió y que
// está documentado en CLAUDE.md. Todos comparten la misma forma: no
// rompen nada visible, no dan error, y se descubren tarde —en una
// captura de pantalla del cliente, o en una zona horaria distinta a la
// de quien programó—.
//
// Documentarlos no impidió que volvieran. Esto sí.
// ============================================================

const NAVEGADOR = fuentesNavegador();
const EDGE = fuentesEdge();

describe("fechas", () => {
  it("nadie usa toISOString() para obtener una fecha", () => {
    // toISOString convierte a UTC: al este de Greenwich la medianoche
    // local cae en el día anterior y el calendario entero se desplaza.
    // Marcar un instante (updated_at, completed_at) sí es correcto.
    const hits = buscar(NAVEGADOR, /toISOString\(\)/).filter(
      (h) => !/new Date\(\)\.toISOString\(\)/.test(h.texto),
    );
    const lista = hits.map((h) => fallo({
      que: "se obtiene una fecha con toISOString()",
      donde: `${h.archivo}:${h.linea} → ${h.texto}`,
      porque: "Convierte a UTC: en cualquier zona al este de Greenwich la medianoche local cae en el día anterior y el calendario entero se desplaza un día.",
      arreglo: "Usa fmtDate() de utils.js, que compone la fecha con getFullYear/getMonth/getDate locales.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("fmtDate no pasa por UTC", () => {
    const utils = leer("src/utils.js");
    const cuerpo = utils.match(/export const fmtDate[\s\S]*?;\n/)?.[0] ?? "";
    expect(cuerpo, "fmtDate está usando toISOString").not.toMatch(/toISOString/);
    expect(cuerpo).toMatch(/getFullYear\(\)/);
    expect(cuerpo).toMatch(/getDate\(\)/);
  });
});

describe("estilos", () => {
  it("no se concatenan variables CSS con sufijos de opacidad", () => {
    // "var(--accent)" + "44" produce CSS inválido que el navegador
    // descarta en silencio: el color simplemente no se aplica.
    const hits = buscar(NAVEGADOR, /var\(--[\w-]+\)"\s*\+|\$\{[^}]*var\(--[\w-]+\)[^}]*\}[0-9a-fA-F]{2}/);
    const lista = hits.map((h) => fallo({
      que: "se concatena una variable CSS con un sufijo de opacidad",
      donde: `${h.archivo}:${h.linea} → ${h.texto}`,
      porque: "Produce CSS inválido («var(--accent)44»), que el navegador descarta sin avisar: el color no se aplica y no hay error en ninguna parte.",
      arreglo: "Usa los tokens ya definidos: --accent-soft, --accent-line, --alt-soft…",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("los tokens de opacidad que se usan existen en index.css", () => {
    const css = leer("src/index.css");
    const usados = new Set(
      buscar(NAVEGADOR, /var\(--[\w-]+-(soft|line)\)/)
        .flatMap((h) => [...h.texto.matchAll(/var\((--[\w-]+-(?:soft|line))\)/g)].map((m) => m[1])),
    );
    const sinDefinir = [...usados].filter((t) => !new RegExp(`${t}\\s*:`).test(css));
    expect(
      sinDefinir,
      fallo({
        que: `se usan tokens que no existen: ${sinDefinir.join(", ")}`,
        donde: "src/index.css",
        porque: "Una variable CSS no definida no da error: la propiedad se queda sin valor y el elemento se pinta sin ese color.",
        arreglo: "Defínelos en :root dentro de src/index.css.",
      }),
    ).toEqual([]);
  });

  it("ningún texto visible baja de --fs-3xs", () => {
    const hits = buscar(NAVEGADOR, /fontSize:\s*["'`](\d+)px/);
    const pequenos = hits.filter((h) => Number(h.texto.match(/fontSize:\s*["'`](\d+)px/)?.[1] ?? 99) < 11);
    expect(
      pequenos.map((h) => `${h.archivo}:${h.linea}`),
      fallo({
        que: "hay texto por debajo de 11px",
        donde: pequenos.map((h) => `${h.archivo}:${h.linea}`).join(", "),
        porque: "--fs-3xs (11px) es el suelo del sistema de diseño; por debajo deja de leerse en un móvil.",
        arreglo: 'Usa fontSize: "var(--fs-3xs)" o mayor.',
      }),
    ).toEqual([]);
  });

  it("la barra de completado del chip del mes conserva su sitio", () => {
    // .cal-post reserva 6px de padding inferior para la barra, que va
    // absoluta pegada al borde. La regla de móvil vuelve a declarar el
    // padding: si se resetea a "3px 2px", la barra se come el texto.
    const css = leer("src/index.css");
    const reglas = [...css.matchAll(/\.cal-post\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(reglas.length, "no se encuentra la regla .cal-post").toBeGreaterThan(0);

    const conPaddingCorto = reglas.filter((r) => {
      const p = r.match(/padding:\s*([^;]+);/)?.[1]?.trim();
      if (!p) return false;
      const valores = p.split(/\s+/);
      // El padding inferior es el 3.º en «a b c d» y el 1.º en «a b».
      const abajo = valores.length >= 3 ? valores[2] : valores[0];
      return /^(\d+)px$/.test(abajo) && Number(abajo.replace("px", "")) < 6;
    });
    expect(
      conPaddingCorto,
      fallo({
        que: "una regla de .cal-post deja menos de 6px de padding inferior",
        donde: "src/index.css → .cal-post",
        porque: "La barra de completado va absoluta pegada al borde de abajo: sin ese hueco reservado, se come el texto del chip.",
        arreglo: "Conserva al menos 6px de padding inferior también en la regla de móvil.",
      }),
    ).toEqual([]);
  });
});

describe("accesibilidad", () => {
  it("nada interactivo es un div con onClick", () => {
    // El fondo oscuro de un diálogo es la excepción legítima: no es un
    // control, es la superficie de descarte. Se admite sólo con
    // className="overlay", porque ese patrón viene acompañado de
    // useDialogA11y —Escape, foco atrapado— y de un botón de cerrar real.
    // Cualquier otro div pulsable sí es un control disfrazado.
    const hits = buscar(NAVEGADOR, /<(div|span)\b[^>]*\bonClick=/)
      .filter((h) => !/className="overlay"/.test(h.texto));
    const lista = hits.map((h) => fallo({
      que: "hay un elemento no interactivo con onClick",
      donde: `${h.archivo}:${h.linea}`,
      porque: "No recibe foco, no responde al teclado y el lector de pantalla no lo anuncia como pulsable: para quien no usa ratón, ese control no existe.",
      arreglo: "Usa <button type=\"button\">. Si estorba visualmente, quítale el estilo, no la semántica.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("los mensajes no se dan con alert() ni confirm()", () => {
    const hits = buscar(NAVEGADOR, /(?<![.\w])(alert|confirm)\s*\(/);
    const lista = hits.map((h) => fallo({
      que: `se usa ${h.texto.match(/(alert|confirm)/)[1]}()`,
      donde: `${h.archivo}:${h.linea}`,
      porque: "Bloquea la pestaña entera, no se puede estilar y en móvil aparece como un aviso del navegador ajeno a la aplicación.",
      arreglo: 'Escribe el mensaje en una región role="status" (o role="alert" si es un error).',
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("los diálogos usan el hook que atrapa el foco", () => {
    // role="dialog" sin foco atrapado deja tabular por detrás del modal.
    const conDialogo = NAVEGADOR.filter((f) => /role="dialog"/.test(leer(f.replace(/^.*\/src\//, "src/"))));
    const sinHook = conDialogo.filter((f) => {
      const texto = leer(f.replace(/^.*\/src\//, "src/"));
      return !/useDialogA11y/.test(texto);
    });
    const lista = sinHook.map((f) => fallo({
      que: "hay un diálogo sin useDialogA11y",
      donde: f.replace(/^.*\/src\//, "src/"),
      porque: "Sin el hook se puede tabular por detrás del modal, Escape no cierra y el fondo sigue haciendo scroll.",
      arreglo: "Llama a useDialogA11y en el componente del diálogo.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("el HTML exportado escapa lo que viene del usuario", () => {
    const exp = leer("src/export.js");
    expect(
      exp,
      fallo({
        que: "export.js no importa escapeHTML",
        donde: "src/export.js",
        porque: "El HTML exportado se abre como archivo local, fuera de la CSP del sitio: cualquier comilla suelta en una descripción rompe el documento, y cualquier etiqueta se ejecuta.",
        arreglo: 'Importa escapeHTML de utils.js y pásalo por todo texto del cliente.',
      }),
    ).toMatch(/escapeHTML/);
    // escapeHTML tiene que cubrir las cinco: sin la comilla simple, un
    // atributo delimitado con comillas simples se escapa de su contexto.
    // Se comprueba ejecutándola, no leyendo su texto: lo que importa es
    // lo que devuelve.
    const esperado = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    const faltan = Object.entries(esperado)
      .filter(([caracter, salida]) => escapeHTML(caracter) !== salida)
      .map(([caracter]) => caracter);
    expect(
      faltan,
      fallo({
        que: `escapeHTML no escapa: ${faltan.join(" ")}`,
        donde: "src/utils.js → escapeHTML",
        porque: "Sin la comilla simple, un valor dentro de un atributo delimitado con ' se sale de su contexto. El HTML exportado se abre fuera de la CSP del sitio, así que ahí sí se ejecuta.",
        arreglo: "Cubre los cinco caracteres: & < > \" '.",
      }),
    ).toEqual([]);
    expect(escapeHTML('<img src=x onerror="a">'), "escapeHTML deja pasar una etiqueta")
      .not.toMatch(/<img/);
  });
});

describe("la lectura de las respuestas del modelo", () => {
  it("ninguna función se queda con el primer bloque", () => {
    const hits = buscar(EDGE, /content\.find\(|\.content\[0\]\.text/);
    const lista = hits.map((h) => fallo({
      que: "se lee la respuesta del modelo tomando un solo bloque",
      donde: `${h.archivo}:${h.linea}`,
      porque: "Basta un bloque de pensamiento por delante para que devuelva undefined: el texto llega vacío, sin ningún error.",
      arreglo: "Filtra por type === 'text' y concatena todos los bloques.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});

describe("el guardado del panel lateral", () => {
  it("el panel guarda al desmontar, no al pulsar cerrar", () => {
    // El fondo oscuro y la tecla Escape llaman a onClose a secas: con el
    // guardado colgado del botón, todo lo editado se perdía sin decir nada.
    const vista = leer("src/components/CalendarView.jsx");
    expect(
      vista,
      fallo({
        que: "no hay guardado al desmontar el panel lateral",
        donde: "src/components/CalendarView.jsx",
        porque: "El fondo oscuro y Escape llaman a onClose directamente: si el guardado cuelga del botón, se pierde todo lo editado —y todo lo que acababa de generar la IA— sin un aviso.",
        arreglo: "Guarda en el cleanup del useEffect, y levanta `yaEscrito` en los botones que reescriben el calendario por su cuenta.",
      }),
    ).toMatch(/yaEscrito/);
  });
});

describe("el aislamiento de las aprobaciones en vivo", () => {
  it("lo que llega por Realtime no se vuelve a escribir en la base", () => {
    // Persistirlo dispararía una escritura por respuesta, y esa escritura
    // volvería como otro evento: un bucle.
    const app = leer("src/App.jsx");
    expect(
      app,
      fallo({
        que: "no existe la ruta local de actualización del calendario",
        donde: "src/App.jsx",
        porque: "Volcar en la base lo que llega por Realtime dispara una escritura por respuesta, y esa escritura vuelve como otro evento: un bucle.",
        arreglo: "Mantén onUpdateCalLocal, que toca sólo el estado. La tabla approvals es la fuente de verdad y se relee al cargar.",
      }),
    ).toMatch(/onUpdateCalLocal/);
  });

  it("la suscripción se da de baja", () => {
    const db = leer("src/lib/db.js");
    expect(
      db,
      fallo({
        que: "subscribeApprovals no devuelve función de baja",
        donde: "src/lib/db.js",
        porque: "Cambiar de calendario dejaría canales abiertos acumulándose hasta agotar el límite de conexiones.",
        arreglo: "Devuelve () => supabase.removeChannel(channel).",
      }),
    ).toMatch(/removeChannel/);
  });
});

describe("las reglas de los hooks", () => {
  it("App.jsx mantiene separados enrutado, puerta de acceso y estado", () => {
    // Llamar hooks después de un return condicional rompe la regla de los
    // hooks; oxlint lo marca como error, pero la separación es lo que
    // evita que alguien lo reintroduzca al añadir una pantalla.
    const app = leer("src/App.jsx");
    for (const componente of ["function App", "function Panel", "function Workspace"]) {
      expect(app, `App.jsx ya no declara ${componente}`).toContain(componente);
    }
  });
});
