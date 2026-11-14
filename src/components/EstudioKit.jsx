import { useId, useState } from "react";
import Icon from "./Icon";
import FuenteDeMarca from "./FuenteDeMarca";
import { NOMBRES_USO, DISENO_POR_TIPO } from "../lib/director";
import {
  TIPOS_PRESET, MAX_PROPIOS, MAX_ESTILOS, MAX_PERSONAJES, MAX_REFS_PRESET, ESTILOS_VISUALES, ESTILO_POR_TIPO, limpiarKit, kitVacio, textoPreset, fundirKit, bloqueDeMarca, nombreDeEstilo,
  MAX_REGLAS,
} from "../lib/kitMarca";
import { MODOS_LOGO, ESQUINAS_LOGO, TAMANO_LOGO, MARGEN_LOGO, posicionDelKit } from "../lib/logoEncima";
import { quitarPerdidasDelKit, prepararKitDesdeImagenes } from "../lib/estudio";
import { TIPOS_ARTE, MIN_TIPOS_ARTE, MAX_TIPOS_ARTE, tipoArteDe } from "../lib/tiposArte";
import { SUGERENCIAS_ANCLAS, MAX_ANCLAS, MAX_ANCLA, avisoDeAncla, limpiarAnclas } from "../lib/anclasEstilo";
import { fundirMoodboard, MIN_MOODBOARD, MAX_MOODBOARD } from "../lib/kitDesdeImagenes";
// Sus estilos son los del Estudio (est-kit-*): ahora vive en Marca, donde el Estudio no se ha cargado.
import "./Estudio.css";

// ============================================================
// El kit de marca del cliente, en Marca → Kit y voz (fase 7; antes, al final del Estudio)
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
//
// La voz de la marca (VozDeMarca) va aparte, en su tarjeta de Marca: con el kit vacío también se escoge.
// ============================================================

/**
 * «Los tipos de arte de esta marca» (2 a 4, `kit.tiposArte`): la forma de pieza que le vende según su estudio de
 * mercado (demostración, testimonio, producto…). El director y el motor de ideas los leen para escoger la composición.
 */
function TiposArteDeMarca({ kit, lectura = false, ocupado = false, onCambiar }) {
  const ids = useId();
  const elegidos = kit.tiposArte ?? [];
  // Mientras guarda se ignora el toque (sin `disabled`: el chip pulsado soltaría el foco).
  const alternar = (id) => { if (!ocupado) onCambiar(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]); };
  if (lectura && !elegidos.length) return null;
  return (
    <section className="field est-kit-artes" aria-labelledby={`${ids}-t`}>
      <span className="label" id={`${ids}-t`}>Los tipos de arte de esta marca</span>
      <p className="hint" id={`${ids}-h`} style={{ margin: 0 }}>
        Escoge de {MIN_TIPOS_ARTE} a {MAX_TIPOS_ARTE} según su estudio de mercado; prueba unas pocas piezas de cada uno y quédate con lo que funcione.
        {elegidos.length === 1 ? " Falta al menos uno más." : ""}
      </p>
      <div className="est-tipos" role="group" aria-labelledby={`${ids}-t`} aria-describedby={`${ids}-h`}>
        {TIPOS_ARTE.map((t) => {
          const dentro = elegidos.includes(t.id);
          return lectura ? (dentro ? <span key={t.id} className="filter-chip active">{t.nombre}</span> : null) : (
            <button key={t.id} type="button" className="filter-chip" aria-pressed={dentro} title={t.ayuda}
              aria-disabled={ocupado || undefined} disabled={!dentro && elegidos.length >= MAX_TIPOS_ARTE} onClick={() => alternar(t.id)}>{t.nombre}</button>
          );
        })}
      </div>
      {elegidos.length > 0 && <p className="hint" style={{ margin: 0 }}>{elegidos.map((id) => `${tipoArteDe(id).nombre}: ${tipoArteDe(id).ayuda}`).join(" · ")}</p>}
    </section>
  );
}

/**
 * Las REFERENCIAS DE ESTILO de la marca (`kit.anclas`, hasta 6): un tipo de película, una época, una revista, un
 * movimiento, una técnica de luz. Sugerencias de la casa con un toque y propias escritas a mano; las que parecen el
 * nombre de una persona o de una marca se avisan y NO van a las piezas (src/lib/anclasEstilo.js).
 */
