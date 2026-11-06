import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  aSlug, slugsUnicos, slugsDeClientes, slugsDeCalendarios,
  porRuta, analizarRuta, construirRuta, rutaDeOtroCliente,
  PESTANAS_DEL_CLIENTE, SECCIONES_DEL_CLIENTE, PESTANAS_VIEJAS, PESTANAS_CLIENTE, pestanaYSeccion,
} from "./rutas.js";

// ============================================================
// Las direcciones
//
// Lo que se comprueba aquí no es que el router «funcione», es que
// `analizarRuta` y `construirRuta` sean INVERSAS. Si se separan, el
// síntoma es de los que no se ven: navegas, la barra de direcciones
// cambia, la pantalla también… y al recargar apareces en otro sitio.
// ============================================================

describe("aSlug", () => {
  it("quita tildes, mayúsculas y signos", () => {
    expect(aSlug("Café Luna")).toBe("cafe-luna");
    expect(aSlug("¡Ñandú 2026!")).toBe("nandu-2026");
    expect(aSlug("Baby Caleb")).toBe("baby-caleb");
  });

  it("no deja guiones sueltos en los extremos", () => {
    expect(aSlug("  ¿Hola?  ")).toBe("hola");
    expect(aSlug("---x---")).toBe("x");
  });

  it("de un nombre entero de espacios y signos no queda nada", () => {
    // Quien lo llama tiene que poner un respaldo; por eso `slugsUnicos`
    // lo hace y esto documenta que devolver "" es lo esperado.
    expect(aSlug("   ")).toBe("");
    expect(aSlug("¿¡!?")).toBe("");
  });

  it("un nombre de espacios NO se convierte en %20", () => {
    // La ficha del ADN de un cliente guardaba la carpeta escapada
    // —«Baby%20Caleb/…»—, no casaba con ninguna del árbol de GitHub y la
    // lectura volvía vacía sólo para los clientes con espacio en el
    // nombre. Un slug no tiene espacios que escapar.
    expect(aSlug("Baby Caleb")).not.toContain("%20");
    expect(aSlug("Baby Caleb")).not.toContain(" ");
  });
});

describe("slugs únicos", () => {
  it("dos nombres que normalizan igual no comparten dirección", () => {
    const m = slugsUnicos([
      { id: "aaaaaaaa-1", name: "Café Luna" },
      { id: "bbbbbbbb-2", name: "Cafe Luna" },
    ]);
    expect(m.get("aaaaaaaa-1")).toBe("cafe-luna");
    expect(m.get("bbbbbbbb-2")).not.toBe("cafe-luna");
    expect(new Set([...m.values()]).size).toBe(2);
  });

  it("el primero se queda el slug limpio, y no cambia porque llegue otro", () => {
    const uno = slugsDeClientes([{ id: "a", name: "Luna" }]);
    const dos = slugsDeClientes([{ id: "a", name: "Luna" }, { id: "b", name: "Luna" }]);
    expect(uno.get("a")).toBe("luna");
    expect(dos.get("a")).toBe("luna");
  });

  it("un nombre vacío cae en el respaldo, y sigue siendo único", () => {
    const m = slugsDeCalendarios([{ id: "c1", name: "" }, { id: "c2", name: "  " }]);
    expect(m.get("c1")).toBe("calendario");
    expect(m.get("c2")).not.toBe("calendario");
    expect(new Set([...m.values()]).size).toBe(2);
  });

  it("se salta lo que no tiene id en vez de meter undefined en el mapa", () => {
    const m = slugsUnicos([{ name: "Sin id" }, { id: "x", name: "Con id" }]);
    expect(m.size).toBe(1);
    expect(m.get("x")).toBe("con-id");
  });
});

describe("porRuta", () => {
  const clientes = [{ id: "id-1", name: "Baby Caleb" }, { id: "id-2", name: "Otro" }];
  const slugs = slugsDeClientes(clientes);

  it("resuelve por slug", () => {
    expect(porRuta(clientes, slugs, "baby-caleb")?.id).toBe("id-1");
  });

  it("y también por id en crudo, para los enlaces viejos", () => {
    expect(porRuta(clientes, slugs, "id-2")?.id).toBe("id-2");
  });

  it("devuelve null si no hay nada que case", () => {
    expect(porRuta(clientes, slugs, "no-existe")).toBeNull();
    expect(porRuta(clientes, slugs, "")).toBeNull();
  });
});

