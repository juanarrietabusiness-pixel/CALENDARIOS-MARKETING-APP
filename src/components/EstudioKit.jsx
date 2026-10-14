import { useId, useState } from "react";
import Icon from "./Icon";
import { TIPOS_PRESET, MAX_PROPIOS, MAX_REFS_PRESET, limpiarKit, kitVacio, textoPreset, fundirKit, bloqueDeMarca } from "../lib/kitMarca";

// ============================================================
// El kit de marca del cliente, en el Estudio
//
// Lo que en Flow era un texto por marca, aquí: la paleta con el papel de
// cada color, la tipografía, el estilo, la luz, lo que nunca sale, el logo
// original (va de referencia en cada imagen) —todo eso va en CADA pieza— y
// un preset por tipo de contenido del calendario, más los propios del
// cliente: qué clase de pieza es.
//
// «Preparar con IA» lee el CEREBRO del cliente y PROPONE: no se guarda
// nada hasta pulsar «Guardar este kit». Cada campo se puede corregir a mano.
//
// Cada tipo (y cada propio) puede llevar hasta dos imágenes de la galería
// como REFERENCIA VISUAL: enseñan el estilo de ese tipo de pieza mejor que
// cualquier párrafo, y van con cada pedido de ese tipo.
// ============================================================

