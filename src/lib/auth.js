import { useEffect, useState } from "react";

// ------------------------------------------------------------
// Sesión del administrador
//
// Antes esto era Supabase Auth (GoTrue) con un token en localStorage.
// Ahora la sesión vive en una cookie `__Host-` que el navegador manda
// sola y que JavaScript NO puede leer —es HttpOnly—. Eso es una mejora
// real: un XSS ya no puede robarla.
//
// La contrapartida es que no hay nada que inspeccionar en el cliente,
// así que «¿hay sesión?» se pregunta al servidor con GET /api/yo. Es
// una petición al cargar, y a cambio la respuesta es la verdad y no una
// copia caducada.
//
// Y DE AHÍ SALÍA EL FALLO QUE ESTO ARREGLA
//
// Con Supabase, `signIn` disparaba `onAuthStateChange` y el panel se
// levantaba solo: nadie tenía que pasar la sesión a ninguna parte.
// Aquí NO hay nada que se dispare. `signIn` devuelve el usuario y, si
// quien la llama no hace nada con él, el estado de `useSession` sigue
// diciendo `null` para siempre. Eso es exactamente lo que se veía:
// escribías correo y contraseña, el servidor respondía 200 y ponía la
// cookie, y la pantalla de acceso se quedaba ahí. Al recargar entrabas,
// porque el arranque sí pregunta a `/api/yo`.
//
// Por eso `useSession` devuelve `setSession` y **Login lo usa**. La
// sesión es de quien la pinta; no hay ningún canal mágico detrás.
// ------------------------------------------------------------

/**
 * `loading` distingue «todavía no lo sé» de «no hay sesión»: sin eso, al
 * recargar se veía un parpadeo de la pantalla de acceso antes de que se
 * restaurase la sesión guardada.
 */
export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const res = await fetch("/api/yo", { credentials: "same-origin" });
        if (!activo) return;
        if (res.ok) {
          const { usuario } = await res.json();
          // Se conserva la forma `{ user: { id, email } }` de Supabase:
          // Workspace lee `session.user.id` para el owner de cada fila.
          setSession({ user: usuario });
        } else {
          setSession(null);
        }
      } catch {
        if (activo) setSession(null);
      } finally {
        if (activo) setLoading(false);
      }
    })();

    return () => { activo = false; };
  }, []);

  return { session, loading, setSession };
}

export async function signIn(email, password) {
  let res;
  try {
    res = await fetch("/api/acceso", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu red.");
  }

  let datos = null;
  try { datos = await res.json(); } catch { /* el borde no siempre devuelve JSON */ }

  if (!res.ok) {
    if (res.status === 429) throw new Error("Demasiados intentos seguidos. Espera un minuto y vuelve a probar.");
    // El servidor ya responde en español y no distingue «no existe esa
    // cuenta» de «contraseña incorrecta»: contarlo permitiría averiguar
    // qué correos tienen cuenta.
    throw new Error(datos?.error || "No se pudo iniciar sesión. Inténtalo de nuevo.");
  }

  return { user: datos.usuario };
}

export async function signOut() {
  try {
    await fetch("/api/salir", { method: "POST", credentials: "same-origin" });
  } catch {
    /* si la red falla, la cookie caduca sola; no hay nada que reintentar */
  }
  // Recargar es lo más limpio: tira todo el estado en memoria, que es
  // justo lo que no debe sobrevivir a un cierre de sesión.
  window.location.reload();
}
