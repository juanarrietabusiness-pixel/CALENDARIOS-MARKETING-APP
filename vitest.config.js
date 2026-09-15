import { defineConfig } from "vitest/config";

// ============================================================
// Configuración de los tests
//
// Tres grupos, separados porque necesitan cosas distintas:
//
//   npm test           lógica de la aplicación + tests de despliegue que
//                      se resuelven leyendo el repositorio. No necesitan
//                      nada: corren en cualquier clon, en cualquier PR.
//
//   npm run test:bundle  mide dist/. Necesita un build hecho CON las
//                      variables VITE_, o estaría midiendo media
//                      aplicación. Por eso no entra en `npm test`: se
//                      ejecuta después del build.
//
//   npm run test:infra  habla con Supabase y con el sitio publicado.
//                      Necesita llaves; sin ellas se salta.
//
// `npm run verificar` es la secuencia completa, la misma que corre CI.
// ============================================================

const SIEMPRE = ["**/*.bundle.test.js", "**/*.live.test.js"];

export default defineConfig({
  test: {
    include: ["src/**/*.test.js", "tests/**/*.test.js"],
    exclude: ["node_modules/**", "dist/**", ...SIEMPRE],
    reporters: process.env.INFORME_DESPLIEGUE || process.env.CI
      ? ["default", new URL("./tests/utils/informe.js", import.meta.url).pathname]
      : ["default"],
  },
});
