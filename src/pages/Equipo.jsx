import "./Equipo.css";
import { useCallback, useEffect, useId, useState } from "react";
import Icon from "../components/Icon";
import { Avatar } from "../components/Presencia";
import CargaEquipo from "../components/CargaEquipo";
import { navegar } from "../lib/rutas";
import {
  cargarEquipo, invitar, retirarInvitacion, sacarMiembro,
  guardarMiPerfil, enlaceDeInvitacion, cambiarPapel, papelDe, PAPELES, cambiarMiContrasena, restablecerContrasenaDe,
} from "../lib/equipo";

const NOMBRE_PAPEL = Object.fromEntries(PAPELES.map(([k, n]) => [k, n]));

/**
 * Cambiar mi contraseña. Pide la actual (una sesión abierta en un equipo ajeno no basta para quedarse con la cuenta) y
 * la nueva dos veces; al guardar se cierran las demás sesiones de esta persona.
 */
function CambiarContrasena() {
  const ids = useId();
  const [f, setF] = useState({ actual: "", nueva: "", otra: "" });
  const [ver, setVer] = useState(false);
  const [estado, setEstado] = useState({ ok: null, texto: "" });
  const [guardando, setGuardando] = useState(false);
  const corta = f.nueva && f.nueva.length < 12;
  const distinta = f.otra && f.otra !== f.nueva;

  const enviar = async (e) => {
    e.preventDefault();
    if (corta || distinta || !f.actual) return;
    setGuardando(true);
    setEstado({ ok: null, texto: "" });
    try {
      const r = await cambiarMiContrasena({ actual: f.actual, nueva: f.nueva });
      setF({ actual: "", nueva: "", otra: "" });
      setEstado({ ok: true, texto: `Contraseña cambiada.${r.cerradas ? ` Se cerraron ${r.cerradas === 1 ? "tu otra sesión abierta" : `tus otras ${r.cerradas} sesiones abiertas`}.` : ""}` });
    } catch (err) {
      setEstado({ ok: false, texto: err.message || "No se pudo cambiar." });
    }
    setGuardando(false);
  };

  const campo = (k, etiqueta, ayuda) => (
    <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
      <label className="label" htmlFor={`${ids}-${k}`}>{etiqueta}</label>
      <input id={`${ids}-${k}`} className="input" type={ver ? "text" : "password"} value={f[k]}
        autoComplete={k === "actual" ? "current-password" : "new-password"}
        aria-describedby={ayuda ? `${ids}-${k}-a` : undefined} aria-invalid={(k === "nueva" && corta) || (k === "otra" && distinta) || undefined}
        onChange={(e) => setF({ ...f, [k]: e.target.value })} required />
      {ayuda && <p id={`${ids}-${k}-a`} className="hint">{ayuda}</p>}
    </div>
  );

  return (
    <section id="contrasena" aria-labelledby={`${ids}-t`}>
      <h2 className="label" id={`${ids}-t`}>Tu contraseña</h2>
      <form onSubmit={enviar} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
        {campo("actual", "Contraseña actual")}
        {campo("nueva", "Nueva", corta ? "Mínimo 12 caracteres." : "Mínimo 12 caracteres. Una frase corta es fácil de recordar y difícil de adivinar.")}
        {campo("otra", "Repite la nueva", distinta ? "No coincide con la nueva." : "")}
        <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap", flexBasis: "100%" }}>
          <label className="elegir-cliente" htmlFor={`${ids}-ver`}>
            <input id={`${ids}-ver`} type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Ver lo que escribo
          </label>
          <button className="btn btn-primary" type="submit" disabled={guardando || corta || distinta || !f.actual || !f.nueva || !f.otra}>
            <Icon name="lock" size={18} /> {guardando ? "Cambiando…" : "Cambiar contraseña"}
          </button>
        </div>
      </form>
      <div role="status" aria-live="polite">
        {estado.texto && <p className={`notice ${estado.ok ? "notice-ok" : "notice-error"}`} style={{ marginTop: "var(--sp-2)" }}>{estado.texto}</p>}
      </div>
    </section>
  );
}

