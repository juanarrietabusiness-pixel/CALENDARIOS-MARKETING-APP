// ============================================================
// El EDITOR DE VIDEO GRABADO por MCP: las herramientas de los estilos de edición (Fase 3) — y, en la Fase 4, la guía y el
// acta (docs/propuesta-edicion-video-grabado.md §5)
//
//   · estilo_de_edicion   los estilos de edición del cliente (las REGLAS con que se editan sus videos grabados). Ver,
//                         ver uno entero, guardar o quitar. Sin `confirmado: true` NO SE GUARDA NI SE QUITA NADA: devuelve
//                         lo que se haría, para enseñárselo a la persona.
// ============================================================

import { difundir } from "../vivo.js";
import {
  estilosEdicionDe, buscarEstiloEdicion, prepararEstiloEdicion, guardarEstiloEdicion, quitarEstiloEdicion, resumenEstiloEdicion,
  ErrorEstiloEdicion,
} from "./estilosEdicion.js";
import { PIEZAS_ESTILO_EDICION, TRANSICIONES_EDICION, TIPOS_ESTILO_EDICION, MAX_ESTILOS_EDICION } from "../../../src/lib/estilosEdicion.js";

/** Un error de lo pedido: vuelve a Claude con `isError`, no como fallo del servidor. */
export class ErrorEdicion extends Error {}

const escribe = (destructiva = false) => ({ readOnlyHint: false, destructiveHint: destructiva, openWorldHint: false });

export const DEFINICIONES_EDICION_MCP = Object.freeze([
  {
    name: "estilo_de_edicion",
    description:
      "Los ESTILOS DE EDICIÓN de un cliente: las REGLAS con que se editan sus videos GRABADOS (clips de una persona hablando a " +
      "cámara): qué piezas van y cuándo (texto detrás de la persona, sello, cinta, fichas, lista…), la cámara, las transiciones, " +
      "el gancho, el cierre y la música. Reglas, no el contenido de un video. Sin «guardar» ni «quitar»: los que tiene; con " +
      `«estilo» (su nombre o id), ése entero en JSON. Con «guardar»: crea uno (hasta ${MAX_ESTILOS_EDICION}) o, con su id o su mismo nombre, ` +
      "lo REEMPLAZA entero. Guardar y quitar, sólo tras el sí de la persona a lo que devolvió la primera llamada (confirmado). " +
      "Lo que ya dice la identidad de video (subtítulos, músicas, efectos) no se repite aquí. No gasta nada.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre o ID del cliente (de listar_clientes)." },
        estilo: { type: "string", description: "Para ver UNO entero (o quitarlo): su nombre o su id." },
        guardar: {
          type: "object",
          description:
            `El estilo entero: { id? (para cambiar uno), nombre, tipo (${TIPOS_ESTILO_EDICION.join(" | ")}), ` +
            `piezas: { ${Object.keys(PIEZAS_ESTILO_EDICION).join(", ")}: "cuándo y cómo va (≤160)", placasNumeradas: bool }, ` +
            "camara: { abierto (1–1,4), medio (1–2, más que abierto), seguir (0–1), maxAcercar (1–2,5), golpeAlEntrar: bool }, " +
            `transiciones: { entreClips, saltoMismoClip: ${Object.keys(TRANSICIONES_EDICION).join(" | ")} }, gancho (≤160), ` +
            "cierre: { segundos (0–8), boton (≤40), numero: bool, usuario: bool }, musica: { bajoVoz, llamado, libre, cierre (dB, −40…0) }, " +
            "ritmo (≤160), notas (≤600) }. Lo que no digas sale del manual del editor y de los números del oficio.",
        },
        quitar: { type: "boolean", description: "true: quita el estilo nombrado en «estilo»." },
        confirmado: { type: "boolean", description: "Sólo tras el «sí» de la persona a lo que devolvió la primera llamada." },
      },
      required: ["cliente"],
    },
    annotations: escribe(true),
  },
]);

