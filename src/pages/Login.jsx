import { useId, useState } from "react";
import { signIn } from "../lib/auth";
import Icon from "../components/Icon";
import logoMark from "../assets/logo-mark.png";

/**
 * Acceso del administrador.
 *
 * Las credenciales las define la agencia en las variables de Netlify y
 * las materializa `/api/admin-seed` como usuario de Supabase Auth. Aquí
 * sólo se inicia sesión: no hay registro, porque no debe haber más
 * cuentas que la de la agencia.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ids = useId();
  const errorId = `${ids}-error`;

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      // No hace falta navegar: onAuthStateChange levanta el workspace.
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-5)",
        paddingTop: "calc(var(--sp-5) + var(--safe-top))",
        paddingBottom: "calc(var(--sp-5) + var(--safe-bottom))",
        background: "var(--bg)",
      }}
    >
      <main
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--elev-2)",
          padding: "var(--sp-6) var(--sp-5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--sp-6)" }}>
          <img
            src={logoMark}
            alt=""
            width={56}
            height={56}
            style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto var(--sp-3)" }}
          />
          <h1 style={{ fontSize: "var(--fs-lg)", marginBottom: "var(--sp-2)" }}>
            Juancito Ads
          </h1>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
            Panel de calendarios de contenido
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label className="label" htmlFor={`${ids}-email`}>Correo</label>
            <input
              id={`${ids}-email`}
              className="input"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor={`${ids}-password`}>Contraseña</label>
            <input
              id={`${ids}-password`}
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          {error && (
            <p id={errorId} role="alert" className="notice notice-error" style={{ display: "block" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "var(--sp-2)" }}
            disabled={loading}
          >
            {loading ? "Entrando…" : <><Icon name="check" size={18} /> Entrar</>}
          </button>
        </form>

        <p className="hint" style={{ marginTop: "var(--sp-5)", textAlign: "center" }}>
          ¿No tienes acceso? Las credenciales se definen en las variables de
          entorno del sitio. Consulta <code>DEPLOY.md</code>.
        </p>
      </main>
    </div>
  );
}
