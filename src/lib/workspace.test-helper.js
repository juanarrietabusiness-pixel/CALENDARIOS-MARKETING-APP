import { readFileSync, existsSync } from "node:fs";

// ============================================================
// Acceso a las recetas reales de Agencia_Workspace desde los tests.
//
// Ese repositorio es un checkout aparte: está en la máquina de quien
// desarrolla y no en el runner de CI. Los casos que dependen de él se
// saltan, no fallan.
//
// El helper existe porque hacerlo a mano se rompió en CI: `describe.skipIf`
// salta los TESTS, pero el cuerpo del `describe` se ejecuta igual al
// colectar. Un `readFileSync` en ese cuerpo lanza aunque el bloque entero
// esté marcado para saltarse, y el fallo sólo aparece donde el repositorio
// no está — es decir, nunca en local y siempre en CI.
//
// `AGENCIA_WORKSPACE` permite apuntar a otra ruta, que es como se comprueba
// que el camino de «no está» funciona sin desmontar el checkout.
// ============================================================

export const RAIZ = process.env.AGENCIA_WORKSPACE || "/home/user/Agencia_Workspace";

export const hayWorkspace = existsSync(RAIZ);

/** Los clientes que tienen receta y que el calendario entrega hoy. */
export const CLIENTES = ["Dcasa", "Juancito Ads", "Baby Caleb", "Feria del lente"];

/** Devuelve la receta del cliente, o null si el repositorio no está. */
export function leerReceta(cliente) {
  const ruta = `${RAIZ}/${cliente}/01_ADN_y_Memoria/05_receta.json`;
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8"));
}