/** Los clientes que puede ver un colaborador: casillas. */
function ElegirClientes({ clients, valor = [], onCambiar, etiqueta }) {
  const ids = useId();
  return (
    <fieldset className="elegir-clientes">
      <legend className="label">{etiqueta}</legend>
      <div className="elegir-clientes-lista">
        {clients.map((c) => (
          <label key={c.id} htmlFor={`${ids}-${c.id}`} className="elegir-cliente">
            <input
              id={`${ids}-${c.id}`}
              type="checkbox"
              checked={valor.includes(c.id)}
              onChange={() => onCambiar(valor.includes(c.id) ? valor.filter((x) => x !== c.id) : [...valor, c.id])}
            />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** El papel de un miembro, editable por quien administra. */
function PapelMiembro({ m, clients, onGuardado, onError }) {
  const ids = useId();
  const [papel, setPapel] = useState(papelDe(m));
  const [clientes, setClientes] = useState(m.clientes ?? []);
  const cambiado = papel !== papelDe(m) || (papel === "colaborador" && JSON.stringify([...clientes].sort()) !== JSON.stringify([...(m.clientes ?? [])].sort()));
  const guardar = async () => {
    try {
      await cambiarPapel(m.userId, { papel, clientes: papel === "colaborador" ? clientes : null });
      onGuardado(`${m.nombre}: ${NOMBRE_PAPEL[papel]}.`);
    } catch (e) { onError(e.message); }
  };
  return (
    <div className="papel-miembro">
      <label className="sr-only" htmlFor={`${ids}-papel`}>Papel de {m.nombre}</label>
      <select id={`${ids}-papel`} className="input" value={papel} onChange={(e) => setPapel(e.target.value)}>
        {PAPELES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
      {papel === "colaborador" && (
        <ElegirClientes clients={clients} valor={clientes} onCambiar={setClientes} etiqueta={`Clientes de ${m.nombre}`} />
      )}
      {cambiado && <button type="button" className="btn btn-primary btn-sm" onClick={guardar}>Guardar papel</button>}
    </div>
  );
}

/**
 * Equipo.
 *
 * Tres cosas, y la del medio es la que importa:
 *
 *  1. Quién está en el espacio y quién está conectado ahora.
 *  2. Invitar: genera un enlace de un solo uso que se copia y se manda.
 *     **El testigo se enseña una vez.** En la base sólo queda su huella,
 *     así que no hay «volver a verlo»: si se pierde, se invita otra vez.
 *     Contarlo aquí evita que alguien cierre la pantalla esperando poder
 *     recuperarlo luego.
 *  3. Cómo te ven: tu nombre y tu color, que son los que salen en la
 *     presencia y en «X está editando esto».
 */
export default function Equipo({ presentes = [], yo, pulso = 0, onVolver, clients = [] }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [temporal, setTemporal] = useState(null); // { nombre, clave }: la contraseña temporal que se acaba de poner
  const [enlaceNuevo, setEnlaceNuevo] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const [correo, setCorreo] = useState("");
  const [nombreInvitado, setNombreInvitado] = useState("");
  const [rol, setRol] = useState("editor");
  const [clientesInvitado, setClientesInvitado] = useState([]);

  const [miNombre, setMiNombre] = useState(yo?.nombre ?? "");

  const ids = useId();
  const conectado = (userId) => presentes.some((p) => p.userId === userId);
  const esAdmin = yo?.rol === "admin";

  const recargar = useCallback(async () => {
    try {
      setDatos(await cargarEquipo());
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo cargar el equipo.");
    }
  }, []);

  // `pulso` sube cuando otra persona entra por invitación, se marcha o
  // cambia su nombre: la lista se relee sola en vez de quedarse vieja
  // hasta que alguien recargue.
  useEffect(() => { void recargar(); }, [recargar, pulso]);

  // «Cambiar contraseña» del menú de la cuenta trae aquí con #contrasena.
  useEffect(() => {
    if (datos && window.location.hash === "#contrasena") document.getElementById("contrasena")?.scrollIntoView({ block: "start" });
  }, [datos]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const crearInvitacion = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      const { testigo } = await invitar({ email: correo, nombre: nombreInvitado, papel: rol, clientes: rol === "colaborador" ? clientesInvitado : null });
      setEnlaceNuevo(enlaceDeInvitacion(testigo));
      setCorreo("");
      setNombreInvitado("");
      await recargar();
    } catch (err) {
      setError(err.message || "No se pudo crear la invitación.");
    }
    setEnviando(false);
  };

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(temporal && texto === temporal.clave ? "Contraseña temporal copiada." : "Enlace copiado. Mándaselo por donde ya habléis.");
    } catch {
      // Sin permiso de portapapeles —o en http—: el enlace está a la
      // vista y se puede seleccionar a mano, que es lo que queda.
      setAviso("No se pudo copiar solo. Selecciona el enlace y cópialo.");
    }
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    try {
      await guardarMiPerfil({ nombre: miNombre });
      setAviso("Guardado. Así te ve el resto del equipo.");
      await recargar();
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-top">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
            <button className="btn-icon" onClick={onVolver} aria-label="Volver al panel">
              <Icon name="chevronLeft" />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title">Equipo</h1>
              <p className="page-meta">
                Quién entra en este espacio y cómo os veis mientras trabajáis.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div role="status" aria-live="polite" className={aviso ? undefined : "sr-only"}>
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {error && <p role="alert" className="notice notice-error" style={{ display: "block" }}>{error}</p>}

      {!datos ? (
        <p style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
          {/* ---- Miembros ---- */}
          <section>
            <h2 className="label">En el espacio</h2>
            {temporal && (
              <div className="notice notice-warn" role="status" style={{ display: "block", marginBottom: "var(--sp-3)" }}>
                <p>Contraseña temporal de <strong>{temporal.nombre}</strong> (se enseña sólo ahora):</p>
                <p style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap", margin: "var(--sp-2) 0" }}>
                  <code style={{ fontSize: "var(--fs-md)", userSelect: "all" }}>{temporal.clave}</code>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(temporal.clave)}><Icon name="copy" size={14} /> Copiar</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTemporal(null)}>Listo</button>
                </p>
                <p className="hint">Sus sesiones se cerraron. Que entre con ésta y la cambie en «Equipo y perfil → Tu contraseña».</p>
              </div>
            )}
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {datos.miembros.map((m) => (
                <li
                  key={m.userId}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--sp-3)",
                    padding: "var(--sp-3)", background: "var(--surface)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  }}
                >
                  <Avatar persona={m} tamano={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>
                      {m.nombre}
                      {m.userId === yo?.id && (
                        <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> · tú</span>
                      )}
                    </p>
                    <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
                      {NOMBRE_PAPEL[papelDe(m)]}
                      {papelDe(m) === "colaborador" && ` (${(m.clientes ?? []).length} ${(m.clientes ?? []).length === 1 ? "cliente" : "clientes"})`}
                      {" · "}
                      {conectado(m.userId) ? "conectado ahora" : "desconectado"}
                    </p>
                    {esAdmin && m.userId !== yo?.id && m.userId !== yo?.ownerId && (
                      <PapelMiembro m={m} clients={clients} onGuardado={(t) => { setAviso(t); void recargar(); }} onError={setError} />
                    )}
                  </div>
                  {esAdmin && m.userId !== yo?.id && m.userId !== yo?.ownerId && (
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label={`Restablecer la contraseña de ${m.nombre}`}
                      title="Le pone una contraseña temporal y cierra sus sesiones: dásela y que la cambie al entrar"
                      onClick={async () => {
                        try {
                          const { temporal } = await restablecerContrasenaDe(m.userId);
                          setTemporal({ nombre: m.nombre, clave: temporal });
                        } catch (err) { setError(err.message); }
                      }}
                    >
                      <Icon name="lock" size={16} /> Contraseña
                    </button>
                  )}
                  {esAdmin && m.userId !== yo?.id && (
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label={`Sacar a ${m.nombre} del espacio`}
                      onClick={async () => {
                        try {
                          await sacarMiembro(m.userId);
                          setAviso(`${m.nombre} ya no tiene acceso.`);
                          await recargar();
                        } catch (err) { setError(err.message); }
                      }}
                    >
                      <Icon name="trash" size={16} /> Sacar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ---- Invitar ---- */}
          {esAdmin && (
            <section>
              <h2 className="label">Invitar a alguien</h2>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                Se genera un enlace de un solo uso. Quien lo abra elige su propia
                contraseña: tú no llegas a verla nunca.
              </p>

              <form onSubmit={crearInvitacion} style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", alignItems: "flex-end" }}>
                <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                  <label className="label" htmlFor={`${ids}-nombre`}>Nombre (opcional)</label>
                  <input
                    id={`${ids}-nombre`} className="input" type="text"
                    value={nombreInvitado} onChange={(e) => setNombreInvitado(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
                  <label className="label" htmlFor={`${ids}-correo`}>Correo (opcional)</label>
                  <input
                    id={`${ids}-correo`} className="input" type="email"
                    autoCapitalize="none" spellCheck="false"
                    value={correo} onChange={(e) => setCorreo(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: "0 1 160px", marginBottom: 0 }}>
                  <label className="label" htmlFor={`${ids}-rol`}>Puede</label>
                  <select
                    id={`${ids}-rol`} className="input"
                    value={rol} onChange={(e) => setRol(e.target.value)}
                  >
                    {PAPELES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                </div>
                <p className="hint" style={{ flexBasis: "100%", margin: 0 }}>{PAPELES.find(([k]) => k === rol)?.[2]}</p>
                {rol === "colaborador" && (
                  <div style={{ flexBasis: "100%" }}>
                    <ElegirClientes clients={clients} valor={clientesInvitado} onCambiar={setClientesInvitado} etiqueta="Qué clientes verá" />
                  </div>
                )}
                <button className="btn btn-primary" type="submit" disabled={enviando}>
                  <Icon name="link" size={18} /> {enviando ? "Generando…" : "Crear enlace"}
                </button>
              </form>

              {enlaceNuevo && (
                <div
                  className="notice notice-ok"
                  style={{ display: "block", marginTop: "var(--sp-3)" }}
                >
                  <p style={{ marginBottom: "var(--sp-2)", fontWeight: 600 }}>
                    Cópialo ahora: este enlace no se vuelve a mostrar.
                  </p>
                  <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
                    <code
                      style={{
                        flex: "1 1 260px", overflowWrap: "anywhere",
                        fontSize: "var(--fs-3xs)", userSelect: "all",
                      }}
                    >
                      {enlaceNuevo}
                    </code>
                    <button className="btn btn-secondary btn-sm" onClick={() => copiar(enlaceNuevo)}>
                      <Icon name="copy" size={16} /> Copiar
                    </button>
                  </div>
                </div>
              )}

              {datos.invitaciones.length > 0 && (
                <>
                  <h3 className="label" style={{ marginTop: "var(--sp-4)" }}>Sin usar todavía</h3>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {datos.invitaciones.map((i) => (
                      <li
                        key={i.id}
                        style={{
                          display: "flex", alignItems: "center", gap: "var(--sp-3)",
                          padding: "var(--sp-2) var(--sp-3)",
                          border: "1px solid var(--border)", borderRadius: "var(--radius)",
                        }}
                      >
                        <Icon name="link" size={16} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-2xs)" }}>
                          {i.nombre || i.email || "Sin nombre"}
                          <span style={{ color: "var(--text-faint)" }}>
                            {" · "}{NOMBRE_PAPEL[papelDe(i)].toLowerCase()}
                          </span>
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          aria-label={`Retirar la invitación de ${i.nombre || i.email || "esa persona"}`}
                          onClick={async () => {
                            try {
                              await retirarInvitacion(i.id);
                              await recargar();
                            } catch (err) { setError(err.message); }
                          }}
                        >
                          <Icon name="close" size={16} /> Retirar
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {/* ---- Carga ---- */}
          <CargaEquipo clients={clients} miembros={datos.miembros} pulso={pulso} />

          {/* La IA y su gasto se mudaron a Ajustes: aquí nadie los
              encontró el día que se acabó el saldo. */}
          <p className="hint" style={{ margin: 0 }}>
            El modelo de IA, el nivel de razonamiento y el presupuesto están en{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navegar("/ajustes")}>
              <Icon name="settings" size={14} /> Ajustes
            </button>
          </p>

          <CambiarContrasena />

          {/* ---- Cómo te ven ---- */}
          <section>
            <h2 className="label">Cómo te ve el equipo</h2>
            <form onSubmit={guardarPerfil} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
                <label className="label" htmlFor={`${ids}-mi-nombre`}>Tu nombre</label>
                <input
                  id={`${ids}-mi-nombre`} className="input" type="text" maxLength={60}
                  value={miNombre} onChange={(e) => setMiNombre(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary" type="submit">
                <Icon name="check" size={18} /> Guardar
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
