import { describe, it, expect } from "vitest";
import { leer, buscar, fuentesNavegador } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// El apilado y las capas
//
// Dos fallos de la misma familia: nadie decide quién queda delante.
//
// Había seis `useState(false)` independientes para seis diálogos del
// calendario, renderizados como hermanos, y NADA cerraba uno al abrir
// otro: se podían apilar el banco de contenido y el diálogo de
// aprobación. Cuál ganaba lo decidía el orden en el DOM, porque los
// `z-index` estaban sin escalar y dos empataban en 50.
//
// Ninguna de las dos cosas da error. Se ven como «a veces la aplicación
// hace algo raro», que es el peor informe de fallo posible.
// ============================================================

const CSS = leer("src/index.css");
const NAVEGADOR = fuentesNavegador();

describe("el apilado se elige, no se inventa", () => {
  it("ningún z-index lleva un número suelto", () => {
    // Un número nuevo en una regla nueva compite con otro que nadie
    // recuerda. La escala está en :root y obliga a nombrar el nivel.
    const sueltos = [...CSS.matchAll(/z-index:\s*(\d+)/g)];
    const lista = sueltos.map((m) => fallo({
      que: `z-index con número suelto (${m[1]})`,
      donde: "src/index.css",
      porque: "Con dos valores iguales, quién queda delante lo decide el orden en el DOM, que no es una decisión de nadie. Ya pasó: .time-picker-drop y .tooltip empataban en 50.",
      arreglo: "Usa un nivel de la escala (--z-desplegable, --z-pista, --z-menu, --z-panel, --z-overlay, --z-salto). Si hace falta uno nuevo, decláralo en :root con su nombre y su destino.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("la escala existe y está ordenada", () => {
    const niveles = ["--z-desplegable", "--z-pista", "--z-menu", "--z-panel", "--z-overlay", "--z-salto"];
    const valores = niveles.map((n) => {
      const m = CSS.match(new RegExp(`${n}:\\s*(\\d+)`));
      return m ? Number(m[1]) : null;
    });
    expect(valores.every((v) => v !== null), `Faltan niveles: ${niveles.filter((_, i) => valores[i] === null).join(", ")}`).toBe(true);
    // Un diálogo modal tiene que tapar el panel lateral, y el enlace de
    // saltar al contenido tiene que estar por encima de todo.
    const ordenado = valores.every((v, i) => i === 0 || v > valores[i - 1]);
    expect(ordenado, `La escala no es creciente: ${valores.join(" < ")}`).toBe(true);
  });
});

describe("una sola capa por encima del calendario", () => {
  it("los diálogos del calendario no vuelven a ser banderas sueltas", () => {
    // La forma exacta que se quitó: `const [xOpen, setXOpen] = useState(false)`
    // para algo que se renderiza como `{xOpen && <Dialogo/>}`. Con una
    // sola, abrir es cerrar lo que hubiera, por construcción.
    const cal = leer("src/components/CalendarView.jsx");
    const prohibidas = ["bankOpen", "approvalModal", "editMeta", "metaPromptOpen", "promptExportOpen", "debugOpen"];
    const vivas = prohibidas.filter((n) => new RegExp(`const \\[${n},`).test(cal));
    const lista = vivas.map((n) => fallo({
      que: `«${n}» vuelve a ser una bandera independiente`,
      donde: "src/components/CalendarView.jsx",
      porque: "Con una bandera por diálogo, nada cierra uno al abrir otro: se apilan dos capas y el orden en el DOM decide cuál se ve.",
      arreglo: "Usa el estado `capa`: abrirCapa(\"nombre\") y cerrarCapa(). Añadir una capa es añadir un nombre, no una bandera más que alguien tendrá que acordarse de bajar.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("el calendario declara la capa y sus dos ayudas", () => {
    const cal = leer("src/components/CalendarView.jsx");
    for (const pieza of ["const [capa, setCapa]", "abrirCapa", "cerrarCapa"]) {
      expect(cal.includes(pieza), `Falta «${pieza}» en CalendarView.jsx`).toBe(true);
    }
  });
});

describe("el chip del mes es un control, y se toca", () => {
  it("no baja de --tap-sm", () => {
    // Es un botón, y arrastrable. Medía 24px: por debajo de los dos
    // mínimos que declara el propio sistema de diseño.
    const bloque = CSS.match(/\.cal-post \{[\s\S]*?\}/)?.[0] ?? "";
    const min = bloque.match(/min-height:\s*([^;]+);/)?.[1]?.trim();
    expect(min, "`.cal-post` no declara min-height").toBeTruthy();
    expect(
      /var\(--tap(-sm)?\)/.test(min),
      `\`.cal-post\` usa min-height: ${min}. Es un botón arrastrable: tiene que salir de la escala táctil (--tap-sm o --tap), no de un número.`,
    ).toBe(true);
  });

  it("en móvil la etiqueta no desaparece", () => {
    // Ocultarla dejaba un punto de color y un icono: en el teléfono no
    // había forma de saber qué era ninguna publicación sin abrirla.
    const movil = CSS.match(/@media \(max-width: 599px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    const oculta = /\.cal-post-label\s*\{[^}]*display:\s*none/.test(movil);
    expect(
      oculta,
      "La regla de móvil oculta .cal-post-label. Un chip sin texto no dice qué publicación es; recórtala a una línea en vez de esconderla.",
    ).toBe(false);
  });
});

describe("los estilos siguen saliendo del sistema", () => {
  it("nadie escribe un tamaño de fuente en píxeles crudos", () => {
    const hits = buscar(NAVEGADOR, /fontSize:\s*["']\d+/);
    const lista = hits.map((h) => fallo({
      que: "tamaño de fuente en píxeles, fuera de la escala",
      donde: `${h.archivo}:${h.linea} → ${h.texto}`,
      porque: "La escala tiene un suelo de 11px por legibilidad; un número suelto se la salta sin que nada avise.",
      arreglo: "Usa un token --fs-*.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});

describe("los hooks que se usan están importados", () => {
  it("ningún fichero llama a un hook que no ha importado de react", () => {
    // ESTO LLEGÓ A PRODUCCIÓN. Al meter `useCallback` en CalendarView no
    // se añadió al import, y oxlint no lo marca: el build compila, el
    // bundle se publica, y revienta al RENDERIZAR con
    // «useCallback is not defined». La página queda en blanco con el
    // título correcto en la pestaña, y sólo en la vista con sesión
    // —así que abrirla sin entrar no lo reproduce—.
    const HOOKS = /\buse(State|Effect|Ref|Callback|Memo|Id|Reducer|LayoutEffect|ImperativeHandle|Transition|DeferredValue|SyncExternalStore)\b/g;
    const lista = [];

    for (const ruta of NAVEGADOR) {
      const rel = ruta.replace(/^.*\/src\//, "src/");
      const texto = leer(rel);
      // Sin comentarios: `rutas.js` NOMBRA useState al explicar por qué
      // la dirección ya no es estado, y eso no es una llamada.
      const codigo = texto
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const linea = texto.match(/^import \{([^}]*)\} from "react";/m);
      const importados = new Set((linea?.[1] ?? "").split(",").map((s) => s.trim()));
      // Lo que declara el propio fichero (hooks propios) no cuenta.
      const propios = new Set([...codigo.matchAll(/(?:function|const)\s+(use[A-Z]\w*)/g)].map((m) => m[1]));

      // Sólo cuentan las LLAMADAS: `useState(` y no la palabra suelta.
      const usados = new Set(
        [...codigo.matchAll(new RegExp(HOOKS.source + "\\s*\\(", "g"))].map((m) => m[0].replace(/\s*\($/, "")),
      );
      for (const h of usados) {
        if (importados.has(h) || propios.has(h)) continue;
        lista.push(fallo({
          que: `«${h}» se usa sin importarlo de react`,
          donde: rel,
          porque: "oxlint no lo marca y el build compila. Falla al RENDERIZAR, con la página en blanco y el título correcto: el síntoma no apunta a un import.",
          arreglo: `Añade ${h} al import de react de ese fichero.`,
        }));
      }
    }
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});
