import { useId, useRef, useState } from "react";
import Icon from "./Icon";
import {
  textoCosto, NOMBRE_PROPORCION, MAX_PROMPT, maxPorPedido, duracionDe, modelosParaLista, creadoresDe, CRITERIOS_ORDEN, NOMBRE_CALIDAD, NOMBRE_MOTOR,
} from "../lib/estudioCatalogo";
import { ETIQUETA_AJUSTE, valorDeAjuste } from "../lib/estudio";
import { TIPOS_PRESET } from "../lib/kitMarca";
import { NOMBRE_TRAMO } from "../lib/videoCorto";
import { CopyButton } from "./calendario/primitivas";

// ============================================================
// El compositor del Estudio: qué se quiere crear
//
// Sólo pinta: el estado (el formulario, la cola, los avisos) vive en Estudio.jsx.
// Sirve igual en la pestaña del cliente y en el diálogo «Crear con IA» del panel
// de una publicación.
//
// Lo que cambia entre imagen y video, dicho a la persona en vez de escondido:
//   · una imagen admite REFERENCIAS (las que dé el modelo);
//   · un video admite una imagen INICIAL, a veces una FINAL, a veces referencias,
//     y cuesta por segundo. Lo que un modelo no admite no se enseña.
// ============================================================

const TIPOS = [["imagen", "Imagen", "image"], ["video", "Video", "video"]];

/** Una fila de imágenes puestas (miniatura + quitar) y el botón de subir una. */
function Ranura({ titulo, ayuda, archivos, max, rol, subiendo, onQuitar, onSubir, ids }) {
  return (
    <div className="field">
      <span className="label" id={`${ids}-${rol}`}>{titulo}</span>
      <div className="est-refs" role="group" aria-labelledby={`${ids}-${rol}`}>
        {archivos.map((r) => (
          <span key={r.id} className="est-ref">
            <img src={r.src} alt="" />
            <span className="est-ref-nombre">{r.prompt || "Imagen"}</span>
            <button type="button" className="btn-icon est-ref-quitar" aria-label={`Quitar: ${r.prompt || "imagen"}`} onClick={() => onQuitar(rol, r)}><Icon name="close" size={14} /></button>
          </span>
        ))}
        {archivos.length < max && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onSubir(rol)}>
            <Icon name="upload" size={16} /> {subiendo ? "Subiendo…" : "Subir una imagen"}
          </button>
        )}
        <span className="hint">{archivos.length} de {max}. {ayuda}</span>
      </div>
    </div>
  );
}

/**
 * El agente diseñador: el estilo de la marca que va delante de la idea
 * (producto, anuncio, corporativo, creativo) y el logo de referencia. Lo
 * que se manda al motor es el preset + la escena: se ve antes de pedir.
 */
