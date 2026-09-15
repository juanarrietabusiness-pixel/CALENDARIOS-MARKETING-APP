import { describe, it, expect } from "vitest";
import { componer, trocear } from "./informe";
import { fallo } from "./fallo";

// ============================================================
// El informe tiene que decir la verdad
//
// La primera versión de este reporter leía la API de vitest como si
// fuera la de la versión anterior: `test.result` en vez de
// `test.result()`, y los casos colgando de `children` en vez de
// `children.allTests()`. El resultado es que no encontraba ningún fallo
// nunca, y escribía «Todo en verde» con la ejecución en rojo.
//
// Ese modo de fallar es el peor posible: el propio mecanismo que avisa
// de los problemas afirmando que no hay ninguno. Estos casos existen
// para que no vuelva a pasar en silencio.
// ============================================================

describe("trocear", () => {
  const mensaje = fallo({
    que: "la cabecera X-Frame-Options no vale «DENY»",
    donde: "netlify.toml → [[headers]]",
    porque: "Es la defensa que no se ve.",
    arreglo: 'Pon X-Frame-Options = "DENY".',
  });

  it("recupera los cuatro campos de un fallo", () => {
    const [b] = trocear(mensaje);
    expect(b.que).toBe("la cabecera X-Frame-Options no vale «DENY»");
    expect(b.donde).toBe("netlify.toml → [[headers]]");
    expect(b.porque).toBe("Es la defensa que no se ve.");
    expect(b.arreglo).toBe('Pon X-Frame-Options = "DENY".');
  });

  it("no arrastra la comparación que vitest pega detrás", () => {
    const conCola = `${mensaje}: expected 324 to be greater than 400`;
    const [b] = trocear(conCola);
    expect(b.arreglo, "el arreglo se ha comido la cola del error").not.toContain("expected");
  });

  it("recupera varios fallos de un mismo mensaje", () => {
    const dos = fallo({ que: "uno", donde: "a", porque: "b", arreglo: "c" })
      + fallo({ que: "dos", donde: "d", porque: "e", arreglo: "f" });
    expect(trocear(dos).map((b) => b.que)).toEqual(["uno", "dos"]);
  });

  it("devuelve vacío ante un mensaje sin formato", () => {
    expect(trocear("expected true to be false")).toEqual([]);
  });
});

describe("componer", () => {
  it("dice que todo está en verde sólo cuando no hay nada", () => {
    expect(componer([], [])).toContain("Todo en verde");
  });

  it("NO dice que todo está en verde cuando hay fallos", () => {
    // El caso que motivó estos tests.
    const texto = componer([{ archivo: "tests/despliegue/x.test.js", nombre: "algo", errores: [] }], []);
    expect(texto, "el informe dice «todo en verde» con un fallo delante").not.toContain("Todo en verde");
    expect(texto).toContain("1 caso falla");
  });

  it("escribe el arreglo de cada fallo, que es para lo que existe", () => {
    const errores = [{
      message: fallo({
        que: "la función «ai-chat» no se despliega nunca",
        donde: ".github/workflows/desplegar-funciones.yml",
        porque: "En producción corre otra versión.",
        arreglo: "Añade un paso: supabase functions deploy ai-chat",
      }),
    }];
    const texto = componer([{ archivo: "tests/despliegue/funciones.test.js", nombre: "paridad", errores }], []);
    expect(texto).toContain("la función «ai-chat» no se despliega nunca");
    expect(texto).toContain("Arreglo: Añade un paso: supabase functions deploy ai-chat");
    expect(texto).toContain("Por qué importa: En producción corre otra versión.");
  });

  it("recoge los errores que ocurren fuera de los casos", () => {
    const texto = componer([], [{ message: "no se pudo cargar el módulo" }]);
    expect(texto).toContain("Error fuera de los casos");
    expect(texto).toContain("no se pudo cargar el módulo");
    expect(texto).not.toContain("Todo en verde");
  });

  it("recuerda cómo reproducirlo", () => {
    const texto = componer([{ archivo: "x", nombre: "y", errores: [] }], []);
    expect(texto).toContain("npm run verificar");
  });
});
