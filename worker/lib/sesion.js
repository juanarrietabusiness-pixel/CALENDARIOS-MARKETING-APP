// ============================================================
// Sesión propia — lo que sustituye a Supabase Auth
//
// Se conserva el acceso por contraseña. Los enlaces mágicos son
// mejores, pero exigen un proveedor de correo, y esa dependencia se
// resuelve en el hub —donde el bot ya la tiene resuelta, con sus tablas
// magic_links y admin_emails—. Meterla aquí alarga el corte sin motivo.
//
// TRES DECISIONES
//
//  1. PBKDF2-SHA256, 600.000 iteraciones, EN VUELTAS DE 100.000.
//     Workers no trae bcrypt; crypto.subtle sí trae PBKDF2. Pero
//     **workerd en producción rechaza más de 100.000 iteraciones por
//     llamada** —«Pbkdf2 failed: iteration counts above 100000 are not
//     supported»—, un tope que NO aplican ni `wrangler dev` ni Node.
//     Con 210.000 de una vez, el acceso devolvía 500 en producción
//     mientras en local funcionaba y los tests pasaban en verde.
//     Encadenando vueltas se alcanza el total sin pasar del tope: el
//     trabajo que le cuesta a un atacante es el mismo.
//
//  2. En `sessions` se guarda el SHA-256 del testigo, no el testigo.
//     Un volcado de D1 —o una consulta de más— no puede devolver
//     sesiones utilizables.
//
//  3. Cookie con prefijo `__Host-`. Ese prefijo PROHÍBE el atributo
//     Domain: la cookie sólo vale para este origen exacto y ningún
//     subdominio la ve. Es lo que hace que el hub vaya a ser un nombre
//     con rutas y no un subdominio por herramienta.
//
//  4. Este fichero también resuelve DE QUÉ ESPACIO es quien entra.
//     `users` y `sessions` no tienen dueño: lo DEFINEN, y desde que hay
//     equipo, `memberships` es parte de esa definición. La capa de
//     acceso no puede hacerlo —necesita el espacio para construirse—,
//     así que la traducción «usuario → espacio» vive aquí, en el único
//     sitio donde ya se decide quién es quién.
// ============================================================

import { sha256, testigo, uuid, ahora, enHoras } from "./ids.js";

export const COOKIE = "__Host-sesion";

/** Trabajo total. OWASP recomienda 600.000 para PBKDF2-SHA256. */
export const ITERACIONES = 600_000;

/**
 * Lo máximo que acepta workerd en producción por cada `deriveBits`.
 * Superarlo lanza NotSupportedError, y sólo allí: en local pasa.
 */
export const MAX_POR_LLAMADA = 100_000;

const HORAS_SESION = 24 * 30;

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (s) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

/**
 * PBKDF2-SHA256 → 256 bits en hexadecimal.
 *
 * Se hace en vueltas de como mucho `MAX_POR_LLAMADA`, encadenando: la
 * salida de una vuelta es el material de entrada de la siguiente. El
 * coste total para quien intente adivinar la contraseña es el mismo que
 * una sola llamada de `total` iteraciones, y ninguna llamada pasa del
 * tope que impone workerd en producción.
 */
export async function derivar(contrasena, salHex, total = ITERACIONES) {
  const salt = deHex(salHex);
  let material = new TextEncoder().encode(contrasena);
  let restantes = total;

  while (restantes > 0) {
    const vuelta = Math.min(restantes, MAX_POR_LLAMADA);
    const clave = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: vuelta },
      clave, 256,
    );
    material = new Uint8Array(bits);
    restantes -= vuelta;
  }
  return hex(material);
}

export async function hashearContrasena(contrasena) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, password_hash: await derivar(contrasena, salt) };
}

// ------------------------------------------------------------
// Cookies
// ------------------------------------------------------------

