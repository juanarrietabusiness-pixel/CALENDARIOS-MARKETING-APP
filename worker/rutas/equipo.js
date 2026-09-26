// ============================================================
// El equipo — quién más entra en este espacio
//
// DOS PUERTAS, Y NO SE PARECEN
//
//   · `rutasEquipo` va DETRÁS de la sesión: la usa quien ya está dentro
//     para ver el equipo, invitar y sacar a alguien.
//
//   · `rutaInvitacionPublica` va DELANTE, con lo público, junto al
//     enlace de aprobación. Quien abre una invitación no tiene cuenta
//     —ese es el sentido de invitarlo—, así que exigir sesión aquí
//     dejaría el enlace inservible para todo el mundo menos para quien
//     no lo necesita.
//
// QUIÉN PUEDE INVITAR
//
// Sólo `admin`. No por jerarquía, sino porque invitar es dar acceso a
// todos los clientes de la agencia: es la única acción de esta
// aplicación que reparte llaves, y conviene que tenga un solo dueño.
// El papel se lee de la sesión, jamás del cuerpo de la petición.
// ============================================================

import { json, error, sinContenido, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, testigo, sha256, ahora, enHoras } from "../lib/ids.js";
import { HORAS_INVITACION, aceptarInvitacion, invitacionPorTestigo, expulsarDelEspacio, cookieSesion, clientesPermitidos } from "../lib/sesion.js";
import { difundir, firma } from "../lib/vivo.js";

const COLOR_VALIDO = /^#[0-9a-fA-F]{6}$/;
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** La ficha pública de un miembro. El hash de su contraseña no sale de D1. */
const salidaMiembro = (m) => ({
  userId: m.user_id,
  nombre: m.nombre,
  color: m.color,
  rol: m.rol,
  soloLectura: m.solo_lectura === 1,
  clientes: clientesPermitidos(m.clientes),
  desde: m.created_at,
});

/**
 * El papel que se enseña, a partir de las tres columnas: administrador,
 * editor, colaborador (sólo algunos clientes) o sólo lectura.
 */
const PAPELES = ["admin", "editor", "colaborador", "lectura"];

/** Lo que se guarda para un papel. `clientes` sólo cuenta para el colaborador. */
function columnasDePapel(papel, clientes) {
  if (papel === "admin") return { rol: "admin", solo_lectura: 0, clientes: null };
  if (papel === "lectura") return { rol: "editor", solo_lectura: 1, clientes: null };
  if (papel === "colaborador") {
    const lista = Array.isArray(clientes) ? [...new Set(clientes.map(String))].slice(0, 200) : [];
    return { rol: "editor", solo_lectura: 0, clientes: JSON.stringify(lista) };
  }
  return { rol: "editor", solo_lectura: 0, clientes: null };
}

/** Una invitación, sin su testigo: en la base sólo está el SHA-256. */
const salidaInvitacion = (i) => ({
  id: i.id,
  email: i.email,
  nombre: i.nombre,
  rol: i.rol,
  soloLectura: i.solo_lectura === 1,
  clientes: clientesPermitidos(i.clientes),
  creada: i.created_at,
  caduca: i.expires_at,
  aceptada: Boolean(i.aceptada_at),
});