function AnclasDeEstilo({ ids, anclas = [], onCambiar }) {
  const [propia, setPropia] = useState("");
  const lista = anclas ?? [];
  const llenas = lista.length >= MAX_ANCLAS;
  const igual = (a, b) => a.toLowerCase() === b.toLowerCase();
  const alternar = (f) => onCambiar(lista.some((x) => igual(x, f)) ? lista.filter((x) => !igual(x, f)) : llenas ? lista : [...lista, f]);
  const aviso = avisoDeAncla(propia);
  const anadir = () => {
    const t = limpiarAnclas([propia])[0];
    if (!t || llenas) return;
    onCambiar(limpiarAnclas([...lista, t]));
    setPropia("");
  };
  return (
    <fieldset className="est-kit-propios">
      <legend className="label">Referencias de estilo (opcional)</legend>
      <p className="hint" style={{ margin: 0 }}>
        Cómo «se siente» la marca en pocas palabras: un tipo de película o de revelado, una época, un tipo de revista, un movimiento
        artístico, una técnica de luz. Van en todas las piezas. Siempre con palabras genéricas: sin nombres de artistas, fotógrafos ni marcas.
      </p>
      {lista.length > 0 && (
        <ul className="est-kit-reglas" aria-label="Referencias de estilo escogidas">
          {lista.map((a) => {
            const av = avisoDeAncla(a);
            return (
              <li key={a}>
                {a}{" "}
                <button type="button" className="btn-icon" aria-label={`Quitar la referencia «${a}»`} onClick={() => onCambiar(lista.filter((x) => x !== a))}><Icon name="close" size={14} /></button>
                {av && <span className="hint" style={{ display: "block" }}><Icon name="alert" size={14} /> No va a las piezas: {av}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <details>
        <summary className="hint">Sugerencias de la casa (toca para añadir o quitar){llenas ? ` · ya hay ${MAX_ANCLAS}` : ""}</summary>
        {SUGERENCIAS_ANCLAS.map((g) => (
          <div key={g.grupo} role="group" aria-label={g.grupo} style={{ marginTop: "var(--sp-2)" }}>
            <span className="hint">{g.grupo}</span>
            <div className="est-tipos">
              {g.frases.map((f) => {
                const dentro = lista.some((x) => igual(x, f));
                return <button key={f} type="button" className="filter-chip" aria-pressed={dentro} disabled={!dentro && llenas} onClick={() => alternar(f)}>{f}</button>;
              })}
            </div>
          </div>
        ))}
      </details>
      <div className="est-kit-regla">
        <input className="input" id={`${ids}-ancla`} aria-label="Escribir una referencia de estilo" value={propia} maxLength={MAX_ANCLA}
          placeholder="luz de ventana de una casa de playa" onChange={(e) => setPropia(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); anadir(); } }} />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!propia.trim() || llenas} onClick={anadir}><Icon name="plus" size={14} /> Añadir</button>
      </div>
      {propia.trim() && aviso && <p className="hint" role="status" style={{ margin: 0 }}><Icon name="alert" size={14} /> {aviso}</p>}
    </fieldset>
  );
}

/**
 * «Preparar desde imágenes»: se escogen de 3 a 10 imágenes de la galería (las que le gustan a la marca) y la IA las mira
 * juntas y PROPONE lo visual del kit. No guarda: la propuesta se revisa como la de «Preparar con IA».
 */
function DesdeImagenes({ ids, archivos = [], ocupado = false, onLeer, onCerrar }) {
  const [elegidas, setElegidas] = useState([]);
  const imagenes = archivos.filter((a) => a.tipo === "imagen" && (!a.mime || /^image\/(png|jpeg|webp)$/.test(a.mime))).slice(0, 60);
  const alternar = (id) => setElegidas((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= MAX_MOODBOARD ? l : [...l, id]));
  const faltan = Math.max(0, MIN_MOODBOARD - elegidas.length);
  return (
    <section className="est-kit-propuesta" aria-labelledby={`${ids}-mb`}>
      <p className="est-kit-propuesta-titulo" id={`${ids}-mb`}><Icon name="image" size={14} /> Preparar desde imágenes</p>
      <p className="hint" style={{ margin: 0 }}>
        Escoge de {MIN_MOODBOARD} a {MAX_MOODBOARD} imágenes que le gusten a la marca: de su galería o de otras cuentas que hayas subido antes
        (Crear → Galería → Subir). La IA las mira juntas y propone el estilo, la luz, la paleta, las referencias de estilo y lo que nunca;
        lo revisas antes de guardar y lo demás del kit no cambia.
      </p>
      {imagenes.length < MIN_MOODBOARD ? (
        <p className="hint">La galería tiene {imagenes.length === 1 ? "1 imagen" : `${imagenes.length} imágenes`}: sube al menos {MIN_MOODBOARD} para preparar el kit desde ellas.</p>
      ) : (
        <div className="est-kit-refs-rejilla" role="group" aria-label="Imágenes del moodboard" style={{ maxHeight: 320 }}>
          {imagenes.map((a) => {
            const dentro = elegidas.includes(a.id);
            return (
              <button key={a.id} type="button" className="est-kit-refs-opcion" aria-pressed={dentro} disabled={!dentro && elegidas.length >= MAX_MOODBOARD}
                aria-label={`${dentro ? "Quitar" : "Escoger"}: ${a.prompt || "imagen"}`} onClick={() => alternar(a.id)}>
                <img src={a.src} alt="" loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
      <p role="status" className="hint" style={{ margin: 0 }}>
        {elegidas.length} de {MAX_MOODBOARD} escogidas{faltan ? ` (falta${faltan === 1 ? "" : "n"} ${faltan})` : ""}.
      </p>
      <div className="est-kit-botones">
        {/* `aria-disabled` y no `disabled`: el botón pulsado no suelta el foco mientras la IA mira. */}
        <button type="button" className="btn btn-primary btn-sm" aria-disabled={Boolean(faltan) || ocupado || undefined}
          onClick={() => { if (!faltan && !ocupado) onLeer(elegidas); }}>
          <Icon name="sparkles" size={14} /> {ocupado ? "Mirando las imágenes…" : `Proponer desde ${elegidas.length === 1 ? "esta imagen" : `estas ${elegidas.length}`}`}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Cancelar</button>
      </div>
    </section>
  );
}

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

/**
 * @param perdidas  lo de la marca cuyo archivo ya no está (el servidor lo dice en GET /api/estudio: [{ que, arreglo }]).
 *                  Las piezas salen sin eso; se avisa aquí, a la vista aunque el kit esté plegado.
 */
export default function EstudioKit({ client, kit: guardado, archivos = [], perdidas = [], lectura = false, onGuardar, onPreparar, onCambio = null }) {
  const ids = useId();
  const kit = limpiarKit(guardado);
  const vacio = kitVacio(kit);
  const [abierto, setAbierto] = useState(vacio);
  const [quitando, setQuitando] = useState(false);
  const [editando, setEditando] = useState(null); // el borrador, o null
  const [propuesta, setPropuesta] = useState(null); // { kit, dudas, conCerebro } o, del moodboard, { kit, dudas, vistas, desde: "imagenes" }
  const [moodboard, setMoodboard] = useState(false);
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

  // Lo que se guardaría con la propuesta: la del moodboard sólo toca lo visual; la del cerebro, como siempre.
  const fundida = (p) => (p.desde === "imagenes" ? fundirMoodboard(kit, p.kit) : fundirKit(kit, p.kit));
  const desdeImagenes = async (archivoIds) => {
    setOcupado("moodboard");
    setError("");
    try {
      const r = await prepararKitDesdeImagenes(client.id, archivoIds);
      setPropuesta({ ...r, desde: "imagenes" });
      setMoodboard(false);
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
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={moodboard} aria-controls={`${ids}-c`} disabled={Boolean(ocupado) && ocupado !== "moodboard"}
              onClick={() => { setMoodboard((v) => !v); setPropuesta(null); setAbierto(true); }}>
              <Icon name="image" size={14} /> Preparar desde imágenes
            </button>
            {!vacio && !editando && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditando({ ...kit, paleta: [...kit.paleta], propios: [...kit.propios], estilos: [...kit.estilos], personajes: [...kit.personajes], reglas: [...kit.reglas], anclas: [...(kit.anclas ?? [])] }); setAbierto(true); }}>
                <Icon name="pencil" size={14} /> Editar
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {perdidas.length > 0 && (
        <div className="notice notice-warn" role="status">
          <p style={{ margin: 0 }}><strong>Falta {perdidas.length === 1 ? "una imagen" : `${perdidas.length} imágenes`} de la marca:</strong> se borraron de la galería, y las piezas salen sin {perdidas.length === 1 ? "ella" : "ellas"}.</p>
          <ul style={{ margin: "var(--sp-1) 0 0", paddingLeft: "var(--sp-4)" }}>
            {perdidas.map((p) => <li key={p.clave}>{p.que.charAt(0).toUpperCase() + p.que.slice(1)}. {p.arreglo}</li>)}
          </ul>
          {/* Lo guardado seguía apuntando a ellas y el aviso no se iba nunca: con esto salen del kit y del catálogo. */}
          {onCambio && !lectura && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: "var(--sp-2)" }} disabled={quitando}
              onClick={async () => {
                setQuitando(true);
                try { await quitarPerdidasDelKit(client.id); await onCambio(); } catch (e) { setError(e.message || "No se pudieron quitar."); } finally { setQuitando(false); }
              }}>
              {quitando ? "Quitando…" : `Quitar${perdidas.length === 1 ? "la" : "las"} del kit y del catálogo`}
            </button>
          )}
        </div>
      )}

      {abierto && (
        <div id={`${ids}-c`} className="est-kit-cuerpo">
          {moodboard && !propuesta && !lectura && (
            <DesdeImagenes ids={ids} archivos={archivos} ocupado={ocupado === "moodboard"} onLeer={desdeImagenes} onCerrar={() => setMoodboard(false)} />
          )}
          {propuesta && (
            <div className="est-kit-propuesta" role="status">
              <p className="est-kit-propuesta-titulo">
                <Icon name="sparkles" size={14} /> {propuesta.desde === "imagenes"
                  ? `Propuesta de la IA mirando ${propuesta.vistas === 1 ? "1 imagen" : `${propuesta.vistas ?? "tus"} imágenes`}: sólo lo visual (estilo, luz, paleta, referencias de estilo y lo que nunca); lo demás del kit se queda`
                  : `Propuesta de la IA ${propuesta.conCerebro ? "a partir del cerebro" : "(el cerebro no tenía guía visual: revisa con cuidado)"}`}
              </p>
              {propuesta.dudas && <p className="hint">Dudas: {propuesta.dudas}</p>}
              {propuesta.desde === "imagenes"
                ? <VistaKit kit={fundida(propuesta)} marca={marca} soloVisual />
                : <VistaKit kit={propuesta.kit} marca={marca} />}
              <div className="est-kit-botones">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar(fundida(propuesta))} disabled={Boolean(ocupado)}>
                  <Icon name="check" size={14} /> {ocupado === "guardar" ? "Guardando…" : "Guardar este kit"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const f = fundida(propuesta); setEditando({ ...f, anclas: [...(f.anclas ?? [])] }); setPropuesta(null); }}>Corregir antes</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPropuesta(null)}>Descartar</button>
              </div>
            </div>
          )}

          {!propuesta && !borrador && (
            vacio
              ? <p className="hint">Prepáralo con la IA desde el cerebro de {client.name}, o escríbelo a mano. Con el kit, cada idea sale con la paleta, el estilo y el logo de la marca.</p>
              : <><VistaKit kit={kit} marca={marca} logo={logo} onQuitarPlantilla={lectura || ocupado ? null : (id) => guardar({ ...kit, plantillas: kit.plantillas.filter((x) => x.id !== id) })}
                onTiposPlantilla={lectura || ocupado ? null : (id, tipos) => guardar({ ...kit, plantillas: kit.plantillas.map((x) => (x.id === id ? { ...x, tipos } : x)) })} /><div className="field"><span className="label">Fuente de la marca</span><FuenteDeMarca client={client} kit={kit} lectura={lectura} onGuardar={onGuardar} /></div></>
          )}

          {/* Los tipos de arte de la marca (curso de campañas): se guardan al tocarlos, también con el kit sin preparar. */}
          {!propuesta && !borrador && (
            <TiposArteDeMarca kit={kit} lectura={lectura} ocupado={Boolean(ocupado)} onCambiar={(tiposArte) => guardar({ ...kit, tiposArte })} />
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
              <AnclasDeEstilo ids={ids} anclas={borrador.anclas ?? []} onCambiar={(l) => cambiar("anclas", l)} />
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
function VistaKit({ kit: k, marca, logo = null, onQuitarPlantilla = null, onTiposPlantilla = null, soloVisual = false }) {
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
        {kit.anclas?.length > 0 && (
          <div>
            <dt>Referencias de estilo</dt>
            <dd>
              <ul className="est-kit-reglas">
                {kit.anclas.map((a) => {
                  const av = avisoDeAncla(a);
                  return <li key={a}>{a}{av && <span className="hint"> · no va a las piezas: {av}</span>}</li>;
                })}
              </ul>
            </dd>
          </div>
        )}
        {!soloVisual && kit.reglas.length > 0 && <div><dt>Reglas</dt><dd><ul className="est-kit-reglas">{kit.reglas.map((r) => <li key={r}>{r}</li>)}</ul></dd></div>}
        {!soloVisual && kit.aprendido.length > 0 && (
          <div>
            <dt>Aprendido</dt>
            <dd>
              {kit.aprendido.map((r) => `${r.tipo === "evitar" ? "Evitar: " : ""}${r.texto}`).join(" · ")}
              <span className="hint"> (de tus «Me gusta»; se cambia en Cerebro → Lo que aprende)</span>
            </dd>
          </div>
        )}
        {!soloVisual && <div>
          <dt>Logo</dt>
          <dd>
            {logo ? <img src={logo.src} alt="Logo de la marca" className="est-kit-logo" /> : kit.logo ? "Guardado" : "Sin escoger: abre una imagen de la galería y pulsa «Usar como logo»."}
            {kit.logo && <span className="hint"> · {MODOS_LOGO[kit.logoModo].nombre}{kit.logoModo === "estampado" ? ` (${ESQUINAS_LOGO[kit.logoPosicion.esquina].toLowerCase()}, ${Math.round(kit.logoPosicion.tamano * 100)} %)` : ""}</span>}
          </dd>
        </div>}
      </dl>
      {!soloVisual && kit.plantillas.length > 0 && (
        <section className="est-kit-plantillas" aria-label="Plantillas de la marca">
          <p className="label" style={{ margin: 0 }}>Plantillas ({kit.plantillas.length})</p>
          <p className="hint" style={{ margin: 0 }}>Piezas que quedaron muy bien: se repite su diseño con otro contenido. Se guardan desde la galería («Guardar como plantilla»).</p>
          <ul className="est-kit-plantillas-lista">
            {kit.plantillas.map((p) => (
              <li key={p.id}>
                <img src={`/api/media/${p.clave}`} alt={p.nombre} loading="lazy" />
                <span><strong>{p.nombre}</strong> <span className="hint">· {NOMBRES_USO[p.uso] ?? p.uso}</span>
                  {/* Los tipos que la usan siempre: el director la sigue en las piezas de ese tipo. */}
                  <span className="est-kit-plantilla-tipos" role="group" aria-label={`Tipos que usan «${p.nombre}»`}>
                    {DISENO_POR_TIPO.map((x) => {
                      const dentro = (p.tipos ?? []).includes(x.id);
                      return onTiposPlantilla ? (
                        <button key={x.id} type="button" className="filter-chip" aria-pressed={dentro}
                          onClick={() => onTiposPlantilla(p.id, dentro ? p.tipos.filter((y) => y !== x.id) : [...(p.tipos ?? []), x.id])}>{x.nombre}</button>
                      ) : dentro ? <span key={x.id} className="hint">{x.nombre} </span> : null;
                    })}
                  </span>
                </span>
                {onQuitarPlantilla && (
                  <button type="button" className="btn-icon" aria-label={`Quitar la plantilla ${p.nombre}`} onClick={() => onQuitarPlantilla(p.id)}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!soloVisual && <details className="est-kit-presets">
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
      </details>}
    </div>
  );
}
