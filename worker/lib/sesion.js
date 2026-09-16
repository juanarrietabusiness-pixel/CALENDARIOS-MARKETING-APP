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
      `select u.id, u.email from sessions s join users u on u.id = s.user_id
        where s.token_hash = ? and s.expires_at > ?`,
    )
    .bind(await sha256(bruto), ahora())
    .first();
  return fila ?? null;
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

  return { testigo: bruto, usuario: { id: usuario.id, email: usuario.email } };
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
