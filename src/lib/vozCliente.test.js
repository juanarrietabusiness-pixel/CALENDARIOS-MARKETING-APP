import { describe, it, expect } from "vitest";
import {
  limpiarRespuestaVoz, respuestaDeFila, resumenVoz, respuestaATexto, enlaceDeVoz, mensajeVoz, mensajeAlCliente, PREGUNTAS_VOZ, MAX_RESPUESTA_VOZ,
} from "./vozCliente.js";
import { pedidoVozAlEstudio, leerPropuestaVoz, limpiarPropuestaVoz, aplicarPropuestaVoz, propuestaVacia } from "./vozAlEstudio.js";

// ============================================================
// La voz del cliente (curso de campañas, entrega 8): la encuesta por enlace y «Llevar al estudio». Lo que importa: una
// sola obligatoria, el testimonio sólo con permiso Y nombre, y que la IA no se invente un testimonio.
// ============================================================

const PRODUCTOS = [{ id: "sofa", nombre: "Sofá cama" }, { id: "mesa", nombre: "Mesa" }];
const FILAS = [
  { id: "r1", respuestas: JSON.stringify({ porque: "Me lo armaron el mismo día", sorpresa: "Lo rápido que llegó, en serio" }), nombre: "Ana", permiso: 1, producto: "sofa", recomienda: "si", created_at: "2026-11-01T10:00:00Z" },
  { id: "r2", respuestas: JSON.stringify({ porque: "Precio", freno: "No sabía si cabía" }), nombre: "", permiso: 0, producto: "", recomienda: "tal-vez", created_at: "2026-11-02T10:00:00Z", llevada_at: "2026-11-03T10:00:00Z" },
  { id: "r3", respuestas: JSON.stringify({ porque: "Me lo recomendaron" }), nombre: "Luis", permiso: 0, producto: "mesa", recomienda: "no", created_at: "2026-11-02T11:00:00Z" },
];
const ESTUDIO = {
  general: null,
  productos: {
    sofa: {
      elementos: { publico: "Familias", problema: "Poco espacio en casa", solucion: "Se abre en cama", diferenciales: "Armado gratis", testimonios: "" },
      objeciones: [{ objecion: "Es caro", respuesta: "Dura años" }],
    },
  },
  aprobadoAt: "2026-10-01T00:00:00Z",
};

describe("lo que manda quien responde", () => {
  it("sólo «por qué nos escogiste» es obligatoria", () => {
    expect(limpiarRespuestaVoz({ respuestas: { problema: "x" } }).error).toMatch(/por qué nos escogiste/);
    const { fila, error } = limpiarRespuestaVoz({ respuestas: { porque: "  Por el trato  ", nada: "x" } });
    expect(error).toBe("");
    expect(fila).toEqual({ respuestas: { porque: "Por el trato" }, nombre: "", permiso: false, producto: "", recomienda: "" });
    expect(PREGUNTAS_VOZ.filter((p) => p.obligatoria).map((p) => p.id)).toEqual(["porque"]);
  });

  it("el testimonio necesita el nombre", () => {
    expect(limpiarRespuestaVoz({ respuestas: { porque: "x" }, permiso: true }).error).toMatch(/escribe tu nombre/);
    expect(limpiarRespuestaVoz({ respuestas: { porque: "x" }, permiso: true, nombre: "Ana" }).fila).toMatchObject({ permiso: true, nombre: "Ana" });
    // Sólo el booleano cuenta como permiso.
    expect(limpiarRespuestaVoz({ respuestas: { porque: "x" }, permiso: "true", nombre: "Ana" }).fila.permiso).toBe(false);
  });

  it("recorta lo largo, y sólo acepta productos y recomendaciones que existen", () => {
    const { fila } = limpiarRespuestaVoz({ respuestas: { porque: "a".repeat(900) }, producto: "inventado", recomienda: "quizas" }, { productos: PRODUCTOS });
    expect(fila.respuestas.porque).toHaveLength(MAX_RESPUESTA_VOZ);
    expect(fila.producto).toBe("");
    expect(fila.recomienda).toBe("");
    expect(limpiarRespuestaVoz({ respuestas: { porque: "x" }, producto: "mesa", recomienda: "si" }, { productos: PRODUCTOS }).fila).toMatchObject({ producto: "mesa", recomienda: "si" });
  });

  it("el campo trampa lleno es un robot: no hay fila ni error", () => {
    expect(limpiarRespuestaVoz({ respuestas: { porque: "x" }, sitio: "http://spam" })).toEqual({ fila: null, error: "", spam: true });
  });
});

