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
      `select u.id, u.email, m.owner_id, m.rol, m.nombre, m.color, m.solo_lectura, m.clientes
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
    // Papeles finos (0020_equipo.sql): sólo mirar, o sólo algunos clientes.
    // Un administrador los ve todos siempre.
    soloLectura: m.rol !== "admin" && (m.solo_lectura === 1 || m.solo_lectura === true),
    clientes: m.rol !== "admin" ? clientesPermitidos(m.clientes) : null,
  };
}

/** null = todos; una lista JSON de ids = un colaborador. Lo que no se entiende, todos NO: ninguno. */
export function clientesPermitidos(texto) {
  if (texto == null || texto === "") return null;
  try {
    const lista = JSON.parse(texto);
    return Array.isArray(lista) ? lista.map(String) : [];
  } catch {
    return [];
  }
}

/** El trozo del correo que sirve de nombre mientras nadie ponga otro. */
export function nombrePorCorreo(email) {
  return String(email ?? "").split("@")[0].slice(0, 60) || "Sin nombre";
}

const COLOR_ADMIN = "#1E90FF";

/** Igual que lo que resuelve la cookie, pero partiendo del id: lo usa el acceso. */
export async function perfilDeUsuario(db, id, email) {
  const m = await db
    .prepare("select owner_id, rol, nombre, color, solo_lectura, clientes from memberships where user_id = ?")
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
  return { id, email, ownerId: id, rol: "admin", nombre, color: COLOR_ADMIN, soloLectura: false, clientes: null };
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
              i.solo_lectura, i.clientes, m.nombre as invita
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
    soloLectura: fila.solo_lectura === 1,
    clientes: fila.clientes ?? null,
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
      `insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura, clientes, created_at)
       values (?,?,?,?,?,?,?,?)`,
    ).bind(id, inv.ownerId, inv.rol, visible, colorDeNombre(visible), inv.soloLectura ? 1 : 0, inv.clientes ?? null, t),
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
    usuario: comoPerfil(id, limpio, {
      owner_id: inv.ownerId, rol: inv.rol, nombre: visible, color: colorDeNombre(visible),
      solo_lectura: inv.soloLectura ? 1 : 0, clientes: inv.clientes ?? null,
    }),
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

// ------------------------------------------------------------
// Conectar Claude (MCP): OAuth 2.1 con PKCE
//
// Claude se registra solo (RFC 7591), abre la pantalla de permiso de la
// aplicación con la sesión de siempre, y cambia el código por un token
// atado a ESA persona y a SU espacio. Vive aquí porque es lo mismo que
// una sesión: define quién es quien llama. Como en `sessions`, sólo se
// guardan huellas.
// ------------------------------------------------------------

export const MINUTOS_CODIGO_MCP = 10;
export const HORAS_ACCESO_MCP = 1;
export const DIAS_RENOVACION_MCP = 90;

/** Una URI de vuelta aceptable: https, o http sólo en la propia máquina. */
export function uriDeVueltaValida(uri) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname));
  } catch { return false; }
}

export async function registrarClienteMCP(db, { nombre = "", redirectUris = [] }) {
  const uris = [...new Set((Array.isArray(redirectUris) ? redirectUris : []).map(String))];
  if (!uris.length || uris.length > 10 || !uris.every(uriDeVueltaValida)) return null;
  const id = `mcp_${testigo(16)}`;
  await db.prepare("insert into mcp_clientes (id, nombre, redirect_uris, created_at) values (?,?,?,?)")
    .bind(id, String(nombre).slice(0, 120), JSON.stringify(uris), ahora()).run();
  return { id, nombre: String(nombre).slice(0, 120), redirectUris: uris };
}

export async function clienteMCP(db, id) {
  const f = await db.prepare("select id, nombre, redirect_uris from mcp_clientes where id = ?").bind(String(id ?? "")).first();
  if (!f) return null;
  let uris = [];
  try { uris = JSON.parse(f.redirect_uris); } catch { /* vacío */ }
  return { id: f.id, nombre: f.nombre, redirectUris: uris };
}

/** El código de un solo uso que vuelve a Claude tras el permiso. */
export async function crearCodigoMCP(db, { clienteId, usuario, redirectUri, reto }) {
  const bruto = testigo(24);
  await db.prepare("insert into mcp_codigos (codigo_hash, owner_id, user_id, cliente_id, redirect_uri, reto, expira, created_at) values (?,?,?,?,?,?,?,?)")
    .bind(await sha256(bruto), usuario.ownerId, usuario.id, clienteId, redirectUri, reto, enHoras(MINUTOS_CODIGO_MCP / 60), ahora()).run();
  return bruto;
}

async function retoS256(verificador) {
  const huella = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador));
  return btoa(String.fromCharCode(...new Uint8Array(huella))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function emitirTokensMCP(db, { ownerId, userId, clienteId, id = null }) {
  const acceso = testigo(32);
  const renovacion = testigo(32);
  const valores = [await sha256(acceso), await sha256(renovacion), enHoras(HORAS_ACCESO_MCP)];
  if (id) {
    await db.prepare("update mcp_tokens set acceso_hash = ?, renovacion_hash = ?, expira = ?, usado_at = ? where id = ?")
      .bind(...valores, ahora(), id).run();
  } else {
    await db.prepare("insert into mcp_tokens (id, owner_id, user_id, cliente_id, acceso_hash, renovacion_hash, expira, created_at) values (?,?,?,?,?,?,?,?)")
      .bind(uuid(), ownerId, userId, clienteId, ...valores, ahora()).run();
  }
  return { access_token: acceso, token_type: "Bearer", expires_in: HORAS_ACCESO_MCP * 3600, refresh_token: renovacion };
}

/**
 * Código → tokens. Se borra al leerlo, valga o no: un código sólo sirve
 * una vez, y uno robado que llega segundo no encuentra nada.
 */
export async function canjearCodigoMCP(db, { codigo, clienteId, redirectUri, verificador }) {
  const huella = await sha256(String(codigo ?? ""));
  const f = await db.prepare("select * from mcp_codigos where codigo_hash = ?").bind(huella).first();
  if (!f) return null;
  await db.prepare("delete from mcp_codigos where codigo_hash = ?").bind(huella).run();
  if (f.expira <= ahora() || f.cliente_id !== clienteId || f.redirect_uri !== redirectUri) return null;
  if (!verificador || (await retoS256(String(verificador))) !== f.reto) return null;
  return emitirTokensMCP(db, { ownerId: f.owner_id, userId: f.user_id, clienteId });
}

/** Renovar: el de renovación se rota en cada uso, y vence si pasa mucho sin usarse. */
export async function renovarTokenMCP(db, { renovacion, clienteId }) {
  const f = await db.prepare("select id, cliente_id, usado_at, created_at from mcp_tokens where renovacion_hash = ?")
    .bind(await sha256(String(renovacion ?? ""))).first();
  if (!f || f.cliente_id !== clienteId) return null;
  const ultimo = Date.parse(f.usado_at ?? f.created_at);
  if (Date.now() - ultimo > DIAS_RENOVACION_MCP * 86_400_000) return null;
  return emitirTokensMCP(db, { id: f.id });
}

/** Quién llama al MCP, por su token. La misma forma que `usuarioDeLaPeticion`. */
export async function usuarioDeTokenMCP(db, bruto) {
  if (!bruto) return null;
  const fila = await db
    .prepare(
      `select t.id as token_id, u.id, u.email, m.owner_id, m.rol, m.nombre, m.color, m.solo_lectura, m.clientes
         from mcp_tokens t
         join users u on u.id = t.user_id
         join memberships m on m.user_id = u.id and m.owner_id = t.owner_id
        where t.acceso_hash = ? and t.expira > ?`,
    )
    .bind(await sha256(bruto), ahora())
    .first();
  if (!fila) return null;
  await db.prepare("update mcp_tokens set usado_at = ? where id = ?").bind(ahora(), fila.token_id).run();
  return comoPerfil(fila.id, fila.email, fila);
}
