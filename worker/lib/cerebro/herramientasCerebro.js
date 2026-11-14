// ============================================================
// El CEREBRO y el ESTUDIO DE MERCADO por MCP (claude.ai): guardar, proponer y leer lo que usa el motor
//
//   · guardar_en_cerebro     guarda UNA nota en el cerebro del cliente (nueva, o reemplazando la que se nombra). Sin
//                            `confirmado: true` NO SE GUARDA NADA: devuelve exactamente lo que se guardaría. Va por la
//                            MISMA función que el PUT de la pantalla (worker/lib/cerebro/guardar.js).
//   · proponer_nota_cerebro  la IA PROPONE «Lenguaje del cliente», «Saber del rubro» o «Voz UGC» con las mismas funciones
//                            que los botones de Marca → Cerebro (lenguaje.js, rubro.js, vozUgc.js). NO guarda: se guarda
//                            con guardar_en_cerebro tras el sí de la persona.
//   · ver_estudio_mercado    el estudio APROBADO (lo general, las 7 maletas con su semáforo y los ángulos de venta), el
//                            catálogo con sus precios y lo que trae el borrador sin aprobar. Sin IA.
//   · proponer_angulos       «Proponer ángulos» de un producto: van al BORRADOR del estudio (mercado.js), nunca a lo
//                            aprobado. Aprobar el estudio se queda en la pantalla: la persona lo revisa entero allí.
//
// Por qué: por el conector, Claude escribía los textos con lo que buscaba en el cerebro y no podía guardar nada en él,
// ni leer el estudio de mercado, que es de donde el motor saca precios, maletas y ángulos.
// ============================================================

import { leerNotasLigeras } from "./cerebro.js";
import { prepararNota, guardarNota, ErrorNota } from "./guardar.js";
import { fold } from "./conocimiento.js";
import { fichaDesactualizada } from "./preparar.js";
import { proponerRubro } from "./rubro.js";
import { proponerLenguaje } from "./lenguaje.js";
import { proponerVozUgc } from "./vozUgc.js";
import { ErrorIA } from "./ia.js";
import { leerMercado, proponerAngulos, ErrorMercado } from "../mercado.js";
import { TIPOS_VISTA, TIPOS_PROPONIBLES } from "../../../src/lib/cerebroVista.js";
import { RUTA_RUBRO, TITULO_RUBRO } from "../../../src/lib/materialTipo.js";
import { RUTA_LENGUAJE, TITULO_LENGUAJE, describirLenguaje } from "../../../src/lib/lenguajeCliente.js";
import { RUTA_VOZ_UGC, TITULO_VOZ_UGC } from "../../../src/lib/ugc.js";
import {
  productosActivos, lineaDeProducto, resumenGeneral, lineaDeAngulo, limpiarAngulos, notaDeProducto, fechaLarga,
} from "../../../src/lib/estudioMercado.js";
import { semaforoMaletas } from "../../../src/lib/maletas.js";

/** Un error de lo pedido: vuelve a Claude con `isError`, no como fallo del servidor. */
export class ErrorCerebro extends Error {}

const clienteP = { type: "string", description: "Nombre o ID del cliente (de listar_clientes)." };
const soloLectura = { readOnlyHint: true, openWorldHint: false };
const escribe = (destructiva = false) => ({ readOnlyHint: false, destructiveHint: destructiva, openWorldHint: false });

/** Lo que se enseña del texto en la vista previa, como mucho (Claude tiene el resto: lo acaba de mandar). */
const MAX_VISTA = 8000;
/** Por encima de esto, el resumen del estudio enseña los ángulos de los productos que faltan sólo por su nombre. */
const MAX_RESUMEN = 18_000;

/** Las notas que lee el motor por su ruta fija: qué es cada una y para qué la usa. */
const NOTAS_DEL_MOTOR = Object.freeze({
  lenguaje_del_cliente: {
    ruta: RUTA_LENGUAJE, titulo: TITULO_LENGUAJE,
    para: "las frases EXACTAS de sus clientes; el motor la lee en TODO lo que escribe (ideas, captions, guiones, textos de anuncio) y la leen el estudio de mercado y los ángulos de venta",
  },
  saber_del_rubro: {
    ruta: RUTA_RUBRO, titulo: TITULO_RUBRO,
    para: "lo que un experto del rubro sabe (consejos, errores comunes, mitos, preguntas); el motor de ideas la lee ENTERA cuando escribe un contenido educativo",
  },
  voz_ugc: {
    ruta: RUTA_VOZ_UGC, titulo: TITULO_VOZ_UGC,
    para: "cómo habla esta marca en sus videos UGC (quién habla, tú o usted, cómo empieza y cierra, qué no dice); la sigue todo guion UGC de este cliente",
  },
});
const EFECTO_POR_RUTA = Object.fromEntries(Object.values(NOTAS_DEL_MOTOR).map((n) => [n.ruta, n]));

