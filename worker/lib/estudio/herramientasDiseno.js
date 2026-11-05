// ============================================================
// El DIRECTOR CREATIVO por MCP: Claude (claude.ai, Claude Code) diseña en lote para un cliente, VE cada pieza, la
// corrige y la pone en su publicación — lo que el asistente de la aplicación hace en el chat (lib/disenoChat.js), pero
// llevado por el SERVIDOR, porque por MCP no hay pantalla que espere las imágenes.
//
//   · guia_de_diseno        el manual del director, la ficha, el kit, el catálogo y lo que la agencia corrige (y, como
//                           imágenes, sus plantillas y lo que le gustó): lo que el chat recibe en su sistema
//   · disenar_piezas        de 1 a 12 piezas: con la FICHA que escribe Claude, o con una idea que diseña el director de
//                           la agencia (fichas.js). Primero el plan con su costo (NO SE CREÓ NADA); con confirmado=true,
//                           un ENCARGO del servidor (encargos.js): el trabajo, la proporción, el control y UNA corrección
//                           que se queda sólo si mejoró. Un carrusel, en orden y en su carpeta (una tarjeta en la galería)
//   · estado_encargo        cómo va y, de lo terminado, las IMÁGENES (miniaturas.js) con su control
//   · corregir_pieza        edita un detalle de una pieza (o iguala su texto a otra de la serie): sale una nueva
//   · poner_en_publicacion  pone lo que ya está en la galería en un post de cualquier mes (sin crear ni cobrar)
//
// CADA PIEZA SE ARMA POR EL MISMO CAMINO QUE EN LA PANTALLA: `apoyosDePieza` + `pedidoDePieza` (src/lib/pieza.js) con
// el kit, las fotos REALES de sus productos, la plantilla y el logo; la escena va en el hueco «{{ESCENA}}» y la pone el
// encargo (la ficha de Claude, o la que escriba el director). Así una pieza pedida desde claude.ai sale igual que una
// pedida desde el chat de la aplicación.
//
// EL COSTO SE CONFIRMA POR TEXTO. El chat tiene un botón; aquí la primera llamada devuelve el plan y la cifra, y sólo
// `confirmado: true` (el booleano, tras el «sí» de la persona) crea el encargo.
//
// Sólo existen en el MCP: el asistente de la aplicación tiene las suyas, con el mismo nombre, en el navegador.
// ============================================================

import { crearEncargo } from "./encargos.js";
import { crearTrabajo, ErrorEstudio } from "./trabajos.js";
import { estadoMotores } from "./motores.js";
import { kitDe } from "./kit.js";
import { leerMercado } from "../mercado.js";
import { archivoPublico, carpetaPublica, crearCarpeta, marcarUso } from "./galeria.js";
import { manualDelEspacio, correccionesDelCliente } from "./fichas.js";
import { catalogoParaDisenar } from "./catalogoDiseno.js";
import { miniaturaDe, MAX_PIEZAS_VISTAS } from "./miniaturas.js";
import { NULO } from "../acceso.js";
import { fotosDelCatalogo } from "../../../src/lib/estudioMercado.js";
import { modeloPorId, modeloPorDefecto, estimar, textoCosto, ajustesDe, nombreDelModelo } from "../../../src/lib/estudioCatalogo.js";
import { apoyosDePieza, pedidoDePieza, ideaParaMejorar } from "../../../src/lib/pieza.js";
import { fotosDeVariosProductos, piezasDeGrupo, postConPiezas, IGUALAR_TEXTO, ejemploParaIgualar } from "../../../src/lib/galeriaPura.js";
import { productosNombrados } from "../../../src/lib/referencias.js";
import { limpiarFicha, textoDeLaFicha, MAX_FICHAS, instruccionDeDiseno, resumenDelKit, lineaDeCorrecciones } from "../../../src/lib/director.js";
import {
  referenciaDePlantilla, lineaDePlantillaEnPedido, limpiarKit, kitVacio, bloqueDeMarca, estiloDeMarca, referenciaDeTipografia, TIPOS_PRESET,
} from "../../../src/lib/kitMarca.js";
import { ESCENA } from "../../../src/lib/encargos.js";
import { pedidoDeCorreccion, modeloParaCorregir, proporcionDeMedidas } from "../../../src/lib/edicion.js";
import { conHistoriaEncajada } from "../redesServidor.js";
import { vistaDeEncargo, vistaDeTrabajo } from "./vistaEstudio.js";
import { vistaDe } from "../mcpVista/modelo.js";

/** Un error de lo pedido: vuelve a Claude como resultado con `isError`, no como fallo del servidor. */
export class ErrorDiseno extends Error {}

