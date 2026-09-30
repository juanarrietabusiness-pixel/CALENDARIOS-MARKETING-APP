// ============================================================
// El Estudio desde el asistente y desde Claude (MCP)
//
// Tres herramientas, las mismas en los dos sitios (una sola implementación,
// como las de consulta de `herramientasServidor.js`):
//
//   · ver_estudio        qué modelos hay HOY, lo último de la galería, lo que está en
//                        marcha y la GUÍA VISUAL de la marca (del cerebro)
//   · crear_en_estudio   pide una imagen o un video: un TRABAJO, no una espera
//   · estado_trabajo     cómo va un pedido y qué archivos dio
//
// CREAR NO ESPERA. El Worker no puede quedarse a ver un video; el pedido queda
// en la cola del Estudio, lo avanza el cron del minuto (o el navegador de quien
// tenga el Estudio abierto) y el resultado aparece en la galería del cliente.
// La respuesta de la herramienta lo dice, con el id para preguntar después.
//
// LAS MISMAS REGLAS QUE LA PANTALLA, PORQUE VAN POR EL MISMO SITIO. `crearTrabajo`
// valida el modelo, exige la llave, comprueba que las imágenes sean de ESTE cliente
// y pide la segunda confirmación desde 0,50 $ (409 `confirmar`) y el presupuesto
// antes de crear nada. Aquí sólo se añade lo propio de que pida una IA y no una
// persona:
//   · topes más cortos (`LIMITES`): hasta 4 imágenes por pedido y 10 s de video;
//   · las imágenes de apoyo se piden por ID de la GALERÍA, nunca por clave de R2:
//     el modelo no puede apuntar a un archivo que no esté ahí ni a uno de otro cliente;
//   · el cobro pasa por la confirmación: la herramienta NO la da por su cuenta. Devuelve
//     el costo y la orden de preguntar; `confirmado: true` sólo va después de un «sí».
//
// LA GUÍA VISUAL SE LE ENSEÑA AL MODELO, NO SE PEGA AL PROMPT. Lo que sale hacia el
// proveedor es lo que quedó escrito en la galería; que la marca se cuele por detrás
// sería un prompt que nadie escribió. Claude ve la guía y la usa al escribir el suyo.
// Sale del cerebro con `para: "imagen"`: la identidad visual, sin las notas internas
// (costos, márgenes) que a un proveedor externo no se le cuentan.
// ============================================================

import {
  MODELOS, modeloPorId, modeloPorDefecto, textoCosto, MAX_VIDEOS_POR_PEDIDO, NOMBRE_ESTADO, estaVivo,
} from "../../../src/lib/estudioCatalogo.js";
import { estadoMotores } from "./motores.js";
import { crearTrabajo, trabajoPublico, ErrorEstudio } from "./trabajos.js";
import { buscar as buscarCerebro } from "../cerebro/cerebro.js";
import { pack } from "../cerebro/memoria.js";

/** Lo más que puede pedir una IA de una vez. La pantalla admite más (8 imágenes, 2 videos): ahí lo ve una persona. */
export const LIMITES = Object.freeze({ imagenes: 4, videos: MAX_VIDEOS_POR_PEDIDO, segundos: 10 });

const GALERIA_A_MOSTRAR = 12;
const MAX_GUIA = 1_800;
const CONSULTA_VISUAL = "estilo visual identidad paleta colores fotografía iluminación composición tipografía evitar negativos";

/** Un error de lo pedido: vuelve al modelo como resultado, no como fallo del servidor. */
export class ErrorHerramientaEstudio extends Error {}

const clienteParam = {
  cliente: { type: "string", description: "Nombre del cliente. En el asistente de un cliente se puede omitir: es ese cliente." },
};