const nombreTipo = (t) => TIPOS_VISTA[t]?.nombre ?? t;
const recorte = (t, n) => {
  const s = String(t ?? "");
  return s.length > n ? `${s.slice(0, n)}\n[… y ${(s.length - n).toLocaleString("es")} caracteres más: es lo que mandaste]` : s;
};
const inicio = (t, n = 300) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const caracteres = (n) => `${n.toLocaleString("es")} ${n === 1 ? "carácter" : "caracteres"}`;
const fecha = (iso) => fechaLarga(String(iso ?? "").slice(0, 10)) || "";
const PUBLICO = { frio: "público frío: quien aún no conoce la marca", tibio: "público tibio: quien ya interactuó" };
const COLOR = { verde: "verde", ambar: "ámbar", rojo: "rojo" };

export const DEFINICIONES_CEREBRO = Object.freeze([
  {
    name: "guardar_en_cerebro",
    description: "Guarda UNA nota en el CEREBRO del cliente, lo que leen el asistente y el motor de la aplicación al escribir para él. Úsala cuando la persona pida recordar algo («anota esto», «de ahora en adelante…», «guarda este análisis»), o para guardar la nota que propuso proponer_nota_cerebro: guardarlo aquí es mejor que repetirlo en cada pedido, porque desde ese momento lo leen el motor de ideas, los guiones, el Estudio y el asistente de la aplicación. Escoge el tipo: «pautas» es una regla de CÓMO ESCRIBIR para este cliente (tono, estructura de un guion, palabras o emojis prohibidos, cómo va el llamado) y la IA la lee SIEMPRE; «nota», un dato del cliente; «decision», algo que el cliente aprobó o rechazó, con su porqué; «marca», tono, personas o límites de la marca. Escríbelo limpio, en frases que se entiendan solas dentro de un mes. Con «nota» (su ruta, la que da buscar_cerebro entre corchetes, o su título) REEMPLAZA esa nota entera; sin «nota», crea una nueva. Sin confirmado NO SE GUARDA NADA: devuelve exactamente lo que se guardaría (y, si reemplaza, qué había). Enséñaselo a la persona y, sólo con su sí, vuelve a llamar con lo mismo y confirmado=true. No pongas confirmado=true por tu cuenta.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP,
        titulo: { type: "string", description: "Título corto y claro (hasta 140 caracteres). Ej.: «Estructura de los reels», «Sin emojis de fuego». Las notas que lee el motor por su nombre van con SU título: «Lenguaje del cliente», «Saber del rubro», «Voz UGC»." },
        texto: { type: "string", description: "Lo que se guarda, completo y limpio." },
        tipo: { type: "string", enum: [...TIPOS_PROPONIBLES], description: "pautas: cómo escribir (la IA las lee siempre). nota: un dato. decision: lo que el cliente aprobó o rechazó y por qué. marca: tono, personas o límites. Al reemplazar, si se omite, se queda el de la nota." },
        interna: { type: "boolean", description: "true: sólo la ven el equipo y el asistente, NUNCA entra en lo que se escribe para publicar (costos, márgenes, proveedores). Una pauta no puede ser interna. Al reemplazar, si se omite, se queda como estaba." },
        nota: { type: "string", description: "Para REEMPLAZAR una nota que ya existe: su ruta (la de buscar_cerebro entre corchetes) o su título. Sin esto, se crea una nota nueva." },
        confirmado: { type: "boolean", description: "Sólo tras el «sí» de la persona a lo que devolvió la primera llamada." },
      },
      required: ["cliente", "titulo", "texto"],
    },
    annotations: escribe(true),
  },
  {
    name: "proponer_nota_cerebro",
    description: "La IA de la aplicación PROPONE una de las tres notas del cerebro que el motor lee por su nombre, con las mismas reglas que sus botones en Marca → Cerebro: «lenguaje_del_cliente» (las frases EXACTAS con que sus clientes cuentan su problema, dudas, deseos y elogios: sale de lo que pegues en material —reseñas, comentarios—, de las reseñas de la competencia en competencia, de los comentarios de la Bandeja y de la encuesta; el CÓDIGO descarta toda frase que no esté tal cual y cambia las marcas de la competencia por «otra marca»; el motor la lee en TODO lo que escribe), «saber_del_rubro» (lo que sabe un experto del rubro, con búsqueda web si la cuenta la tiene: consejos, errores, mitos, preguntas; la lee el motor cuando escribe un EDUCATIVO; tarda uno o dos minutos) o «voz_ugc» (cómo habla la marca en sus videos UGC, sacada de sus guiones UGC; la sigue todo guion UGC). Úsala en vez de escribir tú esa nota: la propuesta lleva lo comprobado por el código y lo que ya sabe la aplicación. Gasta una llamada de IA. NO guarda nada: enséñale la propuesta a la persona y, con su sí, guárdala con guardar_en_cerebro (con el título y la ruta que dice la respuesta).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP,
        tipo: { type: "string", enum: Object.keys(NOTAS_DEL_MOTOR) },
        material: { type: "string", description: "Sólo lenguaje_del_cliente: reseñas o comentarios de SUS clientes, pegados tal cual (opcional si ya hay comentarios en la Bandeja o respuestas a la encuesta)." },
        competencia: { type: "string", description: "Sólo lenguaje_del_cliente: reseñas de clientes de OTRAS marcas (las de 1 estrella sirven: dicen lo que odian de otras opciones)." },
        marcas: { type: "string", description: "Sólo lenguaje_del_cliente: nombres de la competencia que hay que ocultar, separados por comas (además de los del estudio de mercado)." },
      },
      required: ["cliente", "tipo"],
    },
    annotations: escribe(),
  },
  {
    name: "ver_estudio_mercado",
    description: "El ESTUDIO DE MERCADO de un cliente tal como lo usa la aplicación: el catálogo con sus precios EXACTOS (con el id de cada producto), lo general del mercado (perfiles, deseos, nivel de consciencia, el problema, la transformación…), por cada producto las 7 MALETAS con su semáforo (si falta una, no se lanza el anuncio) y sus ÁNGULOS DE VENTA (con su público frío o tibio y sus ganchos), y si hay un BORRADOR sin aprobar y qué trae de nuevo. Con producto, el detalle entero de ese producto (sus maletas, objeciones con respuesta, ganchos por nivel, textos de anuncio y ángulos). Úsala ANTES de escribir anuncios, ganchos o textos de venta para un cliente: escribe con esto delante en vez de inventar precios, garantías o testimonios. Sólo lee; no gasta.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP,
        producto: { type: "string", description: "Opcional: el id o el nombre de un producto del catálogo, para su detalle entero." },
      },
      required: ["cliente"],
    },
    annotations: soloLectura,
  },
  {
    name: "proponer_angulos",
    description: "«Proponer ángulos» de UN producto que ya tiene su estudio de mercado: la IA de la aplicación propone de 3 a 5 ÁNGULOS DE VENTA distintos (una razón diferente para comprar cada uno: problema, lo que siente, cómo lo resuelve, lo que lo distingue, la objeción y el mito que desarma, público frío o tibio y sus ganchos), con su estudio delante y sin inventar garantías (el código quita la que el estudio no respalda y la pide). Úsala en vez de inventar ángulos tú: así quedan donde los lee el motor. Escribe en el BORRADOR del estudio, nunca en lo aprobado (si el borrador ya tenía ángulos de ese producto, los reemplaza): para que el motor los use, la persona tiene que revisarlos y aprobar el estudio en Marca → Cerebro → Estudio de mercado. Gasta una llamada de IA barata (sin búsqueda web).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP,
        producto: { type: "string", description: "El id o el nombre del producto del catálogo (ver_estudio_mercado los da)." },
      },
      required: ["cliente", "producto"],
    },
    annotations: escribe(),
  },
]);

