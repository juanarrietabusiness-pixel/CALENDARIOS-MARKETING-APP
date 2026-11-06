// ============================================================
// El VIDEO por MCP: Claude crea un reel (el encargo del servidor), lo monta, pregunta «¿Está listo?» y extrae un UGC
//
//   · crear_reel          el guion por planos (texto, céntimos) y, con confirmado=true, el ENCARGO del servidor: el
//                         storyboard en orden, el video o los clips y, si se pide, el montaje con la voz de la marca, el
//                         texto, los subtítulos y el logo. Lo que sale se pone SOLO en su publicación. Primero el plan con
//                         su costo (NO SE CREÓ NADA); sólo con el «sí» de la persona, confirmado=true
//   · estado_reel         cómo va (fotogramas, video o clips, montaje) y, de lo listo, las IMÁGENES del storyboard
//   · continuar_reel      tras revisar el storyboard: el video o los clips (con su costo y confirmación)
//   · montar_reel         «Montarlo aquí»: el proyecto de video animado; en automático, además la voz (SIEMPRE se
//                         confirma: confirmado_voz) y el render
//   · video_listo         «¿Está listo este video?» sobre un video de la galería, el mp4 de un video animado o el de una
//                         publicación
//   · extraer_guion_ugc   la transcripción de un video (de la galería o de YouTube) adaptada a la marca como UGC
//
// Sólo en el MCP: herramientas.js (la del asistente) importa herramientasVideo.js, y desde aquí se llega a encargos.js y
// a mercado.js, que por herramientasServidor.js volverían a herramientas.js (el ciclo que deja las definiciones sin
// iniciar; ver vistaEstudio.js). Por el mismo camino que la pantalla: el encargo es el de FlujoReel.
// ============================================================

import { crearEncargo, accionDeReel, encargoPublico } from "./encargos.js";
import { vistaDeEncargo } from "./vistaEstudio.js";
import { lineasDeMedios } from "./vistaMedios.js";
import { crearCarpeta } from "./galeria.js";
import { guionDeReel } from "./reel.js";
import { revisarVideo } from "./revisionVideo.js";
import { extraerUgc, leerMercado, ErrorMercado } from "../mercado.js";
import { kitDe } from "./kit.js";
import { estadoMotores } from "./motores.js";
import { ErrorEstudio } from "./trabajos.js";
import { ErrorDiseno } from "./herramientasDiseno.js";
import { proyectoDe } from "../videosProyectos.js";
import { estructuraExistente } from "../estructurasGuion.js";
import { duracionesDeReel, rutaDeDuracion, duracionDeClip, haceDuracion, DURACION_REEL_POR_DEFECTO } from "../../../src/lib/duracionesVideo.js";
import { pedidoDeVideo, pedidoDeClip, modelosParaReel, modeloParaClips, modelosParaClips } from "../../../src/lib/reelPedidos.js";
import { esTomaFija } from "../../../src/lib/reel.js";
import { saldoKie, textoDeSaldo } from "./kie.js";
import { USD_POR_CREDITO } from "../../../src/lib/voces.js";
import { MODELOS, modeloPorId, porPrecio, estimar, textoCosto, nombreDelModelo } from "../../../src/lib/estudioCatalogo.js";
import { estiloDeMarca, limpiarKit } from "../../../src/lib/kitMarca.js";
import { fotosDelCatalogo } from "../../../src/lib/estudioMercado.js";
import { textoDelGuionReel, ganchoDe, llamadoDe } from "../../../src/lib/montajeReel.js";
import { FRASE_VEREDICTO } from "../../../src/lib/revisionVideo.js";

/** Un error de lo pedido: vuelve a Claude con `isError` (el mismo que el director: mcp.js ya lo conoce). */
export const ErrorReel = ErrorDiseno;

const activosDe = (env) => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clienteP = { type: "string", description: "Nombre o ID del cliente (de listar_clientes)." };
const escribe = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const soloLectura = { readOnlyHint: true, openWorldHint: false };

