// ============================================================
// «Lo mejor del momento» por MCP (Claude en claude.ai y Claude Code)
//
//   · ver_lo_mejor  lo que mejor funciona (la inspiración de los clientes, las referencias, lo propio y los anuncios),
//                   ordenado por el percentil de su fuente, con la cifra de verdad de cada una y sus MINIATURAS como
//                   imágenes (y en la vista previa del chat). No gasta.
//   · recrear       recrea una para un cliente: la publicación en su próximo día libre con el original de referencia y
//                   lo que la crea (el director, el video animado o el guion para grabar). La primera llamada devuelve
//                   el costo y NO crea nada; sólo `confirmado: true` (tras el «sí» de la persona) lo crea.
//
// Son las mismas funciones que la pantalla (worker/lib/loMejor.js): una sola implementación.
// ============================================================

import { loMejor, recrear, miniaturaDe, textoDeLoMejor, ErrorLoMejor } from "./loMejor.js";
import { URI_VISTA, vistaDe, piezaDe } from "./mcpVista/modelo.js";
import { CAMINOS, VENTANAS, TIPOS_LO_MEJOR, FORMATOS_LO_MEJOR, REDES_LO_MEJOR } from "../../src/lib/loMejor.js";

/** Un error de lo pedido: vuelve a Claude como resultado con `isError`. */
export class ErrorHerramientaLoMejor extends Error {}

/** Cuántas miniaturas se mandan como imágenes (pesan; Claude las mira). */
const MAX_IMAGENES = 8;
/** Las dos llevan la vista previa del chat (como `conMetaDeVista`, sin tocar la lista de la vista). */
const conVista = (h) => ({ ...h, _meta: { ui: { resourceUri: URI_VISTA, visibility: ["model", "app"] }, "ui/resourceUri": URI_VISTA } });