/** La nota que nombra `cual` (ruta exacta, título exacto o una sola que lo contenga). Lanza si no hay o si hay varias. */
function notaPorNombre(notas, cual, cliente) {
  const q = String(cual ?? "").trim().slice(0, 200);
  const f = fold(q);
  const exacta = notas.find((n) => n.ruta === q) ?? notas.find((n) => fold(n.titulo) === f);
  if (exacta) return exacta;
  const parecidas = f ? notas.filter((n) => fold(n.titulo).includes(f) || n.ruta.includes(f)) : [];
  if (parecidas.length === 1) return parecidas[0];
  if (parecidas.length > 1) {
    throw new ErrorCerebro(`Hay ${parecidas.length} notas que encajan con «${q}»: ${parecidas.slice(0, 10).map((n) => `«${n.titulo}» [${n.ruta}]`).join(", ")}. Pasa en «nota» la ruta exacta de la que quieres reemplazar.`);
  }
  throw new ErrorCerebro(`El cerebro de ${cliente.name} no tiene una nota «${q}». Búscala con buscar_cerebro (su ruta va entre corchetes) o, para crear una nueva, llama sin «nota».`);
}

/** El producto activo del catálogo que nombra `cual` (id, nombre exacto o uno solo que lo contenga). Lanza si no. */
function productoPorNombre(catalogo, cual, cliente) {
  const activos = productosActivos(catalogo);
  if (!activos.length) throw new ErrorCerebro(`${cliente.name} no tiene catálogo todavía: se hace en Marca → Cerebro → Estudio de mercado.`);
  const q = String(cual ?? "").trim();
  const f = fold(q);
  const p = activos.find((x) => x.id === q) ?? activos.find((x) => fold(x.nombre) === f);
  if (p) return p;
  const parecidos = f ? activos.filter((x) => fold(x.nombre).includes(f)) : [];
  if (parecidos.length === 1) return parecidos[0];
  const lista = activos.map((x) => `«${x.nombre}» (id ${x.id})`).join(", ");
  throw new ErrorCerebro(parecidos.length > 1
    ? `Hay ${parecidos.length} productos que encajan con «${q}». Dime cuál: ${parecidos.map((x) => `«${x.nombre}» (id ${x.id})`).join(", ")}.`
    : `«${q}» no está en el catálogo activo de ${cliente.name}. Los que hay: ${lista}.`);
}