export function leerCookie(req, nombre = COOKIE) {
  const crudo = req.headers.get("Cookie") ?? "";
  for (const parte of crudo.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return null;
}

/**
 * SameSite=Lax y no Strict: con Strict, llegar desde un enlace externo
 * —un correo, el propio enlace de aprobación— no manda la cookie y el
 * panel pide acceso otra vez sin explicar por qué.
 */
export function cookieSesion(valor, segundos = HORAS_SESION * 3600) {
  return `${COOKIE}=${valor}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${segundos}`;
}

export const cookieBorrada = () => cookieSesion("", 0);

// ------------------------------------------------------------
// Ciclo de vida
// ------------------------------------------------------------

/**
 * Devuelve el usuario de la sesión, o null.
 *
 * La caducidad se comprueba en SQL y no en JavaScript: así una fila
 * caducada nunca llega a estar «casi» viva por un reloj mal puesto.
 */
export async function usuarioDeLaPeticion(db, req) {
  const bruto = leerCookie(req);
  if (!bruto) return null;
  const fila = await db
    .prepare(
      `select u.id, u.email, m.owner_id, m.rol, m.nombre, m.color
         from sessions s
         join users u on u.id = s.user_id
         left join memberships m on m.user_id = u.id
        where s.token_hash = ? and s.expires_at > ?`,
    )
    .bind(await sha256(bruto), ahora())
    .first();
  if (!fila) return null;

  // Sin fila de pertenencia es el administrador sembrado antes de que
  // existiera el equipo: funda su propio espacio, que es justo lo que ya
  // era de hecho —todas sus filas llevan su id en `owner_id`—. El alta
  // va con `or ignore` porque dos peticiones simultáneas de la misma
  // pestaña llegarían a la vez, y la segunda no debe ser un 500.
  if (!fila.owner_id) return fundarEspacio(db, fila.id, fila.email);

  return comoPerfil(fila.id, fila.email, fila);
}

/**
 * La forma en la que el resto del Worker ve a quien ha entrado.
 *
 * `id` es la PERSONA —quién firma lo que escribe, quién aparece en la
 * presencia— y `ownerId` es el ESPACIO —qué filas puede tocar—. Que sean
 * dos campos distintos es justo lo que faltaba cuando eran uno solo.
 */
function comoPerfil(id, email, m) {
  return {
    id,
    email,
    ownerId: m.owner_id,
    rol: m.rol,
    nombre: m.nombre || nombrePorCorreo(email),
    color: m.color,
  };
}

/** El trozo del correo que sirve de nombre mientras nadie ponga otro. */
export function nombrePorCorreo(email) {
  return String(email ?? "").split("@")[0].slice(0, 60) || "Sin nombre";
}

const COLOR_ADMIN = "#1E90FF";

/** Igual que lo que resuelve la cookie, pero partiendo del id: lo usa el acceso. */
export async function perfilDeUsuario(db, id, email) {
  const m = await db
    .prepare("select owner_id, rol, nombre, color from memberships where user_id = ?")
    .bind(id)
    .first();
  return m ? comoPerfil(id, email, m) : fundarEspacio(db, id, email);
}

async function fundarEspacio(db, id, email) {
  const nombre = nombrePorCorreo(email);
  await db
    .prepare(
      `insert or ignore into memberships (user_id, owner_id, rol, nombre, color, created_at)
       values (?,?,'admin',?,?,?)`,
    )
    .bind(id, id, nombre, COLOR_ADMIN, ahora())
    .run();
  return { id, email, ownerId: id, rol: "admin", nombre, color: COLOR_ADMIN };
}

export async function iniciarSesion(db, email, contrasena, userAgent = "") {
  const usuario = await db
    .prepare("select id, email, password_hash, salt from users where email = ?")
    .bind(String(email ?? "").trim().toLowerCase())
    .first();

  // Se deriva igual aunque el usuario no exista: si se devolviera antes,
  // la diferencia de tiempo distinguiría «no hay tal cuenta» de
  // «contraseña incorrecta», que es justo lo que no se quiere contar.
  const sal = usuario?.salt ?? "00000000000000000000000000000000";
  const calculado = await derivar(String(contrasena ?? ""), sal);
  if (!usuario || calculado !== usuario.password_hash) return null;

  const bruto = testigo(32);
  await db
    .prepare("insert into sessions (token_hash, user_id, created_at, expires_at, user_agent) values (?,?,?,?,?)")
    .bind(await sha256(bruto), usuario.id, ahora(), enHoras(HORAS_SESION), String(userAgent).slice(0, 300))
    .run();

  // El perfil ENTERO, no sólo {id, email}: la pantalla de acceso lo
  // planta en el estado y entra directa. Devolver la mitad obligaba a
  // una segunda vuelta a /api/yo para saber de qué espacio era.
  return { testigo: bruto, usuario: await perfilDeUsuario(db, usuario.id, usuario.email) };
}

/** Cerrar sesión borra la FILA, no sólo la cookie. */
export async function cerrarSesion(db, req) {
  const bruto = leerCookie(req);
  if (!bruto) return;
  await db.prepare("delete from sessions where token_hash = ?").bind(await sha256(bruto)).run();
}

/** Higiene: las sesiones caducadas no se borran solas. */
export async function purgarSesiones(db) {
  const { meta } = await db.prepare("delete from sessions where expires_at <= ?").bind(ahora()).run();
  return meta?.changes ?? 0;
}

/**
 * Alta o actualización del administrador. Sustituye a
 * netlify/functions/admin-seed.mjs, y con ella desaparece el endpoint
 * que creaba administradores —el motivo de ADMIN_SEED_TOKEN—: esto se
 * ejecuta desde la línea de órdenes, no desde la red.
 */
export async function sembrarUsuario(db, email, contrasena) {
  const limpio = String(email).trim().toLowerCase();
  if (String(contrasena).length < 12) throw new Error("La contraseña debe tener 12 caracteres como mínimo.");
  const { salt, password_hash } = await hashearContrasena(contrasena);
  const existente = await db.prepare("select id from users where email = ?").bind(limpio).first();

  if (existente) {
    await db.prepare("update users set password_hash = ?, salt = ? where id = ?")
      .bind(password_hash, salt, existente.id).run();
    return existente.id;
  }
  const id = uuid();
  await db.prepare("insert into users (id, email, password_hash, salt, created_at) values (?,?,?,?,?)")
    .bind(id, limpio, password_hash, salt, ahora()).run();
  return id;
}

// ------------------------------------------------------------
// Entrar por invitación
//
// Estas tres funciones están aquí y no en la capa de acceso por el
// mismo motivo que la resolución del espacio: se ejecutan cuando
// todavía NO hay sesión —quien abre el enlace no tiene cuenta—, así que
// no hay espacio con el que construir el acceso. Crear la invitación sí
// pasa por la capa: eso lo hace alguien que ya está dentro.
// ------------------------------------------------------------

/** Cuánto vive un enlace de invitación. Una semana es de sobra. */
export const HORAS_INVITACION = 24 * 7;

/**
 * Lee una invitación por su testigo, sin sesión.
 *
 * Devuelve también quién invita, porque la pantalla lo enseña: abrir un
 * enlace que sólo dice «crea tu contraseña» no se distingue de una
 * suplantación.
 */
export async function invitacionPorTestigo(db, bruto) {
  if (!bruto) return null;
  const fila = await db
    .prepare(
      `select i.id, i.owner_id, i.email, i.nombre, i.rol, i.expires_at, i.aceptada_at,
              m.nombre as invita
         from invitaciones i
         left join memberships m on m.user_id = i.creada_por
        where i.token_hash = ?`,
    )
    .bind(await sha256(bruto))
    .first();
  if (!fila) return null;
  return {
    id: fila.id,
    ownerId: fila.owner_id,
    email: fila.email,
    nombre: fila.nombre,
    rol: fila.rol,
    invita: fila.invita || "la agencia",
    caducada: fila.expires_at <= ahora(),
    aceptada: Boolean(fila.aceptada_at),
  };
}

/**
 * Acepta la invitación: crea la persona, la mete en el espacio y le
 * abre sesión.
 *
 * El correo puede venir del enlace o escribirlo quien entra; el `rol` y
 * el `owner_id` salen SIEMPRE de la fila de la invitación, nunca del
 * cuerpo de la petición. Si salieran del cuerpo, cualquiera con un
 * enlace se haría administrador de cualquier espacio escribiendo otro
 * id, que es exactamente la forma de fallo que la capa de acceso existe
 * para impedir en las demás tablas.
 */
export async function aceptarInvitacion(db, bruto, { email, contrasena, nombre, userAgent = "" }) {
  const inv = await invitacionPorTestigo(db, bruto);
  if (!inv) throw new Error("Esa invitación no existe.");
  if (inv.aceptada) throw new Error("Esa invitación ya se usó. Pide una nueva.");
  if (inv.caducada) throw new Error("Esa invitación ha caducado. Pide una nueva.");

  const limpio = String(email ?? inv.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio)) throw new Error("Ese correo no es válido.");
  if (String(contrasena ?? "").length < 12) {
    throw new Error("La contraseña debe tener 12 caracteres como mínimo.");
  }

  const yaExiste = await db.prepare("select id from users where email = ?").bind(limpio).first();
  if (yaExiste) throw new Error("Ya hay una cuenta con ese correo. Entra con ella.");

  const id = uuid();
  const visible = String(nombre ?? inv.nombre ?? "").trim().slice(0, 60) || nombrePorCorreo(limpio);
  const { salt, password_hash } = await hashearContrasena(contrasena);
  const t = ahora();

  // En una sola tanda: o entra la persona con su pertenencia y la
  // invitación queda gastada, o no entra nada. A medias quedaría una
  // cuenta que no pertenece a ningún espacio —y que al entrar fundaría
  // el suyo propio, vacío, sin que nadie entienda por qué—.
  await db.batch([
    db.prepare("insert into users (id, email, password_hash, salt, created_at) values (?,?,?,?,?)")
      .bind(id, limpio, password_hash, salt, t),
    db.prepare(
      `insert into memberships (user_id, owner_id, rol, nombre, color, created_at)
       values (?,?,?,?,?,?)`,
    ).bind(id, inv.ownerId, inv.rol, visible, colorDeNombre(visible), t),
    db.prepare("update invitaciones set aceptada_at = ? where id = ? and aceptada_at is null")
      .bind(t, inv.id),
  ]);

  const bruto2 = testigo(32);
  await db
    .prepare("insert into sessions (token_hash, user_id, created_at, expires_at, user_agent) values (?,?,?,?,?)")
    .bind(await sha256(bruto2), id, t, enHoras(HORAS_SESION), String(userAgent).slice(0, 300))
    .run();

  return {
    testigo: bruto2,
    usuario: { id, email: limpio, ownerId: inv.ownerId, rol: inv.rol, nombre: visible, color: colorDeNombre(visible) },
  };
}

