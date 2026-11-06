import { useCallback, useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { vozDelCliente, enlaceDeVozDelCliente, vozAlEstudio, aceptarVozEnEstudio, borrarRespuestaVoz } from "../../lib/whatsappApi";
import { enlaceDeVoz, mensajeAlCliente, PREGUNTAS_VOZ, RECOMIENDA } from "../../lib/vozCliente";

// ============================================================
// «La voz de tus clientes» en Marca → WhatsApp (curso de campañas, entrega 8)
//
// El enlace de la encuesta (se crea una vez y se reutiliza), el mensaje para que el cliente lo reenvíe, lo que van
// respondiendo y «Llevar al estudio»: la IA lee las respuestas nuevas y PROPONE qué añadir a las maletas; se marca lo
// que se queda y va al BORRADOR del estudio de mercado, que se aprueba como siempre en Marca → Cerebro.
//
// Va aquí, junto al kit de WhatsApp, y no dentro del estudio de mercado: el enlace sale por el mismo WhatsApp del
// cliente, y lo que contestan sus clientes alimenta las dos cosas (las objeciones del kit salen de las del estudio).
// ============================================================

const MAX_VISIBLES = 12;
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : "");
const nombreRecomienda = (id) => RECOMIENDA.find((r) => r.id === id)?.nombre ?? "";

/** Las casillas de la propuesta: «producto|maleta|índice» → marcada (todo marcado de entrada). */
function marcasDe(propuesta) {
  const m = {};
  for (const p of propuesta?.productos ?? []) {
    for (const k of ["problema", "diferenciales", "objeciones", "testimonios"]) (p[k] ?? []).forEach((_, i) => { m[`${p.productoId}|${k}|${i}`] = true; });
  }
  return m;
}

/** Sólo lo marcado de la propuesta (lo que se manda a «Añadir al estudio»). */
function soloMarcado(propuesta, marcas) {
  return {
    ...propuesta,
    productos: (propuesta?.productos ?? []).map((p) => {
      const q = { ...p };
      for (const k of ["problema", "diferenciales", "objeciones", "testimonios"]) q[k] = (p[k] ?? []).filter((_, i) => marcas[`${p.productoId}|${k}|${i}`]);
      return q;
    }),
  };
}

const TITULOS = { problema: "Problema", diferenciales: "Diferenciales", objeciones: "Objeciones", testimonios: "Testimonios" };
const textoDe = (k, x) => (k === "objeciones" ? `«${x.objecion}» → ${x.respuesta}` : k === "testimonios" ? `«${x.cita}» — ${x.nombre}` : x);