/** Un ángulo como lo lee Claude: su línea, su público y sus ganchos. */
function lineasDeAngulo(a, sangria = "  ") {
  return [
    `${sangria}- ${lineaDeAngulo(a)}${a.publico ? ` [${PUBLICO[a.publico]}]` : ""}`,
    ...(a.ganchos?.length ? [`${sangria}  Ganchos: ${a.ganchos.map((g) => `«${g}»`).join(" · ")}`] : []),
  ];
}

/** El semáforo de un producto en una línea: su color y su aviso. */
function lineaDeSemaforo(est) {
  const s = semaforoMaletas(est);
  return `semáforo ${COLOR[s.estado]} — ${s.aviso}`;
}

/** Qué trae el borrador que no está en lo aprobado, en frases. */
function novedadesDelBorrador(aprobado, borrador, catalogo) {
  if (!borrador) return [];
  const nombre = (id, est) => productosActivos(catalogo).find((p) => p.id === id)?.nombre ?? est?.nombre ?? id;
  const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const lineas = [];
  if (!aprobado) {
    lineas.push("Todavía no hay estudio aprobado: todo lo del borrador es nuevo.");
    if (borrador.general) lineas.push("Lo general del mercado.");
  } else if (borrador.general && !igual(borrador.general, aprobado.general)) {
    lineas.push("Lo general del mercado, rehecho o corregido.");
  }
  for (const [id, est] of Object.entries(borrador.productos ?? {})) {
    const antes = aprobado?.productos?.[id];
    const angulos = limpiarAngulos(est.angulos);
    if (!antes) lineas.push(`«${nombre(id, est)}»: estudio nuevo${angulos.length ? `, con ${angulos.length} ángulos de venta` : ""}.`);
    else if (!igual(angulos, limpiarAngulos(antes.angulos))) lineas.push(`«${nombre(id, est)}»: ${angulos.length} ángulos de venta propuestos (${angulos.map((a) => `«${a.nombre}»`).join(", ") || "ninguno"}).`);
    else if (!igual(est, antes)) lineas.push(`«${nombre(id, est)}»: cambios en su estudio.`);
  }
  for (const [id, est] of Object.entries(aprobado?.productos ?? {})) {
    if (!borrador.productos?.[id]) lineas.push(`«${nombre(id, est)}» no está en el borrador: si se aprueba así, su estudio se quita.`);
  }
  return lineas;
}

