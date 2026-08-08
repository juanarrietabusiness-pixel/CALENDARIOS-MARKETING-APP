import { useEffect, useState } from "react";
import { supabase, isSupabaseEnabled } from "./supabase";

/**
 * Sesión del administrador.
 *
 * `loading` distingue «todavía no lo sé» de «no hay sesión»: sin eso, al
 * recargar se veía un parpadeo de la pantalla de acceso antes de que
 * Supabase restaurase la sesión guardada.
 */
export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { session, loading };
}

/**
 * Traduce los mensajes de Supabase, que llegan siempre en inglés.
 *
 * El caso desconocido arrastra el mensaje original en vez de tragárselo:
 * un «No se pudo iniciar sesión» a secas obligó a ir a buscar el registro
 * del servidor para descubrir que el proveedor de correo estaba apagado.
 * Es un panel de una sola persona, no hay a quién ocultarle el detalle.
 */
function translateAuthError(message = "") {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Usuario o contraseña incorrectos.";
  }
  if (m.includes("email logins are disabled") || m.includes("email_provider_disabled")) {
    return "El acceso por correo está desactivado en Supabase. Actívalo en "
      + "Authentication → Sign In / Providers → Email («Enable Email provider» "
      + "encendido, «Allow new users to sign up» apagado).";
  }
  if (m.includes("email not confirmed")) {
    return "La cuenta existe pero no está confirmada. Vuelve a lanzar el alta del administrador.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "No hay conexión con el servidor. Revisa tu red.";
  }
  return `No se pudo iniciar sesión (${message}).`;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(translateAuthError(error.message));
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}