/** El formato de la pieza → la proporción que TIENE que salir (los mismos nombres que el chat de la aplicación). */
export const PROPORCION = Object.freeze({ square: "1:1", vertical: "4:5", story: "9:16", horizontal: "16:9" });
/** Y lo que el director entiende por formato (src/lib/director.js, `limpiarPiezaEncargo`). */
const FORMATO_DIRECTOR = Object.freeze({ square: "post", vertical: "post", story: "historia", horizontal: "anuncio" });
const ESTILOS = Object.keys(TIPOS_PRESET);
/** De cuántas en cuántas piezas a la vez va el encargo (como el chat: el director y el control tardan). */
const PARALELO = 2;
/** Lo que el director mira del cliente: sus plantillas y lo que le gustó (copias de 512 px). */
const MAX_VISTAS = 4;

const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const lista = (v, max) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").slice(0, 80)).filter(Boolean))].slice(0, max);
const activosDe = (env) => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));
const proporcionDe = (a) => a?.ajustes?.aspectRatio ?? proporcionDeMedidas(a?.ancho, a?.alto);
const logoEstampado = (kit) => { const k = limpiarKit(kit); return Boolean(k.logo) && k.logoModo === "estampado"; };

/** El modelo de imagen del cliente (el fijado en su kit si tiene llave; si no, el predeterminado). Pura. */
export function modeloDelCliente(activos, kit) {
  const fijado = String(kit?.modelos?.imagen ?? "");
  const m = fijado ? modeloPorId(fijado) : null;
  return m && m.tipo === "imagen" && (m.motor === "prueba" || activos[m.motor]) ? m : modeloPorDefecto(activos, "imagen");
}

/** Una pieza como llega de Claude, limpia. La ficha manda; sin ficha, la idea (la diseña el director). Pura. */
export function limpiarPiezaMcp(p = {}, i = 0, productosTanda = []) {
  return {
    n: i + 1,
    titulo: texto(p.titulo, 80) || `Pieza ${i + 1}`,
    ficha: limpiarFicha(p.ficha ?? ""),
    idea: texto(p.idea, 900),
    texto: String(p.texto ?? "").trim().slice(0, 400),
    formato: PROPORCION[p.formato] ? p.formato : "vertical",
    estilo: ESTILOS.includes(p.estilo) ? p.estilo : "",
    postId: texto(p.post_id ?? p.postId, 80),
    plantilla: /^plantilla-[a-z0-9-]{1,40}$/.test(String(p.plantilla_id ?? "")) ? String(p.plantilla_id) : "",
    productos: lista(p.productos, 6).length ? lista(p.productos, 6) : lista(productosTanda, 6),
  };
}

/** Las fotos REALES de una pieza: las de sus productos y las de los que nombra su ficha o su idea. Pura. */
export function fotosDeLaPieza(productos = [], pieza = {}, huecos = 0) {
  const ids = [...(pieza.productos ?? []), ...productosNombrados(productos, `${pieza.ficha ?? ""} ${pieza.idea ?? ""}`).map((y) => y.id)];
  return ids.length ? fotosDeVariosProductos(productos, ids, huecos) : [];
}

/**
 * El pedido y el costo de cada pieza, sin crear nada: el MISMO armado que el chat de la aplicación (`planDePiezas`), con
 * la escena en el hueco. → [{ ...pieza, modelo, costo, pedido } | { ...pieza, error }]. Pura salvo por los imports.
 */
export function planDeDiseno(ctx, piezas = [], { productosTanda = [] } = {}) {
  const { kit, activos, productos = [], archivos = [], cliente } = ctx;
  const modelo = modeloDelCliente(activos, kit);
  return (Array.isArray(piezas) ? piezas : []).slice(0, MAX_FICHAS).map((x, i) => {
    const p = limpiarPiezaMcp(x, i, productosTanda);
    if (!p.ficha && !p.idea) return { ...p, error: "Falta la ficha de esta pieza (o, para que la diseñe el director, su idea)." };
    if (!modelo) return { ...p, error: "No hay ningún modelo de imagen con llave (Ajustes → IA)." };
    const plantilla = p.plantilla ? referenciaDePlantilla(kit, p.plantilla, archivos) : null;
    const fotos = fotosDeLaPieza(productos, p, modelo.referencias || 0);
    const apoyos = apoyosDePieza({ kit, preset: p.estilo, archivos, fotos, manuales: plantilla ? [plantilla] : [], modelo });
    const pedido = pedidoDePieza({
      kit, idea: ESCENA, preset: p.estilo, apoyos, modelo, marca: cliente.name, rubro: cliente.industry ?? "",
      proporcion: PROPORCION[p.formato], activos, extra: plantilla ? lineaDePlantillaEnPedido(kit, p.plantilla) : "",
    });
    const usado = modeloPorId(pedido.modelo) ?? modelo;
    return { ...p, modelo: usado, costo: estimar(usado, 1, pedido.ajustes), pedido };
  });
}

