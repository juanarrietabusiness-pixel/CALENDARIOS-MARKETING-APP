// ============================================================
// La auditoría de un perfil de Instagram
//
// DE DÓNDE SALE EL PERFIL
//
//   · De un cliente con su Instagram conectado: se lee con el token de su
//     propia cuenta.
//   · De cualquier otra cuenta de empresa o creador —un prospecto, un
//     cliente sin conectar—: con `business_discovery`, desde cualquier
//     cuenta de Instagram conectada del espacio. Es lo que ya usa la foto
//     de la competencia. Una cuenta PERSONAL no se puede leer así; para
//     ésa (y para los destacados, que la API no da nunca) están las
//     capturas de pantalla que se adjuntan.
//
// QUÉ VE LA IA
//
// La foto de perfil, las nueve últimas publicaciones de la rejilla (como
// imágenes: la rejilla se juzga mirándola), los textos, las cifras ya
// calculadas por `src/lib/auditoria.js` y las capturas. Devuelve un JSON
// que `limpiarAnalisis()` ciñe a los límites de Instagram.
//
// Se CONGELA lo que había al auditar (`datos`): si el cliente cambia la
// biografía mañana, la auditoría sigue diciendo de qué partía.
// ============================================================

import { abrirFlujo, leerFlujo, textoDe, esRechazoDeModelo, mensajeDeRechazo } from "./anthropic.js";
import { prepararIA, registrarConsumo, MARGEN_RAZONAMIENTO, MODELO_SONNET } from "./configIA.js";
import { graph, descifrarMeta, mensajeMeta, ErrorMeta } from "./meta.js";
import { difundir } from "./vivo.js";
import { uuid, ahora } from "./ids.js";
import { cifrasPerfil, limpiarAnalisis, extraerJSON, usuarioInstagram, LIMITES_PERFIL } from "../../src/lib/auditoria.js";

const FIRMA = { userId: "sistema", nombre: "Auditoría", color: "#1E90FF" };
const CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
const MAX_IMAGEN = 3_500_000;
const MAX_CAPTURAS = 4;

/** Un error que es de lo pedido (perfil privado, sin Meta…): se enseña tal cual. */
export class ErrorAuditoria extends Error {}

const CAMPOS_MEDIA = "caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url";
const CAMPOS_PERFIL = `username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(24){${CAMPOS_MEDIA}}`;

const formatoDe = (m) => (m.media_product_type === "REELS" || m.media_type === "VIDEO" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carrusel" : "imagen");

/** El perfil de Graph a la forma de la auditoría. */
function perfilDe(p, fuente) {
  return {
    fuente,
    usuario: p.username ?? "",
    nombre: p.name ?? "",
    bio: p.biography ?? "",
    enlace: p.website ?? "",
    fotoUrl: p.profile_picture_url ?? "",
    seguidores: p.followers_count ?? null,
    siguiendo: p.follows_count ?? null,
    publicaciones: p.media_count ?? null,
    medios: (p.media?.data ?? []).map((m) => ({
      formato: formatoDe(m),
      texto: String(m.caption ?? "").slice(0, 300),
      meGusta: m.like_count ?? null,
      comentarios: m.comments_count ?? null,
      fecha: m.timestamp ?? null,
      enlace: m.permalink ?? "",
      imagen: m.media_type === "VIDEO" ? m.thumbnail_url ?? "" : m.media_url ?? "",
    })),
  };
}

/**
 * Lee el perfil. Con el cliente y su cuenta conectada, directo; si no, por
 * `business_discovery` desde cualquier Instagram conectado del espacio.
 */
export async function leerPerfil(env, acceso, { clientId = null, usuario = "" }) {
  const cuentas = (await acceso.leer("cuentas_sociales", { red: "instagram" })).filter((c) => c.token_cifrado);
  const propia = clientId ? cuentas.find((c) => c.client_id === clientId) : null;
  const pedido = usuarioInstagram(usuario) ?? propia?.usuario?.toLowerCase() ?? null;

  if (propia && (!pedido || propia.usuario?.toLowerCase() === pedido)) {
    const token = await descifrarMeta(env, propia.token_cifrado);
    return perfilDe(await graph(env, token, `/${propia.externo_id}`, { params: { fields: CAMPOS_PERFIL } }), "cuenta");
  }
  if (!pedido) throw new ErrorAuditoria("Escribe el usuario de Instagram que quieres auditar.");
  const desde = propia ?? cuentas[0];
  if (!desde) {
    throw new ErrorAuditoria("Para leer un perfil hace falta al menos una cuenta de Instagram conectada (Ajustes → Integraciones). Sin ella, adjunta capturas del perfil.");
  }
  const token = await descifrarMeta(env, desde.token_cifrado);
  try {
    const r = await graph(env, token, `/${desde.externo_id}`, { params: { fields: `business_discovery.username(${pedido}){${CAMPOS_PERFIL}}` } });
    if (!r?.business_discovery) throw new ErrorAuditoria(`No encontré @${pedido}.`);
    return perfilDe(r.business_discovery, "business_discovery");
  } catch (e) {
    if (e instanceof ErrorMeta) {
      throw new ErrorAuditoria(`Instagram no deja leer @${pedido}: sólo se pueden auditar así las cuentas de empresa o de creador. Si es personal, adjunta capturas del perfil. (${mensajeMeta(e)})`);
    }
    throw e;
  }
}

function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Una imagen del CDN de Meta, como bloque para Claude. null si no se puede. */
async function imagenDelCDN(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !CDN.test(u.hostname)) return null;
  const r = await fetch(u).catch(() => null);
  const tipo = (r?.headers.get("content-type") ?? "").split(";")[0];
  if (!r?.ok || !/^image\/(jpeg|png|webp|gif)$/.test(tipo)) return null;
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_IMAGEN) return null;
  return { type: "image", source: { type: "base64", media_type: tipo, data: aBase64(buf) } };
}

