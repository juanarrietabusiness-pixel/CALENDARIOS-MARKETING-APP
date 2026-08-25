import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { buildMetaMasterPrompt, faltantesDeReceta, faltantesCriticos } from "./metaPrompt";

// ============================================================
// Las recetas reales de Agencia_Workspace, validadas contra lo que el
// ensamblador necesita.
//
// Es el test que faltaba. D'CASA estuvo tres rondas sin poder generar
// porque su sistema visual se deducía con un modelo y perdía campos
// distintos cada vez; nadie podía decir cuáles sin abrir la aplicación.
// Ahora la receta es un archivo, y un archivo se puede comprobar.
//
// El repositorio de la agencia es un checkout aparte, así que si no está
// presente los casos se saltan en vez de fallar: en CI no lo estará.
// ============================================================

const RAIZ = "/home/user/Agencia_Workspace";
const CLIENTES = ["Dcasa", "Juancito Ads", "Baby Caleb", "Feria del lente"];

function leerReceta(cliente) {
  const ruta = `${RAIZ}/${cliente}/01_ADN_y_Memoria/05_receta.json`;
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8"));
}

const hayWorkspace = existsSync(RAIZ);

describe.skipIf(!hayWorkspace)("las recetas publicadas", () => {
  for (const cliente of CLIENTES) {
    describe(cliente, () => {
      const receta = leerReceta(cliente);

      it("existe y es JSON válido", () => {
        expect(receta, `falta ${cliente}/01_ADN_y_Memoria/05_receta.json`).not.toBeNull();
      });

      it("no le falta ningún dato imprescindible", () => {
        // Éste es el test que habría ahorrado tres rondas: si a un cliente
        // le falta la URL de las fuentes o la escala, salta aquí y no en
        // una captura de pantalla.
        const criticos = faltantesCriticos(receta).map((f) => f.que);
        expect(criticos, `a ${cliente} le falta: ${criticos.join(", ")}`).toEqual([]);
      });

      it("trae la URL de Google Fonts completa, con sus pesos", () => {
        expect(receta.fuentes.url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
        expect(receta.fuentes.url).toContain("display=swap");
        // Cada familia declarada tiene que estar en la URL: una URL a medias
        // carga la mitad de las fuentes y el navegador cae a la del sistema.
        for (const f of receta.fuentes.familias) {
          expect(receta.fuentes.url).toContain(f.nombre.replace(/ /g, "+"));
        }
      });

      it("declara el lienzo del estándar de la agencia", () => {
        expect(receta.lienzo).toEqual({ ancho: 1080, alto: 1350 });
      });

      it("da un tamaño y un rol a cada fila de la escala", () => {
        expect(receta.escala.length).toBeGreaterThan(3);
        for (const fila of receta.escala) {
          expect(fila.elemento, `${cliente}: fila sin rol`).toBeTruthy();
          expect(fila.px, `${cliente}: «${fila.elemento}» sin tamaño`).toBeGreaterThan(0);
        }
      });

      it("usa sólo familias que declara, y ninguna prohibida", () => {
        const declaradas = receta.fuentes.familias.map((f) => f.nombre);
        for (const fila of receta.escala) {
          if (!fila.familia) continue;
          expect(declaradas, `${cliente}: «${fila.elemento}» usa ${fila.familia}`).toContain(fila.familia);
        }
        for (const prohibida of receta.fuentesProhibidas || []) {
          expect(declaradas).not.toContain(prohibida);
        }
      });

      it("no deja un color de la paleta también en la lista de prohibidos", () => {
        const usados = receta.colores.map((c) => c.hex.toUpperCase());
        for (const p of receta.coloresProhibidos || []) {
          const hex = (p.hex || "").toUpperCase();
          if (!/^#[0-9A-F]{6}$/.test(hex)) continue; // los descritos en prosa no aplican
          // Un hex puede estar en las dos listas sólo si la prohibición es de
          // contexto: el ADN lo dice en el «porque».
          if (usados.includes(hex)) {
            expect(p.porque, `${cliente}: ${hex} está en las dos listas sin explicación`).toBeTruthy();
          }
        }
      });

      it("dice dónde va el logo sin decir cómo se dibuja", () => {
        expect(receta.logo).toBeTruthy();
        // Que el archivo aún no exista es válido: el documento trae el cuadro
        // de carga. Lo que no vale es no decir dónde se coloca.
        if (receta.logo.posicion) {
          expect(receta.logo.resguardo, `${cliente}: logo sin resguardo`).toBeTruthy();
        }
      });

      it("copia el bloque de estilo y los negativos como texto literal", () => {
        expect(receta.bloqueEstilo.length).toBeGreaterThan(100);
        expect(receta.negativos.length).toBeGreaterThan(100);
        // Los negativos son una lista separada por comas, no una frase.
        expect(receta.negativos.split(",").length).toBeGreaterThan(15);
      });

      it("prohíbe el texto y los logotipos dentro de la imagen generada", () => {
        // Es la regla del estándar §8 que más se escapa: si el modelo puede
        // escribir dentro del fondo, escribirá mal el español.
        for (const termino of ["texto", "letras", "logotipos"]) {
          expect(receta.negativos, `${cliente}: los negativos no prohíben «${termino}»`)
            .toContain(termino);
        }
      });

      it("arma un prompt maestro completo, sin huecos", () => {
        const piezas = [{
          n: 1,
          titular: ["UNA LÍNEA", "⟦Y EL ACENTO⟧"],
          promptFondo: "Fondo liso, sin letras dentro.",
          descripcion: "Un caption.",
          hashtags: "#uno #dos",
        }];
        const prompt = buildMetaMasterPrompt({ receta, piezas, modo: "lote" });

        for (const seccion of [
          "1 · QUÉ ERES Y QUÉ NO HACES",
          "2 · EL SISTEMA VISUAL",
          "3 · EL CONTRATO DEL HTML",
          "4 · EL BLOQUE DE ESTILO",
          "5 · LOS NEGATIVOS",
          "6 · LAS PIEZAS",
          "7 · ANTES DE DEVOLVER",
        ]) {
          expect(prompt, `${cliente}: falta la sección «${seccion}»`).toContain(seccion);
        }

        // Un «—» suelto en su propia línea es un campo que quedó vacío.
        const huecos = prompt.split("\n").filter((l) => l.trim() === "—");
        expect(huecos, `${cliente}: ${huecos.length} huecos en el prompt`).toEqual([]);

        expect(prompt).toContain(receta.fuentes.url);
        expect(prompt).toContain(receta.bloqueEstilo.split("\n")[0]);
        expect(prompt).toContain("No generes ningún logotipo");
      });
    });
  }

  it("ningún cliente reutiliza la paleta de otro", () => {
    // Regla 1 del orquestador: nunca se mezcla la identidad entre clientes,
    // aunque compartan nicho. Un copiar-pegar entre recetas saltaría aquí.
    const porCliente = CLIENTES.map((c) => ({
      cliente: c,
      hexes: new Set((leerReceta(c)?.colores || []).map((x) => x.hex.toUpperCase())),
    }));
    for (const a of porCliente) {
      for (const b of porCliente) {
        if (a.cliente >= b.cliente) continue;
        const comunes = [...a.hexes].filter((h) => b.hexes.has(h) && h !== "#FFFFFF" && h !== "#000000");
        expect(comunes, `${a.cliente} y ${b.cliente} comparten ${comunes.join(", ")}`).toEqual([]);
      }
    }
  });
});

describe("faltantesDeReceta", () => {
  it("marca como imprescindible lo que deja el prompt con huecos", () => {
    const criticos = faltantesCriticos({}).map((f) => f.que);
    expect(criticos).toContain("La URL de Google Fonts");
    expect(criticos).toContain("La escala tipográfica");
    expect(criticos).toContain("El bloque de estilo");
    expect(criticos).toContain("Los negativos");
  });

  it("no marca como imprescindible lo que sólo degrada la pieza", () => {
    const todos = faltantesDeReceta({});
    const marca = todos.find((f) => f.que === "El nombre de la marca");
    expect(marca.critico).toBe(false);
  });

  it("dice de qué archivo sale cada dato que falta", () => {
    for (const f of faltantesDeReceta({})) {
      expect(f.donde, `«${f.que}» no dice de dónde sale`).toBeTruthy();
    }
  });

  it("no reporta nada cuando la receta está completa", () => {
    const completa = {
      marca: "X",
      colores: [{ hex: "#000000", rol: "texto" }],
      fuentes: { url: "https://fonts.googleapis.com/css2?family=X", familias: [{ nombre: "X", rol: "todo" }] },
      reticula: { texto: "x=80" },
      escala: [{ elemento: "Titular", px: 100 }],
      bloqueEstilo: "Estilo.",
      negativos: "texto, letras",
      logo: { posicion: "abajo" },
    };
    expect(faltantesDeReceta(completa)).toEqual([]);
  });
});