/**
 * Un color estable por nombre.
 *
 * Estable y no aleatorio para que la misma persona tenga siempre el
 * mismo punto de color en la presencia: si cambiara entre sesiones, el
 * color dejaría de servir para reconocer a nadie.
 */
export function colorDeNombre(nombre) {
  const paleta = ["#1E90FF", "#F5A623", "#22C55E", "#A855F7", "#EF4444", "#14B8A6", "#EC4899", "#F59E0B"];
  let suma = 0;
  for (const c of String(nombre)) suma = (suma + c.codePointAt(0)) % 4096;
  return paleta[suma % paleta.length];
}

/**
 * Saca a alguien del espacio.
 *
 * Borra la CUENTA, no sólo la pertenencia. Dejar la cuenta viva sin
 * pertenencia sería peor que borrarla: al volver a entrar, la
 * resolución de espacio la trataría como un administrador sin sitio y le
 * fundaría un espacio propio y vacío. La persona vería una aplicación
 * que funciona y no tiene nada dentro, y nadie sabría por qué.
 *
 * El borrado arrastra sus sesiones en cascada. NO arrastra ningún dato
 * de la agencia: los clientes y calendarios llevan en `owner_id` el id
 * del espacio —el del administrador que lo fundó—, nunca el de quien
 * fue invitado. Por eso se rechaza expulsar al fundador: ahí la cascada
 * sí se llevaría el espacio entero.
 */
export async function expulsarDelEspacio(db, ownerId, userId) {
  if (userId === ownerId) throw new Error("No se puede sacar a quien fundó el espacio.");
  const fila = await db
    .prepare("select user_id from memberships where user_id = ? and owner_id = ?")
    .bind(userId, ownerId)
    .first();
  if (!fila) return 0;
  // Borra la cuenta: sus sesiones y su pertenencia se van en cascada.
  // Ningún cliente ni calendario cuelga de ella (ver arriba).
  const { meta } = await db.prepare("delete from users where id = ?").bind(userId).run();
  return meta?.changes ?? 0;
}