/** Una pieza del plan como paso del encargo (encargos.js `limpiarPaso`). Con ficha, la escena va lista. Pura. */
export function pasoDelPlan(p, { calendarioDePost = {}, productos = [], estampa = false } = {}) {
  const tipo = TIPOS_PRESET[p.estilo]?.nombre ?? "";
  const nombres = productos.filter((x) => p.productos.includes(x.id)).map((x) => x.nombre).join("\n");
  const encargo = p.ficha ? null : {
    formato: FORMATO_DIRECTOR[p.formato], proporcion: PROPORCION[p.formato], tipo, idea: [p.titulo, p.idea].filter(Boolean).join(" — "),
    escena: "", texto: p.texto, sinTexto: false, producto: nombres, productoId: p.productos[0] ?? "", productoIds: p.productos,
    indicacion: "", ...(p.plantilla ? { plantilla: p.plantilla } : {}),
  };
  const calendarId = p.postId ? calendarioDePost[p.postId] : null;
  return {
    id: `p${p.n}`, titulo: p.titulo,
    pedido: { ...p.pedido, ...(calendarId ? { calendarId, postId: p.postId } : {}) },
    escena: p.ficha || "",
    sinMejorar: p.ficha ? "" : ideaParaMejorar({ escena: p.idea, texto: p.texto }),
    encargo,
    mejora: encargo ? { ...encargo, idea: ideaParaMejorar({ escena: p.idea, texto: p.texto }), tipo: "imagen", pieza: tipo } : null,
    texto: p.ficha ? textoDeLaFicha(p.ficha) : p.texto,
    controlar: true,
    navegador: estampa ? { plantilla: null, logo: true } : null,
  };
}

/** El texto del plan que se le enseña a Claude (y él a la persona) antes de confirmar. Pura. */
export function textoDelPlan(plan, { carrusel = false, cliente = "" } = {}) {
  const buenas = plan.filter((p) => !p.error);
  const total = buenas.reduce((t, p) => t + (p.costo || 0), 0);
  return [
    `NO SE CREÓ NADA TODAVÍA. Plan de ${cliente}: ${buenas.length} ${carrusel ? "láminas de un carrusel" : buenas.length === 1 ? "pieza" : "piezas"}, costo aproximado ${textoCosto(total)}.`,
    ...plan.map((p) => (p.error
      ? `${p.n}. ${p.titulo} — NO VA: ${p.error}`
      : `${p.n}. ${p.titulo} · ${PROPORCION[p.formato]} · ${nombreDelModelo(p.modelo.id)} · ${textoCosto(p.costo)} · ${p.ficha ? "con tu ficha" : "la diseña el director de la agencia"}${p.postId ? ` · para la publicación ${p.postId}` : ""}`)),
    "Dile a la persona el plan y la cifra. Sólo si dice que sí, repite la MISMA llamada con confirmado=true.",
  ].join("\n");
}

/** El plan como VISTA PREVIA del chat (MCP Apps): cada pieza con su formato, su modelo y su costo; «Crear» es el sí. Pura. */
export function vistaDelPlan(plan, { carrusel = false, cliente = null } = {}) {
  const total = plan.filter((p) => !p.error).reduce((t, p) => t + (p.costo || 0), 0);
  return vistaDe({
    tipo: "plan", titulo: `Plan ${carrusel ? "del carrusel" : "de diseño"}${cliente?.nombre ? ` · ${cliente.nombre}` : ""}`, cliente,
    subtitulo: `${plan.filter((p) => !p.error).length} ${carrusel ? "láminas" : "piezas"} · nada se ha creado todavía`,
    plan: {
      costo: textoCosto(total),
      piezas: plan.map((p) => ({
        titulo: `${p.n}. ${p.titulo}`,
        detalle: p.error ? "" : `${PROPORCION[p.formato]} · ${nombreDelModelo(p.modelo.id)} · ${textoCosto(p.costo)} · ${p.ficha ? "con la ficha de Claude" : "la diseña el director de la agencia"}${p.postId ? ` · para la publicación ${p.postId}` : ""}`,
        error: p.error ?? "",
      })),
    },
  });
}

/** Las plantillas del kit y lo que le gustó a la agencia, como imágenes de 512 px: lo que el director mira. */
async function vistasDelCliente(env, acceso, cliente, kit) {
  const claves = (limpiarKit(kit).plantillas ?? []).map((p) => p.clave).filter(Boolean);
  const gustos = await acceso.leer("estudio_archivos", { client_id: cliente.id, favorito: 1, borrado_at: NULO }, "created_at desc", 8).catch(() => []);
  const elegidas = [...claves.map((clave) => ({ clave, mime: "image/png" })), ...gustos.filter((f) => f.tipo === "imagen").map((f) => ({ clave: f.clave, mime: f.mime }))].slice(0, MAX_VISTAS);
  const vistas = [];
  for (const f of elegidas) {
    const v = await miniaturaDe(env, f.clave, { mime: f.mime, lado: 512 }).catch(() => null);
    if (v && /^image\/(jpeg|png|webp)$/.test(v.mime)) vistas.push({ media_type: v.mime, data: v.datos });
  }
  return vistas;
}

const cliente = { type: "string", description: "Nombre o ID del cliente (de listar_clientes)." };
const soloLectura = { readOnlyHint: true, openWorldHint: false };
const escribe = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

