// ============================================================
// Build que sí compila la aplicación entera.
//
// `vite build` a secas NO verifica el panel. Sin las variables VITE_*,
// `isSupabaseEnabled` se resuelve en tiempo de compilación a false,
// rollup elimina el panel entero y el bundle sale a 140 kB en vez de
// 570: el build pasa sin haber compilado lo que se acaba de tocar, y el
// hash del chunk ni siquiera cambia.
//
// Los valores son de mentira a propósito. No se conecta a nada: sólo
// hacen falta para que la rama no se elimine al compilar.
//
// Existe como script de Node y no como `VAR=x vite build` en package.json
// para que funcione igual en Windows, donde esa sintaxis no vale.
// ============================================================

import { spawnSync } from "node:child_process";

const { status } = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://ejemplo.supabase.co",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "verificacion-de-build",
  },
});

process.exit(status ?? 1);
