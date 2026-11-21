import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import "./IdentidadVideo.css";
import { leerEstilosEdicion, guardarEstiloEdicion, quitarEstiloEdicion, leerPropuestasEdicion } from "../lib/edicionApi";
import PropuestasEdicion from "./PropuestasEdicion";
import { resumenEstiloEdicion, MAX_NOTAS_EDICION, MAX_TEXTO_EDICION } from "../lib/estilosEdicion";

// ============================================================
// Los ESTILOS DE EDICIÓN del cliente en Marca → Kit y voz (en diferido; Fase 5 del editor de video grabado)
//
// Las REGLAS con que se editan sus videos GRABADOS (src/lib/estilosEdicion.js): qué piezas van y cuándo, la cámara, las
// transiciones, el gancho, el cierre y la música. Los lee Claude al editar (guia_de_edicion). Aquí se ven en frases, se
// editan con un formulario (lo que se deja vacío sale del manual del editor y de los números del oficio), se crean y se
// quitan (con confirmación en la propia fila). El servidor dice lo que no entiende y entonces no guarda nada.
// ============================================================

const TIPOS = { "persona-a-camara": "Persona a cámara", "persona-y-pantalla": "Persona y pantalla", "sin-persona": "Sin persona" };
const CAMARA = [["abierto", "Plano abierto (×)", "1,13"], ["medio", "Plano medio (×)", "1,47"], ["seguir", "Sigue la cabeza (0–1)", "0,55"], ["maxAcercar", "Acerca hasta (×)", "2"]];
const MUSICA = [["bajoVoz", "Bajo la voz (dB)", "−18"], ["llamado", "En el llamado (dB)", "−15"], ["libre", "Sin voz (dB)", "−13"], ["cierre", "En el cierre (dB)", "−6"]];
const SI_NO = [["", "Lo del manual"], ["true", "Sí"], ["false", "No"]];

/** Del estilo guardado a lo que se edita (todo texto: lo vacío no se manda). */
function enEdicion(e = {}) {
  const t = (v) => (v === undefined || v === null ? "" : String(v));
  const b = (v) => (typeof v === "boolean" ? String(v) : "");
  return {
    id: e.id ?? "", nombre: t(e.nombre), tipo: t(e.tipo), gancho: t(e.gancho), ritmo: t(e.ritmo), notas: t(e.notas),
    piezas: Object.fromEntries(Object.entries(e.piezas ?? {}).filter(([k]) => k !== "placasNumeradas").map(([k, v]) => [k, t(v)])),
    placasNumeradas: b(e.piezas?.placasNumeradas),
    camara: { ...Object.fromEntries(CAMARA.map(([k]) => [k, t(e.camara?.[k]).replace(".", ",")])), golpeAlEntrar: b(e.camara?.golpeAlEntrar) },
    transiciones: { entreClips: t(e.transiciones?.entreClips), saltoMismoClip: t(e.transiciones?.saltoMismoClip) },
    cierre: { segundos: t(e.cierre?.segundos).replace(".", ","), boton: t(e.cierre?.boton), numero: b(e.cierre?.numero), usuario: b(e.cierre?.usuario) },
    musica: Object.fromEntries(MUSICA.map(([k]) => [k, t(e.musica?.[k]).replace(".", ",")])),
  };
}

