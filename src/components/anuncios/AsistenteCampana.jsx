import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import * as api from "../../lib/anunciosApi";
import {
  OBJETIVOS, CATEGORIAS_ESPECIALES, BOTONES, PAISES, EDAD_MIN, EDAD_MAX, RADIO_MIN_ESPECIAL_KM, MAX_TEXTO,
  borradorVacio, validarBorrador, erroresDelPaso, formatoMoneda, nombrePais, diasEntre, deMenores,
} from "../../lib/anuncios";
import { fechaEnZona } from "../../lib/agenda";

// ============================================================
// «Nueva campaña»: el asistente de cinco pasos
//
//   1. Objetivo (ODAX) y, si toca, categoría especial y píxel
//   2. Presupuesto diario o total, con fechas
//   3. Público: países, ciudades, edad y sexo
//   4. Anuncio: imagen o video del Estudio o de una publicación, texto,
//      título, enlace y botón
//   5. Revisión y crear — EN PAUSA
//
// Cada paso se valida con `validarBorrador()`, la misma función que usa el
// servidor antes de crear: lo que aquí se deja pasar y allí no, es un
// fallo de esta pantalla.
//
// El medio se sube a Meta al escogerlo (imagen → hash; video → Meta lo
// descarga y lo procesa, y aquí se espera a que esté listo). Así «Crear»
// es una sola llamada rápida.
// ============================================================

const PASOS = ["Objetivo", "Presupuesto", "Público", "Anuncio", "Revisar"];
const ESPERA_VIDEO_MS = 4000;

function Errores({ lista }) {
  if (!lista.length) return null;
  return (
    <ul role="alert" className="notice notice-error anu-errores">
      {lista.map((e) => <li key={`${e.campo}-${e.mensaje}`}>{e.mensaje}</li>)}
    </ul>
  );
}

