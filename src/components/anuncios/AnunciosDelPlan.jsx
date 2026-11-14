import { useEffect, useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { publicacionesParaAnuncio, textosATexto, faltanTextos } from "../../lib/anunciosPlan";
import { origenDelAnuncio, diaCorto, textoDeLaPieza } from "../../lib/planCiclo";
import { textoDeNivel, nombreNivelTexto } from "../../lib/textosNivel";
import { BOTONES_PAUTA, MAX_TEXTOS, MAX_TITULOS, MAX_TITULO_ANUNCIO, MAX_DESCRIPCION_ANUNCIO, MAX_TEXTO_ANUNCIO, botonPorDefecto } from "../../lib/pauta";
import { tipoArteDe } from "../../lib/tiposArte";

// ============================================================
// Los ANUNCIOS de una campaña del plan de campañas (Anuncios → Plan de campañas)
//
// Cada hueco de anuncio con la publicación que se SUGIERE (lo que ya funcionó como anuncio, lo publicado que rindió y
// lo marcado «Va a pauta») y «Cambiar» para escoger CUALQUIER publicación del cliente (de cualquier mes, publicada o
// no) o «Anuncio nuevo» sin publicación: el plan sugiere, no limita. Por anuncio, cómo se monta en el Ads Manager
// («Usar la publicación ya subida»: el texto principal es su caption y se escriben el título y la descripción; o
// «Subir la pieza»: de 3 a 5 textos principales, títulos, descripción y botón) y sus textos, que se escriben a mano o
// con «Escribir los textos» (la IA, con el nivel de consciencia de ese anuncio). Lo puro en src/lib/anunciosPlan.js y
// src/lib/planCiclo.js; lo guarda el Worker con el plan (y en `post.anuncio` de su publicación).
// ============================================================

const lineas = (t) => String(t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const borradorDe = (a) => ({
  textos: a?.textos?.textos?.length ? [...a.textos.textos] : [""],
  titulos: (a?.textos?.titulos ?? []).join("\n"),
  descripcion: a?.textos?.descripcion ?? "",
  boton: a?.textos?.boton ?? "",
});

/** Los anuncios de una campaña: un hueco por anuncio, lleno o por escoger. */
export default function AnunciosDeCampana({ c, plan, cliente, soloLectura, ocupado, onGuardar, onEscribir, onCopiar }) {
  const [eligiendo, setEligiendo] = useState(null);
  const pendientes = c.anuncios.filter(faltanTextos).map((a) => a.slot);
  const escribiendo = ocupado === `campana:${c.id}`;
  return (
    <>
      <div className="plan-anuncios-cabeza">
        <h4 className="plan-mini">Anuncios ({c.anunciosPorConjunto} por conjunto{c.conjuntos.length > 1 ? ", los mismos en todos" : ""})</h4>
        {!soloLectura && pendientes.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} aria-busy={escribiendo || undefined}
            onClick={() => onEscribir(pendientes, { clave: `campana:${c.id}` })}>
            <Icon name="sparkles" size={16} /> {escribiendo ? "Escribiendo…" : `Escribir ${pendientes.length === 1 ? "el texto que falta" : `los ${pendientes.length} que faltan`}`}
          </button>
        )}
      </div>
      <ol className="plan-anuncios">
        {Array.from({ length: c.anunciosPorConjunto }, (_, i) => {
          const a = c.anuncios.find((x) => x.n === i + 1) ?? null;
          return (
            <AnuncioDelPlan key={`${c.id}-${i}-${a?.pieza?.postId ?? (a?.nuevo ? "nuevo" : "vacio")}`} a={a} n={i + 1} c={c} plan={plan} soloLectura={soloLectura}
              ocupado={ocupado} onGuardar={onGuardar} onEscribir={onEscribir} onCopiar={onCopiar} onCambiar={() => setEligiendo(i + 1)} />
          );
        })}
      </ol>
      {eligiendo && (
        <ElegirPublicacion cliente={cliente} titulo={`${c.nombreEtapa} · anuncio ${eligiendo}`}
          onCerrar={() => setEligiendo(null)}
          onEscoger={(x) => { const n = eligiendo; setEligiendo(null); void onGuardar(`${c.id}:a${n}`, x === "nuevo" ? { nuevo: true } : { pieza: x }); }} />
      )}
    </>
  );
}