describe("lo que ve la agencia", () => {
  it("la fila de D1 (0/1 y JSON en texto) se lee", () => {
    expect(respuestaDeFila(FILAS[0])).toMatchObject({ id: "r1", permiso: true, producto: "sofa", llevadaAt: null, respuestas: { porque: "Me lo armaron el mismo día" } });
  });

  it("el resumen", () => {
    expect(resumenVoz(FILAS)).toEqual({ total: 3, conPermiso: 1, sinLlevar: 2, recomiendan: { si: 1, "tal-vez": 1, no: 1 } });
  });

  it("una respuesta en texto", () => {
    expect(respuestaATexto(FILAS[1])).toBe("Por qué nos escogió: Precio\nLo que casi lo frena: No sabía si cabía\n¿Nos recomienda?: Tal vez");
  });

  it("el enlace y los mensajes", () => {
    expect(enlaceDeVoz("https://calendarios.test/", "abc")).toBe("https://calendarios.test/voz?t=abc");
    expect(enlaceDeVoz("x", "")).toBe("");
    expect(mensajeVoz({ marca: "Dcasa", enlace: "https://e" })).toContain("En Dcasa queremos");
    const m = mensajeAlCliente({ marca: "Dcasa", enlace: "https://e" });
    expect(m).toMatch(/5 o 10 clientes/);
    expect(m).toContain("https://e");
  });
});

describe("«Llevar al estudio»", () => {
  const productosEstudio = [{ id: "sofa", nombre: "Sofá cama", maletas: ESTUDIO.productos.sofa.elementos, objeciones: ESTUDIO.productos.sofa.objeciones }];

  it("el pedido marca quién puede ser testimonio y lo que ya dice el estudio", () => {
    const t = pedidoVozAlEstudio({ marca: "Dcasa", respuestas: FILAS, productos: productosEstudio });
    expect(t).toContain("[r1] PUEDE SER TESTIMONIO (Ana) · compró: Sofá cama");
    expect(t).not.toContain("[r3] PUEDE SER");
    expect(t).toContain("Problema: Poco espacio en casa");
    expect(t).toContain("Objeción ya respondida: Es caro");
  });

  it("la propuesta se comprueba: productos que existen, testimonios sólo con permiso y con SUS palabras", () => {
    const respuesta = JSON.stringify({
      productos: [
        {
          productoId: "sofa",
          problema: ["No sabía si cabía", "No sabía si cabía"],
          diferenciales: ["Lo arman el mismo día"],
          objeciones: [{ objecion: "¿Cabe?", respuesta: "Mide 1,80 m" }, { objecion: "¿cabe?", respuesta: "repetida" }],
          testimonios: [
            { respuestaId: "r1", cita: "Lo rápido que llegó" },
            { respuestaId: "r3", cita: "Me lo recomendaron" },
            { respuestaId: "r9", cita: "Inventado" },
          ],
        },
        { productoId: "otro", problema: ["x"] },
      ],
      resumen: "Lo rápido.",
    });
    const p = leerPropuestaVoz(respuesta, { respuestas: FILAS, productos: productosEstudio });
    expect(p.productos).toHaveLength(1);
    const [s] = p.productos;
    expect(s.problema).toEqual(["No sabía si cabía"]);
    expect(s.objeciones).toEqual([{ objecion: "¿Cabe?", respuesta: "Mide 1,80 m" }]);
    expect(s.testimonios).toEqual([{ respuestaId: "r1", nombre: "Ana", cita: "Lo rápido que llegó" }]);
  });

  it("una cita reescrita por la IA se cambia por lo que escribió la persona", () => {
    const p = limpiarPropuestaVoz({ productos: [{ productoId: "sofa", testimonios: [{ respuestaId: "r1", cita: "El mejor servicio del país" }] }] }, { respuestas: FILAS, productos: productosEstudio });
    expect(p.productos[0].testimonios[0].cita).toBe("Lo rápido que llegó, en serio");
    expect(propuestaVacia({ productos: [] })).toBe(true);
    expect(leerPropuestaVoz("nada", {})).toBeNull();
  });

  it("aplicar: detrás de lo que había, sin repetir, con el nombre del testimonio", () => {
    const propuesta = {
      productos: [{
        productoId: "sofa", problema: ["No sabía si cabía", "poco espacio en casa"], diferenciales: [],
        objeciones: [{ objecion: "¿Cabe?", respuesta: "Mide 1,80 m" }, { objecion: "es caro", respuesta: "x" }],
        testimonios: [{ respuestaId: "r1", nombre: "Ana", cita: "Lo rápido que llegó" }],
      }, { productoId: "mesa", problema: ["sin estudio"] }],
    };
    const { estudio, cambios } = aplicarPropuestaVoz(ESTUDIO, propuesta);
    const sofa = estudio.productos.sofa;
    expect(sofa.elementos.problema).toBe("Poco espacio en casa\nEn palabras de sus clientes: «No sabía si cabía»");
    expect(sofa.elementos.testimonios).toBe("«Lo rápido que llegó» — Ana");
    expect(sofa.objeciones.map((o) => o.objecion)).toEqual(["Es caro", "¿Cabe?"]);
    expect(cambios).toBe(3);
    expect(estudio.productos.mesa).toBeUndefined();
    // Otra vez lo mismo: nada nuevo.
    expect(aplicarPropuestaVoz(estudio, propuesta).cambios).toBe(0);
    expect(aplicarPropuestaVoz(null, propuesta)).toEqual({ estudio: null, cambios: 0 });
  });
});
