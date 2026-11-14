// ============================================================
// Cambiar UNA publicación desde el servidor, sin pisar a nadie (el reel, el montaje, las piezas de Claude)
//
// Lo que termina en el servidor se pone SOLO en su publicación. El calendario se escribe entero (es una fila por
// mes), así que se escribe con su `updated_at` como condición: si otra persona guardó entremedias, se vuelve a leer y
// se aplica otra vez sobre lo suyo (dos vueltas; si no, se dice). Después, lo de siempre que hace el PUT: mover la
// cola (`resincronizarCalendario`) y avisar al espacio (`calendario:recargar`) para que las pantallas abiertas relean.
// Lo publicado no se toca. Lo puro (qué cambia en la publicación) vive en src/lib/resultadoEnPost.js.
// ============================================================

import { ahora } from "../ids.js";
import { difundir } from "../vivo.js";
import { resincronizarCalendario } from "../publicador.js";
import { publicacionDelCliente } from "../videosProyectos.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
export const SISTEMA_POST = { userId: "sistema", nombre: "Estudio", color: "", tab: null };

/**
 * Aplica `cambiar(post) → post nuevo | null` (o su promesa; null: no se toca) a la publicación `postId` del cliente (en `calendarId`,
 * o en el mes en que esté). → { calendarId, postId, post } si quedó escrita, o { aviso } si no se pudo (no está, ya se
 * publicó, el calendario se estaba guardando a la vez). `publicadas`: también una ya publicada (lo que no cambia lo que
 * salió, como «Va a pauta» de lo orgánico que rindió: worker/lib/enPauta.js).
 */
export async function cambiarPublicacion(env, acceso, { clienteId, calendarId = null, postId, cambiar, por = SISTEMA_POST, publicadas = false }) {
  if (!postId) return { aviso: "Sin publicación." };
  let calId = calendarId;
  if (!calId) calId = (await publicacionDelCliente(acceso, clienteId, String(postId)))?.calendarId ?? null;
  if (!calId) return { aviso: "La publicación ya no está en ningún calendario del cliente: quedó en la galería." };
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const cal = await acceso.leerUno("calendars", { id: calId, client_id: clienteId });
    const dias = leerJSON(cal?.days, []);
    const dia = Array.isArray(dias) ? dias.find((d) => (d?.posts ?? []).some((p) => p?.id === postId)) : null;
    if (!cal || !dia) return { aviso: "La publicación ya no está en su calendario: quedó en la galería." };
    const i = dia.posts.findIndex((p) => p?.id === postId);
    const post = dia.posts[i];
    if (post.status === "published" && !publicadas) return { aviso: "La publicación ya salió: quedó en la galería, sin tocarla." };
    const nuevo = await cambiar(post);
    if (!nuevo) return { calendarId: cal.id, postId, post, sinCambios: true };
    dia.posts[i] = nuevo;
    const n = await acceso.actualizar("calendars", { id: cal.id, client_id: clienteId, updated_at: cal.updated_at }, { days: JSON.stringify(dias), updated_at: ahora() });
    if (!n) continue;
    const crudo = await acceso.leerUno("calendars", { id: cal.id });
    try { await resincronizarCalendario(env, acceso, crudo, por); } catch (e) { console.error("poner en la publicación: resincronizar", e); }
    difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: cal.id, clientId: clienteId, por });
    return { calendarId: cal.id, postId, post: nuevo };
  }
  return { aviso: "El calendario se estaba guardando a la vez: quedó en la galería; ponlo desde ahí." };
}

/** Las columnas del mes que se pueden cambiar de una vez, con su nombre en la aplicación (`rowToCalendar`). */
const COLUMNAS_MES = Object.freeze([
  ["days", "days", true], ["week_concepts", "weekConcepts", true], ["opciones", "opciones", true],
  ["campaign", "campaign", false], ["offers", "offers", false], ["promo_code", "promoCode", false],
]);

/** Un mes de D1 con la forma de la aplicación (lo que reciben las funciones puras: days, weekConcepts, opciones…). */
export function mesDeFila(fila) {
  if (!fila) return null;
  return {
    id: fila.id, dbId: fila.id, client_id: fila.client_id, year: fila.year, month: fila.month, name: fila.name ?? "",
    days: leerJSON(fila.days, []) ?? [], weekConcepts: leerJSON(fila.week_concepts, []) ?? [], opciones: leerJSON(fila.opciones, {}) ?? {},
    campaign: fila.campaign ?? "", offers: fila.offers ?? "", promoCode: fila.promo_code ?? "", updated_at: fila.updated_at,
  };
}

/**
 * Cambia VARIAS publicaciones (o lo del mes: la campaña, las ofertas, los conceptos, `opciones`) de un mes en UNA
 * escritura, sin pisar a nadie: `cambiar(mes) → mes nuevo | null` (o su promesa; null: nada que cambiar) recibe el mes
 * con la forma de la aplicación (`mesDeFila`) y se aplica otra vez sobre lo de la otra persona si guardó entremedias (dos
 * vueltas). Sólo se escriben las columnas que cambiaron. Después, lo de siempre que hace el PUT: mover la cola
 * (`resincronizarCalendario`) y avisar al espacio (`calendario:recargar`). Lo de cada publicación (no tocar lo publicado)
 * lo decide `cambiar`. → { calendarId, mes } si quedó escrito (o `sinCambios`), o { aviso } si no se pudo.
 */
export async function cambiarCalendario(env, acceso, { clienteId, calendarId, cambiar, por = SISTEMA_POST }) {
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const fila = await acceso.leerUno("calendars", { id: calendarId, client_id: clienteId });
    if (!fila) return { aviso: "Ese mes ya no está en el calendario del cliente." };
    const antes = mesDeFila(fila);
    const nuevo = await cambiar(structuredClone(antes));
    if (!nuevo) return { calendarId: fila.id, mes: antes, sinCambios: true };
    const cambios = {};
    for (const [columna, campo, json] of COLUMNAS_MES) {
      if (nuevo[campo] === undefined) continue;
      const valor = json ? JSON.stringify(nuevo[campo] ?? null) : String(nuevo[campo] ?? "");
      if (valor !== (json ? JSON.stringify(antes[campo] ?? null) : String(antes[campo] ?? ""))) cambios[columna] = valor;
    }
    if (!Object.keys(cambios).length) return { calendarId: fila.id, mes: antes, sinCambios: true };
    const n = await acceso.actualizar("calendars", { id: fila.id, client_id: clienteId, updated_at: fila.updated_at }, { ...cambios, updated_at: ahora() });
    if (!n) continue;
    const crudo = await acceso.leerUno("calendars", { id: fila.id });
    try { await resincronizarCalendario(env, acceso, crudo, por); } catch (e) { console.error("cambiar el calendario: resincronizar", e); }
    difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: fila.id, clientId: clienteId, por });
    return { calendarId: fila.id, mes: mesDeFila(crudo) };
  }
  return { aviso: "El calendario se estaba guardando a la vez y no se pudo escribir: vuelve a intentarlo en un momento." };
}