/** Las definiciones, con la forma del MCP (`inputSchema`, `annotations`). */
export const DEFINICIONES_DISENO_MCP = Object.freeze([
  {
    name: "guia_de_diseno",
    description: "LÉELA ANTES DE DISEÑAR para un cliente: el manual del director creativo de la agencia, el formato de la FICHA DE DISEÑO, lo que exige su kit de marca (o que no lo tiene), su CATÁLOGO con los ids de los productos y lo que la agencia suele corregir; y, como imágenes, sus plantillas y lo que le gustó. No gasta.",
    inputSchema: { type: "object", properties: { cliente }, required: ["cliente"] },
    annotations: soloLectura,
  },
  {
    name: "disenar_piezas",
    description: "Diseña de 1 a 12 piezas de imagen (posts, historias, portadas, anuncios o las láminas de UN carrusel) para un cliente, por el mismo camino que la aplicación: su kit, las fotos REALES de sus productos, el control de calidad. Cada pieza con su FICHA (escrita por ti con guia_de_diseno) o sólo con «idea» y «texto» (la diseña el director de la agencia). La PRIMERA llamada, sin confirmado, NO crea nada: devuelve el plan con el costo. Díselo a la persona y, sólo con su «sí», repite la MISMA llamada con confirmado=true. Nunca pongas confirmado=true por tu cuenta. Se hace en el servidor: mira cómo va con estado_encargo.",
    inputSchema: {
      type: "object",
      properties: {
        cliente,
        concepto: { type: "string", description: "La idea que une la tanda y su sistema visual, en 1 o 2 frases." },
        carrusel: { type: "boolean", description: "true si las piezas son las láminas de UN carrusel, en su orden (portada primero): todas 4:5, en orden y agrupadas en la galería." },
        tema: { type: "string", description: "Sólo con carrusel=true y SIN piezas: el tema, y el director de la agencia diseña el carrusel entero." },
        post_id: { type: "string", description: "Con carrusel=true: la publicación donde irá el carrusel (al terminar, ponlo con poner_en_publicacion)." },
        productos: { type: "array", items: { type: "string" }, maxItems: 6, description: "Ids del CATÁLOGO (de guia_de_diseno) de lo que enseña la tanda: sus fotos reales van de referencia." },
        piezas: {
          type: "array", minItems: 1, maxItems: 12,
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Nombre corto de la pieza." },
              ficha: { type: "string", description: "La ficha de diseño completa, una línea por apartado (ver guia_de_diseno). El texto, exacto y entre «»." },
              idea: { type: "string", description: "Sin ficha: qué comunica la pieza (la diseña el director de la agencia)." },
              texto: { type: "string", description: "Sin ficha: el texto EXACTO que va en la pieza (titular y apoyo, una línea cada uno)." },
              formato: { type: "string", enum: ["vertical", "story", "square", "horizontal"], description: "vertical 4:5 (feed, por defecto), story 9:16, square 1:1, horizontal 16:9." },
              post_id: { type: "string", description: "La publicación del calendario a la que va (de ver_calendario)." },
              estilo: { type: "string", enum: ["anuncio", "beneficios", "servicios", "educativo", "diferenciador", "maletas", "humano"], description: "El tipo de contenido (opcional)." },
              plantilla_id: { type: "string", description: "El id de una plantilla del kit a seguir (opcional)." },
              productos: { type: "array", items: { type: "string" }, maxItems: 6, description: "Ids del catálogo de lo que sale en ESTA pieza; manda sobre los de la tanda." },
            },
            required: ["titulo"],
          },
        },
        confirmado: { type: "boolean", description: "Sólo tras oír «sí» de la persona a la cifra exacta del plan." },
      },
      required: ["cliente"],
    },
    annotations: escribe,
  },
  {
    name: "estado_encargo",
    description: "Cómo va lo que pediste con disenar_piezas: cada pieza (esperando, creándose, lista, no salió), su ID de la galería y su control de calidad; y, de las listas, las IMÁGENES para que las MIRES antes de darlas por buenas.",
    inputSchema: { type: "object", properties: { encargo_id: { type: "string" } }, required: ["encargo_id"] },
    annotations: soloLectura,
  },
  {
    name: "corregir_pieza",
    description: "Corrige un DETALLE de una pieza ya hecha editándola: una letra, el tamaño o el sitio del titular, un color, quitar algo. Con igual_a (el ID de otra pieza de la MISMA serie que quedó bien) el texto se pone en su misma posición y tamaño. Sale una NUEVA (la de antes se queda); cuesta lo de una imagen. Mírala con estado_trabajo.",
    inputSchema: {
      type: "object",
      properties: {
        cliente,
        archivo_id: { type: "string", description: "El ID de la pieza en la galería (de estado_encargo o ver_pieza)." },
        indicacion: { type: "string", description: "Qué cambiar, concreto y con medidas: «donde dice X debe decir Y», «el titular baja al 10–24 % de la altura»." },
        igual_a: { type: "string", description: "Opcional: el ID de la pieza de la misma serie a la que igualar el texto." },
      },
      required: ["cliente", "archivo_id"],
    },
    annotations: escribe,
  },
  {
    name: "poner_en_publicacion",
    description: "Pone piezas que YA están en la galería en una publicación del calendario (de cualquier mes), listas para revisar y programar: un carrusel entero en su orden (carrusel_id) o imágenes sueltas en el orden que pases (archivo_ids). NO crea nada ni cuesta nada: nunca vuelvas a diseñar algo que ya existe para ponerlo. Con dos imágenes o más, el post pasa a carrusel.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "La publicación (de ver_calendario)." },
        carrusel_id: { type: "string", description: "El carrusel_id que dio disenar_piezas (o el ID de cualquiera de sus láminas): van todas, en orden." },
        archivo_ids: { type: "array", items: { type: "string" }, maxItems: 10, description: "IDs de imágenes de la galería, en el orden en que van." },
        modo: { type: "string", enum: ["reemplazar", "anadir"], description: "Si ya tiene archivos: reemplazar (lo de antes sigue en la galería) o añadir al final." },
      },
      required: ["post_id"],
    },
    annotations: escribe,
  },
]);

