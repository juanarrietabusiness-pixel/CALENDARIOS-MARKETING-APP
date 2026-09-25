import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  aSlug, slugsUnicos, slugsDeClientes, slugsDeCalendarios,
  porRuta, analizarRuta, construirRuta,
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
    expect(analizarRuta(url("/"))).toEqual({ vista: "panel", cliente: null, calendario: null, pestana: "calendario" });
  });

  it("un cliente", () => {
    expect(analizarRuta(url("/cliente/baby-caleb"))).toEqual({
      vista: "panel", cliente: "baby-caleb", calendario: null, pestana: "calendario",
    });
  });

  it("un cliente y un calendario", () => {
    expect(analizarRuta(url("/cliente/baby-caleb/agosto-2026"))).toEqual({
      vista: "panel", cliente: "baby-caleb", calendario: "agosto-2026", pestana: "calendario",
    });
  });

  it("las pestañas del cliente van donde iría el mes, y no son un mes", () => {
    for (const pestana of ["tareas", "contenido", "ideas", "ficha"]) {
      const r = analizarRuta(url(`/cliente/baby-caleb/${pestana}`));
      expect(r).toEqual({ vista: "panel", cliente: "baby-caleb", calendario: null, pestana });
      expect(construirRuta(r)).toBe(`/cliente/baby-caleb/${pestana}`);
    }
  });

  it("Ajustes tiene su dirección", () => {
    expect(analizarRuta(url("/ajustes"))).toEqual({ vista: "ajustes" });
    expect(construirRuta({ vista: "ajustes" })).toBe("/ajustes");
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
