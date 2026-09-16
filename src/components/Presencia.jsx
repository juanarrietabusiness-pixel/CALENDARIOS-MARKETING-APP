import Icon from "./Icon";
import { iniciales } from "../utils";

// ============================================================
// Quién está dentro, ahora mismo
//
// Es la pieza que convierte «hay tiempo real» en algo que se ve. Sin
// ella los cambios aparecen solos en la pantalla y eso, sin una cara al
// lado, parece un fallo más que un compañero.
//
// Dos avisos distintos y deliberadamente distintos:
//
//   · Los AVATARES de la cabecera: quién tiene el panel abierto.
//   · El punto de ESTADO: si tu propia conexión está viva. Cuando se
//     cae, lo que ves deja de actualizarse solo, y más vale decirlo que
//     dejar a alguien creyendo que el otro no ha tocado nada.
// ============================================================

/**
 * Un avatar. `title` cuenta dónde está esa persona, porque el color y
 * las iniciales no lo dicen y es justo lo que se quiere saber.
 */
export function Avatar({ persona, tamano = 28, donde = "" }) {
  const etiqueta = donde ? `${persona.nombre} · ${donde}` : persona.nombre;
  return (
    <span
      title={etiqueta}
      aria-label={etiqueta}
      role="img"
      style={{
        width: tamano,
        height: tamano,
        borderRadius: "var(--radius-pill)",
        background: persona.color || "var(--accent)",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--fs-3xs)",
        fontWeight: 700,
        flexShrink: 0,
        border: "2px solid var(--surface)",
        letterSpacing: ".02em",
      }}
    >
      {iniciales(persona.nombre)}
    </span>
  );
}

const TEXTO_ESTADO = {
  conectado: "En vivo",
  conectando: "Conectando…",
  desconectado: "Sin conexión en vivo",
};

/**
 * La fila de la cabecera: el estado de la conexión y quién más está.
 *
 * `presentes` incluye a quien lo mira, así que se filtra: verse a uno
 * mismo en la lista de «quién más hay» no informa de nada y ocupa el
 * sitio de quien sí importa.
 */
export default function Presencia({ presentes = [], yo, estado = "desconectado", clientes = [] }) {
  const otros = presentes.filter((p) => p.userId !== yo?.id);
  const nombreDeCliente = (id) => clientes.find((c) => c.id === id)?.name ?? "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
      <span
        role="status"
        title={TEXTO_ESTADO[estado]}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "var(--radius-pill)",
            flexShrink: 0,
            background:
              estado === "conectado" ? "var(--success)"
                : estado === "conectando" ? "var(--accent-alt)"
                  : "var(--text-faint)",
          }}
        />
        <span className="presencia-texto">{TEXTO_ESTADO[estado]}</span>
      </span>

      {otros.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", marginLeft: 2 }}>
          {otros.slice(0, 4).map((p, i) => (
            <span key={p.userId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar
                persona={p}
                donde={p.mirando?.clienteId ? `viendo ${nombreDeCliente(p.mirando.clienteId) || "un cliente"}` : "en el panel"}
              />
            </span>
          ))}
          {otros.length > 4 && (
            <span
              style={{ marginLeft: 4, fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}
            >
              +{otros.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Las caras de quien está mirando ESTE cliente, para la lista lateral.
 *
 * Es lo que evita el choque antes de que ocurra: si ves que tu compañera
 * está dentro de Baby Caleb, no te pones a reescribir su semana.
 */
export function PresenciaEnCliente({ presentes = [], clienteId, yo }) {
  const dentro = presentes.filter(
    (p) => p.userId !== yo?.id && p.mirando?.clienteId === clienteId,
  );
  if (!dentro.length) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      {dentro.slice(0, 3).map((p, i) => (
        <span key={p.userId} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar persona={p} tamano={20} donde="está aquí" />
        </span>
      ))}
    </span>
  );
}

/**
 * «Ana está editando esto.»
 *
 * No bloquea nada, y es a propósito: un bloqueo de verdad exige soltarlo
 * bien en todos los caminos —cerrar la pestaña, quedarse sin batería— y
 * el modo en que falla es dejar una publicación trabada sin nadie
 * dentro. Avisar resuelve el 95 % del problema y no puede atascarse.
 */
export function AvisoEditando({ persona }) {
  if (!persona) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--fs-3xs)",
        padding: "2px var(--sp-2)",
        borderRadius: "var(--radius-pill)",
        background: "var(--accent-soft)",
        color: "var(--text-dim)",
        border: "1px solid var(--accent-line)",
      }}
    >
      <Icon name="pencil" size={12} />
      {persona.nombre} está editando
    </span>
  );
}