/** Las definiciones, con la forma de la API de Anthropic (`input_schema`). El MCP las convierte a `inputSchema`. */
export const DEFINICIONES_ESTUDIO = Object.freeze([
  {
    name: "ver_estudio",
    description:
      "El Estudio de un cliente (imágenes y videos con IA): qué modelos están disponibles ahora y cuánto cuestan, la GUÍA VISUAL de su " +
      "marca, lo último de su galería (con los IDs para partir de una imagen) y lo que está en marcha. Mírala ANTES de crear algo: " +
      "los modelos que aparecen son los únicos que funcionan, y la guía visual es lo que hay que meter en el prompt para que la pieza sea de esa marca.",
    input_schema: { type: "object", properties: { ...clienteParam } },
  },
  {
    name: "crear_en_estudio",
    description:
      "Pide una IMAGEN o un VIDEO al Estudio de un cliente. NO espera el resultado: queda en cola, se hace solo (un video tarda de 1 a 10 minutos) " +
      "y aparece en la galería del cliente. Devuelve el ID del pedido para consultarlo con estado_trabajo. " +
      "Para una imagen suelta que deba verse aquí mismo en el chat, usa generar_imagen; esta es para video, para varias variantes, para elegir modelo " +
      "o para partir de imágenes de la galería. Cuesta dinero: si el pedido sale caro, la respuesta trae el costo y NO se crea nada hasta confirmarlo. " +
      "Entonces pregúntale al usuario, con la cifra, y sólo si dice que sí vuelve a llamarla con confirmado=true. Nunca pongas confirmado=true por tu cuenta. " +
      `Topes: hasta ${LIMITES.imagenes} imágenes o ${LIMITES.videos} videos por pedido, y ${LIMITES.segundos} s por video.`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        tipo: { type: "string", enum: ["imagen", "video"], description: "Por defecto, imagen." },
        prompt: { type: "string", description: "Qué crear: sujeto, composición, luz, estilo y, si hace falta, el texto exacto. Incluye lo esencial de la guía visual de ver_estudio." },
        modelo: { type: "string", description: "ID de un modelo de ver_estudio. Si se omite, el predeterminado del tipo." },
        cantidad: { type: "integer", description: "Cuántas variantes. Por defecto 1." },
        formato: { type: "string", enum: ["1:1", "4:5", "3:4", "9:16", "16:9"], description: "Proporción: 4:5 feed de Instagram, 9:16 historia o reel, 1:1 cuadrada, 16:9 horizontal. Cada modelo admite algunas." },
        duracion: { type: "integer", description: "Segundos de un video (el modelo admite unos valores concretos)." },
        imagen_inicial: { type: "string", description: "ID de una imagen de la galería (de ver_estudio): el video arranca de ella." },
        imagen_final: { type: "string", description: "ID de una imagen de la galería en la que termina el video (necesita imagen_inicial; no todos los modelos la admiten)." },
        referencias: { type: "array", items: { type: "string" }, description: "IDs de imágenes de la galería que sirven de referencia (producto, estilo, persona). Cada modelo admite un número distinto." },
        confirmado: { type: "boolean", description: "Sólo tras oír «sí» del usuario a la cifra exacta que le dijiste." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "estado_trabajo",
    description: "Cómo va un pedido del Estudio (el ID lo dio crear_en_estudio o sale en ver_estudio): si sigue en marcha, si falló y por qué, y qué archivos dio (con sus IDs).",
    input_schema: { type: "object", properties: { trabajo_id: { type: "string" } }, required: ["trabajo_id"] },
  },
]);

export const NOMBRES_ESTUDIO = new Set(DEFINICIONES_ESTUDIO.map((d) => d.name));

/**
 * @param resolverCliente  async (nombre?) → fila de `clients`; la misma que usan las demás herramientas
 * @param usuario          quien firma lo que se pida (el id queda en `creado_por`)
 * @param por              la firma para avisar al espacio en vivo
 * @param origen           "asistente" | "claude": queda en el trabajo, para saber quién lo pidió
 */
export function crearHerramientasEstudio({ env, acceso, resolverCliente, usuario, por, origen }) {
  const activos = () => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, v.activo]));

  /** Un ID de la galería → su clave de R2. Falla con un mensaje que el modelo pueda usar. */
  async function claveDeGaleria(clienteId, id, para) {
    const f = await acceso.leerUno("estudio_archivos", { id: String(id ?? ""), client_id: clienteId });
    if (!f || f.borrado_at) throw new ErrorHerramientaEstudio(`No encontré la imagen «${id}» en la galería (${para}). Los IDs salen de ver_estudio.`);
    if (!String(f.mime).startsWith("image/")) throw new ErrorHerramientaEstudio(`«${id}» no es una imagen (${f.mime}); ${para} tiene que ser una imagen.`);
    return f.clave;
  }

  /** La identidad visual del cliente que el cerebro puede dar a un prompt de imagen: nunca notas internas. */
  async function guiaVisual(clienteId) {
    const hits = await buscarCerebro(env, acceso, clienteId, CONSULTA_VISUAL, { para: "imagen", n: 3, per: 1 });
    const bloques = hits
      // Doble candado: `para: "imagen"` ya las deja fuera, y si un día se rompe, esto lo sigue impidiendo.
      .filter((h) => !h.interna)
      .map((h) => ({ head: `· ${h.titulo}`, body: h.pasajes.join(" … ") }));
    return bloques.length ? pack(bloques, MAX_GUIA) : "";
  }

  const acciones = {
    async ver_estudio({ cliente }) {
      const c = await resolverCliente(cliente);
      const motores = activos();
      const hay = MODELOS.filter((m) => motores[m.motor] && m.motor !== "prueba");
      const usables = hay.length ? hay : MODELOS.filter((m) => m.motor === "prueba");
      const porTipo = (tipo) => usables.filter((m) => m.tipo === tipo);
      const porDefecto = { imagen: modeloPorDefecto(motores, "imagen"), video: modeloPorDefecto(motores, "video") };
      const linea = (m) => {
        const valores = Object.entries(m.ajustes ?? {}).map(([k, d]) => `${k}: ${d.valores.join("/")}`).join("; ");
        const apoyo = [m.inicial ? "imagen inicial" : "", m.final ? "imagen final" : "", m.referencias ? `hasta ${m.referencias} referencias` : ""].filter(Boolean).join(", ");
        return `· ${m.id} — ${m.nombre} · ${textoCosto(m.costo)}${m.por === "s" ? " por segundo" : " por imagen"}${m.estimado ? " (aprox.)" : ""}` +
          `${porDefecto[m.tipo]?.id === m.id ? " · PREDETERMINADO" : ""}${valores ? ` · ${valores}` : ""}${apoyo ? ` · admite ${apoyo}` : ""}`;
      };

      const [filas, trabajos, guia] = await Promise.all([
        acceso.leer("estudio_archivos", { client_id: c.id }, "created_at desc"),
        acceso.leer("estudio_trabajos", { client_id: c.id }, "created_at desc", 20),
        guiaVisual(c.id),
      ]);
      const galeria = filas.filter((f) => !f.borrado_at).slice(0, GALERIA_A_MOSTRAR);
      const vivos = trabajos.filter((t) => estaVivo(t.estado));

      return [
        `Estudio de ${c.name}.`,
        hay.length ? "" : "AVISO: este servidor sólo tiene el motor de prueba (tarjetas, no imágenes reales): falta la llave de un proveedor.",
        `IMÁGENES:\n${porTipo("imagen").map(linea).join("\n") || "(ninguno)"}`,
        `VIDEO:\n${porTipo("video").map(linea).join("\n") || "(ninguno)"}`,
        guia
          ? `GUÍA VISUAL DE LA MARCA (del cerebro; ponla en el prompt, con tus palabras):\n${guia}`
          : `GUÍA VISUAL: el cerebro de ${c.name} no tiene notas de identidad visual. Pregunta al usuario por colores, estilo y qué evitar, o pídele que las añada en la pestaña Cerebro.`,
        galeria.length
          ? `GALERÍA (lo último; el ID sirve de imagen_inicial o referencia):\n${galeria.map((f) => `· ${f.id} · ${f.tipo} · ${f.modelo || "subida"} · «${String(f.prompt).slice(0, 90)}»`).join("\n")}`
          : "GALERÍA: todavía no hay nada.",
        vivos.length ? `EN MARCHA:\n${vivos.map((t) => `· ${t.id} · ${t.tipo} · ${NOMBRE_ESTADO[t.estado]} · «${String(t.prompt).slice(0, 70)}»`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
    },

    async crear_en_estudio(entrada) {
      const c = await resolverCliente(entrada.cliente);
      const tipo = entrada.tipo === "video" ? "video" : "imagen";
      const motores = activos();
      const modelo = entrada.modelo ? modeloPorId(entrada.modelo) : modeloPorDefecto(motores, tipo);
      if (!modelo) throw new ErrorHerramientaEstudio(`No existe el modelo «${entrada.modelo}». Usa ver_estudio para ver cuáles hay.`);
      if (modelo.tipo !== tipo) throw new ErrorHerramientaEstudio(`${modelo.nombre} es un modelo de ${modelo.tipo}, no de ${tipo}.`);

      const n = Number(entrada.cantidad ?? 1);
      const tope = tipo === "video" ? LIMITES.videos : LIMITES.imagenes;
      if (!(Number.isInteger(n) && n >= 1 && n <= tope)) throw new ErrorHerramientaEstudio(`Puedes pedir de 1 a ${tope} ${tipo === "video" ? "videos" : "imágenes"} por vez desde aquí.`);

      // Lo que el modelo no admite se dice; no se cambia en silencio por otro valor.
      const ajustes = {};
      for (const [pedido, campo, valor] of [["formato", "aspectRatio", entrada.formato], ["duracion", "duration", entrada.duracion === undefined ? undefined : String(entrada.duracion)]]) {
        if (valor === undefined || valor === null || valor === "") continue;
        const def = modelo.ajustes?.[campo];
        if (!def?.valores.includes(valor)) {
          throw new ErrorHerramientaEstudio(`${modelo.nombre} no admite ${pedido} «${valor}»${def ? `; admite: ${def.valores.join(", ")}` : " (no lo tiene)"}.`);
        }
        ajustes[campo] = valor;
      }
      const segundos = Number(ajustes.duration ?? modelo.ajustes?.duration?.defecto ?? 0);
      if (tipo === "video" && segundos > LIMITES.segundos) throw new ErrorHerramientaEstudio(`Desde aquí un video dura como mucho ${LIMITES.segundos} s.`);

      const medios = {};
      if (entrada.imagen_inicial) medios.start = [await claveDeGaleria(c.id, entrada.imagen_inicial, "imagen_inicial")];
      if (entrada.imagen_final) medios.end = [await claveDeGaleria(c.id, entrada.imagen_final, "imagen_final")];
      if (Array.isArray(entrada.referencias) && entrada.referencias.length) {
        if (entrada.referencias.length > 8) throw new ErrorHerramientaEstudio("Demasiadas referencias.");
        medios.reference = await Promise.all(entrada.referencias.map((id) => claveDeGaleria(c.id, id, "referencia")));
      }

      let fila;
      try {
        fila = await crearTrabajo(env, acceso, c, {
          modelo: modelo.id, prompt: entrada.prompt, n, ajustes, medios, confirmado: entrada.confirmado === true,
        }, { usuario, origen, por });
      } catch (e) {
        if (!(e instanceof ErrorEstudio)) throw e;
        // La confirmación no es un error: es la respuesta correcta a un pedido caro.
        if (e.codigo === "confirmar") {
          return `NO SE CREÓ NADA. Este pedido cuesta ${textoCosto(e.costo)} (${modelo.nombre}, ${n} ${tipo === "video" ? `video${n > 1 ? "s" : ""} de ${segundos} s` : `imagen${n > 1 ? "es" : ""}`}). ` +
            "Díselo al usuario con esa cifra y pregúntale si lo hago. Sólo si responde que sí, vuelve a llamar con los MISMOS datos y confirmado=true.";
        }
        throw new ErrorHerramientaEstudio(e.message);
      }

      const t = trabajoPublico(fila);
      return [
        `Pedido creado: ${t.id} (${modelo.nombre}, ${n} ${tipo === "video" ? `video${n > 1 ? "s" : ""}` : `imagen${n > 1 ? "es" : ""}`}, costo ${textoCosto(t.costoEstimado)}${modelo.estimado ? ", aprox." : ""}).`,
        tipo === "video"
          ? "Un video tarda de 1 a 10 minutos. Sigue solo: no hace falta esperar aquí."
          : "Las imágenes tardan unos segundos a un par de minutos. Siguen solas: no hace falta esperar aquí.",
        `Va a la galería de ${c.name} (pestaña Estudio). Para saber cómo va: estado_trabajo con el ID ${t.id}.`,
      ].join("\n");
    },

    async estado_trabajo({ trabajo_id: id }) {
      const fila = await acceso.leerUno("estudio_trabajos", { id: String(id ?? "") });
      if (!fila) throw new ErrorHerramientaEstudio(`No encontré el pedido «${id}».`);
      const t = trabajoPublico(fila);
      const modelo = modeloPorId(t.modelo);
      const archivos = t.archivos.length
        ? (await Promise.all(t.archivos.map((a) => acceso.leerUno("estudio_archivos", { id: String(a), client_id: fila.client_id }))))
          .filter(Boolean).map((f) => `· ${f.id} · ${f.tipo} · /api/media/${f.clave}`)
        : [];
      return [
        `Pedido ${t.id}: ${NOMBRE_ESTADO[t.estado] ?? t.estado} — ${modelo?.nombre ?? t.modelo}, ${t.n} ${t.tipo === "video" ? "video" : "imagen"}${t.n > 1 ? "s" : ""}.`,
        t.error ? `Motivo: ${t.error}` : "",
        t.nota ? `Nota: ${t.nota}` : "",
        `Llevan ${t.archivos.length} de ${t.n}.`,
        t.costo > 0 ? `Costo real hasta ahora: ${textoCosto(t.costo)}.` : "",
        archivos.length ? `Archivos:\n${archivos.join("\n")}` : "",
        estaVivo(t.estado) ? "Sigue en marcha: se hace solo." : "",
      ].filter(Boolean).join("\n");
    },
  };

  return acciones;
}