/** Las capturas llegan del navegador ya reducidas, como data: URL. */
function captura(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m || m[2].length > MAX_IMAGEN * 1.4) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

function pedido({ perfil, cifras, cliente, nota, hayCapturas, hayRejilla }) {
  const ficha = cliente
    ? [`Es cliente de la agencia: ${cliente.name}.`, cliente.industry && `Rubro: ${cliente.industry}.`, cliente.descripcion && `Descripción: ${String(cliente.descripcion).slice(0, 600)}`]
      .filter(Boolean).join("\n")
    : "Es un PROSPECTO: todavía no es cliente. La auditoría le tiene que enseñar, con respeto y en concreto, lo que la agencia mejoraría.";
  const { medios, fotoUrl: _fotoUrl, ...resto } = perfil;
  return `Eres el estratega de redes sociales de la agencia Juancito Ads (Panamá). Haz la auditoría del perfil de Instagram @${perfil.usuario || "(ver capturas)"}.

${ficha}
${nota ? `\nLo que pide la agencia: ${String(nota).slice(0, 600)}\n` : ""}
PERFIL (lo que devuelve Instagram, JSON):
${JSON.stringify(resto)}

CIFRAS YA CALCULADAS (no inventes otras; si falta un dato, no lo menciones):
${JSON.stringify(cifras)}

ÚLTIMAS PUBLICACIONES (texto y reacciones; las imágenes de la rejilla van adjuntas en el mismo orden):
${JSON.stringify(medios.slice(0, 12).map(({ imagen: _imagen, ...m }) => m))}

Imágenes adjuntas: primero la foto de perfil${hayRejilla ? "; después las últimas publicaciones de la rejilla, de la más reciente a la más antigua" : ""}${hayCapturas ? "; al final, capturas de pantalla del perfil (ahí se ven los destacados, que la API no da)" : ""}.

Límites de Instagram que tus propuestas DEBEN respetar: biografía ≤ ${LIMITES_PERFIL.bio} caracteres (cuenta emojis y saltos), nombre ≤ ${LIMITES_PERFIL.nombre}, título de destacado ≤ ${LIMITES_PERFIL.tituloDestacado}.

Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma. «estado» es "bien", "mejorable" o "mal":
{
  "puntuacion": 0-100,
  "resumen": "3 o 4 frases: cómo está el perfil y lo que más urge",
  "fortalezas": ["2 a 4 cosas que ya funcionan"],
  "foto": {"estado": "", "comentario": "qué se ve y si se reconoce en pequeño", "recomendacion": ""},
  "nombre": {"estado": "", "comentario": "el campo nombre es buscable: ¿lleva la palabra clave del negocio?", "recomendacion": "", "propuesta": "Nombre | palabra clave"},
  "bio": {"estado": "", "comentario": "", "opciones": ["3 biografías listas para copiar: qué hace, para quién, prueba social o diferencia, y llamada a la acción"]},
  "enlace": {"estado": "", "comentario": "", "recomendacion": ""},
  "destacados": {"estado": "", "comentario": "${hayCapturas ? "según las capturas" : "no hay capturas: di que no se pudieron ver y propón la estructura igualmente"}", "propuesta": [{"titulo": "", "contenido": "qué va dentro"}]},
  "rejilla": {"estado": "", "comentario": "coherencia visual, colores, portadas, legibilidad en miniatura", "recomendaciones": [""]},
  "contenido": {"estado": "", "comentario": "temas, formatos, ritmo e interacción, con las cifras", "recomendaciones": [""]},
  "prioridades": ["las 5 acciones en orden de impacto, cada una concreta y hacible esta semana"]
}

Tono: cercano y profesional, en español de Panamá, de tú. Concreto: nada de «mejorar la estrategia»; di qué cambiar y cómo.`;
}

const vacio = JSON.stringify({});

