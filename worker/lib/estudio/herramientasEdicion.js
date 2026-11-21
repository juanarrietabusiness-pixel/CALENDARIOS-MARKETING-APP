// ============================================================
// El EDITOR DE VIDEO GRABADO por MCP: las herramientas de los estilos de edición (Fase 3) — y, en la Fase 4, la guía y el
// acta (docs/propuesta-edicion-video-grabado.md §5)
//
//   · estilo_de_edicion   los estilos de edición del cliente (las REGLAS con que se editan sus videos grabados). Ver,
//                         ver uno entero, guardar o quitar. Sin `confirmado: true` NO SE GUARDA NI SE QUITA NADA: devuelve
//                         lo que se haría, para enseñárselo a la persona.
//   · guia_de_edicion     lo que hay que saber ANTES de editar, en una llamada (guiaEdicion.js). Sólo lee.
//   · acta_de_edicion     al terminar: el acta y las correcciones de la persona como PROPUESTAS (actasEdicion.js); se
//                         aplican al manual o al estilo sólo con `confirmado` tras el sí.
// ============================================================

import { difundir } from "../vivo.js";
import { avisar, miembrosDe } from "../equipo.js";
import {
  estilosEdicionDe, buscarEstiloEdicion, prepararEstiloEdicion, guardarEstiloEdicion, quitarEstiloEdicion, resumenEstiloEdicion,
  ErrorEstiloEdicion,
} from "./estilosEdicion.js";
import { guiaDeEdicion } from "./guiaEdicion.js";
import { guardarActa, propuestasPendientes, aplicarPropuestas, descartarPropuestas, nombreDeParte, ErrorActa } from "./actasEdicion.js";
import { PIEZAS_ESTILO_EDICION, TRANSICIONES_EDICION, TIPOS_ESTILO_EDICION, MAX_ESTILOS_EDICION } from "../../../src/lib/estilosEdicion.js";
import { TIPOS_VIDEO_GRABADO } from "../../../src/lib/manualEditor.js";
import { textoDePropuesta } from "../../../src/lib/aprendizajeEdicion.js";

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
  {
    name: "guia_de_edicion",
    description:
      "Lo que hay que saber ANTES de editar un video GRABADO de un cliente (clips de una persona hablando a cámara, persona y " +
      "pantalla…), en una sola llamada: el manual del editor de la agencia (lo común y lo del tipo de video), la marca resumida " +
      "con el CONTACTO bueno (el de la nota de datos del negocio, y lo que no coincide), sus estilos de edición, lo que dijo la " +
      "persona las últimas veces, la lista de control antes de entregar y la versión vigente del kit. Primero sin tipo: reconoce " +
      "el tipo de video y vuelve a pedirla con él. Sólo lee.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre o ID del cliente (de listar_clientes)." },
        tipo: { type: "string", enum: [...TIPOS_VIDEO_GRABADO], description: "El tipo de video, cuando ya lo reconociste." },
        estilo: { type: "string", description: "Un estilo de edición entero (su nombre o id), si el cliente tiene varios." },
      },
      required: ["cliente"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "acta_de_edicion",
    description:
      "Al terminar de editar un video grabado: el ACTA (qué se hizo y con qué) y las CORRECCIONES de la persona, cada una " +
      "GENERAL (para todo cliente: va al manual; sólo si la dijo como orden: «nunca…», «siempre…», «en todos los videos») o DE " +
      "LA MARCA (va a su estilo de edición). Quedan como PROPUESTAS: enséñaselas tal cual y aplícalas con «aplicar» y confirmado " +
      "SÓLO con su sí («descartar» si dice que no). Sin nada más: las propuestas que esperan. No gasta nada.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre o ID del cliente (de listar_clientes)." },
        acta: {
          type: "object",
          description: `Lo que se hizo: { tipo (${TIPOS_VIDEO_GRABADO.join(" | ")}), estilo_id?, kit_version, archivo_id? (el video en la galería, de confirmar_subida), resumen: { duracion, lufs, pico, musica, piezas… } }.`,
        },
        correcciones: {
          type: "array",
          description: "Cada corrección de la persona en esta edición: { alcance: general|marca, parte (general: una del manual, p. ej. comun.textos o tipos.persona-a-camara; marca: un campo de texto del estilo, p. ej. piezas.lista o notas), operacion: anadir|cambiar|quitar, antes (el texto EXACTO que hay, para cambiar o quitar), texto, cita (sus palabras, tal cual) }.",
          items: { type: "object" },
        },
        aplicar: { type: "array", items: { type: "string" }, description: "Los ids de las propuestas (pe-…) que la persona aprobó." },
        descartar: { type: "array", items: { type: "string" }, description: "Los ids de las propuestas que la persona no quiere." },
        confirmado: { type: "boolean", description: "Con aplicar: sólo tras el «sí» de la persona a esas propuestas, tal cual se le enseñaron." },
      },
      required: ["cliente"],
    },
    annotations: escribe(),
  },
]);