describe("analizar y construir son inversas", () => {
  const url = (pathname, hash = "") => ({ pathname, hash });

  it("la raíz es el panel sin nada seleccionado", () => {
    expect(analizarRuta(url("/"))).toEqual({ vista: "panel", cliente: null, calendario: null, pestana: "calendario", seccion: null });
  });

  it("un cliente", () => {
    expect(analizarRuta(url("/cliente/baby-caleb"))).toEqual({
      vista: "panel", cliente: "baby-caleb", calendario: null, pestana: "calendario", seccion: null,
    });
  });

  it("un cliente y un calendario", () => {
    expect(analizarRuta(url("/cliente/baby-caleb/agosto-2026"))).toEqual({
      vista: "panel", cliente: "baby-caleb", calendario: "agosto-2026", pestana: "calendario", seccion: null,
    });
  });

  it("las pestañas del cliente van donde iría el mes, y no son un mes", () => {
    for (const pestana of ["crear", "referencias", "marca", "resultados", "tareas"]) {
      const r = analizarRuta(url(`/cliente/baby-caleb/${pestana}`));
      expect(r).toEqual({ vista: "panel", cliente: "baby-caleb", calendario: null, pestana, seccion: null });
      expect(construirRuta(r)).toBe(`/cliente/baby-caleb/${pestana}`);
    }
  });

  it("son cinco, con el calendario primero", () => {
    expect(PESTANAS_DEL_CLIENTE.map(([id]) => id)).toEqual(["calendario", "crear", "referencias", "marca", "resultados"]);
  });

  it("cada sub-sección tiene su dirección y se vuelve a leer igual", () => {
    for (const [pestana, secciones] of Object.entries(SECCIONES_DEL_CLIENTE)) {
      for (const seccion of secciones) {
        const r = analizarRuta(url(`/cliente/dcasa/${pestana}/${seccion}`));
        expect(r).toEqual({ vista: "panel", cliente: "dcasa", calendario: null, pestana, seccion });
        expect(construirRuta(r)).toBe(`/cliente/dcasa/${pestana}/${seccion}`);
      }
    }
  });

  it("Marca → «Música y efectos» (la biblioteca de sonido) tiene su dirección", () => {
    expect(analizarRuta(url("/cliente/dcasa/marca/sonido"))).toMatchObject({ pestana: "marca", seccion: "sonido" });
    expect(construirRuta({ cliente: "dcasa", pestana: "marca", seccion: "sonido" })).toBe("/cliente/dcasa/marca/sonido");
  });

  it("una sub-sección que no existe abre la pestaña en la de entrada", () => {
    expect(analizarRuta(url("/cliente/dcasa/marca/no-existe"))).toMatchObject({ pestana: "marca", seccion: null });
    expect(pestanaYSeccion("resultados", "kit")).toEqual({ pestana: "resultados", seccion: null });
  });

  it("las direcciones de antes abren la pestaña nueva en su sub-sección (no una página vacía)", () => {
    const esperado = {
      estudio: ["crear", "galeria"], diseno: ["crear", "director"],
      ideas: ["referencias", "ideas"], inspiracion: ["referencias", "inspiracion"],
      cerebro: ["marca", "cerebro"], ficha: ["marca", "ficha"], contenido: ["marca", "drive"],
    };
    expect(PESTANAS_VIEJAS).toEqual(esperado);
    for (const [vieja, [pestana, seccion]] of Object.entries(esperado)) {
      expect(analizarRuta(url(`/cliente/baby-caleb/${vieja}`))).toEqual({ vista: "panel", cliente: "baby-caleb", calendario: null, pestana, seccion });
      // Construir con el nombre de antes da la dirección nueva (lo pide quien aún no se cambió).
      expect(construirRuta({ cliente: "baby-caleb", pestana: vieja })).toBe(`/cliente/baby-caleb/${pestana}/${seccion}`);
    }
  });

  it("los nombres nuevos y los de antes quedan reservados para los calendarios", () => {
    for (const n of ["crear", "referencias", "marca", "resultados", "tareas", "estudio", "diseno", "ideas", "inspiracion", "cerebro", "ficha", "contenido"]) {
      expect(PESTANAS_CLIENTE).toContain(n);
    }
    const slugs = slugsDeCalendarios([{ id: "abcdef123", name: "Marca" }, { id: "b2", name: "Crear" }]);
    expect(slugs.get("abcdef123")).not.toBe("marca");
    expect(slugs.get("b2")).not.toBe("crear");
  });

  it("Ajustes tiene su dirección", () => {
    expect(analizarRuta(url("/ajustes"))).toEqual({ vista: "ajustes" });
    expect(construirRuta({ vista: "ajustes" })).toBe("/ajustes");
    expect(analizarRuta(url("/produccion"))).toEqual({ vista: "programacion" });
    expect(construirRuta({ vista: "programacion" })).toBe("/produccion");
    expect(analizarRuta(url("/programacion")), "su nombre de antes sigue abriendo Producción").toEqual({ vista: "programacion" });
    expect(analizarRuta(url("/auditorias"))).toEqual({ vista: "auditorias" });
    expect(construirRuta({ vista: "auditorias" })).toBe("/auditorias");
    expect(analizarRuta(url("/tablero")), "el tablero se quitó: un enlace viejo va a Producción").toEqual({ vista: "programacion" });
    expect(analizarRuta(url("/bandeja"))).toEqual({ vista: "bandeja" });
    expect(construirRuta({ vista: "bandeja" })).toBe("/bandeja");
    expect(analizarRuta(url("/biblioteca"))).toEqual({ vista: "biblioteca" });
    expect(construirRuta({ vista: "biblioteca" })).toBe("/biblioteca");
    expect(analizarRuta(url("/campanas"))).toEqual({ vista: "campanas" });
    expect(construirRuta({ vista: "campanas" })).toBe("/campanas");
    // Anuncios → Plan de campañas, con su dirección (el cliente y el mes van detrás: ?cliente=&mes=).
    expect(analizarRuta(url("/plan-campanas"))).toEqual({ vista: "plan-campanas" });
    expect(construirRuta({ vista: "plan-campanas" })).toBe("/plan-campanas");
    expect(analizarRuta(url("/auditoria"))).toEqual({ vista: "auditoria" });
    expect(analizarRuta(url("/conectar-claude"))).toEqual({ vista: "conectar-claude" });
    expect(analizarRuta(url("/a-mano/cal-1/p9"))).toEqual({ vista: "a-mano", calendario: "cal-1", publicacion: "p9" });
    expect(construirRuta({ vista: "a-mano", calendario: "cal-1", publicacion: "p9" })).toBe("/a-mano/cal-1/p9");
  });

  it("un calendario llamado como una pestaña no se queda su dirección", () => {
    // Si «Ideas» se quedara «ideas», abrir ese mes abriría la pestaña.
    const slugs = slugsDeCalendarios([{ id: "abcdef123", name: "Ideas" }, { id: "x2", name: "Agosto 2026" }]);
    expect(slugs.get("abcdef123")).toBe("ideas-abcdef");
    expect(slugs.get("x2")).toBe("agosto-2026");
  });

  it("el equipo y la invitación", () => {
    expect(analizarRuta(url("/equipo")).vista).toBe("equipo");
    expect(analizarRuta(url("/invitacion/abc123"))).toEqual({ vista: "invitacion", testigo: "abc123" });
  });

  it("la página de aprobación, por ruta y por hash", () => {
    // El hash es la forma vieja. Hay enlaces ya enviados con ella y el
    // cliente final no va a volver a pedirlos.
    expect(analizarRuta(url("/aprobar")).vista).toBe("aprobar");
    expect(analizarRuta(url("/", "#/aprobar?t=xyz")).vista).toBe("aprobar");
  });

  it("todo lo que se construye se vuelve a leer igual", () => {
    const casos = [
      { vista: "panel", cliente: null, calendario: null },
      { vista: "panel", cliente: "baby-caleb", calendario: null },
      { vista: "panel", cliente: "baby-caleb", calendario: "agosto-2026" },
      { vista: "equipo" },
      { vista: "invitacion", testigo: "un-testigo" },
    ];
    for (const caso of casos) {
      const leido = analizarRuta(url(construirRuta(caso)));
      expect(leido.vista).toBe(caso.vista);
      if (caso.vista === "panel") {
        expect(leido.cliente).toBe(caso.cliente);
        expect(leido.calendario).toBe(caso.calendario);
      }
      if (caso.vista === "invitacion") expect(leido.testigo).toBe(caso.testigo);
    }
  });
});

