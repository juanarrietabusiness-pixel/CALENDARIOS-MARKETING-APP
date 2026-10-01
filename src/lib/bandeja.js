// ============================================================
// La bandeja, desde el navegador
//
// Llama a /api/bandeja por `pedir()` (db.js): la misma cookie, la misma
// cabecera de pestaña y el mismo error en español. Nada aquí habla con
// Meta: eso es del Worker, y `connect-src` sigue en `'self'`. Lo puro (la
// ventana de 24 horas, los filtros) está en bandejaVista.js.
// ============================================================

import { pedir } from "./db";

const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const e = encodeURIComponent;

/** Meta, los permisos de la bandeja y el interruptor de cada cliente con cuentas. */
export const estadoBandeja = () => pedir("/bandeja");

/** { comentarios, mensajes } sin atender, de los clientes encendidos. */
export const pendientesBandeja = () => pedir("/bandeja/pendientes");

export const listarComentarios = ({ cliente = "", red = "" } = {}) => {
  const q = new URLSearchParams();
  if (cliente) q.set("cliente", cliente);
  if (red) q.set("red", red);
  return pedir(`/bandeja/comentarios${q.toString() ? `?${q}` : ""}`);
};

export const listarHilos = ({ cliente = "", red = "" } = {}) => {
  const q = new URLSearchParams();
  if (cliente) q.set("cliente", cliente);
  if (red) q.set("red", red);
  return pedir(`/bandeja/mensajes${q.toString() ? `?${q}` : ""}`);
};

export const leerHilo = (id) => pedir(`/bandeja/hilos/${e(id)}`);

/** Enciende o apaga la bandeja de un cliente (y suscribe o da de baja su página en Meta). */
export const cambiarBandeja = (clientId, activa) =>
  pedir(`/bandeja/clientes/${e(clientId)}`, { method: "PUT", body: JSON.stringify({ activa }) });

export const actualizarBandeja = (clientId) => pedir(`/bandeja/clientes/${e(clientId)}/actualizar`, post());

export const responderComentario = (id, texto) => pedir(`/bandeja/comentarios/${e(id)}/responder`, post({ texto }));
export const ocultarComentario = (id, oculto) => pedir(`/bandeja/comentarios/${e(id)}/ocultar`, post({ oculto }));
export const atenderComentario = (id, atendido = true) => pedir(`/bandeja/comentarios/${e(id)}/atendido`, post({ atendido }));
export const borrarComentario = (id) => pedir(`/bandeja/comentarios/${e(id)}`, { method: "DELETE" });

export const responderHilo = (id, texto) => pedir(`/bandeja/hilos/${e(id)}/responder`, post({ texto }));
export const atenderHilo = (id, atendido = true) => pedir(`/bandeja/hilos/${e(id)}/atendido`, post({ atendido }));

/** El OAuth de Meta con los permisos de la bandeja (con revisión de Meta). Sólo el administrador. */
export const urlPermisosBandeja = () => "/api/redes/meta/conectar?para=bandeja";
