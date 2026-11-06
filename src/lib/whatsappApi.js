// ============================================================
// Cliente de /api/whatsapp (la agencia) y /api/publico-voz (la encuesta de los clientes del cliente, sin sesión)
//
// Aparte de db.js a propósito: lo cargan sólo Marca → WhatsApp y la página pública, las dos en diferido. Ver
// worker/rutas/whatsapp.js.
// ============================================================

import { pedir } from "./db.js";

const cuerpo = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });
const de = (clientId) => `/whatsapp/${encodeURIComponent(clientId)}`;

/** El kit guardado, los precios del catálogo y si el estudio tiene garantía: { kit, contexto, avisos, pendientes }. */
export const leerKitWhatsApp = (clientId) => pedir(de(clientId));

/** Guarda el kit. `antes`: el `actualizado` que se leyó (409 si otra persona guardó entremedias). */
export const guardarKitWhatsApp = (clientId, kit, antes) => pedir(de(clientId), cuerpo("PUT", { kit, antes: antes ?? null }));

/** La IA propone el kit entero (no guarda): { kit, avisos, pendientes, modelo, aviso }. */
export const proponerKitWhatsApp = (clientId) => pedir(`${de(clientId)}/proponer`, cuerpo("POST"));

/** Las respuestas de «La voz de tus clientes»: { respuestas, resumen, testigo, productos }. */
export const vozDelCliente = (clientId) => pedir(`${de(clientId)}/voz`);

/** El enlace de la encuesta (se crea una vez y se reutiliza): { testigo, url }. */
export const enlaceDeVozDelCliente = (clientId) => pedir(`${de(clientId)}/voz/enlace`, cuerpo("POST"));

/** «Llevar al estudio»: la IA propone qué añadir a las maletas (no guarda). */
export const vozAlEstudio = (clientId, { todas = false } = {}) => pedir(`${de(clientId)}/voz/estudio`, cuerpo("POST", { todas }));

/** Lo marcado de la propuesta va al borrador del estudio de mercado: { borrador, cambios }. */
export const aceptarVozEnEstudio = (clientId, propuesta, leidas) => pedir(`${de(clientId)}/voz/aceptar`, cuerpo("POST", { propuesta, leidas }));

/** Quita una respuesta. */
export const borrarRespuestaVoz = (clientId, id) => pedir(`${de(clientId)}/voz/${encodeURIComponent(id)}`, { method: "DELETE" });

/** La encuesta, como la ve quien responde. */
export const vozPublica = (testigo) => pedir(`/publico-voz/${encodeURIComponent(testigo)}`);

/** Quien responde guarda su respuesta. */
export const responderVoz = (testigo, datos) => pedir(`/publico-voz/${encodeURIComponent(testigo)}`, cuerpo("POST", datos));