/** El detalle de UN producto: su semáforo maleta a maleta, su estudio entero y lo que trae el borrador. */
function detalleDeProducto(c, m, p) {
  const aprobado = m.estudio?.productos?.[p.id] ?? null;
  const enBorrador = m.borrador?.productos?.[p.id] ?? null;
  const est = aprobado ?? enBorrador;
  if (!est) {
    return `«${p.nombre}» (id ${p.id}) de ${c.name} no tiene estudio todavía (ni aprobado ni en el borrador): se hace en Marca → Cerebro → Estudio de mercado. Sin él, las 7 maletas están en rojo y no se lanza el anuncio.\n${lineaDeProducto(p, { inventario: m.inventario })}`;
  }
  const s = semaforoMaletas(est);
  const partes = [
    `ESTUDIO DE «${p.nombre}» (id ${p.id}) de ${c.name} — ${aprobado ? `aprobado${m.estudio.aprobadoAt ? ` el ${fecha(m.estudio.aprobadoAt)}` : ""}` : "del BORRADOR sin aprobar: el motor todavía NO lo usa"}.`,
    [
      `SEMÁFORO DE LAS 7 MALETAS (${COLOR[s.estado]}): ${s.aviso}`,
      ...s.maletas.map((x) => `· ${x.titulo}: ${COLOR[x.estado]} — ${x.motivo}${x.arreglo ? ` Cómo se arregla: ${x.arreglo}` : ""}${x.delCliente && x.estado !== "verde" ? " (sólo lo puede dar el cliente: no se inventa)" : ""}`),
    ].join("\n"),
    notaDeProducto(est, p),
  ];
  if (aprobado && enBorrador && JSON.stringify(enBorrador) !== JSON.stringify(aprobado)) {
    const angulos = limpiarAngulos(enBorrador.angulos);
    const cambian = JSON.stringify(angulos) !== JSON.stringify(limpiarAngulos(aprobado.angulos));
    partes.push([
      "EN EL BORRADOR SIN APROBAR hay cambios para este producto (el motor todavía no los usa).",
      ...(cambian ? [`Ángulos de venta propuestos (${angulos.length}):`, ...angulos.flatMap((a) => lineasDeAngulo(a, ""))] : []),
      "Para que cuenten, la persona aprueba el estudio en Marca → Cerebro → Estudio de mercado.",
    ].join("\n"));
  }
  return partes.join("\n\n");
}

/**
 * Las herramientas. `resolverCliente(nombre)` → la fila del cliente (lanza si no es de este espacio o de esta persona).
 */
