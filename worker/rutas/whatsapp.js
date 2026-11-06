// ============================================================
// WhatsApp e investigación (curso de campañas, entrega 8)
//
// Con sesión (/api/whatsapp):
//   GET    /:cliente                 El kit guardado, los precios del catálogo, si el estudio tiene garantía, los avisos
//   PUT    /:cliente                 { kit, antes }: guardarlo (409 si otra persona guardó desde que se leyó)
//   POST   /:cliente/proponer        La IA PROPONE el kit entero; no guarda nada
//   GET    /:cliente/voz             Las respuestas de «La voz de tus clientes», su resumen y el testigo (si existe)
//   POST   /:cliente/voz/enlace      El testigo del enlace: se crea UNA vez y se reutiliza siempre
//   POST   /:cliente/voz/estudio     { todas? }: la IA propone qué añadir a las maletas (no guarda)
//   POST   /:cliente/voz/aceptar     { propuesta, leidas }: lo marcado va al BORRADOR del estudio de mercado
//   DELETE /:cliente/voz/:id         Quita una respuesta
//
// Sin sesión (/api/publico-voz, en worker/index.js ANTES de la sesión, como el de ventas):
//   GET    /:testigo                 La encuesta: el nombre y el logo del cliente, las preguntas y sus productos
//   POST   /:testigo                 Guarda una respuesta
//
// Lo de D1 y la IA, en worker/lib/whatsapp.js; lo puro, en src/lib/kitWhatsApp.js y src/lib/vozCliente.js.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { firma } from "../lib/vivo.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import { ErrorMercado } from "../lib/mercado.js";
import {
  ErrorWhatsApp, leerKit, contextoDelKit, guardarKit, proponerKit, vozDelCliente, crearEnlaceDeVoz, borrarRespuesta, vozAlEstudio,
  aceptarVoz, vozPublica, guardarVozPublica,
} from "../lib/whatsapp.js";
import { avisosDelKit, pendientesDelKit } from "../../src/lib/kitWhatsApp.js";
import { enlaceDeVoz } from "../../src/lib/vozCliente.js";

const ID = /^[\w-]{1,80}$/;

/** Lo que llega sin sesión: un error de quien lo escribe es un 400 con su motivo; lo demás, genérico. */
export async function rutaVozPublica(req, env, { partes, metodo }) {
  const testigo = partes[1] ?? "";
  if (partes.length !== 2) return noEncontrado("Ruta");
  try {
    if (metodo === "GET") {
      const datos = await vozPublica(env, testigo);
      return datos ? json(datos) : noEncontrado("Enlace");
    }
    if (metodo === "POST") {
      const r = await guardarVozPublica(env, testigo, (await cuerpo(req)) ?? {});
      return r ? json(r) : noEncontrado("Enlace");
    }
    return error(`Método ${metodo} no permitido aquí`, 405);
  } catch (e) {
    if (e instanceof ErrorWhatsApp && e.estado < 500) return error(e.message, e.estado);
    return error("No se pudo guardar. Vuelve a intentarlo en un momento.", 500, e);
  }
}

export async function rutasWhatsApp(req, env, { acceso, usuario, partes, metodo }) {
  try {
    return await atender(req, env, { acceso, usuario, partes, metodo });
  } catch (e) {
    if (e instanceof ErrorWhatsApp || e instanceof ErrorIA || e instanceof ErrorMercado) return error(e.message, e.estado ?? 400);
    throw e;
  }
}

async function atender(req, env, { acceso, usuario, partes, metodo }) {
  const [, clientId, a, b] = partes;
  if (!ID.test(String(clientId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) return noEncontrado("Cliente");
  const quien = firma(usuario, req);

  // ---------- El kit ----------
  if (!a && metodo === "GET") {
    const [kit, contexto] = await Promise.all([leerKit(acceso, clientId), contextoDelKit(acceso, clientId)]);
    return json({ kit, contexto, avisos: avisosDelKit(kit, contexto), pendientes: pendientesDelKit(kit) });
  }
  if (!a && metodo === "PUT") {
    const d = (await cuerpo(req)) ?? {};
    if (!d.kit || typeof d.kit !== "object") return error("Falta el kit.");
    // Si otra persona guardó desde que se leyó, no se pisa: se devuelve lo de ahora.
    if ("antes" in d) {
      const actual = await leerKit(acceso, clientId);
      if ((d.antes ?? null) !== (actual.actualizado ?? null)) {
        return json({ error: `${actual.por || "Otra persona"} guardó el kit mientras lo editabas. Revisa lo de ahora y vuelve a guardar.`, kit: actual }, 409);
      }
    }
    const kit = await guardarKit(env, acceso, { clientId, entrada: d.kit, usuario, firma: quien });
    const contexto = await contextoDelKit(acceso, clientId);
    return json({ kit, avisos: avisosDelKit(kit, contexto), pendientes: pendientesDelKit(kit) });
  }
  if (a === "proponer" && !b && metodo === "POST") return json(await proponerKit(env, acceso, cliente));

  // ---------- La voz del cliente ----------
  if (a === "voz" && !b && metodo === "GET") return json(await vozDelCliente(acceso, clientId));
  if (a === "voz" && b === "enlace" && partes.length === 4 && metodo === "POST") {
    const testigo = await crearEnlaceDeVoz(acceso, clientId);
    return json({ testigo, url: enlaceDeVoz(new URL(req.url).origin, testigo) });
  }
  if (a === "voz" && b === "estudio" && partes.length === 4 && metodo === "POST") {
    const d = (await cuerpo(req)) ?? {};
    return json(await vozAlEstudio(env, acceso, cliente, { todas: d.todas === true }));
  }
  if (a === "voz" && b === "aceptar" && partes.length === 4 && metodo === "POST") {
    const d = (await cuerpo(req)) ?? {};
    return json(await aceptarVoz(env, acceso, cliente, { propuesta: d.propuesta, leidas: d.leidas, firma: quien }));
  }
  if (a === "voz" && ID.test(String(b ?? "")) && partes.length === 4 && metodo === "DELETE") {
    return json(await borrarRespuesta(env, acceso, { clientId, id: b, firma: quien }));
  }

  return noEncontrado("Ruta");
}
