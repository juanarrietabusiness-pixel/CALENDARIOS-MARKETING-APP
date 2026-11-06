import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import VozDelCliente from "./VozDelCliente";
import { leerKitWhatsApp, guardarKitWhatsApp, proponerKitWhatsApp } from "../../lib/whatsappApi";
import {
  limpiarKitWhatsApp, kitVacio, avisosDelKit, pendientesDelKit, bloquesEditados, fundirKitWhatsApp, kitATexto, guionATexto,
  respuestaATexto, etiquetaATexto, limpiarAtajo, LIMITES_KIT, MAX_RESPUESTAS, MAX_ETIQUETAS, RESPUESTAS_BASE,
} from "../../lib/kitWhatsApp";
import { ETAPAS_CICLO } from "../../lib/cicloVentas";
import { lsGet, lsSet } from "../../utils";
import "./KitWhatsApp.css";

// ============================================================
// Marca → «WhatsApp» (curso de campañas, entrega 8)
//
// El KIT DE WHATSAPP BUSINESS del cliente (src/lib/kitWhatsApp.js): bienvenida, ausencia, respuestas rápidas con su
// atajo, etiquetas por etapa del ciclo y un guion de ventas por producto, cada bloque con «Copiar» y todo junto con
// «Copiar todo». La IA lo PROPONE con el estudio de mercado, el catálogo y la voz de la marca; nada se guarda hasta
// «Guardar», y lo que se toca a mano queda marcado: «Volver a proponer» pregunta antes de pisarlo.
//
// Lo propuesto y no guardado se recuerda en ESTE navegador (`kit-whatsapp-borrador:<cliente>`, 7 días): la propuesta
// se pagó, y cerrar la pestaña no debería perderla. Es una comodidad: lo que vale es lo guardado.
//
// Debajo, «La voz de tus clientes» (VozDelCliente.jsx): la encuesta por enlace y «Llevar al estudio».
// ============================================================

const DIAS_BORRADOR = 7;
const claveBorrador = (clientId) => `kit-whatsapp-borrador:${clientId}`;
/** Lo que cuenta para saber si hay cambios: el kit limpio, sin fechas ni quién. */
const firma = (k) => {
  const { actualizado: _a, por: _p, propuestoAt: _q, ...resto } = limpiarKitWhatsApp(k ?? {});
  return JSON.stringify(resto);
};
const lineas = (v) => (Array.isArray(v) ? v.join("\n") : "");
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

function leerBorrador(clientId) {
  try {
    const b = JSON.parse(lsGet(claveBorrador(clientId)) ?? "null");
    if (!b || Date.now() - Number(b.at) > DIAS_BORRADOR * 86_400_000) return null;
    return b;
  } catch {
    return null;
  }
}
function guardarBorradorLocal(clientId, kit, base) {
  try {
    if (kit) lsSet(claveBorrador(clientId), JSON.stringify({ kit, base: base ?? null, at: Date.now() }));
    else localStorage.removeItem(claveBorrador(clientId));
  } catch { /* sin almacenamiento: sólo se pierde la comodidad */ }
}

/** «Copiar» de un bloque: al portapapeles; si el navegador no deja, `onFallo` enseña el texto para copiarlo a mano. */
function BotonCopiar({ texto, etiqueta = "Copiar", onFallo, quien = "" }) {
  const [hecho, setHecho] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setHecho(true);
      setTimeout(() => setHecho(false), 1800);
    } catch {
      onFallo?.(texto);
    }
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copiar} disabled={!String(texto ?? "").trim()}>
      <Icon name={hecho ? "check" : "copy"} size={14} /> {hecho ? "Copiado" : etiqueta}{quien && <span className="sr-only"> {quien}</span>}
    </button>
  );
}

/** Un texto del kit (bienvenida, respuesta, parte del guion) con su etiqueta. */
function Texto({ etiqueta, valor, onCambio, max = LIMITES_KIT.respuesta, filas = 3, lectura, ayuda = "" }) {
  const id = useId();
  return (
    <div className="kw-campo">
      <label className="label" htmlFor={id}>{etiqueta}</label>
      <textarea id={id} className="textarea" rows={filas} maxLength={max} value={valor ?? ""} readOnly={lectura}
        aria-describedby={ayuda ? `${id}-a` : undefined} onChange={(e) => onCambio(e.target.value)} />
      {ayuda && <p id={`${id}-a`} className="hint">{ayuda}</p>}
    </div>
  );
}