function PasoObjetivo({ b, poner, ids, pixelesCuenta }) {
  const obj = OBJETIVOS[b.objetivo];
  const especial = b.categorias.length > 0;
  return (
    <>
      <div className="field">
        <label className="label" htmlFor={`${ids}-nombre`}>Nombre de la campaña</label>
        <input id={`${ids}-nombre`} className="input" value={b.nombre} maxLength={200} onChange={(e) => poner({ nombre: e.target.value })} placeholder="Ej.: Octubre · Tráfico a la tienda" />
      </div>
      <fieldset className="anu-fieldset">
        <legend className="label">¿Qué quieres conseguir?</legend>
        <div className="anu-objetivos">
          {Object.entries(OBJETIVOS).map(([id, o]) => (
            <label key={id} className="anu-objetivo" data-activo={b.objetivo === id || undefined}>
              <input type="radio" name={`${ids}-objetivo`} value={id} checked={b.objetivo === id} onChange={() => poner({ objetivo: id })} />
              <span className="anu-objetivo-nombre">{o.nombre}</span>
              <span className="hint">{o.descripcion}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {obj?.pixel && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-pixel`}>Píxel de Meta de la web</label>
          <select id={`${ids}-pixel`} className="input" value={b.pixelId} onChange={(e) => poner({ pixelId: e.target.value })}>
            <option value="">{pixelesCuenta === null ? "Cargando píxeles…" : pixelesCuenta.length ? "Escoge el píxel" : "Esta cuenta no tiene píxel"}</option>
            {(pixelesCuenta ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre || p.id}</option>)}
          </select>
          {pixelesCuenta?.length === 0 && <p className="hint">Sin píxel no se miden los resultados en la web. Usa «Tráfico» o instala el píxel primero.</p>}
        </div>
      )}
      <div className="field">
        <label className="anu-check">
          <input type="checkbox" checked={especial} onChange={(e) => poner({ categorias: e.target.checked ? [CATEGORIAS_ESPECIALES[0].id] : [] })} />
          <span>Es de una <strong>categoría especial</strong> (vivienda, empleo, crédito o política)</span>
        </label>
        <p className="hint">Meta obliga a declararlo, y entonces no deja escoger edad ni sexo. Si no es tu caso, déjalo sin marcar.</p>
        {especial && (
          <div className="anu-especial">
            <div className="anu-chips" role="group" aria-label="Categorías especiales">
              {CATEGORIAS_ESPECIALES.map((c) => {
                const on = b.categorias.includes(c.id);
                return (
                  <button key={c.id} type="button" className="filter-chip" aria-pressed={on}
                    onClick={() => poner({ categorias: on ? b.categorias.filter((x) => x !== c.id) : [...b.categorias, c.id] })}>
                    {c.nombre}
                  </button>
                );
              })}
            </div>
            <label className="label" htmlFor={`${ids}-paiscat`}>País donde aplica</label>
            <select id={`${ids}-paiscat`} className="input" value={b.paisCategoria} onChange={(e) => poner({ paisCategoria: e.target.value })}>
              {PAISES.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select>
          </div>
        )}
      </div>
    </>
  );
}

function PasoPresupuesto({ b, poner, ids, cuenta }) {
  const dias = b.fin ? diasEntre(b.inicio, b.fin) : 0;
  const monto = Number(b.presupuesto.monto) || 0;
  return (
    <>
      <div className="segmented" role="group" aria-label="Tipo de presupuesto">
        {[["diario", "Diario"], ["total", "Total"]].map(([id, nombre]) => (
          <button key={id} type="button" className={`segmented-btn ${b.presupuesto.tipo === id ? "active" : ""}`} aria-pressed={b.presupuesto.tipo === id}
            onClick={() => poner({ presupuesto: { ...b.presupuesto, tipo: id } })}>
            {nombre}
          </button>
        ))}
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-monto`}>
          {b.presupuesto.tipo === "total" ? "Presupuesto total" : "Presupuesto al día"} ({cuenta.moneda})
        </label>
        <input id={`${ids}-monto`} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={b.presupuesto.monto}
          onChange={(e) => poner({ presupuesto: { ...b.presupuesto, monto: e.target.value } })} placeholder="Ej.: 10" />
        {cuenta.minimoDiario ? <p className="hint">Mínimo de la cuenta: {formatoMoneda(deMenores(cuenta.minimoDiario, cuenta.moneda), cuenta.moneda)} al día.</p> : null}
      </div>
      <div className="anu-fechas">
        <div className="field">
          <span className="label">Empieza</span>
          <SelectorFecha value={b.inicio || null} onChange={(f) => poner({ inicio: f || "" })} etiqueta="Fecha de inicio" vacio="Sin fecha" prefijo="El" />
        </div>
        <div className="field">
          <span className="label">Termina {b.presupuesto.tipo === "diario" && <span className="hint">(opcional)</span>}</span>
          <SelectorFecha value={b.fin || null} onChange={(f) => poner({ fin: f || "" })} etiqueta="Fecha de fin" vacio="Sin fecha de fin" prefijo="El" />
        </div>
      </div>
      {monto > 0 && (
        <p className="hint" role="status">
          {b.presupuesto.tipo === "total"
            ? `Hasta ${formatoMoneda(monto, cuenta.moneda)} en total${dias ? `, unos ${formatoMoneda(monto / dias, cuenta.moneda)} al día durante ${dias} días` : ""}.`
            : `Hasta ${formatoMoneda(monto, cuenta.moneda)} al día${dias ? `: como mucho ${formatoMoneda(monto * dias, cuenta.moneda)} en ${dias} días` : ", sin fecha de fin"}.`}
        </p>
      )}
    </>
  );
}

function PasoPublico({ b, poner, ids, clientId }) {
  const pub = b.publico;
  const especial = b.categorias.length > 0;
  const [q, setQ] = useState("");
  const [encontradas, setEncontradas] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState("");
  const ponerPub = (cambios) => poner({ publico: { ...pub, ...cambios } });
  const edades = Array.from({ length: EDAD_MAX - EDAD_MIN + 1 }, (_, i) => EDAD_MIN + i);

  const buscar = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBuscando(true);
    setFallo("");
    try { setEncontradas(await api.buscarCiudades(clientId, q.trim())); } catch (err) { setFallo(err.message); }
    setBuscando(false);
  };

  return (
    <>
      <fieldset className="anu-fieldset">
        <legend className="label">Países</legend>
        <div className="anu-chips" role="group" aria-label="Países">
          {PAISES.map((p) => {
            const on = pub.paises.includes(p.codigo);
            return (
              <button key={p.codigo} type="button" className="filter-chip" aria-pressed={on}
                onClick={() => ponerPub({ paises: on ? pub.paises.filter((x) => x !== p.codigo) : [...pub.paises, p.codigo] })}>
                {p.nombre}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor={`${ids}-ciudad`}>Ciudades (en vez del país entero)</label>
        <form className="anu-buscar" onSubmit={buscar} role="search">
          <input id={`${ids}-ciudad`} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: David, Chiriquí" autoComplete="off" />
          <button type="submit" className="btn btn-secondary" disabled={buscando || q.trim().length < 2}>
            <Icon name="search" size={16} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {fallo && <p className="hint" role="alert">{fallo}</p>}
        {encontradas.length > 0 && (
          <ul className="anu-lista-ciudades" aria-label="Ciudades encontradas">
            {encontradas.map((c) => (
              <li key={c.key}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pub.ciudades.some((x) => x.key === c.key)}
                  onClick={() => { ponerPub({ ciudades: [...pub.ciudades, { ...c, radio: especial ? RADIO_MIN_ESPECIAL_KM : 10 }] }); setEncontradas([]); setQ(""); }}>
                  <Icon name="plus" size={14} /> {c.nombre}{c.region ? `, ${c.region}` : ""} · {nombrePais(c.pais)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pub.ciudades.length > 0 && (
          <ul className="anu-ciudades">
            {pub.ciudades.map((c) => (
              <li key={c.key}>
                <span>{c.nombre} · {nombrePais(c.pais)}</span>
                <label className="sr-only" htmlFor={`${ids}-radio-${c.key}`}>Radio alrededor de {c.nombre}</label>
                <select id={`${ids}-radio-${c.key}`} className="input anu-radio" value={c.radio}
                  onChange={(e) => ponerPub({ ciudades: pub.ciudades.map((x) => (x.key === c.key ? { ...x, radio: Number(e.target.value) } : x)) })}>
                  {[0, 10, 17, 25, 40, 80].filter((r) => !especial || r >= RADIO_MIN_ESPECIAL_KM).map((r) => <option key={r} value={r}>{r ? `+${r} km` : "Sólo la ciudad"}</option>)}
                </select>
                <button type="button" className="btn-icon" aria-label={`Quitar ${c.nombre}`} onClick={() => ponerPub({ ciudades: pub.ciudades.filter((x) => x.key !== c.key) })}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="anu-fechas">
        <div className="field">
          <label className="label" htmlFor={`${ids}-emin`}>Edad desde</label>
          <select id={`${ids}-emin`} className="input" value={pub.edadMin} disabled={especial} onChange={(e) => ponerPub({ edadMin: Number(e.target.value) })}>
            {edades.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-emax`}>hasta</label>
          <select id={`${ids}-emax`} className="input" value={pub.edadMax} disabled={especial} onChange={(e) => ponerPub({ edadMax: Number(e.target.value) })}>
            {edades.map((n) => <option key={n} value={n}>{n === EDAD_MAX ? `${n}+` : n}</option>)}
          </select>
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Sexo">
        {[["todos", "Todos"], ["mujeres", "Mujeres"], ["hombres", "Hombres"]].map(([id, nombre]) => (
          <button key={id} type="button" className={`segmented-btn ${pub.sexo === id ? "active" : ""}`} aria-pressed={pub.sexo === id}
            disabled={especial && id !== "todos"} onClick={() => ponerPub({ sexo: id })}>
            {nombre}
          </button>
        ))}
      </div>
      {especial && <p className="hint">Con categoría especial, Meta exige todas las edades y los dos sexos.</p>}
    </>
  );
}

function PasoAnuncio({ b, poner, ids, clientId }) {
  const a = b.anuncio;
  const [lista, setLista] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState("");
  const ponerA = (cambios) => poner((p) => ({ anuncio: { ...p.anuncio, ...cambios } }));

  useEffect(() => {
    let vivo = true;
    api.medios(clientId).then((l) => vivo && setLista(l)).catch((e) => vivo && (setLista([]), setFallo(e.message)));
    return () => { vivo = false; };
  }, [clientId]);

  // Un video lo procesa Meta: se pregunta cada pocos segundos hasta que esté listo.
  const videoId = a.medio?.tipo === "video" && !a.medio.listo ? a.medio.videoId : null;
  useEffect(() => {
    if (!videoId) return undefined;
    let vivo = true;
    const t = setInterval(async () => {
      try {
        const v = await api.estadoVideo(clientId, videoId);
        if (!vivo) return;
        if (v.fallo) { setFallo("Meta no pudo procesar el video. Prueba con otro (MP4, H.264)."); poner((p) => ({ anuncio: { ...p.anuncio, medio: null } })); }
        else if (v.listo) poner((p) => ({ anuncio: { ...p.anuncio, medio: { ...p.anuncio.medio, listo: true, miniatura: v.miniatura } } }));
      } catch (e) { if (vivo) setFallo(e.message); }
    }, ESPERA_VIDEO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [videoId, clientId, poner]);

  const escoger = async (m) => {
    setFallo("");
    setSubiendo(true);
    ponerA({ medio: { clave: m.clave, tipo: m.tipo, src: m.src }, ...(m.texto && !a.texto ? { texto: m.texto.slice(0, MAX_TEXTO) } : {}) });
    try {
      const r = await api.prepararMedio(clientId, m.clave);
      ponerA({ medio: { ...r, src: m.src } });
    } catch (e) {
      setFallo(e.message);
      ponerA({ medio: null });
    }
    setSubiendo(false);
  };

  const estadoMedio = !a.medio ? "" : subiendo ? "Subiendo a Meta…" : a.medio.tipo === "video" && !a.medio.listo ? "Meta está procesando el video…" : "Listo en Meta.";

  return (
    <>
      <fieldset className="anu-fieldset">
        <legend className="label">Imagen o video</legend>
        <p className="hint">Del Estudio o de una publicación del cliente. El video lo descarga Meta y tarda uno o dos minutos en procesarlo.</p>
        {lista === null ? <p className="hint" role="status">Cargando…</p> : lista.length === 0 ? (
          <p className="hint">Este cliente aún no tiene imágenes ni videos en el Estudio ni en sus publicaciones.</p>
        ) : (
          <ul className="anu-medios">
            {lista.map((m) => {
              const elegido = a.medio?.clave === m.clave;
              return (
                <li key={m.clave}>
                  <button type="button" className="anu-medio" aria-pressed={elegido} disabled={subiendo}
                    aria-label={`${m.tipo === "video" ? "Video" : "Imagen"}${m.nombre ? `: ${m.nombre}` : ""}`} onClick={() => escoger(m)}>
                    {m.tipo === "video"
                      ? <span className="anu-medio-video"><Icon name="video" size={24} /></span>
                      : <img src={m.src} alt="" loading="lazy" />}
                    <span className="anu-medio-origen">{m.origen === "estudio" ? "Estudio" : "Publicación"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {estadoMedio && <p className="hint" role="status">{estadoMedio}</p>}
        {fallo && <p className="hint" role="alert">{fallo}</p>}
      </fieldset>

      <div className="field">
        <label className="label" htmlFor={`${ids}-texto`}>Texto principal</label>
        <textarea id={`${ids}-texto`} className="textarea" value={a.texto} maxLength={MAX_TEXTO} onChange={(e) => ponerA({ texto: e.target.value })} placeholder="Lo que se lee encima de la imagen." />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-titulo`}>Título (opcional)</label>
        <input id={`${ids}-titulo`} className="input" value={a.titulo} maxLength={255} onChange={(e) => ponerA({ titulo: e.target.value })} placeholder="Ej.: 2x1 en lattes esta semana" />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-enlace`}>Enlace</label>
        <input id={`${ids}-enlace`} className="input" type="url" inputMode="url" value={a.enlace} onChange={(e) => ponerA({ enlace: e.target.value.trim() })} placeholder="https://" />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-boton`}>Botón</label>
        <select id={`${ids}-boton`} className="input" value={a.boton} onChange={(e) => ponerA({ boton: e.target.value })}>
          {BOTONES.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
      </div>
    </>
  );
}

function PasoRevisar({ b, cuenta }) {
  const obj = OBJETIVOS[b.objetivo];
  const pub = b.publico;
  const lugares = [...pub.paises.map(nombrePais), ...pub.ciudades.map((c) => `${c.nombre}${c.radio ? ` (+${c.radio} km)` : ""}`)].join(", ");
  const filas = [
    ["Campaña", b.nombre],
    ["Objetivo", obj?.nombre],
    ["Categoría especial", b.categorias.length ? CATEGORIAS_ESPECIALES.filter((c) => b.categorias.includes(c.id)).map((c) => c.nombre).join(", ") : "Ninguna"],
    ["Presupuesto", `${formatoMoneda(Number(b.presupuesto.monto), cuenta.moneda)} ${b.presupuesto.tipo === "total" ? "en total" : "al día"}`],
    ["Fechas", `${b.inicio}${b.fin ? ` → ${b.fin}` : " · sin fecha de fin"}`],
    ["Dónde", lugares],
    ["Quién", `${pub.edadMin}–${pub.edadMax === EDAD_MAX ? `${EDAD_MAX}+` : pub.edadMax} años · ${pub.sexo === "todos" ? "todos" : pub.sexo}`],
    ["Anuncio", `${b.anuncio.medio?.tipo === "video" ? "Video" : "Imagen"} · ${BOTONES.find((x) => x.id === b.anuncio.boton)?.nombre}`],
    ["Enlace", b.anuncio.enlace],
  ];
  return (
    <>
      <dl className="anu-revision">
        {filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className="anu-revision-texto">
        {b.anuncio.medio?.tipo !== "video" && b.anuncio.medio?.src && <img src={b.anuncio.medio.src} alt="La imagen del anuncio" />}
        <p>{b.anuncio.texto}</p>
      </div>
      <p className="notice notice-ok" role="note">
        <Icon name="pause" size={16} /> Se crea <strong>en pausa</strong>: la campaña, el conjunto y el anuncio. No gasta nada hasta que el administrador la active.
      </p>
    </>
  );
}

export default function AsistenteCampana({ clientId, cuenta, onClose, onCreada }) {
  const ids = useId();
  const hoy = useMemo(() => fechaEnZona(new Date(), cuenta.zona || "America/Panama"), [cuenta.zona]);
  const [b, setB] = useState(() => borradorVacio(hoy));
  const [paso, setPaso] = useState(1);
  const [intentado, setIntentado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [fallo, setFallo] = useState("");
  const [pixelesCuenta, setPixeles] = useState(null);
  const cuerpoRef = useRef(null);
  const ref = useDialogA11y(() => { if (!creando) onClose(); });

  // Estable: el sondeo del video depende de ella y no debe reiniciarse con cada tecla.
  const poner = useCallback((cambios) => setB((p) => ({ ...p, ...(typeof cambios === "function" ? cambios(p) : cambios) })), []);
  const errores = validarBorrador(b, { moneda: cuenta.moneda, minimoDiario: cuenta.minimoDiario, hoy });
  const delPaso = paso <= 4 ? erroresDelPaso(errores, paso) : errores;
  const necesitaPixel = Boolean(OBJETIVOS[b.objetivo]?.pixel);

  useEffect(() => {
    if (!necesitaPixel || pixelesCuenta !== null) return;
    api.pixeles(clientId).then(setPixeles).catch(() => setPixeles([]));
  }, [necesitaPixel, pixelesCuenta, clientId]);

  const ir = (n) => { setPaso(n); setIntentado(false); cuerpoRef.current?.scrollTo?.(0, 0); };
  const siguiente = () => {
    if (delPaso.length) { setIntentado(true); return; }
    ir(paso + 1);
  };
  const crear = async () => {
    if (errores.length) { setIntentado(true); return; }
    setCreando(true);
    setFallo("");
    try {
      const r = await api.crearCampana(clientId, b);
      onCreada(r);
    } catch (e) {
      setFallo(e.message);
      setCreando(false);
    }
  };

  return (
    // Sin cerrar al pulsar el fondo: un toque de más perdería cinco pasos escritos. Escape y la X sí cierran.
    <div className="overlay overlay-sheet">
      <div ref={ref} className="sheet anu-asistente" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} className="anu-asistente-titulo"><Icon name="megaphone" size={20} /> Nueva campaña</h2>
            <p className="hint">Paso {paso} de {PASOS.length}: {PASOS[paso - 1]} · cuenta {cuenta.nombre} ({cuenta.moneda})</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={creando} aria-label="Cerrar el asistente">
            <Icon name="close" size={18} />
          </button>
        </div>
        <ol className="anu-pasos" aria-label="Pasos">
          {PASOS.map((nombre, i) => (
            <li key={nombre} aria-current={paso === i + 1 ? "step" : undefined} data-hecho={i + 1 < paso || undefined}>
              <span aria-hidden="true">{i + 1}</span> {nombre}
            </li>
          ))}
        </ol>
        <div className="sheet-body anu-asistente-cuerpo" ref={cuerpoRef}>
          {paso === 1 && <PasoObjetivo b={b} poner={poner} ids={ids} pixelesCuenta={pixelesCuenta} />}
          {paso === 2 && <PasoPresupuesto b={b} poner={poner} ids={ids} cuenta={cuenta} />}
          {paso === 3 && <PasoPublico b={b} poner={poner} ids={ids} clientId={clientId} />}
          {paso === 4 && <PasoAnuncio b={b} poner={poner} ids={ids} clientId={clientId} />}
          {paso === 5 && <PasoRevisar b={b} cuenta={cuenta} />}
          {(intentado || paso === 5) && <Errores lista={delPaso} />}
          {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-secondary" onClick={() => (paso > 1 ? ir(paso - 1) : onClose())} disabled={creando}>
            {paso > 1 ? "Atrás" : "Cancelar"}
          </button>
          {paso < PASOS.length ? (
            <button type="button" className="btn btn-primary" onClick={siguiente}>
              Siguiente <Icon name="chevronRight" size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={crear} disabled={creando || errores.length > 0}>
              <Icon name="pause" size={16} /> {creando ? "Creando en Meta…" : "Crear en pausa"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