/** Hasta dos imágenes de la galería como referencia visual de un tipo de pieza. */
function RefsDeTipo({ ids, id, nombre, claves = [], archivos = [], onCambiar }) {
  const imagenes = archivos.filter((a) => a.tipo === "imagen").slice(0, 36);
  const puestas = claves.map((c) => archivos.find((a) => a.clave === c) ?? { clave: c, src: `/api/media/${c}`, id: c });
  const alternar = (clave) => onCambiar(claves.includes(clave) ? claves.filter((c) => c !== clave) : [...claves, clave].slice(-MAX_REFS_PRESET));
  return (
    <div className="est-kit-refs">
      <span className="hint">Referencia visual:</span>
      {puestas.map((a) => (
        <span key={a.clave} className="est-ref">
          <img src={a.src} alt="" />
          <button type="button" className="btn-icon est-ref-quitar" aria-label={`Quitar la referencia de «${nombre}»`} onClick={() => alternar(a.clave)}><Icon name="close" size={14} /></button>
        </span>
      ))}
      {imagenes.length > 0 ? (
        <details className="est-kit-refs-escoger">
          <summary>{puestas.length ? "Cambiar" : "Escoger de la galería"} (hasta {MAX_REFS_PRESET})</summary>
          <div className="est-kit-refs-rejilla" role="group" aria-label={`Referencias de «${nombre}»`}>
            {imagenes.map((a) => (
              <button key={a.id} type="button" className="est-kit-refs-opcion" aria-pressed={claves.includes(a.clave)} aria-label={`${claves.includes(a.clave) ? "Quitar" : "Usar"}: ${a.prompt || "imagen"}`} onClick={() => alternar(a.clave)} id={`${ids}-r-${id}-${a.id}`}>
                <img src={a.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </details>
      ) : !puestas.length && <span className="hint">Sube o crea imágenes en la galería para usarlas aquí.</span>}
    </div>
  );
}

const PALETA_VACIA = () => ({ hex: "#", nombre: "", rol: "" });
const PROPIO_VACIO = () => ({ id: `propio-${Date.now().toString(36)}`, nombre: "", texto: "" });

export default function EstudioKit({ client, kit: guardado, archivos = [], lectura = false, onGuardar, onPreparar }) {
  const ids = useId();
  const kit = limpiarKit(guardado);
  const vacio = kitVacio(kit);
  const [abierto, setAbierto] = useState(vacio);
  const [editando, setEditando] = useState(null); // el borrador, o null
  const [propuesta, setPropuesta] = useState(null); // { kit, dudas, conCerebro }
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const logo = archivos.find((a) => a.clave === kit.logo);
  const marca = { marca: client.name, rubro: client.industry ?? "" };

  const preparar = async () => {
    setOcupado("preparar");
    setError("");
    try {
      const r = await onPreparar();
      setPropuesta(r);
      setAbierto(true);
    } catch (e) {
      setError(e.message);
    }
    setOcupado("");
  };

  const guardar = async (nuevo) => {
    setOcupado("guardar");
    setError("");
    try {
      await onGuardar({ ...nuevo, logo: nuevo.logo || kit.logo });
      setPropuesta(null);
      setEditando(null);
    } catch (e) {
      setError(e.message);
    }
    setOcupado("");
  };

  const borrador = editando;
  const cambiar = (campo, valor) => setEditando((b) => ({ ...b, [campo]: valor }));
  const cambiarColor = (i, campo, valor) => setEditando((b) => ({ ...b, paleta: b.paleta.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)) }));

  return (
    <section className="card est-kit" aria-labelledby={`${ids}-t`}>
      <div className="est-kit-cabecera">
        <button type="button" className="est-kit-titulo" aria-expanded={abierto} aria-controls={`${ids}-c`} onClick={() => setAbierto((v) => !v)}>
          <Icon name={abierto ? "chevronDown" : "chevronRight"} size={16} />
          <span id={`${ids}-t`}>Kit de marca</span>
          {!vacio && (
            <span className="est-kit-muestras" aria-hidden="true">
              {kit.paleta.map((c) => <span key={c.hex} className="est-kit-muestra" style={{ background: c.hex }} />)}
            </span>
          )}
          <span className="est-kit-estado">{vacio ? "Sin preparar" : kit.preparadoAt ? "Preparado desde el cerebro" : "Escrito a mano"}</span>
        </button>
        {!lectura && (
          <div className="est-kit-acciones">
            <button type="button" className="btn btn-secondary btn-sm" onClick={preparar} disabled={Boolean(ocupado)}>
              <Icon name="brain" size={14} /> {ocupado === "preparar" ? "Leyendo el cerebro…" : vacio ? "Preparar con IA" : "Volver a preparar"}
            </button>
            {!vacio && !editando && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditando({ ...kit, paleta: [...kit.paleta], propios: [...kit.propios] }); setAbierto(true); }}>
                <Icon name="pencil" size={14} /> Editar
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert" className="notice notice-error">{error}</p>}

      {abierto && (
        <div id={`${ids}-c`} className="est-kit-cuerpo">
          {propuesta && (
            <div className="est-kit-propuesta" role="status">
              <p className="est-kit-propuesta-titulo">
                <Icon name="sparkles" size={14} /> Propuesta de la IA {propuesta.conCerebro ? "a partir del cerebro" : "(el cerebro no tenía guía visual: revisa con cuidado)"}
              </p>
              {propuesta.dudas && <p className="hint">Dudas: {propuesta.dudas}</p>}
              <VistaKit kit={propuesta.kit} marca={marca} />
              <div className="est-kit-botones">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar(fundirKit(kit, propuesta.kit))} disabled={Boolean(ocupado)}>
                  <Icon name="check" size={14} /> {ocupado === "guardar" ? "Guardando…" : "Guardar este kit"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditando(fundirKit(kit, propuesta.kit)); setPropuesta(null); }}>Corregir antes</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPropuesta(null)}>Descartar</button>
              </div>
            </div>
          )}

          {!propuesta && !borrador && (
            vacio
              ? <p className="hint">Prepáralo con la IA desde el cerebro de {client.name}, o escríbelo a mano. Con el kit, cada idea sale con la paleta, el estilo y el logo de la marca.</p>
              : <VistaKit kit={kit} marca={marca} logo={logo} />
          )}

          {!propuesta && !borrador && vacio && !lectura && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando({ ...kit, paleta: [PALETA_VACIA()], propios: [] })}>
              <Icon name="pencil" size={14} /> Escribirlo a mano
            </button>
          )}

          {borrador && (
            <form className="est-kit-form" onSubmit={(e) => { e.preventDefault(); guardar(borrador); }}>
              <fieldset className="est-kit-paleta">
                <legend className="label">Paleta (con el papel de cada color)</legend>
                {borrador.paleta.map((c, i) => (
                  <div key={i} className="est-kit-color">
                    <label className="sr-only" htmlFor={`${ids}-hex-${i}`}>Color {i + 1}</label>
                    <input type="color" aria-label={`Elegir el color ${i + 1}`} value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#000000"} onChange={(e) => cambiarColor(i, "hex", e.target.value.toUpperCase())} />
                    <input id={`${ids}-hex-${i}`} className="input" value={c.hex} onChange={(e) => cambiarColor(i, "hex", e.target.value)} placeholder="#1B3246" style={{ maxWidth: 110 }} />
                    <input className="input" aria-label={`Nombre del color ${i + 1}`} value={c.nombre} onChange={(e) => cambiarColor(i, "nombre", e.target.value)} placeholder="azul profundo" />
                    <input className="input" aria-label={`Papel del color ${i + 1}`} value={c.rol} onChange={(e) => cambiarColor(i, "rol", e.target.value)} placeholder="estructura / tipografía" />
                    <button type="button" className="btn-icon" aria-label={`Quitar el color ${i + 1}`} onClick={() => cambiar("paleta", borrador.paleta.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                  </div>
                ))}
                {borrador.paleta.length < 8 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar("paleta", [...borrador.paleta, PALETA_VACIA()])}><Icon name="plus" size={14} /> Añadir color</button>
                )}
              </fieldset>
              {[["tipografia", "Tipografía", "Montserrat"], ["estilo", "Estilo", "limpio, cálido, suave y confiable"], ["luz", "Luz", "natural difusa"], ["evitar", "Nunca", "Sin colores fuera de la paleta, sin elementos recargados"]].map(([campo, nombre, ejemplo]) => (
                <div key={campo} className="field">
                  <label className="label" htmlFor={`${ids}-${campo}`}>{nombre}</label>
                  <input id={`${ids}-${campo}`} className="input" value={borrador[campo] ?? ""} onChange={(e) => cambiar(campo, e.target.value)} placeholder={ejemplo} />
                </div>
              ))}
              <p className="hint">Lo de arriba (colores, tipografía, estilo, luz, «nunca») va en TODA pieza. Los presets dicen qué clase de pieza es, según su tipo de contenido.</p>
              {Object.entries(TIPOS_PRESET).map(([tipo, def]) => (
                <div key={tipo} className="field">
                  <label className="label" htmlFor={`${ids}-p-${tipo}`}>Preset «{def.nombre}»</label>
                  <textarea
                    id={`${ids}-p-${tipo}`} className="input" rows={3}
                    value={borrador.presets?.[tipo] ?? ""}
                    onChange={(e) => cambiar("presets", { ...borrador.presets, [tipo]: e.target.value })}
                    placeholder={textoPreset({ ...borrador, presets: {} }, tipo, marca)}
                  />
                  <p className="hint">
                    {def.ayuda} Vacío: se usa la plantilla del tipo. Di para qué es y el tono, no la composición: eso lo decide cada escena.
                    {def.subtipos ? ` Cada una (${Object.values(def.subtipos).map((x) => x.nombre).join(", ")}) le suma su línea.` : ""}
                  </p>
                  <RefsDeTipo ids={ids} id={tipo} nombre={def.nombre} archivos={archivos} claves={borrador.referencias?.[tipo] ?? []}
                    onCambiar={(l) => cambiar("referencias", { ...(borrador.referencias ?? {}), [tipo]: l })} />
                </div>
              ))}
              <fieldset className="est-kit-propios">
                <legend className="label">Presets y estilos propios de {client.name}</legend>
                {(borrador.propios ?? []).map((p, i) => (
                  <div key={p.id} className="est-kit-propio">
                    <input className="input" aria-label={`Nombre del preset propio ${i + 1}`} value={p.nombre} maxLength={40} placeholder="Corporativo"
                      onChange={(e) => cambiar("propios", borrador.propios.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
                    <textarea className="input" rows={2} aria-label={`Qué clase de pieza es «${p.nombre || `preset ${i + 1}`}»`} value={p.texto}
                      placeholder="Fotografía corporativa: personas reales, instalaciones u oficio, tono sobrio y confiable…"
                      onChange={(e) => cambiar("propios", borrador.propios.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                    <button type="button" className="btn-icon" aria-label={`Quitar el preset ${p.nombre || i + 1}`} onClick={() => cambiar("propios", borrador.propios.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                    <RefsDeTipo ids={ids} id={p.id} nombre={p.nombre || `preset ${i + 1}`} archivos={archivos} claves={borrador.referencias?.[p.id] ?? []}
                      onCambiar={(l) => cambiar("referencias", { ...(borrador.referencias ?? {}), [p.id]: l })} />
                  </div>
                ))}
                {(borrador.propios ?? []).length < MAX_PROPIOS && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar("propios", [...(borrador.propios ?? []), PROPIO_VACIO()])}><Icon name="plus" size={14} /> Añadir un preset propio</button>
                )}
                <p className="hint">Para lo que no encaje en los tipos del calendario, o para ESTILOS propios (Navidad, minimalista, foto de estudio…): el texto dice el estilo y la referencia lo enseña. Uno sin nombre o sin texto no se guarda.</p>
              </fieldset>
              <p className="hint">El logo se escoge en la galería: abre una imagen y pulsa «Usar como logo».</p>
              <div className="est-kit-botones">
                <button type="submit" className="btn btn-primary btn-sm" disabled={Boolean(ocupado)}>{ocupado === "guardar" ? "Guardando…" : "Guardar el kit"}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

/** El kit tal cual, para mirar: colores, tipografía, estilo, logo y los presets. */
function VistaKit({ kit: k, marca, logo = null }) {
  const kit = limpiarKit(k);
  return (
    <div className="est-kit-vista">
      {kit.paleta.length > 0 && (
        <ul className="est-kit-colores" aria-label="Paleta">
          {kit.paleta.map((c) => (
            <li key={c.hex}>
              <span className="est-kit-muestra est-kit-muestra-grande" style={{ background: c.hex }} aria-hidden="true" />
              <span><strong>{c.nombre || c.hex}</strong> {c.nombre && <code>{c.hex}</code>}{c.rol && <span className="hint"> · {c.rol}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="est-kit-datos">
        {kit.tipografia && <div><dt>Tipografía</dt><dd>{kit.tipografia}</dd></div>}
        {kit.estilo && <div><dt>Estilo</dt><dd>{kit.estilo}</dd></div>}
        {kit.luz && <div><dt>Luz</dt><dd>{kit.luz}</dd></div>}
        {kit.evitar && <div><dt>Nunca</dt><dd>{kit.evitar}</dd></div>}
        {kit.aprendido.length > 0 && (
          <div>
            <dt>Aprendido</dt>
            <dd>
              {kit.aprendido.map((r) => `${r.tipo === "evitar" ? "Evitar: " : ""}${r.texto}`).join(" · ")}
              <span className="hint"> (de tus «Me gusta»; se cambia en Cerebro → Lo que aprende)</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Logo</dt>
          <dd>{logo ? <img src={logo.src} alt="Logo de la marca" className="est-kit-logo" /> : kit.logo ? "Guardado" : "Sin escoger: abre una imagen de la galería y pulsa «Usar como logo»."}</dd>
        </div>
      </dl>
      <details className="est-kit-presets">
        <summary>Ver lo que va en cada pieza y los presets</summary>
        {bloqueDeMarca(kit) && <p><strong>En toda pieza:</strong> {bloqueDeMarca(kit)}</p>}
        {Object.entries(TIPOS_PRESET).map(([tipo, def]) => (
          <p key={tipo}>
            <strong>{def.nombre}:</strong> {textoPreset(kit, tipo, marca)}{kit.presets[tipo] ? "" : <span className="hint"> (plantilla)</span>}
            {kit.referencias[tipo] && <span className="hint"> · con {kit.referencias[tipo].length === 1 ? "1 imagen" : `${kit.referencias[tipo].length} imágenes`} de referencia</span>}
          </p>
        ))}
        {kit.propios.map((p) => <p key={p.id}><strong>{p.nombre} (propio):</strong> {p.texto}</p>)}
      </details>
    </div>
  );
}