/** Una respuesta rápida: el atajo, su título y el texto. */
function RespuestaRapida({ r, lectura, onCambio, onQuitar, onFallo }) {
  const id = useId();
  return (
    <li className="kw-item">
      <div className="kw-fila">
        <div className="kw-campo kw-atajo">
          <label className="label" htmlFor={`${id}-a`}>Atajo</label>
          <span className="kw-atajo-caja"><span aria-hidden="true">/</span>
            <input id={`${id}-a`} className="input" value={r.atajo} maxLength={LIMITES_KIT.atajo} readOnly={lectura}
              onChange={(e) => onCambio({ atajo: limpiarAtajo(e.target.value) })} />
          </span>
        </div>
        <div className="kw-campo kw-crece">
          <label className="label" htmlFor={`${id}-t`}>Para qué es</label>
          <input id={`${id}-t`} className="input" value={r.titulo} maxLength={LIMITES_KIT.titulo} readOnly={lectura} onChange={(e) => onCambio({ titulo: e.target.value })} />
        </div>
      </div>
      <Texto etiqueta={`Mensaje de /${r.atajo || "…"}`} valor={r.texto} onCambio={(texto) => onCambio({ texto })} lectura={lectura} filas={4} />
      <div className="kw-acciones">
        {r.objecion && <span className="kw-sello">Responde una objeción</span>}
        {r.editado && <span className="kw-sello" data-tipo="editado">Editado a mano</span>}
        <BotonCopiar texto={r.texto} quien={`la respuesta /${r.atajo}`} onFallo={onFallo} />
        {!lectura && <button type="button" className="btn btn-ghost btn-sm" onClick={onQuitar}><Icon name="trash" size={14} /> Quitar<span className="sr-only"> /{r.atajo}</span></button>}
      </div>
    </li>
  );
}

/** Una etiqueta: su nombre, su etapa del ciclo y cuándo se pone. */
function Etiqueta({ t, lectura, onCambio, onQuitar }) {
  const id = useId();
  return (
    <li className="kw-item kw-fila">
      <div className="kw-campo">
        <label className="label" htmlFor={`${id}-n`}>Etiqueta</label>
        <input id={`${id}-n`} className="input" value={t.nombre} maxLength={LIMITES_KIT.etiqueta} readOnly={lectura} onChange={(e) => onCambio({ nombre: e.target.value })} />
      </div>
      <div className="kw-campo">
        <label className="label" htmlFor={`${id}-e`}>Etapa del ciclo</label>
        <select id={`${id}-e`} className="input" value={t.etapa ?? ""} disabled={lectura} onChange={(e) => onCambio({ etapa: e.target.value })}>
          <option value="">Sin etapa</option>
          {ETAPAS_CICLO.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </div>
      <div className="kw-campo kw-crece">
        <label className="label" htmlFor={`${id}-c`}>Cuándo se pone</label>
        <input id={`${id}-c`} className="input" value={t.cuando ?? ""} maxLength={LIMITES_KIT.cuando} readOnly={lectura} onChange={(e) => onCambio({ cuando: e.target.value })} />
      </div>
      {!lectura && <button type="button" className="btn btn-ghost btn-sm kw-quitar" onClick={onQuitar}><Icon name="trash" size={14} /> Quitar<span className="sr-only"> la etiqueta {t.nombre}</span></button>}
    </li>
  );
}

/** El guion de ventas de un producto, plegado. */
function Guion({ g, lectura, onCambio, onFallo }) {
  const id = useId();
  const objeciones = g.objeciones ?? [];
  const cambiarObjecion = (i, cambio) => onCambio({ objeciones: objeciones.map((o, j) => (j === i ? { ...o, ...cambio } : o)) });
  return (
    <details className="kw-guion">
      <summary>
        <span><strong>{g.producto || "Producto"}</strong>{g.editado && <span className="kw-sello" data-tipo="editado">Editado a mano</span>}</span>
        <Icon name="chevronDown" size={18} />
      </summary>
      <div className="kw-guion-cuerpo">
        <Texto etiqueta="1. Saludo" valor={g.saludo} onCambio={(saludo) => onCambio({ saludo })} lectura={lectura} filas={2} max={LIMITES_KIT.linea} />
        <Texto etiqueta="2. Preguntas para saber qué necesita (una por línea)" valor={lineas(g.preguntas)} onCambio={(t) => onCambio({ preguntas: t.split("\n") })} lectura={lectura} filas={3} max={1200}
          ayuda="Lo que separa a quien compra de quien curiosea: qué necesita, para cuándo, para quién." />
        <Texto etiqueta="3. Presentación (con su diferencial)" valor={g.presentacion} onCambio={(presentacion) => onCambio({ presentacion })} lectura={lectura} max={LIMITES_KIT.linea} />
        <fieldset className="kw-objeciones">
          <legend className="label">4. Si pone un «pero»</legend>
          {objeciones.map((o, i) => (
            <div key={i} className="kw-objecion">
              <div className="kw-campo">
                <label className="label" htmlFor={`${id}-o${i}`}>Objeción</label>
                <input id={`${id}-o${i}`} className="input" value={o.objecion} maxLength={200} readOnly={lectura} onChange={(e) => cambiarObjecion(i, { objecion: e.target.value })} />
              </div>
              <Texto etiqueta="Respuesta" valor={o.respuesta} onCambio={(respuesta) => cambiarObjecion(i, { respuesta })} lectura={lectura} filas={2} max={500} />
              {!lectura && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambio({ objeciones: objeciones.filter((_, j) => j !== i) })}><Icon name="trash" size={14} /> Quitar<span className="sr-only"> la objeción {o.objecion}</span></button>}
            </div>
          ))}
          {!lectura && objeciones.length < 6 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambio({ objeciones: [...objeciones, { objecion: "", respuesta: "" }] })}><Icon name="plus" size={14} /> Añadir una objeción</button>
          )}
        </fieldset>
        <Texto etiqueta="5. Cierre (con la oferta y el precio del catálogo)" valor={g.cierre} onCambio={(cierre) => onCambio({ cierre })} lectura={lectura} max={LIMITES_KIT.linea} />
        <Texto etiqueta="6. Si no contesta (un mensaje por línea)" valor={lineas(g.seguimiento)} onCambio={(t) => onCambio({ seguimiento: t.split("\n") })} lectura={lectura} filas={3} max={2100} />
        <div className="kw-acciones"><BotonCopiar texto={guionATexto(limpiarKitWhatsApp({ guiones: [g] }).guiones[0])} etiqueta="Copiar el guion" quien={`de ${g.producto}`} onFallo={onFallo} /></div>
      </div>
    </details>
  );
}