/**
 * Las herramientas. `resolverCliente(nombre)`, `buscarPublicacion(postId)` → { cal, days, dia, indice, post } y
 * `guardarDias(cal, days)` son los de mcp.js: buscar una publicación en cualquier mes y escribirla como lo hace el PUT.
 */
export function crearHerramientasDiseno({ env, acceso, resolverCliente, usuario, por = null, buscarPublicacion, guardarDias }) {
  /** Lo que hace falta para armar las piezas de un cliente: kit, motores con llave, catálogo con fotos y galería. */
  async function contexto(cliente) {
    const [mercado, filas] = await Promise.all([
      leerMercado(acceso, cliente.id).catch(() => null),
      acceso.leer("estudio_archivos", { client_id: cliente.id, borrado_at: NULO }, "created_at desc", 300),
    ]);
    return {
      cliente, kit: kitDe(cliente), activos: activosDe(env), mercado,
      productos: mercado ? fotosDelCatalogo(mercado.catalogo) : [], archivos: filas.map(archivoPublico),
    };
  }

  async function archivoDe(cliente, id) {
    const v = String(id ?? "").trim();
    if (!v) return null;
    const f = await acceso.leerUno("estudio_archivos", { id: v, client_id: cliente.id })
      ?? (v.startsWith(`clientes/${cliente.id}/`) ? (await acceso.leer("estudio_archivos", { clave: v, client_id: cliente.id }, "created_at desc", 1))[0] : null);
    return f && !f.borrado_at ? f : null;
  }

  return {
    async guia_de_diseno({ cliente }) {
      const c = await resolverCliente(cliente);
      const kit = kitDe(c);
      const [manual, correcciones, mercado] = await Promise.all([
        manualDelEspacio(acceso), correccionesDelCliente(acceso, c.id), leerMercado(acceso, c.id).catch(() => null),
      ]);
      const vistas = await vistasDelCliente(env, acceso, c, kit).catch(() => []);
      const textoGuia = [
        instruccionDeDiseno(manual, { canal: "mcp" }),
        resumenDelKit({ kit, marca: bloqueDeMarca(kit), vacio: kitVacio(kit) && !kit.logo, cliente: c.name }),
        catalogoParaDisenar(mercado, c.name),
        lineaDeCorrecciones(correcciones),
        vistas.length ? `Van ${vistas.length} imágenes de ${c.name}: sus plantillas y lo que le gustó a la agencia. Míralas antes de diseñar: es el nivel y el estilo a igualar.` : "",
      ].filter(Boolean).join("\n\n");
      return vistas.length ? { texto: textoGuia, imagenes: vistas.map((v) => ({ datos: v.data, mime: v.media_type })) } : textoGuia;
    },

    async disenar_piezas({ cliente, piezas = [], concepto = "", carrusel = false, post_id: postCarrusel = "", productos = [], tema = "", confirmado }) {
      const c = await resolverCliente(cliente);
      const ctx = await contexto(c);
      const estampa = logoEstampado(ctx.kit);
      const esCarrusel = carrusel === true;
      const lasPiezas = esCarrusel ? (Array.isArray(piezas) ? piezas : []).map((p) => ({ ...p, formato: "vertical", post_id: "" })) : piezas;
      if (!lasPiezas.length && !(esCarrusel && texto(tema, 400))) throw new ErrorDiseno("Faltan las piezas (de 1 a 12, cada una con su ficha o su idea).");
      const plan = lasPiezas.length ? planDeDiseno(ctx, lasPiezas, { productosTanda: productos }) : [];
      const buenas = plan.filter((p) => !p.error);
      if (esCarrusel && buenas.some((p) => !p.ficha)) throw new ErrorDiseno("Un carrusel va con la ficha de CADA lámina (o sin piezas y con «tema», y lo diseña el director).");
      if (!buenas.length && !(esCarrusel && tema)) throw new ErrorDiseno(plan.map((p) => `${p.n}. ${p.error}`).join("\n") || "Ninguna pieza se puede crear.");

      // Un carrusel sin fichas, con tema: el director lo diseña entero (una lámina de costo aproximado por cada una).
      const modeloCarrusel = esCarrusel ? (buenas[0]?.modelo ?? modeloDelCliente(ctx.activos, ctx.kit)) : null;
      if (esCarrusel && !modeloCarrusel) throw new ErrorDiseno("No hay ningún modelo de imagen con llave (Ajustes → IA).");

      const quien = { id: c.id, nombre: c.name };
      if (confirmado !== true) {
        if (esCarrusel && !buenas.length) {
          const una = estimar(modeloCarrusel, 1, ajustesDe(modeloCarrusel, { aspectRatio: "4:5" }, {}));
          return {
            texto: `NO SE CREÓ NADA TODAVÍA. Un carrusel de ${c.name} sobre «${texto(tema, 120)}» que diseña el director (de 5 a 8 láminas): unos ${textoCosto(una * 6)} (${textoCosto(una)} por lámina, ${nombreDelModelo(modeloCarrusel.id)}). Dile la cifra a la persona y, sólo si dice que sí, repite la llamada con confirmado=true.`,
            imagenes: [],
            vista: vistaDe({
              tipo: "plan", titulo: `Plan del carrusel · ${c.name}`, cliente: quien, subtitulo: "Nada se ha creado todavía",
              plan: { costo: textoCosto(una * 6), piezas: [{ titulo: `Carrusel sobre «${texto(tema, 120)}»`, detalle: `De 5 a 8 láminas que diseña el director · ${textoCosto(una)} por lámina · ${nombreDelModelo(modeloCarrusel.id)}` }] },
            }),
          };
        }
        return { texto: textoDelPlan(plan, { carrusel: esCarrusel, cliente: c.name }), imagenes: [], vista: vistaDelPlan(plan, { carrusel: esCarrusel, cliente: quien }) };
      }

      // ¿De qué calendario es cada publicación? (la pieza queda unida a ella en la galería)
      const calendarioDePost = {};
      for (const id of [...new Set([...buenas.map((p) => p.postId), texto(postCarrusel, 80)].filter(Boolean))]) {
        try { calendarioDePost[id] = (await buscarPublicacion(id)).cal.id; } catch { /* sin publicación: la pieza va sólo a la galería */ }
      }
      const titulo = texto(concepto, 140) || (esCarrusel ? texto(tema, 140) || buenas[0]?.titulo : `Diseño de Claude · ${buenas.length} pieza${buenas.length === 1 ? "" : "s"}`);

      try {
        if (esCarrusel) {
          const carpeta = await crearCarpeta(acceso, c.id, titulo || "Carrusel", { tipo: "carrusel" });
          const fotos = fotosDeLaPieza(ctx.productos, { productos: lista(productos, 6), ficha: buenas.map((p) => p.ficha).join("\n"), idea: tema }, 3).map((f) => f.clave);
          const ultima = buenas.length - 1;
          const postId = texto(postCarrusel, 80);
          const vistas = buenas.length ? [] : await vistasDelCliente(env, acceso, c, ctx.kit).catch(() => []);
          const fila = await crearEncargo(env, acceso, c, {
            tipo: "carrusel", titulo, carpetaId: carpeta.id, controlar: true, logoEstampado: estampa, vistas,
            comun: {
              modelo: modeloCarrusel.id, modo: "ia", plantilla: "banda", idea: texto(concepto || tema || titulo, 400), hilo: texto(concepto, 600),
              preset: estiloDeMarca(ctx.kit, buenas[0]?.estilo ?? "", { marca: c.name, rubro: c.industry ?? "" }), fotos, personajes: [],
              tipografia: referenciaDeTipografia(ctx.kit), logo: estampa ? "" : limpiarKit(ctx.kit).logo ?? "",
              ...(postId && calendarioDePost[postId] ? { calendarId: calendarioDePost[postId], postId } : {}),
            },
            ...(buenas.length
              ? { laminas: buenas.map((p, i) => ({ n: i + 1, rol: i === 0 ? "portada" : i === ultima && buenas.length >= 3 ? "cierre" : "contenido", texto: textoDeLaFicha(p.ficha), ficha: p.ficha })) }
              : { propuesta: { guion: "", tema: texto(tema, 400), preset: buenas[0]?.estilo ?? "", estilo: "", productoId: lista(productos, 1)[0] }, laminas: [] }),
          }, { usuario });
          return {
            texto: [
              `Carrusel en marcha para ${c.name}: encargo ${fila.id} (carpeta ${carpeta.id}, que es su carrusel_id).`,
              "Se hace en el servidor, lámina a lámina y en orden (cada una con la anterior y la portada de referencia), con el control de calidad.",
              `Mira cómo va con estado_encargo (encargo_id ${fila.id}); al terminar te devuelve cada lámina para que la revises. La vista previa del chat enseña las láminas según salen.`,
              postId ? `Cuando esté bien, ponlo en la publicación con poner_en_publicacion (post_id ${postId}, carrusel_id ${carpeta.id}).` : "",
            ].filter(Boolean).join("\n"),
            imagenes: [],
            vista: (await vistaDeEncargo(env, acceso, fila)).vista,
          };
        }
        const vistas = buenas.some((p) => !p.ficha) ? await vistasDelCliente(env, acceso, c, ctx.kit).catch(() => []) : [];
        const fila = await crearEncargo(env, acceso, c, {
          tipo: "lote", titulo, mejorar: buenas.some((p) => !p.ficha), controlar: true, paralelo: PARALELO, vistas,
          pasos: buenas.map((p) => pasoDelPlan(p, { calendarioDePost, productos: ctx.productos, estampa })),
        }, { usuario });
        const total = buenas.reduce((t, p) => t + (p.costo || 0), 0);
        return {
          texto: [
            `En marcha para ${c.name}: encargo ${fila.id}, ${buenas.length} pieza${buenas.length === 1 ? "" : "s"} (unos ${textoCosto(total)}).`,
            plan.some((p) => p.error) ? `No van: ${plan.filter((p) => p.error).map((p) => `${p.n} (${p.error})`).join("; ")}.` : "",
            "Se hacen en el servidor, de dos en dos, con el control de calidad (corrige sola una letra mal escrita y se queda con la mejor).",
            `Mira cómo va con estado_encargo (encargo_id ${fila.id}); al terminar te devuelve cada imagen para que la revises. La vista previa del chat enseña las piezas según salen.`,
            estampa ? "El logo de este cliente lo ESTAMPA la aplicación: queda puesto cuando alguien abra el Estudio." : "",
          ].filter(Boolean).join("\n"),
          imagenes: [],
          vista: (await vistaDeEncargo(env, acceso, fila)).vista,
        };
      } catch (e) {
        if (e instanceof ErrorEstudio) throw new ErrorDiseno(e.message);
        throw e;
      }
    },

    async estado_encargo({ encargo_id: id }) {
      const fila = await acceso.leerUno("estudio_encargos", { id: String(id ?? "") });
      if (!fila) throw new ErrorDiseno(`No encontré el encargo «${id}».`);
      // La vista previa del chat (MCP Apps) lleva las mismas piezas; las imágenes son las mismas que mira Claude.
      const { e, porId, imagenes, vista } = await vistaDeEncargo(env, acceso, fila);
      const FASE = { nuevo: "esperando", generando: "creándose", opciones: "revisándose", hecho: "lista", fallido: "no salió" };
      const finalesDe = (p) => (p.fase === "hecho" ? (p.finales?.length ? p.finales : p.opciones.map((o) => o.id)) : []);
      const lineas = e.pasos.map((p, i) => {
        const finales = finalesDe(p);
        const control = p.opciones?.[0]?.control;
        const nota = control ? ` · control: ${control.estado === "ok" ? "bien" : "revisar"}${control.puntajeDiseno ? `, diseño ${control.puntajeDiseno}/10` : ""}${p.opciones?.[0]?.corregida ? " (corregida)" : ""}` : "";
        return `${i + 1}. ${p.titulo || p.id} — ${FASE[p.fase] ?? p.fase}${finales.length ? ` · archivo ${finales.join(", ")}` : ""}${nota}${p.error ? ` · ${p.error}` : ""}${p.deDirector ? " · ficha del director" : ""}`;
      });
      const vivo = e.estado === "en_marcha";
      const listas = [...new Set(e.pasos.flatMap(finalesDe))].map((x) => porId.get(x)).filter((f) => f && String(f.mime ?? "").startsWith("image/"));
      const textoEstado = [
        `Encargo ${e.id} (${e.tipo === "carrusel" ? "carrusel" : "piezas"}): ${vivo ? "en marcha" : e.estado === "hecho" ? "terminado" : e.estado}. ${e.nota ?? ""}`.trim(),
        e.error ? `Motivo: ${e.error}` : "",
        ...lineas,
        imagenes.length ? `Van ${imagenes.length === 1 ? "la imagen lista" : `las ${imagenes.length} imágenes listas`}, en el orden de arriba: MÍRALAS antes de darlas por buenas.` : "",
        listas.length > MAX_PIEZAS_VISTAS ? `Hay ${listas.length - MAX_PIEZAS_VISTAS} más: míralas con ver_pieza.` : "",
        vivo ? "Sigue en el servidor: vuelve a mirar en un minuto (la vista previa del chat se pone al día sola)." : "",
      ].filter(Boolean).join("\n");
      return { texto: textoEstado, imagenes, vista };
    },

    async corregir_pieza({ cliente, archivo_id: archivoId, indicacion = "", igual_a: igualA = "" }) {
      const c = await resolverCliente(cliente);
      const f = await archivoDe(c, archivoId);
      if (!f || !String(f.mime ?? "").startsWith("image/")) throw new ErrorDiseno("No encontré esa imagen en la galería de este cliente (usa su ID de estado_encargo o ver_pieza).");
      const a = archivoPublico(f);
      const buenaF = igualA ? await archivoDe(c, igualA) : null;
      if (igualA && !buenaF) throw new ErrorDiseno("No encontré la pieza a la que igualar.");
      const instruccion = texto(indicacion, 600) || (buenaF ? IGUALAR_TEXTO : "");
      if (!instruccion) throw new ErrorDiseno("Falta qué corregir.");
      const activos = activosDe(env);
      const aspecto = proporcionDe(a);
      const m = modeloParaCorregir(activos, a.modelo, aspecto);
      if (!m) throw new ErrorDiseno("No hay ningún modelo que edite imágenes con llave (Ajustes → IA).");
      const { prompt, medios } = pedidoDeCorreccion({ clave: a.clave, instruccion, ejemplos: buenaF ? [ejemploParaIgualar(archivoPublico(buenaF))] : [], modelo: m });
      try {
        const t = await crearTrabajo(env, acceso, c, {
          modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: aspecto }, medios), medios, confirmado: true,
          ...(a.carpetaId ? { carpetaId: a.carpetaId } : {}),
        }, { usuario, origen: "claude", por });
        const { vista } = await vistaDeTrabajo(env, acceso, t, { titulo: "Versión corregida" });
        return {
          texto: `Corrigiendo la pieza ${a.id} con ${nombreDelModelo(m.id)} (unos ${textoCosto(estimar(m, 1, {}))}): pedido ${t.id}. Sale una NUEVA y la de antes se queda en la galería. Mírala con estado_trabajo (trabajo_id ${t.id}) y, si va en una publicación, ponla con poner_en_publicacion.`,
          imagenes: [], vista,
        };
      } catch (e) {
        if (e instanceof ErrorEstudio) throw new ErrorDiseno(e.message);
        throw e;
      }
    },

    async poner_en_publicacion({ post_id: postId, carrusel_id: carruselId = "", archivo_ids: archivoIds = [], modo = "reemplazar" }) {
      const { cal, days, dia, indice, post } = await buscarPublicacion(String(postId ?? ""));
      const c = await acceso.leerUno("clients", { id: cal.client_id });
      if (!c) throw new ErrorDiseno("No encontré el cliente de esa publicación.");
      if (post.status === "published") throw new ErrorDiseno("Esa publicación ya salió: no se le cambian los archivos.");
      let piezas = [];
      if (carruselId) {
        const id = String(carruselId);
        let carpeta = await acceso.leerUno("estudio_carpetas", { id, client_id: c.id });
        if (!carpeta) { const f = await archivoDe(c, id); carpeta = f?.carpeta_id ? await acceso.leerUno("estudio_carpetas", { id: f.carpeta_id, client_id: c.id }) : null; }
        if (!carpeta) throw new ErrorDiseno("No encontré ese carrusel en la galería del cliente de esa publicación.");
        const dentro = (await acceso.leer("estudio_archivos", { client_id: c.id, carpeta_id: carpeta.id, borrado_at: NULO }, "created_at asc", 200)).map(archivoPublico);
        piezas = piezasDeGrupo(carpetaPublica(carpeta), dentro).filter((a) => a.tipo === "imagen");
        if (!piezas.length) throw new ErrorDiseno("Ese carrusel no tiene láminas todavía.");
      } else {
        const ids = (Array.isArray(archivoIds) ? archivoIds : []).map(String).filter(Boolean).slice(0, 10);
        if (!ids.length) throw new ErrorDiseno("Falta qué poner: archivo_ids o carrusel_id.");
        for (const id of ids) {
          const f = await archivoDe(c, id);
          if (!f) throw new ErrorDiseno(`No encontré «${id}» en la galería de ${c.name}.`);
          piezas.push(archivoPublico(f));
        }
      }
      const r = postConPiezas(post, piezas, modo === "anadir" ? "anadir" : "reemplazar");
      // Si el post RECIBE su primera imagen, su historia encajada (9:16), como hace el panel: en el Container.
      r.post = await conHistoriaEncajada(env, { antes: post, despues: r.post, clienteId: c.id, colorMarca: c.primary_color });
      dia.posts[indice] = r.post;
      await guardarDias(cal, days);
      for (const a of piezas) await marcarUso(acceso, c.id, a.id, { calendarId: cal.id, postId: post.id }).catch(() => {});
      const n = r.post.medios?.length ?? 0;
      return `Puesto en la publicación ${post.id} del ${dia.date}: ${n} archivo${n === 1 ? "" : "s"}${r.post.format === "carrusel" ? " (carrusel)" : ""}${r.post.encajadaDe && r.post.encajadaDe !== post.encajadaDe ? ", con su historia 9:16 (sale también como historia)" : ""}, ${modo === "anadir" ? "añadido a lo que tenía" : "en lugar de lo que tenía (lo de antes sigue en la galería)"}. Queda lista para revisar y programar.`;
    },
  };
}

