import { useId, useRef, useState } from "react";
import Icon from "./Icon";
import {
  textoCosto, NOMBRE_PROPORCION, MAX_PROMPT, maxPorPedido, duracionDe, modelosParaLista, creadoresDe, CRITERIOS_ORDEN, NOMBRE_CALIDAD, NOMBRE_MOTOR,
} from "../lib/estudioCatalogo";
import { ETIQUETA_AJUSTE, valorDeAjuste } from "../lib/estudio";

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

export default function Compositor({
  ids, form, setForm, modelo, motores, costo, confirmando, enviando, subiendo,
  onEnviar, onConfirmar, onNo, onModelo, onTipo, onQuitarMedio, onSubirArchivos, promptRef, etiquetaPrompt = "¿Qué quieres crear?",
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
