// ============================================================
// Despertar a la bomba del Estudio de un espacio
//
// Aparte de vivo.js a propósito: `difundir` es un aviso y NUNCA se espera (un
// test lo vigila); despertar a la bomba es lo que hace que un trabajo siga sin
// pantalla, y SÍ se espera —es corto: el objeto sólo apunta su alarma—, porque
// una petición sin esperar puede cortarse al terminar la respuesta.
// ============================================================

/**
 * Despierta a la bomba del Estudio de este espacio (el Durable Object pone su alarma): hay un trabajo o un encargo que
 * tiene que seguir aunque nadie mire la pantalla. Sin el binding (tests, local mal configurado), nada.
 */
export async function despertar(env, ownerId) {
  if (!env?.HUB || !ownerId) return;
  try {
    const hub = env.HUB.get(env.HUB.idFromName(ownerId));
    await hub.fetch(new Request("https://hub/despertar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId }),
    }));
  } catch {
    // El cron de respaldo lo avanza igual, más despacio.
  }
}
