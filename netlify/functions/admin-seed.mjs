import { timingSafeEqual } from "node:crypto";

// ------------------------------------------------------------
// Alta del usuario administrador
//
// Las credenciales de acceso viven en las variables de Netlify
// (ADMIN_EMAIL / ADMIN_PASSWORD) y esta función las materializa como
// usuario de Supabase Auth. Así el login usa Auth de verdad —con RLS y
// Realtime funcionando— sin dejar de administrarse desde Netlify.
//
// Es idempotente: si el usuario ya existe, le pone la contraseña actual.
// Sirve tanto para el alta inicial como para recuperar el acceso si se
// olvida la contraseña.
//
// Se protege con ADMIN_SEED_TOKEN. Sin esa variable la función se niega
// a ejecutarse: un endpoint que crea administradores no puede quedar
// abierto por un despiste de configuración.
//
// Se habla con la API de Auth por HTTP en vez de usar @supabase/supabase-js:
// el cliente arrastra el módulo de Realtime, que exige un WebSocket nativo
// y revienta al construirse en Node 20 («native WebSocket not found»)
// aunque esta función no suscriba nada. Tres peticiones sueltas no
// justifican una dependencia que puede caerse por el runtime de turno.
// ------------------------------------------------------------

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SEED_TOKEN = process.env.ADMIN_SEED_TOKEN;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Comparación en tiempo constante: un `===` filtra el token carácter a carácter. */
function tokenMatches(received) {
  if (typeof received !== "string" || received.length === 0) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(SEED_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** La API de Auth pide la clave de servicio en las dos cabeceras. */
function authHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
}

async function authFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...options,
    headers: authHeaders(),
  });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    const detalle = cuerpo?.msg || cuerpo?.error_description || cuerpo?.message || res.status;
    throw new Error(`Auth respondió ${res.status}: ${detalle}`);
  }
  return cuerpo;
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  if (!SEED_TOKEN) {
    return json({ error: "ADMIN_SEED_TOKEN no está configurado; la función está desactivada." }, 503);
  }
  if (!tokenMatches(req.headers.get("x-seed-token"))) {
    return json({ error: "No autorizado" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" }, 503);
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return json({ error: "Faltan ADMIN_EMAIL o ADMIN_PASSWORD" }, 503);
  }
  if (ADMIN_PASSWORD.length < 12) {
    return json({ error: "ADMIN_PASSWORD debe tener al menos 12 caracteres." }, 400);
  }

  try {
    const email = ADMIN_EMAIL.trim().toLowerCase();

    const lista = await authFetch("/users?page=1&per_page=200");
    const existente = (lista?.users ?? []).find(
      (u) => (u.email || "").toLowerCase() === email
    );

    if (existente) {
      await authFetch(`/users/${existente.id}`, {
        method: "PUT",
        body: JSON.stringify({ password: ADMIN_PASSWORD, email_confirm: true }),
      });
      return json({ ok: true, creado: false, email, mensaje: "Contraseña actualizada." });
    }

    await authFetch("/users", {
      method: "POST",
      body: JSON.stringify({ email, password: ADMIN_PASSWORD, email_confirm: true }),
    });

    return json({ ok: true, creado: true, email, mensaje: "Administrador creado." });
  } catch (e) {
    // El mensaje de Supabase puede describir la configuración del
    // proyecto: se registra entero, y al cliente sólo le llega el motivo.
    console.error("admin-seed:", e);
    return json({ error: "No se pudo crear o actualizar el administrador.", detalle: e.message }, 500);
  }
};

export const config = { path: "/api/admin-seed" };