/**
 * Crea y genera una auditoría. Deja la fila en «generando» mientras la IA
 * trabaja (la pantalla lo enseña en vivo) y en «error» con su motivo si
 * algo falla: nunca desaparece sin decir por qué.
 */
export async function generarAuditoria(env, acceso, { clientId = null, usuario = "", capturas = [], nota = "", usuarioId = null }) {
  if (!env.ANTHROPIC_API_KEY) throw new ErrorAuditoria("El servidor no tiene configurada la clave de Anthropic.");
  const cliente = clientId ? await acceso.leerUno("clients", { id: clientId }) : null;
  if (clientId && !cliente) throw new ErrorAuditoria("Ese cliente no existe.");
  const imagenesCaptura = (Array.isArray(capturas) ? capturas : []).slice(0, MAX_CAPTURAS).map(captura).filter(Boolean);

  const ia = await prepararIA(env, acceso);
  if (ia.bloqueo) throw new ErrorAuditoria(ia.bloqueo);

  // El perfil primero: si no se puede leer y no hay capturas, no hay nada
  // que auditar y no se crea ninguna fila.
  let perfil;
  try {
    perfil = await leerPerfil(env, acceso, { clientId, usuario });
  } catch (e) {
    if (!(e instanceof ErrorAuditoria) || !imagenesCaptura.length) throw e;
    perfil = { fuente: "capturas", usuario: usuarioInstagram(usuario) ?? "", nombre: "", bio: "", enlace: "", fotoUrl: "", seguidores: null, siguiendo: null, publicaciones: null, medios: [], aviso: e.message };
  }
  const cifras = cifrasPerfil(perfil);

  const base = {
    id: uuid(), client_id: clientId, usuario: perfil.usuario || usuarioInstagram(usuario) || "perfil",
    testigo: null, compartido: 0, generado_por: usuarioId, created_at: ahora(),
  };
  await acceso.insertar("auditorias", { ...base, estado: "generando", datos: vacio, analisis: vacio, updated_at: ahora() });
  difundir(env, acceso.ownerId, { tipo: "auditoria", id: base.id, estado: "generando", por: FIRMA });

  try {
    const foto = perfil.fotoUrl ? await imagenDelCDN(perfil.fotoUrl) : null;
    const rejilla = (await Promise.all(perfil.medios.slice(0, 9).map((m) => (m.imagen ? imagenDelCDN(m.imagen) : null)))).filter(Boolean);
    const contenido = [
      ...(foto ? [foto] : []),
      ...rejilla,
      ...imagenesCaptura,
      { type: "text", text: pedido({ perfil, cifras, cliente, nota, hayCapturas: imagenesCaptura.length > 0, hayRejilla: rejilla.length > 0 }) },
    ];

    let modelo = ia.modelo;
    let m;
    for (;;) {
      try {
        const res = await abrirFlujo(env, {
          model: modelo,
          max_tokens: 6000 + (MARGEN_RAZONAMIENTO[ia.esfuerzo] ?? 16_000),
          thinking: { type: "adaptive" },
          output_config: { effort: ia.esfuerzo },
          messages: [{ role: "user", content: contenido }],
        });
        m = await leerFlujo(res);
        break;
      } catch (e) {
        if (esRechazoDeModelo(e) && modelo !== MODELO_SONNET) { modelo = MODELO_SONNET; continue; }
        throw new Error(mensajeDeRechazo(e));
      }
    }
    await registrarConsumo(acceso, { funcion: "auditoria", modelo, uso: m.usage, clienteId: clientId });
    const bruto = extraerJSON(textoDe(m));
    if (!bruto) throw new Error("La IA no devolvió la auditoría en el formato esperado. Vuelve a intentarlo.");

    // La foto de perfil se guarda incrustada (es pequeña): el enlace
    // público no tiene sesión para pasar por el proxy de miniaturas.
    const fotoIncrustada = foto && foto.source.data.length < 200_000 ? `data:${foto.source.media_type};base64,${foto.source.data}` : "";
    const { fotoUrl: _fotoUrl, ...sinUrl } = perfil;
    const fila = {
      ...base,
      estado: "listo",
      datos: JSON.stringify({ perfil: { ...sinUrl, foto: fotoIncrustada }, cifras, capturas: imagenesCaptura.length, modelo, auditadoEl: ahora() }),
      analisis: JSON.stringify(limpiarAnalisis(bruto)),
      error: null,
      updated_at: ahora(),
    };
    await acceso.guardar("auditorias", fila);
    difundir(env, acceso.ownerId, { tipo: "auditoria", id: base.id, estado: "listo", por: FIRMA });
    return fila;
  } catch (e) {
    await acceso.actualizar("auditorias", { id: base.id }, { estado: "error", error: String(e?.message ?? e).slice(0, 500), updated_at: ahora() });
    difundir(env, acceso.ownerId, { tipo: "auditoria", id: base.id, estado: "error", por: FIRMA });
    throw e;
  }
}