export const DEFINICIONES_LO_MEJOR = Object.freeze([
  conVista({
    name: "ver_lo_mejor",
    description: "«Lo mejor del momento»: lo que MEJOR está funcionando ahora —lo que publica la competencia y las cuentas que inspiran a cada cliente (con «rinde X×» contra la mediana de su cuenta), las referencias que guardó el equipo, lo mejor propio de cada cliente y los anuncios de la competencia que llevan más días activos— ordenado por el percentil de cada fuente, con su tipo (UGC, anuncio que vende, carrusel, motion, viral…), por qué funciona y sus miniaturas. Úsala para proponer qué recrear. No gasta.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre o ID del cliente para ver sólo lo suyo. Sin él, de todos." },
        ventana: { type: "string", enum: VENTANAS.map((v) => v.id), description: "semana (por defecto), mes, o nuevo (lo más reciente)." },
        tipo: { type: "string", enum: TIPOS_LO_MEJOR.map((t) => t.id) },
        formato: { type: "string", enum: Object.keys(FORMATOS_LO_MEJOR) },
        red: { type: "string", enum: Object.keys(REDES_LO_MEJOR) },
        cuantas: { type: "integer", description: "Cuántas (de 1 a 30). Por defecto 12." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  conVista({
    name: "recrear",
    description: "Recrea una pieza de «Lo mejor» para un cliente: crea la publicación en su próximo día libre con el original como REFERENCIA (no se publica) y lanza lo que la crea según el camino: «imagen» o «carrusel» (el director diseña con la marca del cliente mirando el original SÓLO como inspiración; sigue en el servidor), «animado» (el guion de un video animado con su idea y su estructura) o «grabar» (el guion para grabar: lo que se dice, tomas, texto en pantalla y qué audio usar). La primera llamada devuelve el COSTO y el día y NO crea nada: dile la cifra a la persona y, sólo si dice que sí, repite la llamada con confirmado=true.",
    inputSchema: {
      type: "object",
      properties: {
        clave: { type: "string", description: "La clave de la pieza (la que da ver_lo_mejor entre corchetes)." },
        cliente: { type: "string", description: "Nombre o ID del cliente para quien se recrea." },
        camino: { type: "string", enum: Object.keys(CAMINOS), description: "Cómo se recrea. Sin él, el sugerido." },
        producto_id: { type: "string", description: "El id del producto del catálogo (opcional: sin él, el que mejor encaje)." },
        confirmado: { type: "boolean", description: "Sólo true tras el «sí» de la persona al costo. No lo pongas por tu cuenta." },
      },
      required: ["clave", "cliente"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }),
]);

export function crearHerramientasLoMejor({ env, acceso, resolverCliente, usuario }) {
  return {
    async ver_lo_mejor({ cliente = "", ventana = "semana", tipo = "", formato = "", red = "", cuantas = 12 } = {}) {
      const c = cliente ? await resolverCliente(cliente) : null;
      const n = Math.max(1, Math.min(30, Math.floor(Number(cuantas)) || 12));
      const r = await loMejor(env, acceso, { ventana, cliente: c?.id ?? "", tipo, formato, red, max: n });
      const clientes = await acceso.leerColumnas("clients", ["id", "name"]).catch(() => []);
      const nombre = (id) => clientes.find((x) => x.id === id)?.name ?? id;
      const imagenes = [];
      const piezas = [];
      for (const p of r.piezas) {
        let indice = null;
        if (imagenes.length < MAX_IMAGENES) {
          const v = await miniaturaDe(env, { miniatura: p.miniatura, miniaturaOriginal: p.miniaturaOriginal });
          if (v) { indice = imagenes.length; imagenes.push({ datos: v.data, mime: v.media_type }); }
        }
        piezas.push(piezaDe({
          id: p.clave, titulo: `${p.cifra.texto} · ${p.tipoNombre || FORMATOS_LO_MEJOR[p.formato] || "pieza"}${p.cuenta ? ` · ${p.cuenta}` : ""}`,
          nota: p.idea || p.texto || "", imagen: indice, sinImagen: indice === null, archivo: false,
        }));
      }
      const texto = textoDeLoMejor(r, nombre);
      return {
        texto, imagenes,
        vista: vistaDe({
          tipo: "piezas", titulo: `Lo mejor del momento${c ? ` · ${c.name}` : ""}`,
          subtitulo: `${VENTANAS.find((v) => v.id === r.ventana)?.nombre ?? ""} · ${r.total} piezas, de mejor a peor`,
          cliente: c ? { id: c.id, nombre: c.name } : null, piezas,
        }),
      };
    },

    async recrear({ clave, cliente, camino = "", producto_id: productoId = "", confirmado }) {
      const c = await resolverCliente(cliente);
      try {
        const r = await recrear(env, acceso, usuario, { clave: String(clave ?? ""), clienteId: c.id, camino, productoId: String(productoId ?? ""), confirmado: confirmado === true });
        const que = r.encargoId
          ? `El director la está diseñando en el servidor (encargo ${r.encargoId}): se pondrá sola en la publicación al terminar; míralo con estado_encargo.`
          : r.videoId ? `El guion del video animado ${r.videoId} está listo para revisar (ver_video, ver_escenas).`
            : "El guion para grabar está en la publicación (con las tomas y qué audio usar).";
        return `Hecho para ${c.name}: publicación ${r.postId} del ${r.fecha} (${CAMINOS[r.camino].nombre}), con el original como referencia. ${que}${r.aviso ? ` ${r.aviso}` : ""}`;
      } catch (e) {
        if (e instanceof ErrorLoMejor && e.codigo === "confirmar") {
          return {
            texto: `NO SE CREÓ NADA TODAVÍA. ${e.message} Camino: ${CAMINOS[e.camino].nombre} (se puede: ${e.caminos.map((x) => x).join(", ")}). Dile la cifra a la persona y, sólo si dice que sí, repite la llamada con confirmado=true.`,
            imagenes: [],
            vista: vistaDe({
              tipo: "plan", titulo: `Recrear para ${c.name}`, cliente: { id: c.id, nombre: c.name }, subtitulo: "Nada se ha creado todavía",
              plan: { costo: e.costoTexto, piezas: [{ titulo: CAMINOS[e.camino].nombre, detalle: `${e.detalle} · va el ${e.fecha}` }] },
            }),
          };
        }
        if (e instanceof ErrorLoMejor) throw new ErrorHerramientaLoMejor(e.message);
        throw e;
      }
    },
  };
}
