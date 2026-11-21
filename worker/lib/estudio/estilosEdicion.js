// ============================================================
// Los ESTILOS DE EDICIÓN de un cliente: leerlos, guardarlos y quitarlos (lo puro, en src/lib/estilosEdicion.js; la
// herramienta, `estilo_de_edicion` en herramientasEdicion.js)
//
// Viven en el kit (`kit.estilosEdicion`, hasta 6) y SÓLO se escriben aquí (`guardarKit(…, { conEdicion: true })`): el PUT
// del kit los conserva. Guardar es sólo con el «sí» de una persona: quien llama lo comprueba (`confirmado`). No gasta nada.
// ============================================================

import { kitDe, guardarKit } from "./kit.js";
import { limpiarEstiloEdicion, limpiarEstilosEdicion, resumenEstiloEdicion, MAX_ESTILOS_EDICION } from "../../../src/lib/estilosEdicion.js";

/** Un error de lo pedido, con su estado HTTP. */
export class ErrorEstiloEdicion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

/** Un id nuevo («ee-» y 10 letras o cifras). */
export const nuevoIdEstiloEdicion = () => `ee-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

/** Los estilos guardados del cliente. */
export const estilosEdicionDe = (cliente) => limpiarEstilosEdicion(kitDe(cliente).estilosEdicion);

/** Un estilo por su id o por su nombre (sin mirar mayúsculas ni tildes), o null. */
export function buscarEstiloEdicion(estilos, cual) {
  const plano = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const q = plano(cual);
  if (!q) return null;
  return estilos.find((e) => e.id === cual) ?? estilos.find((e) => plano(e.nombre) === q) ?? estilos.find((e) => plano(e.nombre).includes(q)) ?? null;
}

/**
 * Comprueba un estilo SIN guardarlo: → { estilo, errores, nuevo, reemplaza }. Con `id` (o el nombre de uno guardado) lo
 * cambia ENTERO; sin él es uno nuevo. Lo que no se entiende se dice en `errores` y no se guarda nada hasta que no haya.
 */
export function prepararEstiloEdicion(cliente, entrada) {
  const estilos = estilosEdicionDe(cliente);
  const errores = [];
  const limpio = limpiarEstiloEdicion(entrada, errores);
  if (!limpio) return { estilo: null, errores: errores.length ? errores : ["El estilo no se entiende: es un objeto con al menos «nombre»."], nuevo: false, reemplaza: null };
  const reemplaza = (entrada?.id && estilos.find((e) => e.id === entrada.id)) || estilos.find((e) => e.nombre.toLowerCase() === limpio.nombre.toLowerCase()) || null;
  if (entrada?.id && !reemplaza) errores.push(`No hay ningún estilo con el id «${entrada.id}» en este cliente (sin id se crea uno nuevo).`);
  if (!reemplaza && estilos.length >= MAX_ESTILOS_EDICION) errores.push(`Este cliente ya tiene ${MAX_ESTILOS_EDICION} estilos de edición: cambia o quita uno antes.`);
  const estilo = { ...limpio, id: reemplaza?.id ?? limpio.id ?? nuevoIdEstiloEdicion() };
  return { estilo, errores, nuevo: !reemplaza, reemplaza };
}

/** Guarda un estilo ya comprobado (prepararEstiloEdicion sin errores). → { estilo, estilos }. */
export async function guardarEstiloEdicion(env, acceso, cliente, entrada) {
  const { estilo, errores } = prepararEstiloEdicion(cliente, entrada);
  if (errores.length) throw new ErrorEstiloEdicion(errores.join(" "));
  const actuales = estilosEdicionDe(cliente);
  const lista = actuales.some((e) => e.id === estilo.id) ? actuales.map((e) => (e.id === estilo.id ? estilo : e)) : [...actuales, estilo];
  const kit = await guardarKit(env, acceso, cliente, { ...kitDe(cliente), estilosEdicion: lista }, { conEdicion: true });
  const estilos = limpiarEstilosEdicion(kit.estilosEdicion);
  return { estilo: estilos.find((e) => e.id === estilo.id) ?? estilo, estilos };
}

/** Quita un estilo (por id o nombre). → { quitado, estilos }. */
export async function quitarEstiloEdicion(env, acceso, cliente, cual) {
  const actuales = estilosEdicionDe(cliente);
  const quitado = buscarEstiloEdicion(actuales, cual);
  if (!quitado) throw new ErrorEstiloEdicion(`No encuentro el estilo «${cual}» en este cliente.`, 404);
  const kit = await guardarKit(env, acceso, cliente, { ...kitDe(cliente), estilosEdicion: actuales.filter((e) => e.id !== quitado.id) }, { conEdicion: true });
  return { quitado, estilos: limpiarEstilosEdicion(kit.estilosEdicion) };
}

export { resumenEstiloEdicion };