const lineas = (e) => resumenEstiloEdicion(e).map((x) => `  · ${x}`).join("\n");

/** Las herramientas. */
export function crearHerramientasEdicion({ env, acceso, resolverCliente, por }) {
  const conErrores = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErrorEstiloEdicion) throw new ErrorEdicion(e.message);
      throw e;
    }
  };

  return {
    async estilo_de_edicion({ cliente, estilo, guardar, quitar = false, confirmado = false } = {}) {
      const c = await resolverCliente(cliente);
      const estilos = estilosEdicionDe(c);

      if (guardar !== undefined && guardar !== null) {
        const p = prepararEstiloEdicion(c, guardar);
        if (p.errores.length) throw new ErrorEdicion(`NO SE GUARDÓ NADA. ${p.errores.join(" ")}`);
        if (confirmado !== true) {
          return [
            `NO SE HA GUARDADO NADA. Esto ${p.nuevo ? "CREA el estilo de edición" : `REEMPLAZA ENTERO el estilo «${p.reemplaza.nombre}»`} de ${c.name}:`,
            `«${p.estilo.nombre}»`, lineas(p.estilo),
            "Enséñaselo a la persona tal cual. Sólo si dice que sí, vuelve a llamar con lo MISMO y confirmado: true.",
          ].join("\n");
        }
        const r = await conErrores(() => guardarEstiloEdicion(env, acceso, c, guardar));
        difundir(env, acceso.ownerId, { tipo: "estudio", clientId: c.id, por });
        return [`Guardado el estilo de edición «${r.estilo.nombre}» [${r.estilo.id}] de ${c.name}:`, lineas(r.estilo),
          `${c.name} tiene ${r.estilos.length} de ${MAX_ESTILOS_EDICION}.`].join("\n");
      }

      if (quitar === true) {
        const e = buscarEstiloEdicion(estilos, estilo);
        if (!e) throw new ErrorEdicion(estilo ? `No encuentro el estilo «${estilo}» en ${c.name}.` : "Dime qué estilo quitar («estilo»: su nombre o id).");
        if (confirmado !== true) {
          return [`NO SE HA QUITADO NADA. Esto QUITA el estilo de edición «${e.nombre}» [${e.id}] de ${c.name}:`, lineas(e),
            "Sólo si la persona dice que sí, vuelve a llamar con quitar y confirmado: true. No se puede deshacer."].join("\n");
        }
        const r = await conErrores(() => quitarEstiloEdicion(env, acceso, c, e.id));
        difundir(env, acceso.ownerId, { tipo: "estudio", clientId: c.id, por });
        return `Quitado el estilo de edición «${r.quitado.nombre}» de ${c.name}. Le quedan ${r.estilos.length}.`;
      }

      if (estilo) {
        const e = buscarEstiloEdicion(estilos, estilo);
        if (!e) throw new ErrorEdicion(`No encuentro el estilo «${estilo}» en ${c.name}. Tiene: ${estilos.map((x) => `«${x.nombre}»`).join(", ") || "ninguno"}.`);
        return [`Estilo de edición «${e.nombre}» de ${c.name} (para cambiarlo, guárdalo ENTERO con su id):`, JSON.stringify(e, null, 2)].join("\n");
      }

      if (!estilos.length) {
        return `${c.name} no tiene estilos de edición: sus videos grabados se editan con el manual del editor y los números del oficio. ` +
          "Si la persona te cuenta cómo quiere que se editen (o al terminar una edición que le gustó), propón uno con guardar.";
      }
      return [`ESTILOS DE EDICIÓN de ${c.name} (${estilos.length} de ${MAX_ESTILOS_EDICION}):`,
        ...estilos.map((e) => `«${e.nombre}» [${e.id}]\n${lineas(e)}`)].join("\n\n");
    },
  };
}