function EstiloDeMarca({ ids, preset, onPreset, kitListo, textoPreset, conLogo, onConLogo, puedeLogo, esVideo, angulos = [], onAngulo }) {
  return (
    <div className="field est-estilo">
      <span className="label" id={`${ids}-estilo`}>Estilo de la marca</span>
      <div className="est-tipos" role="group" aria-labelledby={`${ids}-estilo`}>
        <button type="button" className="filter-chip" aria-pressed={!preset} onClick={() => onPreset("")}>Sin preset</button>
        {Object.entries(TIPOS_PRESET).map(([tipo, def]) => (
          <button key={tipo} type="button" className="filter-chip" aria-pressed={preset === tipo} onClick={() => onPreset(tipo)} title={def.ayuda}>{def.nombre}</button>
        ))}
      </div>
      {preset && (
        <details className="est-preset-vista">
          <summary>Lo que va delante de tu idea{kitListo ? "" : " (sin kit: prepáralo arriba para que lleve la paleta)"}</summary>
          <p>{textoPreset}</p>
        </details>
      )}
      {preset === "anuncio" && !esVideo && angulos.length > 0 && onAngulo && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-angulo`}>Desde el estudio de mercado</label>
          <select id={`${ids}-angulo`} className="input" defaultValue="" onChange={(e) => { const a = angulos.find((x) => x.id === e.target.value); if (a) onAngulo(a); e.target.value = ""; }}>
            <option value="">Escoge un producto y un gancho…</option>
            {[...new Set(angulos.map((a) => a.producto))].map((producto) => (
              <optgroup key={producto} label={`${producto}${angulos.find((a) => a.producto === producto)?.precio ? ` · ${angulos.find((a) => a.producto === producto).precio}` : ""}`}>
                {angulos.filter((a) => a.producto === producto).map((a) => <option key={a.id} value={a.id}>{a.nombreNivel}: {a.gancho}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="hint">Escribe la idea con el gancho y el precio exactos del catálogo; la escena la ajustas tú.</p>
        </div>
      )}
      {preset && puedeLogo && (
        <label className="est-logo-casilla">
          <input type="checkbox" checked={conLogo} onChange={(e) => onConLogo(e.target.checked)} /> Poner el logo de la marca como referencia
        </label>
      )}
      {preset && esVideo && <p className="hint">En video el logo no va de referencia: el video empezaría en él.</p>}
    </div>
  );
}

/**
 * El guion de un video corto (8 o 10 s según el modelo): gancho, beneficio y cierre en una sola toma. La IA
 * lo escribe; la persona lo mira y lo usa como pedido. Lo que va en edición (texto largo, logo) se dice aparte.
 */
function GuionCorto({ segundos, escribiendo, resultado, onEscribir, onUsar, onDescartar }) {
  const g = resultado?.guion;
  return (
    <div className="est-guion">
      <div className="est-acciones-idea">
        <button type="button" className="btn btn-secondary btn-sm" disabled={escribiendo} onClick={onEscribir}>
          <Icon name="video" size={14} /> {escribiendo ? "Escribiendo el guion…" : `Guion de ${segundos} s con IA`}
        </button>
        <p className="hint" style={{ margin: 0 }}>Gancho, beneficio y cierre en una sola toma. El texto largo y el logo van en edición.</p>
      </div>
      {g && (
        <div className="est-guion-tarjeta">
          {g.escena && <p><strong>Escena:</strong> {g.escena}</p>}
          <ol className="est-guion-tramos">
            {g.tramos.map((t) => <li key={t.clave}><strong>{t.desde}–{t.hasta} s · {NOMBRE_TRAMO[t.clave]}:</strong> {t.accion}</li>)}
          </ol>
          {g.camara && <p><strong>Cámara:</strong> {g.camara}</p>}
          <p><strong>Texto en pantalla:</strong> {g.textoPantalla ? `«${g.textoPantalla}»` : "ninguno"}</p>
          {g.textoEdicion && <p><strong>Para edición (CapCut o Canva):</strong> {g.textoEdicion}</p>}
          {g.sonido && <p><strong>Sonido:</strong> {g.sonido}</p>}
          {g.descripcion && (
            <div className="est-guion-desc">
              <p><strong>Descripción del post:</strong></p>
              <p className="est-guion-caption">{g.descripcion}</p>
              <CopyButton text={g.descripcion} describes="la descripción" />
            </div>
          )}
          <div className="est-acciones-idea">
            <button type="button" className="btn btn-primary btn-sm" onClick={onUsar}><Icon name="check" size={14} /> Usar como pedido</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDescartar}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lo que se sabe del modelo escogido: quién lo hace, qué tan bueno es, cuánto tarda y para qué sirve. */
function FichaDelModelo({ modelo }) {
  const calidad = modelo.calidad ?? 2;
  return (
    <div className="est-ficha">
      <p className="hint est-modelo-nota">{modelo.nota}</p>
      <ul className="est-ficha-datos" aria-label="Sobre este modelo">
        {modelo.creador && <li><span className="est-dato-t">Lo hace</span> {modelo.creador}</li>}
        <li>
          <span className="est-dato-t">Calidad</span>{" "}
          <span className="est-puntos" role="img" aria-label={`${calidad} de 4: ${NOMBRE_CALIDAD[calidad]}`}>
            {[1, 2, 3, 4].map((n) => <span key={n} className="est-punto" data-lleno={n <= calidad || undefined} />)}
          </span>
        </li>
        {modelo.velocidad && <li><span className="est-dato-t">Velocidad</span> {modelo.velocidad}</li>}
        {modelo.para?.length > 0 && <li><span className="est-dato-t">Sirve para</span> {modelo.para.join(", ")}</li>}
      </ul>
    </div>
  );
}

/**
 * «Mejorar idea»: la IA devuelve la idea más clara y sencilla en el mismo campo, y
 * «Volver a mi idea» la deshace.
 */
function MejorarIdea({ mejorando, onMejorar, onVolverIdea }) {
  return (
    <div className="est-mejorar">
      <button type="button" className="btn btn-accent btn-sm" disabled={mejorando} onClick={onMejorar}>
        <Icon name="wand" size={16} /> {mejorando ? "Mejorando la idea…" : "Mejorar idea"}
      </button>
      {onVolverIdea && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={mejorando} onClick={onVolverIdea}>
          Volver a mi idea
        </button>
      )}
      <p className="hint">La reescribe más clara y sencilla para que la IA la entienda. No crea nada todavía.</p>
    </div>
  );
}

export default function Compositor({
  ids, form, setForm, modelo, motores, costo, confirmando, enviando, subiendo,
  onEnviar, onConfirmar, onNo, onModelo, onTipo, onQuitarMedio, onSubirArchivos, promptRef, etiquetaPrompt = "¿Qué quieres crear?",
  mejorando = false, onMejorar = null, onVolverIdea = null,
  estilo = null,
  guionCorto = null,
}) {
  const entrada = useRef(null);
  const rolSubida = useRef("reference");
  const [orden, setOrden] = useState("recomendado");
  const [creador, setCreador] = useState("");
  const idsLista = useId();
  const activo = (m) => Boolean(motores?.[m.motor]?.activo);
  const activos = Object.fromEntries(Object.entries(motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));
  const esVideo = form.tipo === "video";
  const medios = form.medios;
  const conInicial = Boolean(modelo.inicial);
  const conFinal = Boolean(modelo.final) && medios.start.length > 0;
  const nombreDeTipo = esVideo ? (form.n > 1 ? `${form.n} videos` : "video") : (form.n > 1 ? `${form.n} imágenes` : "imagen");
  const cantidades = esVideo ? [1, 2] : [1, 2, 3, 4, 6, 8].filter((n) => n <= maxPorPedido(modelo));
  const segundos = esVideo ? duracionDe(modelo, form.ajustes) : 0;

  const abrirSubida = (rol) => { rolSubida.current = rol; entrada.current?.click(); };
  const alElegir = (e) => {
    // Copiar ANTES de resetear: vaciar el campo vacía también su lista de archivos.
    const archivos = [...e.target.files];
    e.target.value = "";
    if (archivos.length) onSubirArchivos(archivos, rolSubida.current);
  };
  const cambiarAjuste = (nombre, valor) => setForm((f) => ({ ...f, ajustes: { ...f.ajustes, [nombre]: valor } }));

  return (
    <form className="card est-compositor" onSubmit={(e) => { e.preventDefault(); onEnviar(false); }}>
      <div className="est-tipos" role="group" aria-label="Qué crear">
        {TIPOS.map(([tipo, nombre, icono]) => (
          <button key={tipo} type="button" className="filter-chip" aria-pressed={form.tipo === tipo} onClick={() => onTipo(tipo)}>
            <Icon name={icono} size={14} /> {nombre}
          </button>
        ))}
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-p`}>{etiquetaPrompt}</label>
        <textarea
          id={`${ids}-p`} ref={promptRef} className="input est-prompt-campo" rows={4} maxLength={MAX_PROMPT}
          placeholder={esVideo
            ? "El sofá gira despacio mientras la luz de la tarde cruza la sala; cámara fija, sin texto…"
            : "Una taza de café humeante sobre una mesa de madera, luz de la mañana, estilo fotografía de producto…"}
          value={form.prompt}
          onChange={(e) => { onNo(); setForm({ ...form, prompt: e.target.value }); }}
        />
        <p className="hint">Sin texto dentro de {esVideo ? "el video" : "la imagen"}, salvo que lo pidas. {form.prompt.length > 3500 ? `${form.prompt.length} de ${MAX_PROMPT} caracteres.` : ""}</p>
      </div>

      {onMejorar && <MejorarIdea mejorando={mejorando} onMejorar={onMejorar} onVolverIdea={onVolverIdea} />}

      {esVideo && guionCorto && <GuionCorto {...guionCorto} />}

      {estilo && <EstiloDeMarca ids={ids} esVideo={esVideo} {...estilo} />}

      <div className="est-fila">
        <div className="field">
          <label className="label" htmlFor={`${ids}-m`}>Modelo</label>
          <select id={`${ids}-m`} className="input" value={form.modelo} onChange={(e) => onModelo(e.target.value)}>
            {modelosParaLista(form.tipo, { orden, creador, activos, seleccionado: form.modelo }).map((m) => (
              <option key={m.id} value={m.id} disabled={!activo(m)}>
                {m.nombre}{m.motor === "prueba" ? "" : ` · ${NOMBRE_MOTOR[m.motor] ?? m.motor}`} · {textoCosto(m.costo)}{m.por === "s" && m.costo > 0 ? " por segundo" : ""}{activo(m) ? "" : " · sin llave"}
              </option>
            ))}
          </select>
        </div>
        {Object.entries(modelo.ajustes).map(([nombre, def]) => (
          <div className="field" key={nombre}>
            <label className="label" htmlFor={`${ids}-a-${nombre}`}>{ETIQUETA_AJUSTE[nombre] ?? nombre}</label>
            <select id={`${ids}-a-${nombre}`} className="input" value={form.ajustes[nombre]} onChange={(e) => cambiarAjuste(nombre, e.target.value)}>
              {def.valores.map((v) => (
                <option key={v} value={v}>{nombre === "aspectRatio" ? `${NOMBRE_PROPORCION[v] ?? v} (${v})` : valorDeAjuste(nombre, v)}</option>
              ))}
            </select>
          </div>
        ))}
        <div className="field">
          <label className="label" htmlFor={`${ids}-n`}>Cuántos</label>
          <select id={`${ids}-n`} className="input" value={form.n} onChange={(e) => { onNo(); setForm({ ...form, n: Number(e.target.value) }); }}>
            {cantidades.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <details className="est-lista-opciones">
        <summary>Ordenar y filtrar la lista de modelos</summary>
        <div className="est-fila est-fila-lista">
          <div className="field">
            <label className="label" htmlFor={`${idsLista}-o`}>Ordenar por</label>
            <select id={`${idsLista}-o`} className="input" value={orden} onChange={(e) => setOrden(e.target.value)}>
              {CRITERIOS_ORDEN.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${idsLista}-c`}>Creador</label>
            <select id={`${idsLista}-c`} className="input" value={creador} onChange={(e) => setCreador(e.target.value)}>
              <option value="">Todos</option>
              {creadoresDe(form.tipo).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </details>

      <FichaDelModelo modelo={modelo} />

      {modelo.necesitaImagen && (
        <p className="notice notice-warn est-necesita" role="note">
          {modelo.nombre} no crea desde texto solo: necesita {conInicial ? "una imagen inicial" : "al menos una imagen de referencia"}.
        </p>
      )}
      {conInicial && (
        <Ranura ids={ids} rol="start" titulo="Imagen inicial" max={1} archivos={medios.start} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida}
          ayuda="El video arranca de esta imagen. También puedes usar «Animar» en cualquiera de la galería." />
      )}
      {conFinal && (
        <Ranura ids={ids} rol="end" titulo="Imagen final" max={1} archivos={medios.end} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida}
          ayuda="Opcional: el video termina en esta imagen." />
      )}
      {modelo.referencias > 0 ? (
        <Ranura ids={ids} rol="reference" titulo="Imágenes de referencia" max={modelo.referencias} archivos={medios.reference} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida}
          ayuda="También puedes usar cualquiera de la galería con «Usar de referencia»." />
      ) : !conInicial && (
        <p className="hint">{modelo.nombre} no admite imágenes de referencia.</p>
      )}
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" multiple className="est-archivo" tabIndex={-1} aria-hidden="true" onChange={alElegir} />

      <div className="est-pie-compositor">
        <p className="est-costo">
          Costo: <strong>{textoCosto(costo)}</strong>
          {esVideo && costo > 0 ? ` · ${segundos} s × ${form.n} × ${textoCosto(modelo.costo).replace("≈ ", "")}/s` : ""}
          {modelo.estimado && costo > 0 ? " · precio aproximado" : ""}
        </p>
        {confirmando != null ? (
          <div className="est-confirmar" role="alert">
            <span>Este pedido cuesta <strong>{textoCosto(confirmando)}</strong>. ¿Seguimos?</span>
            <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => onConfirmar()}>Sí, crear</button>
            <button type="button" className="btn btn-ghost" onClick={onNo}>No</button>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={enviando || !activo(modelo)}>
            <Icon name={esVideo ? "video" : "sparkles"} size={18} /> {enviando ? "Pidiendo…" : `Crear ${nombreDeTipo}`}
          </button>
        )}
      </div>
    </form>
  );
}
