import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { mcpCliente, mcpAutorizar } from "../lib/db";
import logoMark from "../assets/logo-mark.png";

// ============================================================
// /conectar-claude — el permiso que pide Claude (OAuth)
//
// Llega aquí desde claude.ai con los parámetros de OAuth en la dirección.
// Es una pantalla de la aplicación, con la sesión de siempre: si no la
// hay, la puerta de acceso sale antes y, al entrar, se vuelve aquí.
// Lo que se permite queda atado a ESTA persona y a SU espacio.
// ============================================================

export default function ConectarClaude({ yo }) {
  // Los parámetros vienen de la dirección y no cambian mientras se está aquí.
  const [pedido] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      tipo: p.get("response_type") ?? "",
      clientId: p.get("client_id") ?? "",
      redirectUri: p.get("redirect_uri") ?? "",
      reto: p.get("code_challenge") ?? "",
      metodo: p.get("code_challenge_method") ?? "",
      state: p.get("state") ?? "",
    };
  });
  const [app, setApp] = useState(null);
  const [fallo, setFallo] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (pedido.tipo !== "code" || !pedido.clientId || !pedido.redirectUri) {
      setFallo("Este enlace de conexión está incompleto. Vuelve a añadir el conector desde Claude.");
      return;
    }
    mcpCliente(pedido.clientId, pedido.redirectUri).then(setApp).catch((e) => setFallo(e.message));
  }, [pedido]);

  const responder = async (permitir) => {
    setTrabajando(true);
    try {
      const { tipo: _tipo, ...datos } = pedido;
      const { redirect } = await mcpAutorizar({ ...datos, permitir });
      window.location.assign(redirect);
    } catch (e) {
      setFallo(e.message);
      setTrabajando(false);
    }
  };

  return (
    <div className="conectar-claude">
      <div className="conectar-claude-tarjeta">
        <img src={logoMark} alt="" width={56} height={56} />
        <h1>Conectar Claude</h1>
        {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
        {!fallo && !app && <p role="status" className="hint">Comprobando…</p>}
        {app && (
          <>
            <p>
              <strong>{app.nombre}</strong> quiere usar Juancito Ads con tu cuenta{yo?.nombre ? ` (${yo.nombre})` : ""}.
            </p>
            <ul className="conectar-claude-lista">
              <li><Icon name="check" size={14} /> Ver clientes, calendarios, la cola, tareas, ideas y resultados.</li>
              <li><Icon name="check" size={14} /> Crear, cambiar, mover y programar publicaciones, y crear tareas e ideas.</li>
              <li><Icon name="alert" size={14} /> Lo que haga lo verá tu equipo firmado como «Claude». Puedes desconectarlo cuando quieras en Ajustes → Claude.</li>
            </ul>
            <p className="hint">Volverás a {app.vuelta}.</p>
            <div className="conectar-claude-botones">
              <button type="button" className="btn btn-secondary" disabled={trabajando} onClick={() => responder(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={trabajando} onClick={() => responder(true)}>
                {trabajando ? "Conectando…" : "Permitir"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