/** El modelo de los FOTOGRAMAS: el del kit si admite referencias (la continuidad), si no el más barato que sí. Pura. */
export function modeloParaFotogramas(activos = {}, kit = {}) {
  const fijado = modeloPorId(String(kit?.modelos?.imagen ?? ""));
  if (fijado?.tipo === "imagen" && (fijado.referencias ?? 0) >= 2 && (fijado.motor === "prueba" || activos[fijado.motor])) return fijado;
  const lista = porPrecio(MODELOS.filter((m) => m.tipo === "imagen" && (m.referencias ?? 0) >= 2 && (m.motor === "prueba" || activos[m.motor])), activos);
  return lista.find((m) => m.motor !== "prueba") ?? lista[0] ?? null;
}

/**
 * El plan del reel con su costo (sin crear nada): cuántos fotogramas, por qué ruta sale (un video o clips y montaje),
 * con qué modelos y cuánto, más o menos. Pura salvo por los imports.
 */
export function planDeReel({ guion, activos, kit, salida, modeloVideoId = "", montar = true }) {
  const segundos = Number(guion?.segundos) || DURACION_REEL_POR_DEFECTO;
  const planos = guion?.planos ?? [];
  const imagen = modeloParaFotogramas(activos, kit);
  const ruta = rutaDeDuracion(activos, segundos);
  const deUno = modelosParaReel(activos).filter((m) => haceDuracion(m, segundos));
  // Un video sólo con un modelo que haga ESA duración: si ninguno, por clips (nunca un guion de 30 s con uno de 10).
  const pedida = salida === "clips" || salida === "uno" ? salida : ruta?.segundos === segundos ? ruta.ruta : "clips";
  const s = pedida === "uno" && !deUno.length ? "clips" : pedida;
  const elegido = modeloPorId(modeloVideoId);
  const video = s === "uno"
    ? (elegido && deUno.some((m) => m.id === elegido.id) ? elegido : deUno.find((m) => m.id === ruta?.modelos?.[0]) ?? deUno.find((m) => m.motor !== "prueba") ?? deUno[0] ?? null)
    : (elegido?.inicial ? elegido : modeloParaClips(activos));
  const costoFotos = imagen ? planos.length * estimar(imagen, 1, { imageSize: "2K" }) : 0;
  // Con montaje, la toma FIJA (el producto, un beneficio, el cierre) va con su fotograma: ese clip no se paga.
  const conClip = montar ? planos.filter((p) => !esTomaFija(p)) : planos;
  const costoClips = (m, lista) => lista.reduce((t, p) => t + estimar(m, 1, pedidoDeClip({ modelo: m, plano: p, fotograma: { clave: "x" }, segundos: duracionDeClip(m, Math.max(1, p.hasta - p.desde)) }).ajustes), 0);
  const costoUno = (m) => estimar(m, 1, pedidoDeVideo({ modelo: m, planos, segundos, fotogramas: [{ clave: "x" }] }).ajustes);
  const costoVideo = !video ? 0 : s === "uno" ? costoUno(video) : costoClips(video, conClip);
  // La OPCIÓN CARA con que se compara: lo más caro entre un solo video con el preferido de esa duración y un clip por
  // cada plano con el siguiente modelo de clips. Así el plan dice cuánto se ahorra.
  const alternativas = [
    ...(deUno[0] ? [{ nombre: `un video con ${deUno[0].nombre}`, costo: costoUno(deUno[0]) }] : []),
    ...modelosParaClips(activos).filter((m) => m.motor !== "prueba" && m.id !== video?.id).slice(0, 2)
      .map((m) => ({ nombre: `${planos.length} clips con ${m.nombre}`, costo: costoClips(m, planos) })),
  ].filter((a) => a.costo > costoVideo);
  const cara = alternativas.sort((a, b) => b.costo - a.costo)[0] ?? null;
  return {
    segundos, salida: s, imagen, video, costoFotos, costoVideo, total: costoFotos + costoVideo, planos: planos.length,
    clips: s === "clips" ? conClip.length : 0, fijos: s === "clips" ? planos.length - conClip.length : 0,
    ...(cara ? { cara: { nombre: cara.nombre, costo: cara.costo, ahorro: cara.costo - costoVideo } } : {}),
  };
}

