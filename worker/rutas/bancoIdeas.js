// ============================================================
// El banco de ideas de la agencia: /api/banco-ideas
//
//   GET    /banco-ideas?cliente=<id>   Las de ese cliente y las generales (sin cliente)
//   GET    /banco-ideas                Todas
//   POST   /banco-ideas                Guardar una { clienteId?, idea }
//   PUT    /banco-ideas/<id>           Cambiarla o asignarle otro cliente { clienteId?, idea }
//   DELETE /banco-ideas/<id>           Quitarla
//
// Antes cada cliente guardaba su banco dentro de su fila (`clients.ideas_bank`) y no había sitio para lo que aún no
// es de nadie. Ahora es UNA tabla: una idea sin cliente es GENERAL y sale en el banco de todos hasta que se le asigne
// uno. Un colaborador sólo ve y escribe las de sus clientes: la capa no le enseña filas sin cliente ni le deja
// escribirlas (403), igual que con las conversaciones del asistente general.
//
// Un enlace de TikTok o YouTube trae su título y su miniatura por oEmbed (público, sin llave) al guardarlo; si no
// contesta, se guarda igual. Instagram pide un token para su oEmbed: va sin título.
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { difundir, firma } from "../lib/vivo.js";
import { limpiarIdea, plataformaDe, ideaDeFila, MAX_DATOS } from "../../src/lib/bancoIdeas.js";

/** Lo más que se lee de una vez (las más nuevas). */
const MAX_LISTA = 2000;
const ID_VALIDO = /^[\w-]{1,100}$/;
const ESPERA_OEMBED = 4000;

const publica = ideaDeFila;

/**
 * Título, autor y miniatura de un enlace de TikTok o YouTube (oEmbed, sin llave). Nada si no contesta a tiempo: un
 * enlace no puede tumbar el guardado. La miniatura se pinta por el proxy de miniaturas (la CSP es `img-src 'self'`).
 */
async function datosDelEnlace(url) {
  const p = plataformaDe(url);
  const base = p === "tiktok" ? "https://www.tiktok.com/oembed?url=" : p === "youtube" ? "https://www.youtube.com/oembed?format=json&url=" : "";
  if (!base) return {};
  try {
    const res = await fetch(base + encodeURIComponent(url), { signal: AbortSignal.timeout(ESPERA_OEMBED) });
    if (!res.ok) return {};
    const d = await res.json();
    const salida = {};
    if (d?.title) salida.enlaceTitulo = String(d.title).slice(0, 300);
    if (d?.author_name) salida.enlaceAutor = String(d.author_name).slice(0, 120);
    if (/^https:\/\//.test(String(d?.thumbnail_url ?? ""))) salida.miniatura = String(d.thumbnail_url).slice(0, 2000);
    return salida;
  } catch {
    return {};
  }
}

/** El cliente que manda el navegador, comprobado: null = general. Lanza «no encontrado» con un id que no es del espacio. */
async function clienteValido(acceso, valor) {
  const id = valor ? String(valor) : "";
  if (!id) return null;
  return (await acceso.leerUno("clients", { id })) ? id : undefined;
}

/** Guarda la fila y avisa. El enlace nuevo trae su título (si aún no lo tenía). */
async function guardarIdea(env, acceso, usuario, req, { id, clientId, idea, previa }) {
  let datos = limpiarIdea(idea, id);
  if (!datos) return error("Falta la idea.");
  const enlaceNuevo = datos.referenceLink && datos.referenceLink !== (previa?.referenceLink ?? "");
  if (enlaceNuevo) {
    const extra = await datosDelEnlace(datos.referenceLink);
    // Lo que escribió la persona gana; lo que trae el enlace sólo rellena lo vacío.
    for (const [k, v] of Object.entries(extra)) if (!datos[k]) datos[k] = v;
  } else if (previa && !datos.referenceLink) {
    // Sin enlace, lo que venía de él ya no vale.
    delete datos.enlaceTitulo; delete datos.enlaceAutor; delete datos.miniatura;
  }
  const texto = JSON.stringify(datos);
  if (texto.length > MAX_DATOS) return error("La idea es demasiado grande (¿una imagen pegada dentro?). Súbela al Estudio o a Drive y enlázala.", 413);
  const cuando = ahora();
  const fila = {
    id, client_id: clientId, datos: texto, creada_por: previa ? previa.creadaPor ?? null : usuario?.id ?? null,
    created_at: previa?.created_at ?? cuando, updated_at: cuando,
  };
  if (previa) await acceso.actualizar("banco_ideas", { id }, { client_id: clientId, datos: texto, updated_at: cuando });
  else await acceso.insertar("banco_ideas", fila);
  const salida = publica(fila);
  difundir(env, acceso.ownerId, { tipo: "banco-ideas", id, clientId, antes: previa?.clientId ?? null, por: firma(usuario, req) });
  return json({ idea: salida }, previa ? 200 : 201);
}

export async function rutasBancoIdeas(req, env, { acceso, usuario, partes, metodo }) {
  const url = new URL(req.url);
  const id = partes[1] ? String(partes[1]) : "";

  if (!id && metodo === "GET") {
    const cliente = String(url.searchParams.get("cliente") ?? "").trim();
    if (cliente && !(await acceso.leerUno("clients", { id: cliente }))) return noEncontrado("Cliente");
    // `client_id = ?` no casa con un vacío: las generales se juntan aquí.
    const filas = await acceso.leer("banco_ideas", {}, "created_at desc", MAX_LISTA);
    const elegidas = cliente ? filas.filter((f) => f.client_id === cliente || !f.client_id) : filas;
    return json({ ideas: elegidas.map(publica) });
  }

  if (!id && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const clientId = await clienteValido(acceso, b.clienteId);
    if (clientId === undefined) return noEncontrado("Cliente");
    const nuevoId = ID_VALIDO.test(String(b.idea?.id ?? "")) ? String(b.idea.id) : uuid();
    if (await acceso.leerUno("banco_ideas", { id: nuevoId })) return error("Esa idea ya está en el banco.", 409);
    return await guardarIdea(env, acceso, usuario, req, { id: nuevoId, clientId, idea: b.idea });
  }

  if (!id) return error(`Método ${metodo} no permitido aquí`, 405);
  if (!ID_VALIDO.test(id)) return noEncontrado("Idea");
  const fila = await acceso.leerUno("banco_ideas", { id });
  if (!fila) return noEncontrado("Idea");
  const previa = publica(fila);

  if (metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    // Sin `clienteId` en el cuerpo, se queda donde estaba; con null o vacío, pasa a general.
    const clientId = "clienteId" in b ? await clienteValido(acceso, b.clienteId) : previa.clientId;
    if (clientId === undefined) return noEncontrado("Cliente");
    return await guardarIdea(env, acceso, usuario, req, { id, clientId, idea: b.idea ?? previa, previa });
  }

  if (metodo === "DELETE") {
    await acceso.borrar("banco_ideas", { id });
    difundir(env, acceso.ownerId, { tipo: "banco-ideas", id, clientId: previa.clientId, borrada: true, por: firma(usuario, req) });
    return sinContenido();
  }

  return error(`Método ${metodo} no permitido aquí`, 405);
}
