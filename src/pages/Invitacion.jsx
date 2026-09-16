import { useEffect, useId, useState } from "react";
import Icon from "../components/Icon";
import logoMark from "../assets/logo-mark.png";
import { aceptarInvitacion, leerInvitacion } from "../lib/equipo";
import { analizarRuta } from "../lib/rutas";

/**
 * La pantalla que ve quien ha sido invitado.
 *
 * Es la única de la aplicación que crea una cuenta, y por eso hace tres
 * cosas que el acceso normal no necesita:
 *
 *  · Dice QUIÉN invita antes de pedir nada. Un enlace que sólo dice
 *    «inventa una contraseña» es indistinguible de una suplantación.
 *  · Distingue caducada de ya usada. Las dos se arreglan pidiendo otro
 *    enlace, pero saber cuál de las dos es evita la llamada de «pues a
 *    mí me funcionaba».
 *  · Deja la sesión abierta al terminar. Acabas de escribir la
 *    contraseña: volver a pedirla en la pantalla siguiente no protege
 *    nada y parece que algo ha ido mal.
 */
export default function Invitacion({ onAcceso }) {
  const { testigo } = analizarRuta();

  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");

  const ids = useId();
  const errorId = `${ids}-error`;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const datos = await leerInvitacion(testigo);
        if (!vivo) return;
        setInfo(datos);
        setNombre(datos.nombre || "");
        setEmail(datos.email || "");
      } catch (e) {
        if (vivo) setError(e.message || "Ese enlace no vale.");
      }
      if (vivo) setCargando(false);
    })();
    return () => { vivo = false; };
  }, [testigo]);

  const submit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (password !== repetida) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    if (password.length < 12) {
      setError("La contraseña debe tener 12 caracteres como mínimo.");
      return;
    }

    setError("");
    setEnviando(true);
    try {
      const { usuario } = await aceptarInvitacion(testigo, { email, password, nombre });
      // Igual que en el acceso: la sesión la pone quien la pinta.
      onAcceso({ user: usuario });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  const marco = (contenido) => (
    <div
      style={{
        minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--sp-5)",
        paddingTop: "calc(var(--sp-5) + var(--safe-top))",
        paddingBottom: "calc(var(--sp-5) + var(--safe-bottom))",
        background: "var(--bg)",
      }}
    >
      <main
        style={{
          width: "100%", maxWidth: 420, background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--elev-2)", padding: "var(--sp-6) var(--sp-5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--sp-5)" }}>
          <img
            src={logoMark} alt="" width={56} height={56}
            style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto var(--sp-3)" }}
          />
          <h1 style={{ fontSize: "var(--fs-lg)", marginBottom: "var(--sp-2)" }}>Juancito Ads</h1>
        </div>
        {contenido}
      </main>
    </div>
  );

  if (cargando) return marco(<p role="status" style={{ textAlign: "center", color: "var(--text-dim)" }}>Comprobando el enlace…</p>);

  if (!info) {
    return marco(
      <>
        <p role="alert" className="notice notice-error" style={{ display: "block" }}>
          {error || "Ese enlace no vale."}
        </p>
        <p className="hint" style={{ marginTop: "var(--sp-4)", textAlign: "center" }}>
          Pide otro a quien te invitó.
        </p>
      </>,
    );
  }

  if (info.aceptada || info.caducada) {
    return marco(
      <>
        <p role="alert" className="notice notice-warn" style={{ display: "block" }}>
          {info.aceptada
            ? "Este enlace ya se usó. Si la cuenta es tuya, entra con tu correo y tu contraseña."
            : "Este enlace ha caducado."}
        </p>
        <a className="btn btn-secondary" href="/" style={{ width: "100%", marginTop: "var(--sp-4)" }}>
          Ir al acceso
        </a>
      </>,
    );
  }

  return marco(
    <>
      <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", marginBottom: "var(--sp-5)", textAlign: "center" }}>
        <strong>{info.invita}</strong> te ha invitado a los calendarios de la
        agencia{info.rol === "admin" ? ", con permiso para administrar el espacio" : ""}.
        Elige tu contraseña y entras.
      </p>

      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor={`${ids}-nombre`}>Tu nombre</label>
          <input
            id={`${ids}-nombre`} className="input" type="text" maxLength={60} required
            value={nombre} onChange={(e) => { setNombre(e.target.value); setError(""); }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`${ids}-email`}>Tu correo</label>
          <input
            id={`${ids}-email`} className="input" type="email" required
            autoComplete="username" autoCapitalize="none" spellCheck="false"
            value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`${ids}-pass`}>Contraseña</label>
          <input
            id={`${ids}-pass`} className="input" type="password" required minLength={12}
            autoComplete="new-password"
            value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
            aria-describedby={`${ids}-pista`}
          />
          <p id={`${ids}-pista`} className="hint">12 caracteres como mínimo.</p>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${ids}-pass2`}>Repítela</label>
          <input
            id={`${ids}-pass2`} className="input" type="password" required
            autoComplete="new-password"
            value={repetida} onChange={(e) => { setRepetida(e.target.value); setError(""); }}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>

        {error && (
          <p id={errorId} role="alert" className="notice notice-error" style={{ display: "block" }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "var(--sp-2)" }} disabled={enviando}>
          {enviando ? "Entrando…" : <><Icon name="check" size={18} /> Entrar al espacio</>}
        </button>
      </form>
    </>,
  );
}