/** Un hueco de anuncio: la pieza (o por escoger), cómo se monta y sus textos. */
function AnuncioDelPlan({ a, n, c, plan, soloLectura, ocupado, onGuardar, onEscribir, onCopiar, onCambiar }) {
  const ids = useId();
  const slot = `${c.id}:a${n}`;
  const nivel = a?.nivel ?? c.nivelesAnuncios?.[n - 1] ?? "";
  const info = textoDeNivel(nivel);
  const [b, setB] = useState(() => borradorDe(a));
  const [sucio, setSucio] = useState(false);
  const huella = JSON.stringify(a?.textos ?? null);
  // Si llegan otros textos (la IA, otra persona), se enseñan los nuevos salvo que se esté escribiendo encima.
  useEffect(() => { if (!sucio) setB(borradorDe(a)); }, [huella]); // eslint-disable-line react-hooks/exhaustive-deps
  const poner = (cambio) => { setB((x) => ({ ...x, ...cambio })); setSucio(true); };
  const img = a?.pieza?.medios?.find((m) => /^\/api\/media\//.test(m) && !/\.(mp4|mov|webm)$/i.test(m));
  const escribiendo = ocupado === slot;
  const conPublicacion = a?.como === "publicacion";

  const guardarTextos = async () => {
    const textos = {
      textos: conPublicacion ? [] : b.textos.map((t) => t.trim()).filter(Boolean),
      titulos: lineas(b.titulos), descripcion: b.descripcion.trim(), boton: b.boton || botonPorDefecto(plan.destino),
    };
    const pieza = a?.pieza ? { pieza: { calendarId: a.pieza.calendarId, postId: a.pieza.postId } } : a?.nuevo ? { nuevo: true } : {};
    const ok = await onGuardar(slot, { ...pieza, como: a.como, textos, editado: true });
    if (ok) setSucio(false);
  };
  const copiarTodo = () => onCopiar(textosATexto(a?.textos, { conCaption: conPublicacion ? a.caption || "(el de la publicación)" : "" }));

  if (!a) {
    return (
      <li className="plan-anuncio plan-falta">
        <div className="plan-anuncio-cabeza">
          <span className="plan-sin-imagen" aria-hidden="true"><Icon name="plus" size={18} /></span>
          <div>
            <strong>Anuncio {n} · por escoger o producir</strong>
            <p className="hint">Nivel {nombreNivelTexto(nivel).toLowerCase() || "de su etapa"}{info ? `: ${info.hablale}` : ""}</p>
          </div>
        </div>
        {!soloLectura && (
          <div className="plan-anuncio-acciones">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCambiar}><Icon name="search" size={16} /> Escoger una publicación</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onGuardar(slot, { nuevo: true })}><Icon name="plus" size={16} /> Anuncio nuevo (sin publicación)</button>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="plan-anuncio" aria-labelledby={`${ids}-t`}>
      <div className="plan-anuncio-cabeza">
        {img ? <img src={img} alt="" width="64" height="64" loading="lazy" /> : <span className="plan-sin-imagen" aria-hidden="true"><Icon name={a.nuevo ? "upload" : "image"} size={18} /></span>}
        <div>
          <strong id={`${ids}-t`}>Anuncio {n} · {a.nuevo ? "anuncio nuevo (sin publicación)" : a.pieza.titulo}</strong>
          <p className="hint">
            {origenDelAnuncio(a, plan.moneda)}
            {a.pieza?.fecha ? ` · ${diaCorto(a.pieza.fecha)}${a.pieza.publicada ? " (ya salió)" : ""}` : ""}
            {a.pieza?.tipoArte ? ` · ${tipoArteDe(a.pieza.tipoArte)?.nombre ?? ""}` : ""}
          </p>
          <p className="hint">Nivel: <strong>{nombreNivelTexto(nivel) || "—"}</strong>{info ? ` — ${info.hablale}` : ""}</p>
          <p className="plan-anuncio-nombre">
            <span className="hint">Nombre en el Ads Manager:</span> <span>{a.nombre}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCopiar(a.nombre)} aria-label={`Copiar el nombre del anuncio ${n}`}><Icon name="copy" size={16} /></button>
          </p>
        </div>
      </div>
      {!soloLectura && (
        <div className="plan-anuncio-acciones">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCambiar}><Icon name="refresh" size={16} /> Cambiar</button>
          {!a.sugerido && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onGuardar(slot, null)}><Icon name="undo" size={16} /> Volver a lo sugerido</button>}
        </div>
      )}

      {!a.nuevo && (
        <fieldset className="plan-como" disabled={soloLectura}>
          <legend className="label">¿Cómo lo montas en el Ads Manager?</legend>
          <label>
            <input type="radio" name={`${ids}-como`} checked={conPublicacion} disabled={!a.puedePublicacion}
              onChange={() => void onGuardar(slot, { pieza: { calendarId: a.pieza.calendarId, postId: a.pieza.postId }, como: "publicacion" })} />
            Usar la publicación ya subida{!a.puedePublicacion ? " (todavía no salió en Instagram o Facebook)" : ""}
          </label>
          <label>
            <input type="radio" name={`${ids}-como`} checked={!conPublicacion}
              onChange={() => void onGuardar(slot, { pieza: { calendarId: a.pieza.calendarId, postId: a.pieza.postId }, como: "subir" })} />
            Subir la pieza (un anuncio nuevo con su imagen o video)
          </label>
          <details className="plan-ayuda">
            <summary>¿Qué es esto?</summary>
            <p>
              <strong>Usar la publicación ya subida</strong> («Usar publicación existente» en el Ads Manager): el anuncio es esa misma publicación,
              con sus «me gusta» y comentarios. Su texto principal es el caption y no se cambia; sí se escriben el título y la descripción.
              <strong> Subir la pieza</strong>: un anuncio nuevo con la imagen o el video, con sus textos propios (hasta 5 textos principales: Meta prueba cuál funciona).
            </p>
          </details>
        </fieldset>
      )}

      <div className="plan-textos">
        {conPublicacion ? (
          <div className="plan-caption">
            <p className="label">Texto principal: el de la publicación (no se cambia)</p>
            <blockquote>{a.caption || "La publicación no tiene caption."}</blockquote>
            {a.problemas?.length > 0 && (
              <ul className="plan-problemas">
                {a.problemas.map((p) => <li key={p.codigo} className="notice notice-warn"><Icon name="alert" size={16} /> <span>{p.texto} Arréglalo en la publicación antes de montarla, o súbela como anuncio nuevo.</span></li>)}
              </ul>
            )}
          </div>
        ) : (
          b.textos.map((t, k) => (
            <div className="field" key={k}>
              <label className="label" htmlFor={`${ids}-x${k}`}>Texto principal {k + 1}</label>
              <textarea id={`${ids}-x${k}`} className="input" rows={3} maxLength={MAX_TEXTO_ANUNCIO} value={t} readOnly={soloLectura}
                onChange={(e) => poner({ textos: b.textos.map((x, j) => (j === k ? e.target.value : x)) })} />
            </div>
          ))
        )}
        {!conPublicacion && !soloLectura && b.textos.length < MAX_TEXTOS && (
          <button type="button" className="btn btn-ghost btn-sm plan-mas" onClick={() => poner({ textos: [...b.textos, ""] })}><Icon name="plus" size={16} /> Otro texto principal</button>
        )}
        <div className="field">
          <label className="label" htmlFor={`${ids}-ti`}>Títulos (uno por línea, hasta {MAX_TITULOS}, de {MAX_TITULO_ANUNCIO} caracteres)</label>
          <textarea id={`${ids}-ti`} className="input" rows={2} value={b.titulos} readOnly={soloLectura} onChange={(e) => poner({ titulos: e.target.value })} />
          {lineas(b.titulos).some((x) => x.length > MAX_TITULO_ANUNCIO) && <p className="hint" role="status">Un título pasa de {MAX_TITULO_ANUNCIO} caracteres: al guardar se corta en la última palabra que cabe.</p>}
        </div>
        <div className="plan-textos-fila">
          <div className="field">
            <label className="label" htmlFor={`${ids}-de`}>Descripción ({MAX_DESCRIPCION_ANUNCIO} caracteres)</label>
            <input id={`${ids}-de`} className="input" maxLength={MAX_DESCRIPCION_ANUNCIO} value={b.descripcion} readOnly={soloLectura} onChange={(e) => poner({ descripcion: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-bo`}>Botón</label>
            <select id={`${ids}-bo`} className="input" value={b.boton || botonPorDefecto(plan.destino)} disabled={soloLectura} onChange={(e) => poner({ boton: e.target.value })}>
              {BOTONES_PAUTA.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
        </div>
        <p className="hint">
          {a.textosDe === "publicacion" ? "Son los textos de anuncio de la publicación («Va a pauta»)." : a.ia ? "Los escribió la IA: revísalos antes de montarlos." : a.editado ? "Los escribió una persona." : faltanTextos(a) ? "Faltan sus textos." : ""}
          {a.pieza && !a.nuevo ? " Lo que se guarde aquí va también a la publicación." : ""}
        </p>
        <div className="plan-anuncio-acciones">
          {!soloLectura && sucio && <button type="button" className="btn btn-primary btn-sm" onClick={() => void guardarTextos()}><Icon name="check" size={16} /> Guardar los textos</button>}
          {!soloLectura && sucio && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setB(borradorDe(a)); setSucio(false); }}>Deshacer</button>}
          {!soloLectura && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} aria-busy={escribiendo || undefined}
              onClick={() => void onEscribir([slot], { clave: slot, reescribir: true })}>
              <Icon name="sparkles" size={16} /> {escribiendo ? "Escribiendo…" : faltanTextos(a) ? "Escribir los textos" : "Escribirlos otra vez"}
            </button>
          )}
          {!faltanTextos(a) && <button type="button" className="btn btn-ghost btn-sm" onClick={copiarTodo}><Icon name="copy" size={16} /> Copiar todo</button>}
        </div>
      </div>
      {!a.nuevo && <p className="hint plan-como-monta">{textoDeLaPieza(a)}</p>}
    </li>
  );
}

/** «Cambiar»: escoger CUALQUIER publicación del cliente, o un anuncio nuevo sin publicación. */
function ElegirPublicacion({ cliente, titulo, onEscoger, onCerrar }) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const [buscar, setBuscar] = useState("");
  const lista = useMemo(() => publicacionesParaAnuncio(cliente?.calendars ?? [], { buscar }), [cliente?.calendars, buscar]);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog plan-elegir" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="plan-elegir-cabeza">
          <h3 id={`${id}-t`}>¿Qué va en {titulo}?</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <p className="hint">Cualquier publicación del cliente, de cualquier mes, ya publicada o no. O un anuncio nuevo con una pieza que vas a subir.</p>
        <button type="button" className="btn btn-secondary" onClick={() => onEscoger("nuevo")}><Icon name="upload" size={16} /> Anuncio nuevo (sin publicación)</button>
        <div className="field">
          <label className="label" htmlFor={`${id}-b`}>Buscar</label>
          <input id={`${id}-b`} className="input" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Una fecha, el formato o lo que dice" />
        </div>
        {lista.length ? (
          <ul className="plan-elegir-lista" aria-label="Publicaciones del cliente">
            {lista.map((p) => (
              <li key={`${p.calendarId}-${p.postId}`}>
                <button type="button" className="plan-elegir-opcion" onClick={() => onEscoger({ calendarId: p.calendarId, postId: p.postId })}>
                  {p.miniatura && !p.video ? <img src={p.miniatura} alt="" width="48" height="48" loading="lazy" /> : <span className="plan-sin-imagen" aria-hidden="true"><Icon name={p.video ? "video" : "image"} size={16} /></span>}
                  <span>
                    <span className="plan-elegir-titulo">{p.etiqueta}</span>
                    <span className="hint">{p.publicada ? "Ya salió" : "Todavía no sale"}{p.vaAPauta ? " · va a pauta" : ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint" role="status">{buscar ? "Ninguna publicación coincide." : "Este cliente todavía no tiene publicaciones."}</p>
        )}
      </div>
    </div>
  );
}
