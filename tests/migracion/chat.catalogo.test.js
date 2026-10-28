import { describe, it, expect } from "vitest";
import { catalogoParaDisenar } from "../../worker/rutas/chat.js";

// ============================================================
// El catálogo que ve el asistente cuando diseña
//
// Sin él, el asistente no sabía qué productos había y, en los carruseles, se
// los inventaba con marca y todo. Ahora cada producto va con su id (lo que
// pasa en «productos» de disenar_piezas para que vayan sus fotos reales) y,
// sin catálogo, se le dice que PREGUNTE.
// ============================================================

describe("el catálogo en el sistema del asistente", () => {
  it("cada producto con su precio, su id y si tiene fotos; lo agotado no sale con el inventario encendido", () => {
    const mercado = {
      inventario: true,
      catalogo: [
        { id: "s", nombre: "Sofá cama", tipo: "producto", precio: "$399", activo: true, fotos: ["clientes/c1/s.png"] },
        { id: "m", nombre: "Mesa", tipo: "producto", precio: "$120", activo: true },
        { id: "x", nombre: "Silla", tipo: "producto", precio: "$40", activo: true, stock: "agotado" },
      ],
    };
    const t = catalogoParaDisenar(mercado, "Dcasa");
    expect(t).toMatch(/CATÁLOGO DE DCASA/);
    expect(t).toMatch(/Sofá cama[^\n]*\$399[^\n]*id: s · 1 foto real/);
    expect(t).toMatch(/Mesa[^\n]*id: m · sin fotos/);
    expect(t).not.toMatch(/Silla/);
    expect(t).toMatch(/PREGÚNTALE cuál/);
    expect(t).toMatch(/Nunca inventes un producto/);
  });

  it("sin catálogo, le dice que pregunte antes de enseñar un producto", () => {
    expect(catalogoParaDisenar(null, "Dcasa")).toMatch(/vacío\. Si una pieza tiene que enseñar un producto, PREGÚNTALE/);
  });
});
