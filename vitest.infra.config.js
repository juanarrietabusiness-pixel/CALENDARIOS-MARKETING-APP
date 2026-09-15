import { defineConfig } from "vitest/config";

// Habla con el proyecto de Supabase y con el sitio publicado. Necesita
// SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF (y SITIO_URL para las
// cabeceras); sin ellas, los casos se saltan en vez de fallar.
export default defineConfig({
  test: {
    include: ["tests/**/*.live.test.js"],
    testTimeout: 30_000,
    reporters: process.env.INFORME_DESPLIEGUE || process.env.CI
      ? ["default", new URL("./tests/utils/informe.js", import.meta.url).pathname]
      : ["default"],
  },
});