/** La propuesta de la IA, con una casilla por cosa. */
function PropuestaVoz({ propuesta, marcas, onMarcar }) {
  return (
    <div className="kw-propuesta">
      {propuesta.resumen && <p className="hint" style={{ marginTop: 0 }}><strong>Lo que más se repite:</strong> {propuesta.resumen}</p>}
      {propuesta.productos.map((p) => (
        <fieldset key={p.productoId} className="kw-propuesta-producto">
          <legend>{p.producto}</legend>
          {["problema", "diferenciales", "objeciones", "testimonios"].filter((k) => p[k]?.length).map((k) => (
            <div key={k} className="kw-propuesta-maleta">
              <p className="kw-propuesta-titulo">{TITULOS[k]}</p>
              {p[k].map((x, i) => {
                const clave = `${p.productoId}|${k}|${i}`;
                return (
                  <label key={clave} className="kw-casilla">
                    <input type="checkbox" checked={Boolean(marcas[clave])} onChange={(e) => onMarcar(clave, e.target.checked)} />
                    <span>{textoDe(k, x)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** Una respuesta de la encuesta. */
function Respuesta({ r, producto, lectura, onQuitar }) {
  const [confirmar, setConfirmar] = useState(false);
  return (
    <li className="kw-respuesta">
      <div className="kw-respuesta-cabecera">
        <strong>{r.nombre || "Sin nombre"}</strong>
        <span className="hint">{fecha(r.creadaAt)}</span>
        {r.permiso && r.nombre && <span className="kw-sello" data-tipo="testimonio"><Icon name="check" size={12} /> Puede ser testimonio</span>}
        {!r.llevadaAt && <span className="kw-sello" data-tipo="nueva">Nueva</span>}
        {producto && <span className="kw-sello">{producto}</span>}
        {r.recomienda && <span className="kw-sello">Recomienda: {nombreRecomienda(r.recomienda)}</span>}
      </div>
      <dl className="kw-respuesta-texto">
        {PREGUNTAS_VOZ.filter((p) => r.respuestas[p.id]).map((p) => (
          <div key={p.id}><dt>{p.pregunta}</dt><dd>{r.respuestas[p.id]}</dd></div>
        ))}
      </dl>
      {!lectura && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => (confirmar ? onQuitar(r) : setConfirmar(true))} onBlur={() => setConfirmar(false)}>
          <Icon name="trash" size={14} /> {confirmar ? "Sí, quitar" : "Quitar"}<span className="sr-only"> la respuesta de {r.nombre || "alguien sin nombre"}</span>
        </button>
      )}
    </li>
  );
}

export default function VozDelCliente({ client, lectura = false }) {
  const ids = useId();
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState(null);
  const [copia, setCopia] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [propuesta, setPropuesta] = useState(null);
  const [marcas, setMarcas] = useState({});
  const [verTodas, setVerTodas] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await vozDelCliente(client.id));
      setFallo("");
    } catch (e) {
      setFallo(e.message || "No se pudieron leer las respuestas.");
    }
  }, [client.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Llegó una respuesta (o alguien del equipo quitó una): se relee.
  useEffect(() => {
    const alCambiar = (ev) => {
      if (ev.detail?.clientId === client.id && ev.detail?.que === "voz") void cargar();
    };
    window.addEventListener("whatsapp", alCambiar);
    return () => window.removeEventListener("whatsapp", alCambiar);
  }, [client.id, cargar]);

  async function asegurarEnlace() {
    if (datos?.testigo) return enlaceDeVoz(window.location.origin, datos.testigo);
    const r = await enlaceDeVozDelCliente(client.id);
    setDatos((d) => ({ ...d, testigo: r.testigo }));
    return enlaceDeVoz(window.location.origin, r.testigo);
  }

  async function copiar(que) {
    setAviso(null);
    setCopia("");
    let texto = "";
    try {
      const enlace = await asegurarEnlace();
      texto = que === "mensaje" ? mensajeAlCliente({ marca: client.name, enlace }) : enlace;
      await navigator.clipboard.writeText(texto);
      setAviso({ ok: true, texto: que === "mensaje" ? "Mensaje copiado: pégalo en el WhatsApp del cliente para que lo reenvíe." : "Enlace copiado." });
    } catch (e) {
      if (texto) { setCopia(texto); setAviso({ ok: true, texto: "No se pudo copiar solo: cópialo de aquí abajo." }); }
      else setAviso({ ok: false, texto: e.message || "No se pudo crear el enlace." });
    }
  }

  async function llevar(todas = false) {
    setOcupado("llevar");
    setAviso(null);
    try {
      const r = await vozAlEstudio(client.id, { todas });
      if (!r.propuesta?.productos?.length) {
        setAviso({ ok: true, texto: "La IA leyó las respuestas y no encontró nada que el estudio no diga ya." });
        setPropuesta(null);
      } else {
        setPropuesta({ ...r.propuesta, leidas: r.leidas, enBorrador: r.enBorrador });
        setMarcas(marcasDe(r.propuesta));
      }
      if (r.aviso) setAviso({ ok: true, texto: r.aviso });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setOcupado("");
  }

  async function aceptar() {
    setOcupado("aceptar");
    try {
      const r = await aceptarVozEnEstudio(client.id, soloMarcado(propuesta, marcas), propuesta.leidas);
      setPropuesta(null);
      setAviso({ ok: true, texto: `${r.cambios === 1 ? "Entró 1 cosa" : `Entraron ${r.cambios} cosas`} al borrador del estudio de mercado. Revísalo y apruébalo en Marca → Cerebro → Estudio de mercado: hasta entonces, la IA no lo usa.` });
      void cargar();
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setOcupado("");
  }

  async function quitar(r) {
    try {
      await borrarRespuestaVoz(client.id, r.id);
      setDatos((d) => ({ ...d, respuestas: d.respuestas.filter((x) => x.id !== r.id) }));
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
  }

  const productos = new Map((datos?.productos ?? []).map((p) => [p.id, p.nombre]));
  const respuestas = datos?.respuestas ?? [];
  const visibles = verTodas ? respuestas : respuestas.slice(0, MAX_VISIBLES);
  const res = datos?.resumen;
  const marcadas = Object.values(marcas).filter(Boolean).length;
  const url = datos?.testigo ? enlaceDeVoz(window.location.origin, datos.testigo) : "";

  return (
    <section className="card kw-voz" aria-labelledby={`${ids}-t`}>
      <header className="kw-cabecera">
        <div>
          <h3 id={`${ids}-t`}>La voz de tus clientes</h3>
          <p className="hint">
            Una encuesta de siete preguntas cortas que {client.name} reenvía por WhatsApp a sus clientes (de 5 a 10 bastan). Lo
            que respondan va a las maletas del estudio de mercado: el problema y los diferenciales con sus palabras, lo que
            casi los frena y los testimonios (sólo de quien dio permiso, con su nombre).
          </p>
        </div>
        <div className="kw-botones">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar("enlace")} disabled={lectura && !datos?.testigo}>
            <Icon name="link" size={16} /> Copiar el enlace
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar("mensaje")} disabled={lectura && !datos?.testigo}>
            <Icon name="copy" size={16} /> Copiar el mensaje para el cliente
          </button>
          {url && (
            <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={16} /> Abrir la encuesta<span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          )}
        </div>
      </header>

      <div aria-live="polite">
        {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "notice notice-error"}>{aviso.texto}</p>}
      </div>
      {copia && <textarea className="textarea" readOnly rows={copia.includes("\n") ? 5 : 1} value={copia} aria-label="Texto para copiar" onFocus={(e) => e.target.select()} />}
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {!datos && !fallo && <p role="status" className="hint">Cargando las respuestas…</p>}

      {res && (
        <p className="kw-resumen">
          {res.total === 0 ? "Todavía no hay respuestas." : (
            <>
              <strong>{res.total === 1 ? "1 respuesta" : `${res.total} respuestas`}</strong>
              {` · ${res.conPermiso} con permiso para testimonio · ${res.sinLlevar === 1 ? "1 nueva" : `${res.sinLlevar} nuevas`}`}
              {res.recomiendan.si + res.recomiendan["tal-vez"] + res.recomiendan.no > 0 && ` · Recomendarían: ${res.recomiendan.si} sí, ${res.recomiendan["tal-vez"]} tal vez, ${res.recomiendan.no} no`}
            </>
          )}
        </p>
      )}

      {!lectura && res?.total > 0 && !propuesta && (
        <div className="kw-botones">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => llevar(false)} disabled={Boolean(ocupado) || !res.sinLlevar}>
            <Icon name="sparkles" size={16} /> {ocupado === "llevar" ? "Leyendo las respuestas…" : `Llevar al estudio${res.sinLlevar ? ` (${res.sinLlevar} ${res.sinLlevar === 1 ? "nueva" : "nuevas"})` : ""}`}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => llevar(true)} disabled={Boolean(ocupado)}>
            Leerlas todas otra vez
          </button>
        </div>
      )}

      {propuesta && (
        <div className="kw-bloque" role="group" aria-labelledby={`${ids}-p`}>
          <h4 id={`${ids}-p`}>Lo que propone la IA para el estudio</h4>
          <p className="hint" style={{ marginTop: 0 }}>
            Marca lo que se queda. Va al {propuesta.enBorrador ? "borrador del estudio que ya estás revisando" : "borrador del estudio (se crea desde el aprobado)"}: nada cambia lo que usa la IA hasta que lo apruebes.
          </p>
          <PropuestaVoz propuesta={propuesta} marcas={marcas} onMarcar={(k, v) => setMarcas((m) => ({ ...m, [k]: v }))} />
          <div className="kw-botones">
            <button type="button" className="btn btn-primary btn-sm" onClick={aceptar} disabled={Boolean(ocupado) || !marcadas}>
              <Icon name="check" size={16} /> {ocupado === "aceptar" ? "Añadiendo…" : `Añadir ${marcadas === 1 ? "lo marcado (1)" : `lo marcado (${marcadas})`} al estudio`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPropuesta(null)} disabled={Boolean(ocupado)}>Descartar</button>
          </div>
        </div>
      )}

      {respuestas.length > 0 && (
        <>
          <ul className="kw-respuestas" aria-label="Las respuestas, las más nuevas primero">
            {visibles.map((r) => <Respuesta key={r.id} r={r} producto={productos.get(r.producto) ?? ""} lectura={lectura} onQuitar={quitar} />)}
          </ul>
          {respuestas.length > MAX_VISIBLES && (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={verTodas} onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? "Ver menos" : `Ver las ${respuestas.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