export async function rutasEquipo(req, env, ctx) {
  const { acceso, partes, metodo, usuario } = ctx;
  const [, , sub, subId] = ["", ...partes];
  const esAdmin = usuario.rol === "admin";

  // ---- GET /api/equipo ----
  if (!sub && metodo === "GET") {
    const miembros = await acceso.leer("memberships", {}, "created_at asc");
    // Las invitaciones pendientes sólo las ve quien puede crearlas: para
    // el resto del equipo son ruido, y llevan el correo de alguien que
    // todavía no ha aceptado estar aquí.
    const invitaciones = esAdmin ? await acceso.leer("invitaciones", {}, "created_at desc") : [];
    return json({
      miembros: miembros.map(salidaMiembro),
      invitaciones: invitaciones.filter((i) => !i.aceptada_at).map(salidaInvitacion),
      yo: { userId: usuario.id, rol: usuario.rol, nombre: usuario.nombre, color: usuario.color },
    });
  }

  // ---- PUT /api/equipo/yo ---- cómo me ven los demás
  if (sub === "yo" && metodo === "PUT") {
    const { nombre, color } = (await cuerpo(req)) ?? {};
    const cambios = {};
    if (typeof nombre === "string" && nombre.trim()) cambios.nombre = nombre.trim().slice(0, 60);
    if (typeof color === "string" && COLOR_VALIDO.test(color)) cambios.color = color;
    if (!Object.keys(cambios).length) return error("No hay nada que cambiar");

    // Acotado por `user_id` Y por el espacio: sin lo segundo, bastaría
    // mandar el id de otra persona para renombrarla.
    const n = await acceso.actualizar("memberships", { user_id: usuario.id }, cambios);
    if (!n) return noEncontrado("Miembro");

    // Sus tareas siguen siendo suyas: van por `asignado_id`, y el nombre
    // que se enseña se pone al día.
    if (cambios.nombre) {
      await acceso.actualizar("client_tasks", { asignado_id: usuario.id }, { assigned_to: cambios.nombre });
      await acceso.actualizar("quick_tasks", { asignado_id: usuario.id }, { assigned_to: cambios.nombre });
    }
    const fila = await acceso.leerUno("memberships", { user_id: usuario.id });
    difundir(env, usuario.ownerId, { tipo: "miembro", miembro: salidaMiembro(fila), por: firma(usuario, req) });
    return json(salidaMiembro(fila));
  }

  // ---- POST /api/equipo/invitacion ----
  if (sub === "invitacion" && metodo === "POST") {
    if (!esAdmin) return error("Sólo quien administra el espacio puede invitar.", 403);

    const { email = "", nombre = "", rol = "editor", papel = null, clientes = null } = (await cuerpo(req)) ?? {};
    const limpio = String(email).trim().toLowerCase();
    if (limpio && !EMAIL_VALIDO.test(limpio)) return error("Ese correo no es válido.");
    const elegido = papel ?? rol;
    if (!PAPELES.includes(elegido)) return error("Ese papel no existe.");
    const columnas = columnasDePapel(elegido, clientes);

    // El testigo se devuelve UNA vez, aquí. En la base queda su huella,
    // así que ni una consulta ni un volcado pueden reconstruir el
    // enlace: si se pierde, se invita otra vez.
    const bruto = testigo(24);
    const fila = {
      id: uuid(),
      token_hash: await sha256(bruto),
      email: limpio,
      nombre: String(nombre).trim().slice(0, 60),
      rol: columnas.rol,
      solo_lectura: columnas.solo_lectura,
      clientes: columnas.clientes,
      creada_por: usuario.id,
      expires_at: enHoras(HORAS_INVITACION),
      aceptada_at: null,
      created_at: ahora(),
    };
    await acceso.insertar("invitaciones", fila);

    difundir(env, usuario.ownerId, { tipo: "invitacion", invitacion: salidaInvitacion(fila), por: firma(usuario, req) });
    return json({ testigo: bruto, invitacion: salidaInvitacion(fila) }, 201);
  }

  // ---- DELETE /api/equipo/invitacion/:id ----
  if (sub === "invitacion" && metodo === "DELETE") {
    if (!esAdmin) return error("Sólo quien administra el espacio puede retirar invitaciones.", 403);
    const n = await acceso.borrar("invitaciones", { id: subId });
    if (!n) return noEncontrado("Invitación");
    difundir(env, usuario.ownerId, { tipo: "invitacion:fuera", id: subId, por: firma(usuario, req) });
    return sinContenido();
  }

  // ---- PUT /api/equipo/miembro/:userId ---- cambiar el papel
  if (sub === "miembro" && metodo === "PUT") {
    if (!esAdmin) return error("Sólo quien administra el espacio puede cambiar papeles.", 403);
    if (subId === usuario.id) return error("No puedes cambiar tu propio papel: pídeselo a otra persona que administre.", 400);
    const { papel, clientes = null } = (await cuerpo(req)) ?? {};
    if (!PAPELES.includes(papel)) return error("Ese papel no existe.");
    if (subId === usuario.ownerId) return error("Quien fundó el espacio es siempre administrador.", 400);
    const n = await acceso.actualizar("memberships", { user_id: subId }, columnasDePapel(papel, clientes));
    if (!n) return noEncontrado("Miembro");
    const fila = await acceso.leerUno("memberships", { user_id: subId });
    difundir(env, usuario.ownerId, { tipo: "miembro", miembro: salidaMiembro(fila), por: firma(usuario, req) });
    return json(salidaMiembro(fila));
  }

  // ---- DELETE /api/equipo/miembro/:userId ----
  if (sub === "miembro" && metodo === "DELETE") {
    if (!esAdmin) return error("Sólo quien administra el espacio puede sacar a alguien.", 403);
    if (subId === usuario.id) return error("No puedes sacarte a ti mismo.", 400);

    try {
      const n = await expulsarDelEspacio(env.DB, usuario.ownerId, subId);
      if (!n) return noEncontrado("Miembro");
    } catch (e) {
      return error(e.message, 400);
    }

    difundir(env, usuario.ownerId, { tipo: "miembro:fuera", userId: subId, por: firma(usuario, req) });
    return sinContenido();
  }

  return noEncontrado("Ruta");
}

/**
 * El enlace de invitación, sin sesión.
 *
 * GET cuenta quién invita y a qué; POST crea la cuenta y deja la sesión
 * abierta, para que quien acepta entre directo y no tenga que escribir
 * la contraseña que acaba de inventar.
 */
export async function rutaInvitacionPublica(req, env, { partes, metodo }) {
  const bruto = partes[1] ?? "";

  if (metodo === "GET") {
    const inv = await invitacionPorTestigo(env.DB, bruto);
    if (!inv) return noEncontrado("Invitación");
    // El `ownerId` NO sale: es el identificador del espacio, y quien
    // todavía no ha entrado no tiene por qué recibirlo.
    return json({
      email: inv.email,
      nombre: inv.nombre,
      rol: inv.rol,
      invita: inv.invita,
      caducada: inv.caducada,
      aceptada: inv.aceptada,
    });
  }

  if (metodo === "POST") {
    const { email, password, nombre } = (await cuerpo(req)) ?? {};
    try {
      const sesion = await aceptarInvitacion(env.DB, bruto, {
        email,
        contrasena: password,
        nombre,
        userAgent: req.headers.get("User-Agent") ?? "",
      });
      difundir(env, sesion.usuario.ownerId, {
        tipo: "miembro",
        miembro: {
          userId: sesion.usuario.id,
          nombre: sesion.usuario.nombre,
          color: sesion.usuario.color,
          rol: sesion.usuario.rol,
          desde: ahora(),
        },
        por: firma(sesion.usuario),
      });
      return json({ usuario: sesion.usuario }, 201, { "Set-Cookie": cookieSesion(sesion.testigo) });
    } catch (e) {
      // Los errores de aquí son del enlace, no del servidor: caducado,
      // ya usado, correo repetido. Se cuentan tal cual porque quien los
      // lee es quien puede resolverlos.
      return error(e.message, 400);
    }
  }

  return noEncontrado("Ruta");
}
