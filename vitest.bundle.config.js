import { defineConfig } from "vitest/config";

// Mide dist/. Se ejecuta DESPUÉS de `npm run build:verificado`, nunca
// antes: sin un dist construido con las variables VITE_ no hay nada que
// medir y el primer caso lo dice en alto.
export default defineConfig({
  test: {
    include: ["tests/**/*.bundle.test.js"],
    reporters: process.env.INFORME_DESPLIEGUE || process.env.CI
      ? ["default", new URL("./tests/utils/informe.js", import.meta.url).pathname]
      : ["default"],
  },
});