export function crearHerramientasCerebro({ env, acceso, resolverCliente }) {
  /** Lo que guardaría guardar_en_cerebro, sin escribir: la nota limpia, la que reemplaza, su ruta y los avisos. */
  async function planDeGuardado(c, { titulo, texto, tipo, interna, nota }) {
    if (tipo !== undefined && !TIPOS_PROPONIBLES.includes(tipo)) {
      throw new ErrorCerebro(`Tipo no válido: «${tipo}». Los que se pueden escoger: ${TIPOS_PROPONIBLES.join(", ")}.`);
    }
    const notas = await leerNotasLigeras(acceso, c.id);
    const cual = String(nota ?? "").trim();
    const destino = cual ? notaPorNombre(notas, cual, c) : null;
    const entrada = {
      ...(destino ? { id: destino.id } : {}),
      titulo, texto,
      tipo: tipo ?? destino?.tipo ?? "nota",
      interna: interna === undefined ? Boolean(destino?.interna) : interna === true,
    };
    let plan;
    try {
      plan = await prepararNota(acceso, c.id, entrada);
    } catch (e) {
      if (e instanceof ErrorNota) throw new ErrorCerebro(e.message);
      throw e;
    }
    const avisos = [];
    if (entrada.interna && !plan.nota.interna) avisos.push("Una pauta no puede ser interna (no llegaría a lo que se escribe): se guarda visible.");
    if (!plan.previa) {
      const mismo = notas.find((n) => fold(n.titulo) === fold(plan.nota.titulo));
      if (mismo) avisos.push(`Ya hay una nota «${mismo.titulo}» [${mismo.ruta}]: así se crearía OTRA aparte (ruta «${plan.ruta}»). Para reemplazarla, pasa nota="${mismo.ruta}".`);
    } else if (plan.previa.origen === "mercado") {
      avisos.push("OJO: esta nota la escribe el estudio de mercado (o el catálogo): cuando se vuelva a guardar el catálogo o a aprobar el estudio, se reescribe y se pierde lo que cambies aquí. Lo de fondo se cambia en Marca → Cerebro → Estudio de mercado.");
    } else if (plan.previa.origen === "repositorio") {
      avisos.push("Esta nota salió del repositorio de GitHub: al guardarla queda corregida a mano y una importación ya no la pisa.");
    } else if (plan.previa.origen === "ia" && ["ficha", "cifras"].includes(plan.previa.tipo)) {
      avisos.push("Esta nota la escribió la IA con «Preparar ficha»: al guardarla queda corregida a mano y renovar la ficha ya no la reescribe (salvo «Renovar de todas formas»).");
    }
    return { ...plan, avisos };
  }

  /** Para qué sirve una nota guardada, en una frase. */
  const efectoDe = (ruta, nota) => {
    if (EFECTO_POR_RUTA[ruta]) return `Es «${EFECTO_POR_RUTA[ruta].titulo}»: ${EFECTO_POR_RUTA[ruta].para}.`;
    if (nota.interna) return "Es interna: la ven el equipo y el asistente, pero no entra en nada de lo que se escribe para publicar.";
    if (nota.tipo === "pautas") return "Es una pauta: la IA la sigue SIEMPRE que escribe para este cliente (asistente, ideas, guiones, Estudio).";
    return "La encuentran el asistente y el motor cuando buscan en el cerebro sobre ese tema.";
  };

  return {
    async guardar_en_cerebro({ cliente, titulo = "", texto = "", tipo, interna, nota, confirmado } = {}) {
      const c = await resolverCliente(cliente);
      const plan = await planDeGuardado(c, { titulo, texto, tipo, interna, nota });
      const { nota: limpia, previa, ruta } = plan;

      if (confirmado !== true) {
        return [
          `NO SE GUARDÓ NADA. Esto es lo que se guardaría en el cerebro de ${c.name}:`,
          previa
            ? `· REEMPLAZA la nota «${previa.titulo}» [${previa.ruta}] (${nombreTipo(previa.tipo)}${previa.interna ? ", interna" : ""}), que tiene ${caracteres(String(previa.texto ?? "").length)} y empieza así: «${inicio(previa.texto)}». Lo que tenía no se recupera.`
            : `· Una nota NUEVA (ruta «${ruta}»).`,
          `· Tipo: ${nombreTipo(limpia.tipo)}.${TIPOS_VISTA[limpia.tipo]?.ayuda ? ` ${TIPOS_VISTA[limpia.tipo].ayuda}.` : ""}`,
          `· Interna: ${limpia.interna ? "sí (no entra en lo que se escribe para publicar)" : "no (puede salir en lo que se escribe para publicar)"}.`,
          `· Título: «${limpia.titulo}»`,
          `· Texto (${caracteres(limpia.texto.length)}):`,
          recorte(limpia.texto, MAX_VISTA),
          ...(plan.avisos.length ? ["", ...plan.avisos.map((a) => `Aviso: ${a}`)] : []),
          "",
          "Enséñaselo a la persona y, sólo con su sí, vuelve a llamar con lo mismo y confirmado=true.",
        ].join("\n");
      }

      let r;
      try {
        r = await guardarNota(env, acceso, c.id, { ...(previa ? { id: previa.id } : {}), ...limpia, interna: Boolean(limpia.interna) });
      } catch (e) {
        if (e instanceof ErrorNota) throw new ErrorCerebro(e.message);
        throw e;
      }
      const g = r.guardada;
      // La ficha técnica y las cifras las escribe la IA a partir de las notas: si este dato va ahí, quedaron atrás.
      const vieja = !g.interna && ["marca", "decision", "nota"].includes(g.tipo) ? fichaDesactualizada(await leerNotasLigeras(acceso, c.id)) : null;
      return [
        `Guardada en el cerebro de ${c.name}: «${g.titulo}» [${g.ruta}] (${nombreTipo(g.tipo)}${g.interna ? ", interna" : ""}).`,
        r.previa ? `Reemplazó la nota anterior (tenía ${caracteres(String(r.previa.texto ?? "").length)}).` : "Es una nota nueva.",
        efectoDe(g.ruta, g),
        ...plan.avisos.filter((a) => a.startsWith("Una pauta")),
        vieja ? "La ficha técnica y las cifras (lo que la IA lee SIEMPRE) son de antes de este cambio: si cambió un dato que va ahí (teléfono, precio, horario), que la persona las renueve en Marca → Cerebro." : "",
      ].filter(Boolean).join("\n");
    },

    async proponer_nota_cerebro({ cliente, tipo, material = "", competencia = "", marcas = "" } = {}) {
      const c = await resolverCliente(cliente);
      const def = NOTAS_DEL_MOTOR[tipo];
      if (!def) throw new ErrorCerebro(`Tipo no válido: «${tipo}». Los que hay: ${Object.keys(NOTAS_DEL_MOTOR).join(", ")}.`);
      let r;
      try {
        if (tipo === "lenguaje_del_cliente") {
          r = await proponerLenguaje(env, acceso, c, { texto: String(material ?? ""), competencia: String(competencia ?? ""), marcas: String(marcas ?? "").slice(0, 2000) });
        } else if (tipo === "saber_del_rubro") {
          r = await proponerRubro(env, acceso, c);
        } else {
          r = await proponerVozUgc(env, acceso, c);
        }
      } catch (e) {
        if (e instanceof ErrorIA) throw new ErrorCerebro(e.message);
        throw e;
      }
      const existente = r.existente?.id
        ? (await acceso.leerColumnas("cerebro_notas", ["ruta", "caracteres"], { id: r.existente.id, client_id: c.id }))[0] ?? null
        : null;
      const detalle = tipo === "lenguaje_del_cliente"
        ? describirLenguaje(r)
        : tipo === "saber_del_rubro"
          ? `${r.conWeb ? "La IA buscó en internet: que la persona revise los datos y sus fuentes antes de guardarla." : "Sin búsqueda en internet: sólo conocimiento general y seguro del rubro."}${r.fuentes?.length ? ` Fuentes: ${r.fuentes.join(" · ")}` : ""}`
          : r.guiones ? `La IA leyó ${r.guiones} ${r.guiones === 1 ? "guion UGC" : "guiones UGC"} de ${c.name}.` : `${c.name} todavía no tiene guiones UGC: la propuesta sale de lo que se sabe de la marca.`;
      const ignorado = tipo !== "lenguaje_del_cliente" && [material, competencia, marcas].some((x) => String(x ?? "").trim())
        ? "(material, competencia y marcas sólo cuentan para lenguaje_del_cliente: aquí no se usaron.)" : "";
      const cabecera = [
        `PROPUESTA — NO SE GUARDÓ NADA: la nota «${r.titulo}» de ${c.name}: ${def.para}.`,
        detalle,
        ignorado,
        r.aviso ?? "",
        existente
          ? `Ya hay una nota «${def.titulo}» [${existente.ruta}] de ${caracteres(Number(existente.caracteres) || 0)}: la propuesta parte de ella y guardarla la REEMPLAZA.`
          : "Todavía no tiene esta nota: se crearía nueva.",
        `Para guardarla: enséñasela a la persona (puede corregirla) y, sólo con su sí, guardar_en_cerebro con cliente «${c.name}», titulo «${r.titulo}», tipo «nota», el texto de abajo (con lo que corrija)${existente ? `, nota «${existente.ruta}»` : ""} y confirmado=true. Guárdala con ESE título: es por el que el motor la encuentra.`,
      ].filter(Boolean).join("\n");
      return `${cabecera}\n\nTEXTO PROPUESTO:\n${r.texto}`;
    },

    async ver_estudio_mercado({ cliente, producto } = {}) {
      const c = await resolverCliente(cliente);
      const m = await leerMercado(acceso, c.id);
      const activos = productosActivos(m.catalogo);
      if (!activos.length && !m.estudio && !m.borrador) {
        return `${c.name} todavía no tiene catálogo ni estudio de mercado: se hacen en Marca → Cerebro → Estudio de mercado (el catálogo con sus precios y «Realizar estudio de mercado», por pasos y con revisión). Sin ellos, no inventes precios, garantías ni testimonios: pregúntalos.`;
      }
      if (String(producto ?? "").trim()) return detalleDeProducto(c, m, productoPorNombre(m.catalogo, producto, c));

      const e = m.estudio;
      const partes = [
        e ? `ESTUDIO DE MERCADO DE ${c.name}${e.aprobadoAt ? ` (aprobado el ${fecha(e.aprobadoAt)})` : ""}. Es lo que leen el motor de ideas, el lote y el plan de campañas: escribe con esto delante en vez de inventar.`
          : `${c.name} no tiene un estudio de mercado APROBADO: el motor todavía no usa ninguno.${m.borrador ? " Hay un borrador (abajo)." : ""}`,
      ];
      if (activos.length) {
        partes.push([
          "CATÁLOGO (los precios y ofertas son EXACTAMENTE estos: no se inventan otros ni se redondean):",
          ...activos.map((p) => `${lineaDeProducto(p, { inventario: m.inventario })} (id ${p.id})`),
          ...(m.inventario ? ["Inventario encendido: lo agotado no se anuncia."] : []),
        ].join("\n"));
      }
      const g = e?.general ? resumenGeneral(e.general) : "";
      if (g) partes.push(`LO GENERAL DEL MERCADO:\n${g}${e.general.faltan?.length ? `\nFalta por confirmar: ${e.general.faltan.join("; ")}` : ""}`);

      if (e) {
        const bloques = [];
        let largo = partes.join("\n\n").length;
        for (const p of activos) {
          const est = e.productos?.[p.id];
          if (!est) {
            bloques.push(`· «${p.nombre}» (id ${p.id}): sin estudio todavía (se hace en la pantalla, paso a paso). Sin él, las 7 maletas están en rojo: no se lanza el anuncio.`);
            continue;
          }
          const s = semaforoMaletas(est);
          const angulos = limpiarAngulos(est.angulos);
          const compacto = largo > MAX_RESUMEN;
          const lineas = [
            `· «${p.nombre}» (id ${p.id}): ${lineaDeSemaforo(est)}`,
            ...(s.flojas.length ? [`  Flojas (escritas pero muy cortas o generales): ${s.maletas.filter((x) => x.estado === "ambar").map((x) => x.titulo.toLowerCase()).join(", ")}.`] : []),
            ...(est.faltan?.length ? [`  Falta por confirmar: ${est.faltan.join("; ")}.`] : []),
            angulos.length
              ? (compacto
                ? `  Ángulos de venta (${angulos.length}): ${angulos.map((a) => `«${a.nombre}»${a.publico ? ` (${a.publico === "frio" ? "frío" : "tibio"})` : ""}`).join(", ")} — su detalle, con producto.`
                : [`  Ángulos de venta (${angulos.length}):`, ...angulos.flatMap((a) => lineasDeAngulo(a, "  "))].join("\n"))
              : "  Sin ángulos de venta: proponer_angulos con este producto los propone (al borrador).",
          ];
          const bloque = lineas.join("\n");
          largo += bloque.length;
          bloques.push(bloque);
        }
        if (bloques.length) partes.push(`LAS 7 MALETAS Y LOS ÁNGULOS DE VENTA, POR PRODUCTO:\n${bloques.join("\n")}`);
      }

      const novedades = novedadesDelBorrador(e, m.borrador, m.catalogo);
      if (novedades.length) {
        partes.push([
          `BORRADOR SIN APROBAR${m.borrador.hechoAt ? ` (del ${fecha(m.borrador.hechoAt)})` : ""}: el motor todavía NO lo usa. Trae:`,
          ...novedades.map((x) => `- ${x}`),
          "Para que el motor lo use, la persona lo revisa y lo aprueba en Marca → Cerebro → Estudio de mercado (no se aprueba desde aquí).",
        ].join("\n"));
      }
      partes.push("El detalle de un producto (sus maletas enteras, objeciones con su respuesta, ganchos por nivel de consciencia y textos de anuncio): ver_estudio_mercado con producto.");
      return partes.join("\n\n");
    },

    async proponer_angulos({ cliente, producto } = {}) {
      const c = await resolverCliente(cliente);
      if (!String(producto ?? "").trim()) throw new ErrorCerebro("Dime de qué producto (su id o su nombre; ver_estudio_mercado los da).");
      const m = await leerMercado(acceso, c.id);
      const p = productoPorNombre(m.catalogo, producto, c);
      const antes = limpiarAngulos(m.borrador?.productos?.[p.id]?.angulos).length;
      let r;
      try {
        r = await proponerAngulos(env, acceso, c, { productoId: p.id });
      } catch (e) {
        // Sin estudio de ese producto (409): se hace en la pantalla, por pasos y con revisión; no desde aquí.
        if (e instanceof ErrorMercado && e.estado === 409) throw new ErrorCerebro(`${e.message} Se hace en Marca → Cerebro → Estudio de mercado («Realizar estudio de mercado», por pasos y con revisión).`);
        if (e instanceof ErrorMercado || e instanceof ErrorIA) throw new ErrorCerebro(e.message);
        throw e;
      }
      const angulos = limpiarAngulos(r.angulos);
      const faltan = r.borrador?.productos?.[p.id]?.faltan ?? [];
      return [
        `Ángulos de venta propuestos para «${p.nombre}» de ${c.name} (${angulos.length}).`,
        `Quedaron en el BORRADOR del estudio de mercado, NO en lo aprobado${antes ? ` (reemplazaron los ${antes} que el borrador tenía para este producto)` : ""}: para que el motor los use (ideas, lote, plan de campañas), la persona tiene que revisarlos y aprobar el estudio en Marca → Cerebro → Estudio de mercado.`,
        "",
        ...angulos.flatMap((a, i) => lineasDeAngulo(a, "").map((l, j) => (j === 0 ? `${i + 1}. ${l.replace(/^- /, "")}` : `   ${l.trim()}`))),
        ...(faltan.length ? ["", `Falta por confirmar (pídeselo al cliente; no se inventa): ${faltan.join("; ")}.`] : []),
        ...(r.aviso ? ["", r.aviso] : []),
      ].join("\n");
    },
  };
}
