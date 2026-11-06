import { useEffect, useId, useState } from "react";
import { vozPublica, responderVoz } from "../lib/whatsappApi";
import { limpiarRespuestaVoz, MAX_RESPUESTA_VOZ, MAX_NOMBRE_VOZ } from "../lib/vozCliente";
import "./VozCliente.css";

// ============================================================
// /voz?t=… — «Tu opinión», la encuesta que abren los CLIENTES del cliente (curso de campañas, entrega 8)
//
// Sin sesión, como la de ventas: el testigo del enlace es todo lo que hace falta. Siete preguntas cortas y una de sí o
// no; sólo una obligatoria («¿Por qué nos escogiste?»). El nombre es opcional, salvo si marca que su respuesta se puede
// usar como testimonio. Nada de datos personales obligatorios: ni teléfono ni correo.
//
// Va con la marca del CLIENTE (su nombre, su logo y su color), no con la de la agencia. El campo `sitio` es una trampa
// para robots: una persona no lo ve ni lo alcanza con el teclado.
// ============================================================

function colorDe(c) {
  return /^#[0-9a-f]{6}$/i.test(String(c ?? "")) ? c : "#1F6FD1";
}

/** Texto blanco o casi negro sobre un color, el que más contraste (luminancia relativa, WCAG). */
function textoSobre(hex) {
  const canal = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? "#FFFFFF" : "#111827";
}

function Pregunta({ p, valor, onCambio }) {
  const id = useId();
  return (
    <div className="voz-campo">
      <label htmlFor={id}>{p.pregunta}{p.obligatoria ? <span className="voz-obligatoria"> (obligatoria)</span> : ""}</label>
      <textarea id={id} rows={2} maxLength={MAX_RESPUESTA_VOZ} value={valor} required={Boolean(p.obligatoria)} onChange={(e) => onCambio(e.target.value)} />
    </div>
  );
}

export default function VozCliente() {
  const testigo = new URLSearchParams(window.location.search).get("t") ?? "";
  const ids = useId();
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");
  const [respuestas, setRespuestas] = useState({});
  const [nombre, setNombre] = useState("");
  const [permiso, setPermiso] = useState(false);
  const [producto, setProducto] = useState("");
  const [recomienda, setRecomienda] = useState("");
  const [sitio, setSitio] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    vozPublica(testigo)
      .then((d) => {
        setDatos(d);
        document.title = `Tu opinión · ${d.cliente?.nombre ?? ""}`.replace(/ · $/, "");
      })
      .catch((e) => setFallo(e.estado === 404 ? "Este enlace no existe o ya no está disponible." : e.message));
  }, [testigo]);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    const entrada = { respuestas, nombre, permiso, producto, recomienda, sitio };
    const { error: problema } = limpiarRespuestaVoz(entrada, { productos: datos?.productos ?? [] });
    if (problema) { setError(problema); return; }
    setEnviando(true);
    try {
      await responderVoz(testigo, entrada);
      setHecho(true);
    } catch (err) {
      setError(err.message || "No se pudo enviar. Vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  if (fallo) return <main className="voz-pagina"><div className="voz-contenido"><p role="alert" className="voz-error voz-solo">{fallo}</p></div></main>;
  if (!datos) return <main className="voz-pagina"><div className="voz-contenido"><p role="status" className="voz-ayuda voz-solo">Cargando…</p></div></main>;

  const color = colorDe(datos.cliente?.color);
  const estilo = { "--voz-color": color, "--voz-sobre-color": textoSobre(color) };
  const marca = datos.cliente?.nombre || "nosotros";

  return (
    <main className="voz-pagina" style={estilo}>
      <div className="voz-contenido">
        <header className="voz-cabecera">
          {datos.cliente?.logo && <img src={datos.cliente.logo} alt="" className="voz-logo" />}
          <p className="voz-marca">{datos.cliente?.nombre}</p>
          <h1>{hecho ? "¡Gracias!" : "¿Nos ayudas con tu opinión?"}</h1>
          {!hecho && <p className="voz-ayuda">Son unas preguntas cortas: contesta las que quieras. Sólo una es obligatoria.</p>}
        </header>

        {hecho ? (
          <p role="status" className="voz-gracias">Tu respuesta nos ayuda a mejorar en {marca}. ¡Gracias por tomarte el tiempo!</p>
        ) : (
          <form className="voz-tarjeta voz-form" onSubmit={enviar} noValidate>
            {datos.preguntas.map((p) => (
              <Pregunta key={p.id} p={p} valor={respuestas[p.id] ?? ""} onCambio={(v) => setRespuestas((r) => ({ ...r, [p.id]: v }))} />
            ))}

            <fieldset className="voz-campo voz-recomienda">
              <legend>¿Nos recomendarías?</legend>
              <div className="voz-opciones">
                {datos.recomienda.map((r) => (
                  <label key={r.id} className="voz-opcion" data-escogida={recomienda === r.id ? "" : undefined}>
                    <input type="radio" name={`${ids}-rec`} value={r.id} checked={recomienda === r.id} onChange={() => setRecomienda(r.id)} />
                    <span>{r.nombre}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {datos.productos.length > 1 && (
              <div className="voz-campo">
                <label htmlFor={`${ids}-p`}>¿Qué compraste? (opcional)</label>
                <select id={`${ids}-p`} value={producto} onChange={(e) => setProducto(e.target.value)}>
                  <option value="">Prefiero no decirlo</option>
                  {datos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}

            <div className="voz-campo">
              <label htmlFor={`${ids}-n`}>Tu nombre (opcional)</label>
              <input id={`${ids}-n`} type="text" autoComplete="given-name" maxLength={MAX_NOMBRE_VOZ} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>

            <label className="voz-permiso">
              <input type="checkbox" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />
              <span>Pueden usar mi respuesta como testimonio, con mi nombre.</span>
            </label>

            {/* La trampa para robots: fuera de la vista y del teclado. */}
            <div className="voz-trampa" aria-hidden="true">
              <label htmlFor={`${ids}-s`}>No escribas aquí</label>
              <input id={`${ids}-s`} type="text" tabIndex={-1} autoComplete="off" value={sitio} onChange={(e) => setSitio(e.target.value)} />
            </div>

            {error && <p role="alert" className="voz-error">{error}</p>}
            <button type="submit" className="voz-boton" disabled={enviando}>{enviando ? "Enviando…" : "Enviar mi opinión"}</button>
            <p className="voz-ayuda">No te pedimos teléfono ni correo. Lo que escribas sólo lo ve {marca} y quien le ayuda con su comunicación.</p>
          </form>
        )}
      </div>
    </main>
  );
}