/** De lo que se edita al estilo que se manda: sin lo vacío; los números con coma o con punto. */
function paraGuardar(f) {
  const num = (v) => { const n = Number(String(v).replace(",", ".").replace("−", "-").trim()); return String(v).trim() === "" || !Number.isFinite(n) ? undefined : n; };
  const bool = (v) => (v === "" ? undefined : v === "true");
  const sinVacios = (o) => { const r = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")); return Object.keys(r).length ? r : undefined; };
  const piezas = sinVacios({ ...Object.fromEntries(Object.entries(f.piezas).map(([k, v]) => [k, v.trim()])), placasNumeradas: bool(f.placasNumeradas) });
  return sinVacios({
    ...(f.id ? { id: f.id } : {}), nombre: f.nombre.trim(), tipo: f.tipo || undefined, gancho: f.gancho.trim(), ritmo: f.ritmo.trim(), notas: f.notas.trim(),
    piezas,
    camara: sinVacios({ ...Object.fromEntries(CAMARA.map(([k]) => [k, num(f.camara[k])])), golpeAlEntrar: bool(f.camara.golpeAlEntrar) }),
    transiciones: sinVacios({ entreClips: f.transiciones.entreClips || undefined, saltoMismoClip: f.transiciones.saltoMismoClip || undefined }),
    cierre: sinVacios({ segundos: num(f.cierre.segundos), boton: f.cierre.boton.trim(), numero: bool(f.cierre.numero), usuario: bool(f.cierre.usuario) }),
    musica: sinVacios(Object.fromEntries(MUSICA.map(([k]) => [k, num(f.musica[k])]))),
  }) ?? {};
}

export default function EstilosEdicion({ client, lectura = false }) {
  const ids = useId();
  const [datos, setDatos] = useState(null);
  const [forma, setForma] = useState(null); // el estilo que se edita (o uno nuevo)
  const [quitar, setQuitar] = useState(null); // el id que se pide quitar (confirmar en la fila)
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  const [propuestas, setPropuestas] = useState([]);
  const releer = async () => {
    const [d, p] = await Promise.all([leerEstilosEdicion(client.id), leerPropuestasEdicion(client.id).catch(() => null)]);
    setDatos(d); setPropuestas(p?.deMarca ?? []);
  };

  useEffect(() => {
    let vivo = true;
    Promise.all([leerEstilosEdicion(client.id), leerPropuestasEdicion(client.id).catch(() => null)])
      .then(([d, p]) => { if (vivo) { setDatos(d); setPropuestas(p?.deMarca ?? []); } })
      .catch((e) => { if (vivo) { setDatos({ estilos: [] }); setAviso({ ok: false, texto: e.message }); } });
    return () => { vivo = false; };
  }, [client.id]);

  if (!datos) return <p role="status" className="hint">Cargando los estilos de edición…</p>;
  const { estilos = [], max = 6, piezas = {}, transiciones = {}, tipos = Object.keys(TIPOS) } = datos;

  const guardar = async () => {
    setOcupado(true); setAviso(null);
    try {
      const d = await guardarEstiloEdicion(client.id, paraGuardar(forma));
      setDatos(d); setForma(null);
      setAviso({ ok: true, texto: "Guardado: Claude lo sigue en las próximas ediciones de este cliente." });
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setOcupado(false);
  };
  const confirmarQuitar = async (id) => {
    setOcupado(true); setAviso(null);
    try { setDatos(await quitarEstiloEdicion(client.id, id)); setQuitar(null); setAviso({ ok: true, texto: "Quitado." }); } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setOcupado(false);
  };
  const campo = (parte, k) => (ev) => setForma((f) => ({ ...f, [parte]: { ...f[parte], [k]: ev.target.value } }));
  const raiz = (k) => (ev) => setForma((f) => ({ ...f, [k]: ev.target.value }));
  const fid = (k) => `${ids}-${k}`;
  const selectSiNo = (id, valor, onChange) => (
    <select id={id} className="input" value={valor} onChange={onChange}>{SI_NO.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
  );

  return (
    <div className="identidad-video">
      <div>
        <h3 className="card-title" style={{ margin: 0 }}><Icon name="video" size={18} /> Estilos de edición de sus videos grabados</h3>
        <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>
          Cómo se editan los clips que graba este cliente (una persona hablando a cámara): qué piezas van y cuándo, la cámara, las transiciones,
          el gancho y el cierre. Claude los sigue al editar; lo que un estilo no dice sale del manual del editor (Ajustes → Editor de video).
        </p>
      </div>

      <PropuestasEdicion titulo="Lo que propone aprender para su estilo" propuestas={propuestas} puede={!lectura}
        sinPermiso="Las decide quien edita la marca." onCambio={releer} />

      {estilos.length ? (
        <ul className="identidad-lista">
          {estilos.map((e) => (
            <li key={e.id} className="identidad-grupo">
              <div className="identidad-fila">
                <strong>{e.nombre}</strong>
                {!lectura && (quitar === e.id ? (
                  <span className="action-row" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-danger btn-sm" disabled={ocupado} onClick={() => confirmarQuitar(e.id)}>Sí, quitarlo</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuitar(null)}>Cancelar</button>
                  </span>
                ) : (
                  <span className="action-row" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => { setForma(enEdicion(e)); setAviso(null); }}>Editar</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => setQuitar(e.id)} aria-label={`Quitar el estilo ${e.nombre}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                ))}
              </div>
              <ul className="hint" style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
                {resumenEstiloEdicion(e).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      ) : <p className="hint" style={{ margin: 0 }}>Ninguno todavía. Claude propone uno al terminar una edición que te guste, o créalo aquí.</p>}

      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "notice notice-error"} style={{ margin: 0 }}>{aviso.texto}</p>}</div>

      {!lectura && !forma && estilos.length < max && (
        <button type="button" className="btn btn-secondary" style={{ justifySelf: "start" }} onClick={() => { setForma(enEdicion({})); setAviso(null); }}>
          <Icon name="plus" size={18} /> Nuevo estilo de edición
        </button>
      )}

      {!lectura && forma && (
        <form className="identidad-grupo" onSubmit={(ev) => { ev.preventDefault(); guardar(); }} aria-label={forma.id ? `Editar el estilo ${forma.nombre}` : "Nuevo estilo de edición"}>
          <div className="field">
            <label className="label" htmlFor={fid("nombre")}>Nombre</label>
            <input id={fid("nombre")} className="input" maxLength={60} required value={forma.nombre} onChange={raiz("nombre")} placeholder="Ej.: Alex en obra" />
          </div>
          <div className="field">
            <label className="label" htmlFor={fid("tipo")}>Tipo de video</label>
            <select id={fid("tipo")} className="input" value={forma.tipo} onChange={raiz("tipo")}>
              <option value="">Cualquiera</option>
              {tipos.map((t) => <option key={t} value={t}>{TIPOS[t] ?? t}</option>)}
            </select>
          </div>
          {[["gancho", "El gancho"], ["ritmo", "El ritmo"]].map(([k, n]) => (
            <div key={k} className="field">
              <label className="label" htmlFor={fid(k)}>{n}</label>
              <textarea id={fid(k)} className="textarea" rows={2} maxLength={MAX_TEXTO_EDICION} value={forma[k]} onChange={raiz(k)} />
            </div>
          ))}

          <fieldset className="identidad-grupo">
            <legend className="label">Las piezas: cuándo y cómo va cada una (vacía: lo del manual)</legend>
            {Object.entries(piezas).map(([k, desc]) => (
              <div key={k} className="field">
                <label className="label" htmlFor={fid(`p-${k}`)} style={{ textTransform: "none" }}>{desc[0].toUpperCase() + desc.slice(1)}</label>
                <textarea id={fid(`p-${k}`)} className="textarea" rows={2} maxLength={MAX_TEXTO_EDICION} value={forma.piezas[k] ?? ""} onChange={campo("piezas", k)} />
              </div>
            ))}
            <div className="field">
              <label className="label" htmlFor={fid("placas")}>Placas numeradas</label>
              {selectSiNo(fid("placas"), forma.placasNumeradas, raiz("placasNumeradas"))}
            </div>
          </fieldset>

          <fieldset className="identidad-grupo">
            <legend className="label">La cámara</legend>
            {CAMARA.map(([k, n, ej]) => (
              <div key={k} className="field">
                <label className="label" htmlFor={fid(`c-${k}`)} style={{ textTransform: "none" }}>{n}</label>
                <input id={fid(`c-${k}`)} className="input" inputMode="decimal" value={forma.camara[k]} onChange={campo("camara", k)} placeholder={`Ej.: ${ej}`} />
              </div>
            ))}
            <div className="field">
              <label className="label" htmlFor={fid("golpe")}>Golpe de zoom al entrar a cada tramo</label>
              {selectSiNo(fid("golpe"), forma.camara.golpeAlEntrar, campo("camara", "golpeAlEntrar"))}
            </div>
          </fieldset>

          <fieldset className="identidad-grupo">
            <legend className="label">Las transiciones</legend>
            {[["entreClips", "Entre clips"], ["saltoMismoClip", "Dentro de un clip (un salto)"]].map(([k, n]) => (
              <div key={k} className="field">
                <label className="label" htmlFor={fid(`t-${k}`)} style={{ textTransform: "none" }}>{n}</label>
                <select id={fid(`t-${k}`)} className="input" value={forma.transiciones[k]} onChange={campo("transiciones", k)}>
                  <option value="">Lo del manual</option>
                  {Object.entries(transiciones).map(([v, d]) => <option key={v} value={v}>{v} · {d}</option>)}
                </select>
              </div>
            ))}
          </fieldset>

          <fieldset className="identidad-grupo">
            <legend className="label">El cierre</legend>
            <div className="field">
              <label className="label" htmlFor={fid("cs")} style={{ textTransform: "none" }}>Segundos sin voz</label>
              <input id={fid("cs")} className="input" inputMode="decimal" value={forma.cierre.segundos} onChange={campo("cierre", "segundos")} placeholder="Ej.: 3" />
            </div>
            <div className="field">
              <label className="label" htmlFor={fid("cb")} style={{ textTransform: "none" }}>El botón</label>
              <input id={fid("cb")} className="input" maxLength={40} value={forma.cierre.boton} onChange={campo("cierre", "boton")} placeholder="Ej.: ESCRÍBANOS AL WHATSAPP" />
            </div>
            {[["numero", "Con el número"], ["usuario", "Con el @usuario"]].map(([k, n]) => (
              <div key={k} className="field">
                <label className="label" htmlFor={fid(`cc-${k}`)} style={{ textTransform: "none" }}>{n}</label>
                {selectSiNo(fid(`cc-${k}`), forma.cierre[k], campo("cierre", k))}
              </div>
            ))}
          </fieldset>

          <fieldset className="identidad-grupo">
            <legend className="label">La música (dB, como los números del oficio; vacío: los del oficio)</legend>
            {MUSICA.map(([k, n, ej]) => (
              <div key={k} className="field">
                <label className="label" htmlFor={fid(`m-${k}`)} style={{ textTransform: "none" }}>{n}</label>
                <input id={fid(`m-${k}`)} className="input" inputMode="decimal" value={forma.musica[k]} onChange={campo("musica", k)} placeholder={`Ej.: ${ej}`} />
              </div>
            ))}
          </fieldset>

          <div className="field">
            <label className="label" htmlFor={fid("notas")}>Notas</label>
            <textarea id={fid("notas")} className="textarea" rows={3} maxLength={MAX_NOTAS_EDICION} value={forma.notas} onChange={raiz("notas")}
              placeholder="Ej.: Alex tutea al hablar: se deja. Lo escrito por la marca, de usted." />
          </div>
          <div className="action-row" style={{ margin: 0 }}>
            <button type="submit" className="btn btn-primary" disabled={ocupado || !forma.nombre.trim()}>{ocupado ? "Guardando…" : "Guardar el estilo"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setForma(null); setAviso(null); }}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
