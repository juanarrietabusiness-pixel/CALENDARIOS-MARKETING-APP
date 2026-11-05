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
 * publicó, el calendario se estaba guardando a la vez).
 */
export async function cambiarPublicacion(env, acceso, { clienteId, calendarId = null, postId, cambiar, por = SISTEMA_POST }) {
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
    if (post.status === "published") return { aviso: "La publicación ya salió: quedó en la galería, sin tocarla." };
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