/** El plan en una frase (lo que se le dice a la persona antes del «sí»). Pura. */
export function textoDelPlan(plan, { revisar = false } = {}) {
  const fotos = `${plan.planos} fotogramas con ${nombreDelModelo(plan.imagen?.id)} (${textoCosto(plan.costoFotos)})`;
  if (revisar) return `${fotos}; luego se PARA a revisar el storyboard: el video (${plan.salida === "uno" ? `un video de ${plan.segundos} s` : `${plan.clips} clips`} con ${nombreDelModelo(plan.video?.id)}, unos ${textoCosto(plan.costoVideo)}) se confirma después con continuar_reel`;
  const video = plan.salida === "uno" ? `un video de ${plan.segundos} s` : `${plan.clips} clips${plan.fijos ? ` (y ${plan.fijos} plano${plan.fijos === 1 ? "" : "s"} de toma fija con su fotograma, sin clip)` : ""}`;
  return `${fotos} y ${video} con ${nombreDelModelo(plan.video?.id)} (${textoCosto(plan.costoVideo)})`;
}

/** Lo que se ahorra frente a la opción cara, en una frase («» si no hay con qué comparar). Pura. */
export const textoDelAhorro = (plan) => (plan.cara ? `Frente a ${plan.cara.nombre} (unos ${textoCosto(plan.cara.costo)}) se ahorran unos ${textoCosto(plan.cara.ahorro)}.` : "");

/**
 * Los clips de un reel en palabras: cuántos están, cuáles NO salieron y por qué (con montaje, se montan con su
 * fotograma: su frase no se pierde) y cuáles son de toma fija (sin clip). Pura.
 */
export function lineaDeClips(pasos = [], conMontaje = false) {
  const con = pasos.filter((p) => p.clip && p.clip.fase !== "omitido");
  const listos = con.filter((p) => p.clip.fase === "hecho");
  const fallidos = con.filter((p) => p.clip.fase === "fallido");
  const fijos = pasos.filter((p) => p.clip?.fase === "omitido");
  return [
    `Clips: ${listos.length} de ${con.length} listos (archivos ${listos.map((p) => p.clip.archivoId).join(", ") || "—"}).`,
    fijos.length ? `Toma fija, con su fotograma (sin clip): ${fijos.map((p) => p.titulo || p.id).join(", ")}.` : "",
    fallidos.length ? `NO salieron: ${fallidos.map((p) => `${p.titulo || p.id} (${p.clip.error || "sin motivo"})`).join("; ")}.${conMontaje ? " Se montan con su fotograma y su frase se dice igual." : ""}` : "",
  ].filter(Boolean).join(" ");
}

/** El guion como lo lee Claude (y lo devuelve tal cual en la segunda llamada). */
const textoDelGuion = (g) => [
  `Gancho: «${ganchoDe(g)}» · Llamado: «${llamadoDe(g)}» · ${g.segundos} s, ${g.planos.length} planos.`,
  g.estructuraId ? `Sigue la estructura de guion de la agencia «${g.estructuraNombre || g.estructuraId}» (ID ${g.estructuraId}).` : "",
  textoDelGuionReel(g),
  g.descripcion ? `Caption: ${g.descripcion}` : "",
].filter(Boolean).join("\n");

