// ============================================================
// Avisar al espacio de que algo ha cambiado
//
// Una sola función, y a propósito: si cada ruta construyera su propia
// llamada al Durable Object, la que se olvidara de hacerlo no fallaría
// —guardaría bien en D1— y el otro navegador simplemente no se enteraría
// nunca. Ese es el fallo que no se ve mirando la pantalla: el dato está,
// el guardado fue correcto, y la otra persona sigue viendo lo de antes.
//
// NO SE ESPERA A QUE TERMINE
//
// Difundir es un efecto secundario: si el Durable Object tarda o falla,
// la escritura en D1 ya ha ocurrido y la respuesta no debe retrasarse ni
// convertirse en un error. El cliente que no reciba el aviso recarga al
// reconectar, que es la red de seguridad de todo esto.
// ============================================================

/**
 * Lo más grande que se manda por el socket.
 *
 * Un calendario entero viaja dentro del evento, y eso es lo que evita
 * una segunda vuelta a la red para leerlo. Pero un mes con veinticinco
 * publicaciones escritas ya son decenas de kB, y el tope de un mensaje
 * de WebSocket en Workers es 1 MB: pasado cierto punto, mandar la fila
 * deja de ser un atajo y pasa a ser un mensaje que no llega —en
 * silencio, que es lo peor—.
 *
 * Por encima de esto se manda el aviso LIGERO, que sólo dice qué ha
 * cambiado, y el otro lado lo relee. Medio segundo de más, y llega.
 */
const TOPE_EVENTO = 512 * 1024;

/**
 * Manda un evento a todos los navegadores abiertos en este espacio.
 *
 * `env.HUB` puede no existir en un entorno sin el binding —los tests, o
 * un `wrangler dev` mal configurado—: se comprueba en vez de reventar,
 * porque perder el tiempo real nunca debe costar la escritura.
 *
 * `ligero` es el mismo aviso sin el cuerpo, para cuando el cuerpo no
 * cabe. Ver `TOPE_EVENTO`.
 */
export function difundir(env, ownerId, evento, ligero = null) {
  if (!env?.HUB || !ownerId) return;
  try {
    let payload = JSON.stringify(evento);
    if (payload.length > TOPE_EVENTO) {
      if (!ligero) return;
      payload = JSON.stringify(ligero);
    }

    const hub = env.HUB.get(env.HUB.idFromName(ownerId));
    hub.fetch(
      new Request("https://hub/difundir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }),
    ).catch(() => {});
  } catch {
    // Igual que arriba: el aviso es mejorable, la escritura no.
  }
}

/**
 * Quién firma el cambio.
 *
 * Va en todos los eventos de datos para que el otro lado pueda decir
 * «Ana ha actualizado Agosto» en vez de que las cosas cambien solas
 * delante de alguien que no ha tocado nada, que es inquietante y además
 * parece un fallo.
 *
 * `tab` es la PESTAÑA que originó el cambio, no la persona. El evento va
 * a todos los conectados —incluido quien lo provocó, porque el cambio
 * llegó por HTTP y el Durable Object no sabe de qué socket salió—, y sin
 * este dato esa pestaña se aplicaría su propio guardado encima de lo que
 * su usuario haya seguido escribiendo. Por pestaña y no por persona: dos
 * pestañas del mismo navegador sí tienen que verse.
 */
export const firma = (usuario, req) => ({
  userId: usuario.id,
  nombre: usuario.nombre,
  color: usuario.color,
  tab: req?.headers?.get("X-Pestana") ?? null,
});
