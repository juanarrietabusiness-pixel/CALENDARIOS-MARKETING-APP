import { useEffect, useState } from "react";
import Icon from "./Icon";
import { mcpConexiones, mcpDesconectar } from "../lib/db";

// ============================================================
// Ajustes → Claude: usar la aplicación desde cualquier chat de Claude
//
// Se añade una vez como conector personalizado con la dirección /mcp, y
// Claude pide permiso aquí, con la sesión de cada persona. Cada conexión
// queda atada a quien la dio y se puede cortar desde esta lista.
// ============================================================

export default function SeccionClaude({ pulso = 0 }) {
  const [lista, setLista] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState("");
  const direccion = `${window.location.origin}/mcp`;

  const cargar = () => mcpConexiones().then(setLista).catch((e) => setFallo(e.message));
  useEffect(() => { void cargar(); }, [pulso]);

  const copiar = async () => {
    await navigator.clipboard?.writeText(direccion).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };
  const desconectar = async (c) => {
    if (!window.confirm(`¿Desconectar «${c.nombre}»? Claude dejará de poder usar la aplicación hasta que se vuelva a conectar.`)) return;
    try { await mcpDesconectar(c.id); await cargar(); } catch (e) { setFallo(e.message); }
  };

  return (
    <section id="claude" className="ajustes-seccion" aria-labelledby="ajustes-claude">
      <h2 className="ajustes-titulo" id="ajustes-claude">
        <Icon name="messageCircle" size={18} /> Claude en cualquier chat
      </h2>
      <p className="ajustes-intro">
        Úsala desde Claude —web, escritorio, móvil o Claude Code— sin abrir la aplicación: «¿qué sale mañana de Baby Caleb?»,
        «mueve el reel del jueves a las 7», «programa lo aprobado de octubre». Claude usa las mismas herramientas que el asistente,
        con tu cuenta, y lo que cambia se ve aquí al momento.
      </p>
      <ol className="ajustes-pasos">
        <li>En claude.ai, abre <strong>Ajustes → Conectores → Añadir conector personalizado</strong>.</li>
        <li>
          Pon esta dirección:
          <span className="ajustes-copiable">
            <code>{direccion}</code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copiar}>
              <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
            </button>
          </span>
        </li>
        <li>Claude abre esta aplicación para pedirte permiso: entra con tu usuario y pulsa «Permitir».</li>
      </ol>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      <h3 className="label">Conexiones</h3>
      {lista?.length === 0 && <p className="hint">Todavía no hay ninguna.</p>}
      {lista?.length > 0 && (
        <ul className="ajustes-conexiones">
          {lista.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.nombre}</strong> · de {c.persona}
                <span className="hint"> · conectada el {new Date(c.desde).toLocaleDateString("es-PA", { day: "numeric", month: "short" })}
                  {c.usado ? `, usada por última vez el ${new Date(c.usado).toLocaleDateString("es-PA", { day: "numeric", month: "short" })}` : ""}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => desconectar(c)} aria-label={`Desconectar ${c.nombre}`}>Desconectar</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