export const DEFINICIONES_REEL_MCP = Object.freeze([
  {
    name: "crear_reel",
    description: "Crea un REEL por planos para un cliente, en el SERVIDOR (sigue aunque se cierre todo): el storyboard (un fotograma por plano, en orden), el video (uno con todo, o un clip limpio por plano) y, con montar=true, el MONTAJE con la voz de la marca, el gancho escrito, los subtítulos, el logo y el llamado (el texto lo escribe el código: sin faltas). Lo que sale se pone SOLO en su publicación (publicacion_id). Sin «guion», escribe el guion (texto, céntimos) y devuelve el plan con su costo, lo que se ahorra y si el saldo de Kie alcanza: NO SE CREÓ NADA. Díselo a la persona y, sólo con su «sí», repite la llamada con el MISMO guion y confirmado=true. Por defecto se PARA tras el storyboard (revisar=true): mira los fotogramas con estado_reel y sigue con continuar_reel. Por defecto pocos planos y clips con el modelo más barato que deja el producto fiel; los planos de toma «fija» (el producto, un beneficio, el cierre) se montan con su fotograma, sin clip. La voz del montaje SIEMPRE se confirma aparte (confirmado_voz). Mira cómo va con estado_reel.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP,
        idea: { type: "string", description: "La idea central: la promoción, el beneficio o lo que se quiere contar." },
        segundos: { type: "integer", description: "8, 10, 15, 20, 30, 45 o 60. Lo que un modelo no hace en un video va por clips y montaje." },
        planos: { type: "integer", description: "Cuántos planos (opcional). Por defecto POCOS para pagar menos clips: 4 hasta 20 s y 6 en 30 s. Sólo más si la persona lo pide." },
        publicacion_id: { type: "string", description: "La publicación del calendario (de ver_calendario): el guion sigue el que ya tiene y el resultado se pone en ella." },
        producto_id: { type: "string", description: "Un producto del catálogo (de guia_de_diseno): su precio exacto y sus fotos reales." },
        estructura_id: { type: "string", description: "La ESTRUCTURA de guion de la agencia que sigue la voz en off (de ver_estructuras con para=voz). Si se omite, la IA escoge la que encaje y la respuesta dice cuál." },
        salida: { type: "string", enum: ["uno", "clips"], description: "uno: un solo video con todo; clips: un clip por plano (para montar). Si se omite, la que mejor sale con esa duración." },
        montar: { type: "boolean", description: "true (por defecto): montarlo con la voz, el texto, los subtítulos y el logo, y renderizarlo a mp4." },
        revisar: { type: "boolean", description: "true (por defecto): se para tras el storyboard para que la persona lo revise ANTES de pagar el video (luego continuar_reel). false sólo si la persona pide saltarse la revisión." },
        voz: { type: "string", description: "Otra voz para ESTE reel (un id de ElevenLabs de listar_voces). Si se omite, la de la marca (voz_de_marca la cambia para todos)." },
        guion: { type: "object", description: "El guion que devolvió la primera llamada (tal cual, o corregido)." },
        confirmado: { type: "boolean", description: "Sólo tras el «sí» de la persona a la cifra del plan." },
        confirmado_voz: { type: "boolean", description: "Sólo si la persona ya aceptó pagar la voz del montaje (si no, el montaje se para a pedirla con su costo)." },
      },
      required: ["cliente"],
    },
    annotations: escribe,
  },
  {
    name: "estado_reel",
    description: "Cómo va un reel de crear_reel: los fotogramas (con sus IMÁGENES, para que las mires), el video o los clips, el montaje (si espera que se confirme la voz, su costo) y si ya está en su publicación. No gasta.",
    inputSchema: { type: "object", properties: { encargo_id: { type: "string" } }, required: ["encargo_id"] },
    annotations: soloLectura,
  },
  {
    name: "continuar_reel",
    description: "Tras revisar el storyboard de un reel (crear_reel se para ahí por defecto): crea el video («uno») o los clips («clips»: sólo los planos de toma «movimiento»; los de toma fija van con su fotograma) y, con montar, el montaje. La primera llamada sin confirmado dice el costo, lo que se ahorra y si el saldo de Kie alcanza; sólo con el «sí» de la persona, confirmado=true.",
    inputSchema: {
      type: "object",
      properties: {
        encargo_id: { type: "string" }, salida: { type: "string", enum: ["uno", "clips"] },
        modelo: { type: "string", description: "Opcional: el id de un modelo de video (por defecto, el más barato que deja el producto fiel)." },
        montar: { type: "boolean" }, confirmado: { type: "boolean" }, confirmado_voz: { type: "boolean" },
        voz: { type: "string", description: "Otra voz para el montaje de ESTE reel (un id de listar_voces)." },
      },
      required: ["encargo_id"],
    },
    annotations: escribe,
  },
  {
    name: "montar_reel",
    description: "«Montarlo aquí»: de los clips (o el video) de un reel a un video animado con la voz de la marca, el gancho, los subtítulos, el logo y el llamado. automatico=false sólo crea el proyecto (para revisarlo con ver_video); automatico=true además lo aprueba, pide la voz y lo renderiza a mp4 en su publicación. La VOZ siempre se confirma: sin confirmado_voz se para y estado_reel dice el costo; con el «sí» de la persona, vuelve a llamar con confirmado_voz=true.",
    inputSchema: {
      type: "object",
      properties: {
        encargo_id: { type: "string" }, automatico: { type: "boolean" }, confirmado_voz: { type: "boolean" },
        voz: { type: "string", description: "Otra voz para ESTE montaje (un id de listar_voces); si se omite, la de la marca." },
      },
      required: ["encargo_id"],
    },
    annotations: escribe,
  },
  {
    name: "video_listo",
    description: "«¿Está listo este video?»: la IA lo VE y dice si se puede publicar (gancho, voz, producto, marca, cierre, defectos, encuadre) con su veredicto y los arreglos. Un video de la galería (archivo_id), el mp4 de un video animado (video_id) o el de una publicación (publicacion_id). Cuesta céntimos (la segunda vez sale guardado, salvo otra_vez).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP, archivo_id: { type: "string" }, video_id: { type: "string" }, publicacion_id: { type: "string" },
        formato: { type: "string", enum: ["reel", "historia", "youtube"] }, otra_vez: { type: "boolean" },
      },
      required: ["cliente"],
    },
    annotations: escribe,
  },
  {
    name: "extraer_guion_ugc",
    description: "Transcribe un video (de la galería: archivo_id; o de YouTube: youtube) y lo ADAPTA a la marca como guion UGC para grabar (tramos con lo que se dice, lo que se ve y el texto), con ganchos y caption, sin copiar frases ni marcas. No guarda nada: para ponerlo en una publicación, editar_publicacion (guion). Cuesta céntimos (Gemini y una llamada de texto).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP, archivo_id: { type: "string" }, youtube: { type: "string", description: "El enlace de un video público de YouTube." },
        producto_id: { type: "string" }, segundos: { type: "integer", description: "15, 30, 45 o 60 (si se omite, la del original)." },
        nota: { type: "string", description: "Lo que la agencia quiere (opcional)." },
      },
      required: ["cliente"],
    },
    annotations: escribe,
  },
]);

