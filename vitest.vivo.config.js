import { defineConfig } from "vitest/config";

// ============================================================
// El tiempo real, ejecutado
//
// Levanta el Worker con `wrangler dev` —workerd de verdad, con su D1 y
// su Durable Object—, mete a dos personas en un espacio y comprueba que
// lo que escribe una llega al socket de la otra.
//
// Va aparte de `npm test` porque arranca un proceso y tarda unos
// segundos; y va DENTRO de `npm run verificar` porque no necesita
// llaves ni cuenta: `wrangler dev` corre en local. Un test que sólo se
// ejecuta a mano no defiende nada.
//
// Sin paralelismo y con un solo fichero a la vez: cada uno levanta su
// propio Worker, y dos a la vez sólo sirven para competir por la CPU.
// ============================================================

export default defineConfig({
  test: {
    include: ["tests/vivo/**/*.test.js"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    reporters: process.env.INFORME_DESPLIEGUE || process.env.CI
      ? ["default", new URL("./tests/utils/informe.js", import.meta.url).pathname]
      : ["default"],
  },
});