export default function KitWhatsApp({ client, lectura = false }) {
  const ids = useId();
  const [kit, setKit] = useState(null); // lo que se edita
  const [guardado, setGuardado] = useState(null); // lo último guardado (o null)
  const [contexto, setContexto] = useState({ productos: [], hayGarantia: false, conEstudio: false });
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState(null);
  const [avisoIA, setAvisoIA] = useState([]);
  const [ocupado, setOcupado] = useState("");
  const [pregunta, setPregunta] = useState(null); // { propuesto } cuando hay bloques editados
  const [conflicto, setConflicto] = useState(null);
  const [remoto, setRemoto] = useState(false);
  const [copia, setCopia] = useState("");
  const [recuperado, setRecuperado] = useState(false);
  // Al preguntar qué hacer con lo editado, el foco va a la primera opción (si no, se quedaba en un botón deshabilitado).
  const primeraOpcion = useRef(null);
  useEffect(() => { if (pregunta) primeraOpcion.current?.focus(); }, [pregunta]);

  const cargar = useCallback(async ({ conBorrador = false } = {}) => {
    try {
      const d = await leerKitWhatsApp(client.id);
      const g = kitVacio(d.kit) ? null : d.kit;
      setGuardado(g);
      setContexto(d.contexto ?? { productos: [], hayGarantia: false });
      const b = conBorrador ? leerBorrador(client.id) : null;
      if (b && (b.base ?? null) === (g?.actualizado ?? null) && firma(b.kit) !== firma(g)) {
        setKit(b.kit);
        setRecuperado(true);
      } else {
        setKit(g ?? limpiarKitWhatsApp({}));
        setRecuperado(false);
        if (conBorrador) guardarBorradorLocal(client.id, null);
      }
      setRemoto(false);
      setFallo("");
    } catch (e) {
      setFallo(e.message || "No se pudo leer el kit.");
    }
  }, [client.id]);
  useEffect(() => { void cargar({ conBorrador: true }); }, [cargar]);

  const sucio = kit != null && firma(kit) !== firma(guardado);
  // Lo no guardado, a este navegador (cada cambio): cerrar la pestaña no pierde una propuesta pagada.
  useEffect(() => {
    if (kit == null) return;
    guardarBorradorLocal(client.id, sucio ? kit : null, guardado?.actualizado ?? null);
  }, [kit, sucio, guardado, client.id]);

  // Otra persona guardó el kit: se relee si no hay cambios a medias; si los hay, se avisa y no se pisa.
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  useEffect(() => {
    const alCambiar = (ev) => {
      if (ev.detail?.clientId !== client.id || ev.detail?.que !== "kit") return;
      if (sucioRef.current) setRemoto(true);
      else void cargar();
    };
    window.addEventListener("whatsapp", alCambiar);
    return () => window.removeEventListener("whatsapp", alCambiar);
  }, [client.id, cargar]);

  const avisos = useMemo(() => (kit ? avisosDelKit(kit, contexto) : []), [kit, contexto]);
  const pendientes = useMemo(() => (kit ? pendientesDelKit(kit) : []), [kit]);

  /** Un cambio a mano: el bloque queda `editado` (así «Volver a proponer» no lo pisa sin preguntar). */
  const cambiar = (fn) => setKit((k) => fn(structuredClone(k)));
  const cambiarMensaje = (campo) => (texto) => cambiar((k) => ({ ...k, [campo]: { texto, editado: true } }));
  const cambiarEn = (lista, i) => (cambio) => cambiar((k) => ({ ...k, [lista]: k[lista].map((x, j) => (j === i ? { ...x, ...cambio, editado: true } : x)) }));
  const quitarDe = (lista, i) => () => cambiar((k) => ({ ...k, [lista]: k[lista].filter((_, j) => j !== i) }));

  async function proponer() {
    setOcupado("proponer");
    setAviso(null);
    try {
      const r = await proponerKitWhatsApp(client.id);
      setAvisoIA([r.aviso, ...(r.avisos ?? [])].filter(Boolean));
      if (bloquesEditados(kit) > 0) setPregunta({ propuesto: r.kit });
      else {
        setKit(fundirKitWhatsApp(kit, r.kit, { pisarEditado: true }));
        setAviso({ ok: true, texto: "Propuesta lista: revísala, corrige lo que haga falta y pulsa «Guardar». Todavía no está guardada." });
      }
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setOcupado("");
  }

  function aplicarPropuesta(pisarEditado) {
    setKit(fundirKitWhatsApp(kit, pregunta.propuesto, { pisarEditado }));
    setPregunta(null);
    setAviso({ ok: true, texto: pisarEditado ? "Reemplazado todo por la propuesta nueva. Todavía no está guardado." : "Propuesta nueva puesta, salvo lo que editaste a mano. Todavía no está guardado." });
  }

  async function guardar(antes = guardado?.actualizado ?? null) {
    setOcupado("guardar");
    setAviso(null);
    try {
      const r = await guardarKitWhatsApp(client.id, limpiarKitWhatsApp(kit), antes);
      setGuardado(r.kit);
      setKit(r.kit);
      setConflicto(null);
      setRemoto(false);
      setRecuperado(false);
      guardarBorradorLocal(client.id, null);
      setAviso({ ok: true, texto: "Kit guardado: el equipo lo ve igual y el asistente lo puede leer." });
    } catch (e) {
      if (e.estado === 409 && e.datos?.kit) setConflicto(e.datos.kit);
      setAviso({ ok: false, texto: e.message });
    }
    setOcupado("");
  }

  function descartar() {
    setKit(guardado ?? limpiarKitWhatsApp({}));
    setRecuperado(false);
    guardarBorradorLocal(client.id, null);
  }

  if (fallo && !kit) {
    return (
      <div className="notice notice-error notice-action" role="alert">
        <span>{fallo}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void cargar({ conBorrador: true })}>Reintentar</button>
      </div>
    );
  }
  if (!kit) return <p role="status" className="hint">Cargando el kit de WhatsApp…</p>;

  const vacio = kitVacio(kit);
  const editados = bloquesEditados(kit);
  const textoTodo = kitATexto(kit, { marca: client.name });

  return (
    <div className="kw">
      <section className="card" aria-labelledby={`${ids}-t`}>
        <header className="kw-cabecera">
          <div>
            <h3 id={`${ids}-t`}>Kit de WhatsApp Business</h3>
            <p className="hint">
              Lo que el equipo de {client.name} pega en su WhatsApp Business: el mensaje de bienvenida y el de ausencia, las
              respuestas rápidas (con las objeciones del estudio de mercado), las etiquetas de cada etapa del ciclo de ventas
              y un guion de ventas por producto. Los precios salen del catálogo, exactos. La IA lo propone; nada se guarda
              hasta «Guardar».
            </p>
          </div>
          <div className="kw-botones">
            {!lectura && (
              <button type="button" className="btn btn-accent btn-sm" onClick={proponer} disabled={Boolean(ocupado)}>
                <Icon name="sparkles" size={16} /> {ocupado === "proponer" ? "Preparando el kit…" : vacio ? "Proponer con IA" : "Volver a proponer"}
              </button>
            )}
            {!lectura && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar()} disabled={Boolean(ocupado) || !sucio}>
                <Icon name="check" size={16} /> {ocupado === "guardar" ? "Guardando…" : "Guardar"}
              </button>
            )}
            <BotonCopiar texto={textoTodo} etiqueta="Copiar todo" onFallo={setCopia} />
          </div>
        </header>

        <div className="kw-estado">
          <p role="status">
            {sucio
              ? (recuperado ? "Lo que no se guardó la última vez, recuperado de este navegador." : "Hay cambios sin guardar.")
              : guardado?.actualizado ? `Guardado${guardado.por ? ` por ${guardado.por}` : ""} · ${fechaHora(guardado.actualizado)}` : "Todavía no hay kit guardado."}
          </p>
          {sucio && !lectura && <button type="button" className="btn btn-ghost btn-sm" onClick={descartar}>Descartar los cambios</button>}
        </div>

        <div aria-live="polite">
          {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "notice notice-error"}>{aviso.texto}</p>}
        </div>
        {copia && <textarea className="textarea" readOnly rows={6} value={copia} aria-label="Texto para copiar" onFocus={(e) => e.target.select()} />}

        {pregunta && (
          <div className="notice notice-warn kw-pregunta" role="group" aria-labelledby={`${ids}-q`}>
            <p id={`${ids}-q`} role="status" style={{ margin: 0 }}>
              <strong>Hay {editados === 1 ? "un bloque editado" : `${editados} bloques editados`} a mano.</strong> ¿Qué hago con {editados === 1 ? "él" : "ellos"}?
            </p>
            <div className="kw-botones">
              <button type="button" className="btn btn-primary btn-sm" ref={primeraOpcion} onClick={() => aplicarPropuesta(false)}>Conservar lo editado</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarPropuesta(true)}>Reemplazarlo todo</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPregunta(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {conflicto && (
          <div className="notice notice-warn kw-pregunta" role="alert">
            <span>Otra persona guardó el kit mientras lo editabas.</span>
            <div className="kw-botones">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setKit(conflicto); setGuardado(conflicto); setConflicto(null); }}>Ver lo de ahora (se pierde lo tuyo)</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => guardar(conflicto.actualizado ?? null)}>Guardar lo mío encima</button>
            </div>
          </div>
        )}
        {remoto && !conflicto && (
          <div className="notice notice-warn notice-action" role="status">
            <span>Otra persona guardó el kit. Lo tuyo sigue aquí sin guardar.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void cargar()}>Ver lo de ahora</button>
          </div>
        )}

        {(avisoIA.length > 0 || avisos.length > 0) && (
          <ul className="notice notice-warn kw-avisos" aria-label="Para revisar antes de copiar">
            {[...new Set([...avisoIA, ...avisos])].map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
        {pendientes.length > 0 && (
          <details className="kw-pendientes">
            <summary>Lo que falta rellenar ({pendientes.length})</summary>
            <ul>{pendientes.map((p) => <li key={`${p.donde}|${p.que}`}><strong>{p.donde}:</strong> {p.que}</li>)}</ul>
          </details>
        )}
        {vacio && (
          <p className="hint">
            {contexto.conEstudio
              ? "Con «Proponer con IA», el kit sale del estudio de mercado aprobado (sus objeciones con su respuesta), el catálogo y la voz de la marca."
              : "Todavía no hay estudio de mercado aprobado: el kit saldrá con lo que se sabe de la marca. Con el estudio (Marca → Cerebro), las objeciones salen mejor."}
          </p>
        )}
      </section>

      {!vacio && (
        <>
          <section className="card kw-bloque" aria-labelledby={`${ids}-m`}>
            <h4 id={`${ids}-m`}>Mensajes automáticos</h4>
            <p className="hint">En WhatsApp Business: Herramientas para la empresa → Mensaje de bienvenida y Mensaje de ausencia.</p>
            <Texto etiqueta="Mensaje de bienvenida" valor={kit.bienvenida?.texto} onCambio={cambiarMensaje("bienvenida")} lectura={lectura} max={LIMITES_KIT.mensaje} />
            <div className="kw-acciones"><BotonCopiar texto={kit.bienvenida?.texto} quien="el mensaje de bienvenida" onFallo={setCopia} /></div>
            <Texto etiqueta="Mensaje de ausencia" valor={kit.ausencia?.texto} onCambio={cambiarMensaje("ausencia")} lectura={lectura} max={LIMITES_KIT.mensaje} />
            <div className="kw-acciones"><BotonCopiar texto={kit.ausencia?.texto} quien="el mensaje de ausencia" onFallo={setCopia} /></div>
          </section>

          <section className="card kw-bloque" aria-labelledby={`${ids}-r`}>
            <h4 id={`${ids}-r`}>Respuestas rápidas ({kit.respuestas.length})</h4>
            <p className="hint">En WhatsApp Business: Herramientas para la empresa → Respuestas rápidas. En el chat se escribe «/» y el atajo.</p>
            <ul className="kw-lista">
              {kit.respuestas.map((r, i) => (
                <RespuestaRapida key={i} r={r} lectura={lectura} onCambio={cambiarEn("respuestas", i)} onQuitar={quitarDe("respuestas", i)} onFallo={setCopia} />
              ))}
            </ul>
            <div className="kw-acciones">
              {!lectura && kit.respuestas.length < MAX_RESPUESTAS && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar((k) => {
                  const libre = RESPUESTAS_BASE.find((b) => !k.respuestas.some((r) => r.atajo === b.atajo));
                  return { ...k, respuestas: [...k.respuestas, { atajo: libre?.atajo ?? "", titulo: libre?.titulo ?? "", texto: "", editado: true }] };
                })}><Icon name="plus" size={14} /> Añadir una respuesta</button>
              )}
              <BotonCopiar texto={limpiarKitWhatsApp(kit).respuestas.map(respuestaATexto).join("\n\n")} etiqueta="Copiar todas" quien="las respuestas rápidas" onFallo={setCopia} />
            </div>
          </section>

          <section className="card kw-bloque" aria-labelledby={`${ids}-e`}>
            <h4 id={`${ids}-e`}>Etiquetas</h4>
            <p className="hint">
              En WhatsApp Business: Herramientas para la empresa → Etiquetas. Cada una dice en qué etapa del ciclo va esa
              conversación: así se sabe a quién hacerle seguimiento y, más adelante, con qué público hacer anuncios.
            </p>
            <ul className="kw-lista">
              {kit.etiquetas.map((t, i) => <Etiqueta key={i} t={t} lectura={lectura} onCambio={cambiarEn("etiquetas", i)} onQuitar={quitarDe("etiquetas", i)} />)}
            </ul>
            <div className="kw-acciones">
              {!lectura && kit.etiquetas.length < MAX_ETIQUETAS && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar((k) => ({ ...k, etiquetas: [...k.etiquetas, { nombre: "", etapa: "", cuando: "", editado: true }] }))}>
                  <Icon name="plus" size={14} /> Añadir una etiqueta
                </button>
              )}
              <BotonCopiar texto={limpiarKitWhatsApp(kit).etiquetas.map((t) => `• ${etiquetaATexto(t)}`).join("\n")} etiqueta="Copiar las etiquetas" onFallo={setCopia} />
            </div>
          </section>

          <section className="card kw-bloque" aria-labelledby={`${ids}-g`}>
            <h4 id={`${ids}-g`}>Guiones de ventas ({kit.guiones.length})</h4>
            <p className="hint">Uno por producto: para quien atiende, no para pegar entero. Saludo, preguntas para calificar, presentación, objeciones, cierre y seguimiento.</p>
            {kit.guiones.length
              ? kit.guiones.map((g, i) => <Guion key={g.productoId || i} g={g} lectura={lectura} onCambio={cambiarEn("guiones", i)} onFallo={setCopia} />)
              : <p className="hint">Sin guiones: el catálogo no tiene productos activos.</p>}
          </section>
        </>
      )}

      <VozDelCliente client={client} lectura={lectura} />
    </div>
  );
}