/** `buscarPublicacion(postId)` → { cal, post… } (el de mcp.js). */
export function crearHerramientasReel({ env, acceso, resolverCliente, usuario, buscarPublicacion }) {
  const conErrores = async (f) => {
    try { return await f(); } catch (e) {
      if (e instanceof ErrorEstudio || e instanceof ErrorMercado || e?.estado) throw new ErrorReel(e.message);
      throw e;
    }
  };
  async function encargoDe(id) {
    const fila = await acceso.leerUno("estudio_encargos", { id: String(id ?? "") });
    if (!fila || fila.tipo !== "reel") throw new ErrorReel(`No encontré el reel «${id}».`);
    const cliente = await acceso.leerUno("clients", { id: fila.client_id });
    if (!cliente) throw new ErrorReel("El cliente de ese reel ya no existe.");
    return { fila, cliente };
  }

  /**
   * ¿Alcanza el saldo de Kie para lo que se va a pedir? Sólo si algo del plan va por Kie (y se sabe leer el saldo).
   * → { texto, noAlcanza }: el texto dice el saldo y de qué cuenta es la llave.
   */
  async function saldoParaElPlan(plan, costo) {
    const porKie = [plan.imagen, plan.video].some((m) => m?.motor === "kie");
    if (!porKie || !(costo > 0)) return { texto: "", noAlcanza: false };
    const saldo = await saldoKie(env);
    if (saldo === null) return { texto: "", noAlcanza: false };
    const usd = saldo * USD_POR_CREDITO;
    if (usd >= costo) return { texto: "", noAlcanza: false };
    return { texto: `OJO: el saldo de Kie NO alcanza para esto (hace falta unos ${textoCosto(costo)}). ${await textoDeSaldo(env, saldo)} Recárgalo en kie.ai antes de seguir.`, noAlcanza: true };
  }

  /** El estado de un reel en palabras, con las imágenes del storyboard (las mismas de la vista previa del chat). */
  async function estado(fila) {
    const e = encargoPublico(fila);
    const { imagenes, vista } = await vistaDeEncargo(env, acceso, fila);
    const r = e.reel ?? {};
    const v = r.video ?? {};
    const m = r.montaje;
    const hechos = e.pasos.filter((p) => p.fase === "hecho").length;
    const clips = e.pasos.filter((p) => p.clip);
    const lineas = [
      `Reel «${e.titulo}» (encargo ${e.id}): ${e.estado === "en_marcha" ? "en marcha" : e.estado}. ${e.nota ?? ""}`.trim(),
      e.error ? `Motivo: ${e.error}` : "",
      `Storyboard: ${hechos} de ${e.pasos.length} fotogramas.`,
      r.salida === "uno" ? `Video: ${{ espera: "espera la revisión (continuar_reel)", nuevo: "en cola", generando: "creándose", hecho: `listo (archivo ${v.archivoId})`, fallido: `no salió: ${v.error}` }[v.fase] ?? v.fase}.` : "",
      r.salida === "clips" && clips.length ? lineaDeClips(e.pasos, Boolean(m)) : "",
      m ? `Montaje: ${m.fase}${m.videoId ? ` (video animado ${m.videoId}: míralo con ver_video y ver_escenas)` : ""}${m.fase === "confirmar" ? ` · la voz cuesta ${m.costoTexto || "unos céntimos"}: pregúntale a la persona y, con su sí, montar_reel con confirmado_voz=true` : ""}${m.error ? ` · ${m.error}` : ""}${m.nota ? ` · ${m.nota}` : ""}.` : "",
      r.puesto?.postId ? `Ya está en su publicación ${r.puesto.postId}.` : "",
      imagenes.length ? "Van las imágenes del storyboard que ya están: MÍRALAS." : "",
      // El mp4 (o los videos) se reproducen en la vista previa del chat; aquí, sus direcciones para la persona.
      lineasDeMedios(vista),
      e.estado === "en_marcha" ? "Sigue en el servidor: vuelve a mirar en un minuto." : "",
    ].filter(Boolean).join("\n");
    return { texto: lineas, imagenes, vista };
  }

  return {
    async crear_reel({ cliente, idea = "", segundos, planos: planosPedidos = 0, publicacion_id: postId = "", producto_id: productoId = "", estructura_id: estructuraId = "", salida, montar = true, revisar = true, voz = "", guion: guionDado, confirmado, confirmado_voz: confirmadoVoz }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const activos = activosDe(env);
        if (!duracionesDeReel(activos).length) throw new ErrorReel("No hay ningún modelo de video con llave (Ajustes → IA).");
        const kit = kitDe(c);
        let guion = guionDado && typeof guionDado === "object" && Array.isArray(guionDado.planos) ? guionDado : null;
        let escrito = false;
        if (!guion) {
          guion = await guionDeReel(env, acceso, c, { idea, segundos: Number(segundos) || DURACION_REEL_POR_DEFECTO, planos: Number(planosPedidos) || 0, productoId, postId, montaje: montar !== false, estructuraId });
          escrito = true;
        } else if (estructuraId && !guion.estructuraId) {
          // Un guion que escribió Claude con una estructura: se apunta si existe en el espacio.
          const id = await estructuraExistente(acceso, estructuraId);
          if (!id) throw new ErrorReel(`No encontré la estructura de guion «${estructuraId}» (de ver_estructuras).`);
          guion = { ...guion, estructuraId: id };
        }
        const revisa = revisar !== false;
        const plan = planDeReel({ guion, activos, kit, salida, montar: montar !== false });
        if (!plan.imagen) throw new ErrorReel("No hay ningún modelo de imagen con llave para los fotogramas (Ajustes → IA).");
        if (!plan.video) throw new ErrorReel("No hay ningún modelo de video con llave que haga esto (Ajustes → IA).");
        const cifra = textoDelPlan(plan, { revisar: revisa });
        const total = revisa ? plan.costoFotos : plan.total;
        const saldo = await saldoParaElPlan(plan, total);
        if (confirmado !== true) {
          return [
            `NO SE CREÓ NADA TODAVÍA${escrito ? " (sólo se escribió el guion)" : ""}. Plan del reel de ${c.name}: ${cifra}; unos ${textoCosto(total)} ahora${montar !== false ? ", más la voz del montaje (se confirma aparte)" : ""}. ${revisa ? "" : textoDelAhorro(plan)}`.trim(),
            saldo.texto,
            textoDelGuion(guion),
            `Dile a la persona el guion y la cifra. Sólo si dice que sí, repite crear_reel con guion = este JSON (o corregido) y confirmado=true:\n${JSON.stringify(guion)}`,
          ].filter(Boolean).join("\n\n");
        }
        if (saldo.noAlcanza) throw new ErrorReel(saldo.texto);
        let calendarId = null;
        if (postId) {
          try { calendarId = (await buscarPublicacion(String(postId))).cal.id; } catch { throw new ErrorReel(`No encontré la publicación «${postId}» (de ver_calendario).`); }
        }
        const mercado = productoId ? await leerMercado(acceso, c.id).catch(() => null) : null;
        const fotos = (mercado ? fotosDelCatalogo(mercado.catalogo).find((p) => p.id === productoId)?.fotos ?? [] : []).slice(0, 2);
        const titulo = texto(idea || guion.titulo || ganchoDe(guion) || "Reel", 120);
        const carpeta = await crearCarpeta(acceso, c.id, titulo, { tipo: "reel" });
        const fila = await crearEncargo(env, acceso, c, {
          tipo: "reel", titulo, reel: { ...guion, segundos: plan.segundos }, carpetaId: carpeta.id,
          comun: { modelo: plan.imagen.id, estilo: estiloDeMarca(limpiarKit(kit), "", { marca: c.name, rubro: c.industry ?? "" }), fotos, personajes: [], referencias: [] },
          salida: plan.salida, revisar: revisa, video: { modelo: plan.video.id },
          montaje: montar !== false ? { automatico: true, confirmadoVoz: confirmadoVoz === true, vozId: voz } : null,
          ...(postId && calendarId ? { calendarId, postId: String(postId) } : {}),
        }, { usuario });
        const r = await estado(fila);
        return {
          ...r,
          texto: [
            `Reel en marcha para ${c.name}: encargo ${fila.id} (${cifra}). Se hace en el servidor, en orden; sigue aunque se cierre todo.`,
            revisa ? "Se parará tras el storyboard para revisarlo ANTES de pagar el video: mira los fotogramas con estado_reel (uno por uno: el empaque fiel, nada de la marca en el producto «malo», nada inventado) y sigue con continuar_reel." : "",
            montar !== false ? `Al terminar se monta con la voz de la marca, el texto y el logo${confirmadoVoz === true ? "" : " (la voz se confirmará aparte: estado_reel dirá su costo)"}.` : "",
            postId ? `Lo que salga se pone SOLO en la publicación ${postId}.` : "",
            `Mira cómo va con estado_reel (encargo_id ${fila.id}).`,
          ].filter(Boolean).join("\n"),
        };
      });
    },

    async estado_reel({ encargo_id: id }) {
      const { fila } = await encargoDe(id);
      return estado(fila);
    },

    async continuar_reel({ encargo_id: id, salida, modelo = "", montar = true, confirmado, confirmado_voz: confirmadoVoz, voz = "" }) {
      const { fila, cliente } = await encargoDe(id);
      return conErrores(async () => {
        const e = encargoPublico(fila);
        const plan = planDeReel({ guion: e.reel?.reel, activos: activosDe(env), kit: kitDe(cliente), salida, modeloVideoId: modelo, montar: montar !== false });
        if (!plan.video) throw new ErrorReel("No hay ningún modelo de video con llave que haga esto (Ajustes → IA).");
        const saldo = await saldoParaElPlan({ ...plan, imagen: null }, plan.costoVideo);
        if (confirmado !== true) {
          const video = plan.salida === "uno" ? `Un video de ${plan.segundos} s` : `${plan.clips} clips${plan.fijos ? ` (y ${plan.fijos} plano${plan.fijos === 1 ? "" : "s"} de toma fija con su fotograma, sin clip)` : ""}`;
          return [
            `NO SE CREÓ NADA TODAVÍA. ${video} con ${nombreDelModelo(plan.video.id)}: unos ${textoCosto(plan.costoVideo)}${montar !== false ? ", más la voz del montaje (se confirma aparte)" : ""}. ${textoDelAhorro(plan)}`.trim(),
            saldo.texto,
            "Sólo con el «sí» de la persona, repite con confirmado=true.",
          ].filter(Boolean).join("\n");
        }
        if (saldo.noAlcanza) throw new ErrorReel(saldo.texto);
        const r = await accionDeReel(env, acceso, cliente, fila, "continuar", {
          salida: plan.salida, video: { modelo: plan.video.id }, montaje: montar !== false ? { automatico: true, confirmadoVoz: confirmadoVoz === true, vozId: voz } : null,
        });
        if (r.ocupado) throw new ErrorReel("El reel está dando un paso ahora mismo: vuelve a intentarlo en unos segundos.");
        return estado(await acceso.leerUno("estudio_encargos", { id: fila.id }));
      });
    },

    async montar_reel({ encargo_id: id, automatico = true, confirmado_voz: confirmadoVoz, voz = "" }) {
      const { fila, cliente } = await encargoDe(id);
      return conErrores(async () => {
        const r = await accionDeReel(env, acceso, cliente, fila, "montar", { automatico: automatico !== false, confirmadoVoz: confirmadoVoz === true, vozId: voz });
        if (r.ocupado) throw new ErrorReel("El reel está dando un paso ahora mismo: vuelve a intentarlo en unos segundos.");
        return estado(await acceso.leerUno("estudio_encargos", { id: fila.id }));
      });
    },

    async video_listo({ cliente, archivo_id: archivoId = "", video_id: videoId = "", publicacion_id: postId = "", formato = "reel", otra_vez: otraVez }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        let datos = { archivoId: String(archivoId || "") };
        if (!datos.archivoId && videoId) {
          const p = await proyectoDe(acceso, c.id, videoId);
          const render = JSON.parse(p.render || "{}");
          if (render.estado !== "listo" || !render.archivoId) throw new ErrorReel("Ese video animado aún no tiene su mp4: renderízalo primero (renderizar_video).");
          datos = { archivoId: render.archivoId };
        }
        let idea = "";
        if (!datos.archivoId && postId) {
          const { post } = await buscarPublicacion(String(postId));
          const medio = (post.medios ?? []).find((m) => m?.tipo === "video" && String(m.src ?? "").startsWith("/api/media/"));
          if (!medio) throw new ErrorReel("Esa publicación no tiene un video.");
          datos = { clave: String(medio.src).replace(/^\/api\/media\//, "") };
          idea = String(post.idea || post.title || "").slice(0, 600);
        }
        if (!datos.archivoId && !datos.clave) throw new ErrorReel("Di qué video: archivo_id, video_id o publicacion_id.");
        let r;
        try {
          r = await revisarVideo(env, acceso, c, { ...datos, formato, idea, otraVez: otraVez === true });
        } catch (e) {
          if (e?.codigo === "fotogramas") throw new ErrorReel("El motor de video del espacio es Meta: necesita los fotogramas, que saca el navegador. Revísalo desde la aplicación («¿Está listo este video?»).");
          throw e;
        }
        const v = r.revision;
        return [
          `${FRASE_VEREDICTO[v.veredicto] ?? v.veredicto} (${v.puntaje}/10)${r.guardada ? " · revisión guardada (sin pagar otra vez)" : ""}. ${v.resumen ?? ""}`.trim(),
          ...v.criterios.map((x) => `· ${x.nombre}: ${x.ok === true ? "sí" : x.ok === false ? "NO" : "—"}${x.nota ? ` (${x.nota})` : ""}`),
          v.arreglos?.length ? `Arreglos:\n${v.arreglos.map((a) => `- ${a}`).join("\n")}` : "",
        ].filter(Boolean).join("\n");
      });
    },

    async extraer_guion_ugc({ cliente, archivo_id: archivoId = "", youtube = "", producto_id: productoId = "", segundos, nota = "" }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        if (!archivoId && !youtube) throw new ErrorReel("Di qué video: archivo_id (de la galería) o youtube (un enlace).");
        const r = await extraerUgc(env, acceso, c, {
          archivoId: String(archivoId), youtube: String(youtube), productoId: String(productoId), nota: texto(nota, 500),
          ...(Number(segundos) ? { duracion: Number(segundos) } : {}),
        });
        const a = r.adaptado;
        return [
          `Guion UGC para ${c.name}${r.producto ? ` (${r.producto.nombre})` : ""}, ${r.duracion} s${a.titulo ? `: «${a.titulo}»` : ""}. No se guardó nada.`,
          `GUION (para el campo «guion» de la publicación):\n${a.guion}`,
          a.ganchos?.length ? `GANCHOS para probar:\n${a.ganchos.map((g) => `- ${g}`).join("\n")}` : "",
          a.descripcion ? `CAPTION:\n${a.descripcion}` : "",
          `El original, transcrito (para la fórmula): gancho «${r.original?.gancho ?? ""}», ${r.original?.duracion ?? "?"} s.`,
        ].filter(Boolean).join("\n\n");
      });
    },
  };
}