describe("cambiar de cliente", () => {
  const en = (pathname) => analizarRuta({ pathname, hash: "" });
  it("se queda en la misma pestaña", () => {
    for (const p of ["resultados", "crear", "referencias", "marca", "tareas"]) {
      expect(rutaDeOtroCliente(en(`/cliente/dcasa/${p}`), "baby-caleb")).toBe(`/cliente/baby-caleb/${p}`);
    }
  });
  it("y en la misma sub-sección", () => {
    expect(rutaDeOtroCliente(en("/cliente/dcasa/marca/kit"), "baby-caleb")).toBe("/cliente/baby-caleb/marca/kit");
    expect(rutaDeOtroCliente(en("/cliente/dcasa/referencias/competencia"), "baby-caleb")).toBe("/cliente/baby-caleb/referencias/competencia");
  });
  it("desde una dirección de antes, a lo mismo en la nueva", () => {
    expect(rutaDeOtroCliente(en("/cliente/dcasa/estudio"), "baby-caleb")).toBe("/cliente/baby-caleb/crear/galeria");
    expect(rutaDeOtroCliente(en("/cliente/dcasa/cerebro"), "baby-caleb")).toBe("/cliente/baby-caleb/marca/cerebro");
  });
  it("en el calendario, el mismo mes", () => {
    expect(rutaDeOtroCliente(en("/cliente/dcasa/octubre-2026"), "baby-caleb")).toBe("/cliente/baby-caleb/octubre-2026");
    expect(rutaDeOtroCliente(en("/cliente/dcasa"), "baby-caleb")).toBe("/cliente/baby-caleb");
  });
  it("un enlace viejo por nombre, o fuera de un cliente: al calendario de hoy", () => {
    expect(rutaDeOtroCliente(en("/cliente/dcasa/campana-de-obra"), "baby-caleb")).toBe("/cliente/baby-caleb");
    expect(rutaDeOtroCliente(en("/tareas"), "baby-caleb")).toBe("/cliente/baby-caleb");
    expect(rutaDeOtroCliente(en("/"), "baby-caleb")).toBe("/cliente/baby-caleb");
  });
});

describe("navegar", () => {
  let original;

  beforeEach(async () => {
    original = globalThis.window;
    const eventos = [];
    globalThis.window = {
      location: { pathname: "/", search: "", hash: "" },
      history: {
        pushState: (_e, _t, destino) => { globalThis.window.location.pathname = destino; eventos.push(["push", destino]); },
        replaceState: (_e, _t, destino) => { globalThis.window.location.pathname = destino; eventos.push(["replace", destino]); },
      },
      dispatchEvent: () => true,
      eventos,
    };
    globalThis.PopStateEvent = class { constructor(t) { this.type = t; } };
  });

  afterEach(() => { globalThis.window = original; });

  it("no mete en el historial la dirección en la que ya se está", async () => {
    const { navegar } = await import("./rutas.js");
    navegar("/");
    expect(globalThis.window.eventos).toEqual([]);
  });

  it("reemplazar no apila: corregir la dirección no es navegar", async () => {
    const { navegar } = await import("./rutas.js");
    navegar("/cliente/x", { reemplazar: true });
    expect(globalThis.window.eventos).toEqual([["replace", "/cliente/x"]]);
  });
});
