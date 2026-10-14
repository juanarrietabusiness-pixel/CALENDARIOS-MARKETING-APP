import { useId, useState } from "react";
import Icon from "./Icon";
import {
  TIPOS_PRESET, MAX_PROPIOS, MAX_ESTILOS, MAX_PERSONAJES, MAX_REFS_PRESET, ESTILOS_VISUALES, ESTILO_POR_TIPO, limpiarKit, kitVacio, textoPreset, fundirKit, bloqueDeMarca, nombreDeEstilo,
  MAX_REGLAS,
} from "../lib/kitMarca";
import { MODOS_LOGO, ESQUINAS_LOGO, TAMANO_LOGO, MARGEN_LOGO, posicionDelKit } from "../lib/logoEncima";

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
function RefsDeTipo({ ids, id, nombre, claves = [], archivos = [], onCambiar, titulo = "Referencia visual:" }) {
  const imagenes = archivos.filter((a) => a.tipo === "imagen").slice(0, 36);
  const puestas = claves.map((c) => archivos.find((a) => a.clave === c) ?? { clave: c, src: `/api/media/${c}`, id: c });
  const alternar = (clave) => onCambiar(claves.includes(clave) ? claves.filter((c) => c !== clave) : [...claves, clave].slice(-MAX_REFS_PRESET));
  return (
    <div className="est-kit-refs">
      <span className="hint">{titulo}</span>
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
const ESTILO_VACIO = () => ({ id: `estilo-${Date.now().toString(36)}`, nombre: "", texto: "" });
const PERSONAJE_VACIO = () => ({ id: `personaje-${Date.now().toString(36)}`, nombre: "", descripcion: "", imagenes: [] });

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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditando({ ...kit, paleta: [...kit.paleta], propios: [...kit.propios], estilos: [...kit.estilos], personajes: [...kit.personajes], reglas: [...kit.reglas] }); setAbierto(true); }}>
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando({ ...kit, paleta: [PALETA_VACIA()], propios: [], estilos: [], personajes: [] })}>
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
              <fieldset className="est-kit-propios">
                <legend className="label">Reglas que no se rompen</legend>
                {(borrador.reglas ?? []).map((r, i) => (
                  <div key={i} className="est-kit-regla">
                    <input className="input" aria-label={`Regla ${i + 1}`} value={r} maxLength={160}
                      onChange={(e) => cambiar("reglas", borrador.reglas.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button type="button" className="btn-icon" aria-label={`Quitar la regla ${i + 1}`} onClick={() => cambiar("reglas", borrador.reglas.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                  </div>
                ))}
                {(borrador.reglas ?? []).length < MAX_REGLAS && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar("reglas", [...(borrador.reglas ?? []), ""])}><Icon name="plus" size={14} /> Añadir una regla</button>
                )}
                <p className="hint">Lo que repites en cada pedido: «el texto ocupa como mucho un tercio de la pieza», «el logo siempre abajo a la derecha», «nunca tapar la cara del bebé». Van en TODA pieza y en «Revisar marca». También se guardan desde cualquier corrección con «Guardar como regla».</p>
              </fieldset>
              <fieldset className="est-kit-propios">
                <legend className="label">El logo en las piezas</legend>
                <div className="est-tipos" role="radiogroup" aria-label="Quién pone el logo">
                  {Object.entries(MODOS_LOGO).map(([id, m]) => (
                    <label key={id} className="est-kit-modo-logo">
                      <input type="radio" name={`${ids}-logo-modo`} value={id} checked={(borrador.logoModo ?? "modelo") === id} onChange={() => cambiar("logoModo", id)} />
                      <span><strong>{m.nombre}</strong><span className="hint"> · {m.ayuda}</span></span>
                    </label>
                  ))}
                </div>
                {borrador.logoModo === "estampado" && (
                  <div className="lote-fila">
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-lg-esq`}>Dónde</label>
                      <select id={`${ids}-lg-esq`} className="input" value={borrador.logoPosicion?.esquina ?? "abajo-derecha"}
                        onChange={(e) => cambiar("logoPosicion", { ...posicionDelKit(borrador.logoPosicion), esquina: e.target.value })}>
                        {Object.entries(ESQUINAS_LOGO).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-lg-tam`}>Tamaño: {Math.round(posicionDelKit(borrador.logoPosicion).tamano * 100)} % del ancho</label>
                      <input id={`${ids}-lg-tam`} type="range" min={TAMANO_LOGO.min} max={TAMANO_LOGO.max} step={0.01} value={posicionDelKit(borrador.logoPosicion).tamano}
                        onChange={(e) => cambiar("logoPosicion", { ...posicionDelKit(borrador.logoPosicion), tamano: Number(e.target.value) })} />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-lg-mar`}>Margen: {Math.round(posicionDelKit(borrador.logoPosicion).margen * 100)} %</label>
                      <input id={`${ids}-lg-mar`} type="range" min={MARGEN_LOGO.min} max={MARGEN_LOGO.max} step={0.01} value={posicionDelKit(borrador.logoPosicion).margen}
                        onChange={(e) => cambiar("logoPosicion", { ...posicionDelKit(borrador.logoPosicion), margen: Number(e.target.value) })} />
                    </div>
                  </div>
                )}
              </fieldset>
              <p className="hint">Lo de arriba (colores, tipografía, estilo, luz, «nunca» y las reglas) va en TODA pieza. Cada tipo de pieza dice QUÉ comunica; el estilo visual (abajo), cómo se ve.</p>
              {Object.entries(TIPOS_PRESET).map(([tipo, def]) => (
                <div key={tipo} className="field">
                  <label className="label" htmlFor={`${ids}-p-${tipo}`}>Tipo «{def.nombre}»: qué comunica</label>
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
                <legend className="label">Tipos de pieza propios de {client.name}</legend>
                {(borrador.propios ?? []).map((p, i) => (
                  <div key={p.id} className="est-kit-propio">
                    <input className="input" aria-label={`Nombre del tipo propio ${i + 1}`} value={p.nombre} maxLength={40} placeholder="Feria de muebles"
                      onChange={(e) => cambiar("propios", borrador.propios.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
                    <textarea className="input" rows={2} aria-label={`Qué comunica «${p.nombre || `tipo ${i + 1}`}»`} value={p.texto}
                      placeholder="Pieza para invitar a la feria: fecha, lugar y lo que se va a encontrar; tono festivo…"
                      onChange={(e) => cambiar("propios", borrador.propios.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                    <div className="est-kit-propio-botones">
                      {(borrador.estilos ?? []).length < MAX_ESTILOS && (
                        <button type="button" className="btn btn-ghost btn-sm" title="Si describe cómo se ve y no qué comunica"
                          onClick={() => setEditando((b) => ({ ...b, propios: b.propios.filter((_, j) => j !== i), estilos: [...(b.estilos ?? []), { ...p, id: p.id.replace(/^propio-/, "estilo-") }] }))}>
                          Es un estilo
                        </button>
                      )}
                      <button type="button" className="btn-icon" aria-label={`Quitar el tipo ${p.nombre || i + 1}`} onClick={() => cambiar("propios", borrador.propios.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                    </div>
                    <RefsDeTipo ids={ids} id={p.id} nombre={p.nombre || `tipo ${i + 1}`} archivos={archivos} claves={borrador.referencias?.[p.id] ?? []}
                      onCambiar={(l) => cambiar("referencias", { ...(borrador.referencias ?? {}), [p.id]: l })} />
                  </div>
                ))}
                {(borrador.propios ?? []).length < MAX_PROPIOS && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar("propios", [...(borrador.propios ?? []), PROPIO_VACIO()])}><Icon name="plus" size={14} /> Añadir un tipo propio</button>
                )}
                <p className="hint">Para lo que no encaje en los tipos del calendario: dice QUÉ comunica la pieza. Uno sin nombre o sin texto no se guarda.</p>
              </fieldset>
              <fieldset className="est-kit-propios">
                <legend className="label">Estilos visuales propios de {client.name}</legend>
                {(borrador.estilos ?? []).map((p, i) => (
                  <div key={p.id} className="est-kit-propio">
                    <input className="input" aria-label={`Nombre del estilo propio ${i + 1}`} value={p.nombre} maxLength={40} placeholder="Navidad"
                      onChange={(e) => cambiar("estilos", borrador.estilos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
                    <textarea className="input" rows={2} aria-label={`Cómo se ve «${p.nombre || `estilo ${i + 1}`}»`} value={p.texto}
                      placeholder="Acabado navideño cálido: luces doradas desenfocadas al fondo, tonos rojos y verdes de la paleta, textura de tela…"
                      onChange={(e) => cambiar("estilos", borrador.estilos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                    <button type="button" className="btn-icon" aria-label={`Quitar el estilo ${p.nombre || i + 1}`} onClick={() => cambiar("estilos", borrador.estilos.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                    <RefsDeTipo ids={ids} id={p.id} nombre={p.nombre || `estilo ${i + 1}`} archivos={archivos} claves={borrador.referencias?.[p.id] ?? []}
                      onCambiar={(l) => cambiar("referencias", { ...(borrador.referencias ?? {}), [p.id]: l })} />
                  </div>
                ))}
                {(borrador.estilos ?? []).length < MAX_ESTILOS && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar("estilos", [...(borrador.estilos ?? []), ESTILO_VACIO()])}><Icon name="plus" size={14} /> Añadir un estilo propio</button>
                )}
                <p className="hint">Dice CÓMO se ve (luz, acabado, ambiente) en una o dos frases; la referencia lo enseña. Se escoge en «Estilo visual» junto a los de la casa.</p>
              </fieldset>
              <fieldset className="est-kit-propios">
                <legend className="label">Personajes de {client.name}</legend>
                {(borrador.personajes ?? []).map((p, i) => {
                  const cambiarP = (campo, valor) => cambiar("personajes", borrador.personajes.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
                  return (
                    <div key={p.id} className="est-kit-propio">
                      <input className="input" aria-label={`Nombre del personaje ${i + 1}`} value={p.nombre} maxLength={40} placeholder="Caleb" onChange={(e) => cambiarP("nombre", e.target.value)} />
                      <textarea className="input" rows={2} aria-label={`Cómo es «${p.nombre || `personaje ${i + 1}`}»`} value={p.descripcion} maxLength={300}
                        placeholder="Bebé de un año, pelirrojo, ojos claros, con gorro marrón y traje verde salvia con bordados azules" onChange={(e) => cambiarP("descripcion", e.target.value)} />
                      <button type="button" className="btn-icon" aria-label={`Quitar el personaje ${p.nombre || i + 1}`} onClick={() => cambiar("personajes", borrador.personajes.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                      <RefsDeTipo ids={ids} id={p.id} nombre={p.nombre || `personaje ${i + 1}`} archivos={archivos} claves={p.imagenes ?? []} titulo="Retrato y cuerpo entero:"
                        onCambiar={(l) => cambiarP("imagenes", l)} />
                    </div>
                  );
                })}
                {(borrador.personajes ?? []).length < MAX_PERSONAJES && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar("personajes", [...(borrador.personajes ?? []), PERSONAJE_VACIO()])}><Icon name="plus" size={14} /> Añadir un personaje</button>
                )}
                <p className="hint">El que sale una y otra vez (la mascota, el bebé de la marca, la dueña): con su retrato y su cuerpo entero de la galería, sale IGUAL en cada imagen, carrusel y reel donde lo escojas. Sin imagen no se guarda.</p>
              </fieldset>
              <fieldset className="est-kit-propios">
                <legend className="label">El estilo de cada tipo de pieza</legend>
                {Object.entries(TIPOS_PRESET).map(([tipo, def]) => (
                  <div key={tipo} className="est-kit-estilo-tipo">
                    <label className="label" htmlFor={`${ids}-et-${tipo}`}>{def.nombre}</label>
                    <select id={`${ids}-et-${tipo}`} className="input" value={borrador.estiloPorTipo?.[tipo] ?? ""}
                      onChange={(e) => { const v = e.target.value; const n = { ...(borrador.estiloPorTipo ?? {}) }; if (v) n[tipo] = v; else delete n[tipo]; cambiar("estiloPorTipo", n); }}>
                      <option value="">El de la casa ({ESTILOS_VISUALES[ESTILO_POR_TIPO[tipo]]?.nombre})</option>
                      {Object.entries(ESTILOS_VISUALES).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                      {(borrador.estilos ?? []).filter((e) => e.nombre && e.texto).map((e) => <option key={e.id} value={e.id}>{e.nombre} (propio)</option>)}
                    </select>
                  </div>
                ))}
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
        {kit.reglas.length > 0 && <div><dt>Reglas</dt><dd><ul className="est-kit-reglas">{kit.reglas.map((r) => <li key={r}>{r}</li>)}</ul></dd></div>}
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
          <dd>
            {logo ? <img src={logo.src} alt="Logo de la marca" className="est-kit-logo" /> : kit.logo ? "Guardado" : "Sin escoger: abre una imagen de la galería y pulsa «Usar como logo»."}
            {kit.logo && <span className="hint"> · {MODOS_LOGO[kit.logoModo].nombre}{kit.logoModo === "estampado" ? ` (${ESQUINAS_LOGO[kit.logoPosicion.esquina].toLowerCase()}, ${Math.round(kit.logoPosicion.tamano * 100)} %)` : ""}</span>}
          </dd>
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
        {kit.propios.map((p) => <p key={p.id}><strong>{p.nombre} (tipo propio):</strong> {p.texto}</p>)}
        {kit.estilos.map((p) => <p key={p.id}><strong>{p.nombre} (estilo propio):</strong> {p.texto}</p>)}
        {kit.personajes.map((p) => <p key={p.id}><strong>{p.nombre} (personaje):</strong> {p.descripcion || "—"} · {p.imagenes.length === 1 ? "1 imagen" : `${p.imagenes.length} imágenes`}</p>)}
        {Object.keys(kit.estiloPorTipo).length > 0 && (
          <p><strong>Estilos fijados:</strong> {Object.entries(kit.estiloPorTipo).map(([t, id]) => `${TIPOS_PRESET[t]?.nombre} → ${nombreDeEstilo(kit, id)}`).join(" · ")}</p>
        )}
      </details>
    </div>
  );
}