const lineas = (e) => resumenEstiloEdicion(e).map((x) => `  · ${x}`).join("\n");

/** Las herramientas. */
export function crearHerramientasEdicion({ env, acceso, resolverCliente, usuario, por }) {
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

    async guia_de_edicion({ cliente, tipo = "", estilo = "" } = {}) {
      const c = await resolverCliente(cliente);
      return guiaDeEdicion(acceso, c, { tipo, estilo });
    },

    async acta_de_edicion({ cliente, acta, correcciones = [], aplicar, descartar, confirmado = false } = {}) {
      const c = await resolverCliente(cliente);
      const nombre = (p) => (p.destino === "manual" ? nombreDeParte(p.parte) : p.parte);
      const conActas = async (fn) => {
        try {
          return await fn();
        } catch (e) {
          if (e instanceof ErrorActa) throw new ErrorEdicion(e.message);
          throw e;
        }
      };
      if (Array.isArray(aplicar) && aplicar.length) {
        if (confirmado !== true) {
          const { generales, deMarca } = await propuestasPendientes(acceso, c);
          const pedidas = [...generales, ...deMarca].filter((p) => aplicar.includes(p.id));
          return ["NO SE HA APLICADO NADA. Esto es lo que cambiaría (enséñaselo tal cual):", ...pedidas.map((p) => textoDePropuesta(p, { nombreParte: nombre(p) })),
            "Sólo si la persona dice que sí, vuelve a llamar con los mismos ids y confirmado: true."].join("\n");
        }
        const r = await conActas(() => aplicarPropuestas(env, acceso, c, usuario, aplicar));
        difundir(env, acceso.ownerId, { tipo: "estudio", clientId: c.id, por });
        return r.map((x) => (x.hecho ? `· ${x.id}: aplicada${x.version ? ` (manual, versión ${x.version})` : x.estilo ? ` (estilo «${x.estilo}»)` : ""}.` : `· ${x.id}: NO (${x.motivo}).`)).join("\n");
      }
      if (Array.isArray(descartar) && descartar.length) {
        const r = await conActas(() => descartarPropuestas(acceso, c, usuario, descartar));
        return r.map((x) => (x.hecho ? `· ${x.id}: descartada.` : `· ${x.id}: NO (${x.motivo}).`)).join("\n");
      }
      if (acta) {
        const r = await conActas(() => guardarActa(acceso, c, usuario, { acta, correcciones }));
        const lineas = [`Acta guardada (${r.acta.tipo}, manual v${r.acta.manualVersion || "de la casa"}).`];
        if (r.propuestas.length) {
          lineas.push("PROPUESTAS (enséñaselas TAL CUAL y aplícalas sólo con su sí: aplicar con sus ids y confirmado):",
            ...r.propuestas.map((p) => textoDePropuesta(p, { nombreParte: nombre(p) })));
          if (r.propuestas.some((p) => p.destino === "estilo") && !r.estilo) lineas.push(`${c.name} no tiene estilo de edición para este tipo: al aplicar lo de la marca se crea uno.`);
        } else lineas.push("Ninguna propuesta.");
        if (r.descartadas.length) lineas.push("NO SE PROPUSIERON:", ...r.descartadas.map((d) => `· corrección ${d.n}: ${d.motivo}`));
        if (r.propuestas.length) {
          // A la campana de los demás (quien editó ya las ve aquí): dónde se aceptan o se rechazan en la pantalla.
          const generales = r.propuestas.filter((p) => p.destino === "manual").length;
          const marca = r.propuestas.length - generales;
          const partes = [generales && `${generales} para el manual del editor`, marca && `${marca} para el estilo de ${c.name}`].filter(Boolean).join(" y ");
          const miembros = await miembrosDe(acceso).catch(() => []);
          await avisar(env, acceso, {
            para: miembros.map((m) => m.userId), tipo: "edicion", por: { userId: usuario?.id, nombre: usuario?.nombre },
            texto: `Claude propone aprender de la edición de ${c.name}: ${partes}. Acéptalas o recházalas.`,
            enlace: generales ? "/ajustes#editor-video" : `/cliente/${encodeURIComponent(c.id)}/marca/kit`,
          });
          lineas.push("(El equipo las ve también en la pantalla, para aceptarlas o rechazarlas.)");
        }
        return lineas.join("\n");
      }
      const { generales, deMarca } = await propuestasPendientes(acceso, c);
      if (!generales.length && !deMarca.length) return `No hay propuestas esperando (ni del manual ni de ${c.name}).`;
      return ["PROPUESTAS QUE ESPERAN EL SÍ:", ...[...generales, ...deMarca].map((p) => textoDePropuesta(p, { nombreParte: nombre(p) }))].join("\n");
    },
  };
}
