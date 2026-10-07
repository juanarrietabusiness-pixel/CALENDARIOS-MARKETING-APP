import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import * as api from "../../lib/anunciosApi";
import {
  OBJETIVOS, CATEGORIAS_ESPECIALES, BOTONES, PAISES, EDAD_MIN, EDAD_MAX, RADIO_MIN_ESPECIAL_KM, MAX_TEXTO,
  DESTINOS, TIPOS_CONJUNTO, MAX_CONJUNTOS, MAX_ANUNCIOS, MAX_TARJETAS, PASOS_CAMPANA,
  borradorVacio, normalizarBorrador, conjuntoVacio, anuncioVacio, tarjetaVacia, validarBorrador, erroresDelPaso,
  formatoMoneda, nombrePais, diasEntre, deMenores, destinoDe, presupuestoDelBorrador,
} from "../../lib/anuncios";
import { fechaEnZona } from "../../lib/agenda";

// ============================================================
// «Nueva campaña»: el asistente de cuatro pasos
//
//   1. Objetivo, a dónde lleva (web o WhatsApp), categoría especial, píxel
//      y fechas
//   2. Públicos: de 1 a 3 conjuntos —intereses, Advantage+, similares o
//      abierto—, cada uno con su presupuesto
//   3. Anuncios: de 1 a 6, cada uno imagen, video o carrusel; van en
//      TODOS los conjuntos
//   4. Revisión y crear — EN PAUSA
//
// Cada paso se valida con `validarBorrador()`, la misma función que usa el
// servidor antes de crear: lo que aquí se deja pasar y allí no, es un
// fallo de esta pantalla.
//
// El medio se sube a Meta al escogerlo (imagen → hash; video → Meta lo
// descarga y lo procesa, y aquí se espera a que esté listo). Así «Crear»
// es una sola llamada.
//
// `inicial` abre el asistente con un borrador ya escrito (el del estratega
// de campañas): se revisa paso a paso igual.
// ============================================================

const ESPERA_VIDEO_MS = 4000;

function Errores({ lista }) {
  if (!lista.length) return null;
  return (
    <ul role="alert" className="notice notice-error anu-errores">
      {lista.map((e, i) => <li key={`${e.campo}-${i}`}>{e.mensaje}</li>)}
    </ul>
  );
}

/** Chips para escoger cuál de la lista se edita, con «Añadir» al final. */
function Selector({ etiqueta, lista, activo, onActivo, nombreDe, onAnadir, max, textoAnadir }) {
  return (
    <div className="anu-chips anu-selector" role="group" aria-label={etiqueta}>
      {lista.map((x, i) => (
        <button key={i} type="button" className="filter-chip" aria-pressed={activo === i} onClick={() => onActivo(i)}>{nombreDe(x, i)}</button>
      ))}
      {lista.length < max && (
        <button type="button" className="filter-chip" onClick={onAnadir}><Icon name="plus" size={14} /> {textoAnadir}</button>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 1. Objetivo
// ------------------------------------------------------------

function PasoObjetivo({ b, poner, ids, pixelesCuenta }) {
  const especial = b.categorias.length > 0;
  const whatsappPosible = DESTINOS.whatsapp.objetivos.includes(b.objetivo);
  const destino = destinoDe(b);
  const conPixel = destino === "web" && OBJETIVOS[b.objetivo]?.pixel;
  const dias = b.fin ? diasEntre(b.inicio, b.fin) : 0;
  return (
    <>
      <div className="field">
        <label className="label" htmlFor={`${ids}-nombre`}>Nombre de la campaña</label>
        <input id={`${ids}-nombre`} className="input" value={b.nombre} maxLength={200} onChange={(e) => poner({ nombre: e.target.value })} placeholder="Ej.: Octubre · Ventas · Sofá cama" />
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
      {whatsappPosible && (
        <fieldset className="anu-fieldset">
          <legend className="label">¿A dónde lleva el anuncio?</legend>
          <div className="segmented" role="group" aria-label="A dónde lleva el anuncio">
            {Object.entries(DESTINOS).map(([id, d]) => (
              <button key={id} type="button" className={`segmented-btn ${destino === id ? "active" : ""}`} aria-pressed={destino === id} onClick={() => poner({ destino: id })}>
                {id === "whatsapp" && <Icon name="message" size={14} />} {d.nombre}
              </button>
            ))}
          </div>
          <p className="hint">
            {destino === "whatsapp"
              ? "El botón abre WhatsApp con el número conectado a la página del cliente (se conecta una vez en el Administrador de anuncios). Meta optimiza por conversaciones."
              : DESTINOS.web.descripcion}
          </p>
        </fieldset>
      )}
      {conPixel && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-pixel`}>Píxel de Meta de la web</label>
          <select id={`${ids}-pixel`} className="input" value={b.pixelId} onChange={(e) => poner({ pixelId: e.target.value })}>
            <option value="">{pixelesCuenta === null ? "Cargando píxeles…" : pixelesCuenta.length ? "Escoge el píxel" : "Esta cuenta no tiene píxel"}</option>
            {(pixelesCuenta ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre || p.id}</option>)}
          </select>
          {pixelesCuenta?.length === 0 && <p className="hint">Sin píxel no se miden los resultados en la web. Lleva la campaña a WhatsApp, usa «Tráfico» o instala el píxel primero.</p>}
        </div>
      )}
      <div className="anu-fechas">
        <div className="field">
          <span className="label">Empieza</span>
          <SelectorFecha value={b.inicio || null} onChange={(f) => poner({ inicio: f || "" })} etiqueta="Fecha de inicio" vacio="Sin fecha" prefijo="El" />
        </div>
        <div className="field">
          <span className="label">Termina <span className="hint">(opcional con presupuesto diario)</span></span>
          <SelectorFecha value={b.fin || null} onChange={(f) => poner({ fin: f || "" })} etiqueta="Fecha de fin" vacio="Sin fecha de fin" prefijo="El" />
        </div>
      </div>
      {dias > 0 && <p className="hint">{dias} días.</p>}
      <div className="field">
        <label className="anu-check">
          <input type="checkbox" checked={especial} onChange={(e) => poner({ categorias: e.target.checked ? [CATEGORIAS_ESPECIALES[0].id] : [] })} />
          <span>Es de una <strong>categoría especial</strong> (vivienda, empleo, crédito o política)</span>
        </label>
        <p className="hint">Meta obliga a declararlo, y entonces no deja escoger edad, sexo ni públicos similares. Si no es tu caso, déjalo sin marcar.</p>
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

// ------------------------------------------------------------
// 2. Públicos (conjuntos)
// ------------------------------------------------------------

function BuscarEnMeta({ id, etiqueta, placeholder, buscar, onElegir, pintar, yaEsta }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState("");
  const enviar = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBuscando(true);
    setFallo("");
    try {
      const r = await buscar(q.trim());
      setLista(r);
      if (!r.length) setFallo("Meta no encontró nada con eso.");
    } catch (err) { setFallo(err.message); }
    setBuscando(false);
  };
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{etiqueta}</label>
      <form className="anu-buscar" onSubmit={enviar} role="search">
        <input id={id} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
        <button type="submit" className="btn btn-secondary" disabled={buscando || q.trim().length < 2}>
          <Icon name="search" size={16} /> {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {fallo && <p className="hint" role="alert">{fallo}</p>}
      {lista.length > 0 && (
        <ul className="anu-lista-ciudades" aria-label="Encontrados">
          {lista.map((x) => (
            <li key={x.key ?? x.id}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={yaEsta(x)} onClick={() => { onElegir(x); setLista([]); setQ(""); }}>
                <Icon name="plus" size={14} /> {pintar(x)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const millones = (n) => (n ? ` · ${n >= 1e6 ? `${Math.round(n / 1e5) / 10} M` : `${Math.round(n / 1e3)} mil`}` : "");

function EditorConjunto({ c, i, especial, cuenta, ids, clientId, ponerC, publicos, onPublicos }) {
  const pub = c.publico;
  const ponerPub = (cambios) => ponerC({ publico: { ...pub, ...cambios } });
  const edades = Array.from({ length: EDAD_MAX - EDAD_MIN + 1 }, (_, k) => EDAD_MIN + k);
  const id = `${ids}-c${i}`;
  const [origen, setOrigen] = useState("");
  const [creando, setCreando] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);
  const sugeridos = Array.isArray(c.sugeridos) ? c.sugeridos : [];

  /** Los intereses que propuso el estratega (palabras) se buscan en Meta: se queda el primero que encuentre de cada uno. */
  const resolver = async (palabras) => {
    setResolviendo(true);
    setFallo("");
    const intereses = [...pub.intereses];
    const sinEncontrar = [];
    for (const w of palabras) {
      try {
        const x = (await api.buscarIntereses(clientId, w))[0];
        if (x && !intereses.some((y) => y.id === x.id)) intereses.push({ id: x.id, nombre: x.nombre });
        if (!x) sinEncontrar.push(w);
      } catch (e) { setFallo(e.message); sinEncontrar.push(w); break; }
    }
    ponerC({ publico: { ...pub, intereses }, sugeridos: sugeridos.filter((w) => !palabras.includes(w) || sinEncontrar.includes(w)) });
    if (sinEncontrar.length) setFallo(`Meta no tiene estos intereses: ${sinEncontrar.join(", ")}. Busca otros parecidos.`);
    setResolviendo(false);
  };
  const [fallo, setFallo] = useState("");
  const monto = Number(c.presupuesto.monto) || 0;

  const crearSimilar = async () => {
    setCreando(true);
    setFallo("");
    try {
      const nuevo = await api.crearSimilar(clientId, { origenId: origen, pais: pub.paises[0] || "PA", porcentaje: 1 });
      onPublicos((l) => [...(l ?? []), nuevo]);
      ponerPub({ similares: [{ id: nuevo.id, nombre: nuevo.nombre }] });
    } catch (e) { setFallo(e.message); }
    setCreando(false);
  };

  return (
    <div className="anu-conjunto">
      <div className="anu-fechas">
        <div className="field">
          <label className="label" htmlFor={`${id}-nombre`}>Nombre del conjunto</label>
          <input id={`${id}-nombre`} className="input" value={c.nombre} maxLength={80} onChange={(e) => ponerC({ nombre: e.target.value })} placeholder={TIPOS_CONJUNTO[c.tipo]?.nombre ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-monto`}>Presupuesto {c.presupuesto.tipo === "total" ? "total" : "al día"} ({cuenta.moneda})</label>
          <div className="anu-monto">
            <input id={`${id}-monto`} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={c.presupuesto.monto}
              onChange={(e) => ponerC({ presupuesto: { ...c.presupuesto, monto: e.target.value } })} placeholder="Ej.: 5" />
            <div className="segmented" role="group" aria-label="Tipo de presupuesto">
              {[["diario", "Diario"], ["total", "Total"]].map(([t, nombre]) => (
                <button key={t} type="button" className={`segmented-btn ${c.presupuesto.tipo === t ? "active" : ""}`} aria-pressed={c.presupuesto.tipo === t}
                  onClick={() => ponerC({ presupuesto: { ...c.presupuesto, tipo: t } })}>{nombre}</button>
              ))}
            </div>
          </div>
          {cuenta.minimoDiario ? <p className="hint">Mínimo de la cuenta: {formatoMoneda(deMenores(cuenta.minimoDiario, cuenta.moneda), cuenta.moneda)} al día.</p> : null}
          {monto > 0 && <p className="hint">{formatoMoneda(monto, cuenta.moneda)} {c.presupuesto.tipo === "total" ? "en total" : "al día"}.</p>}
        </div>
      </div>

      <fieldset className="anu-fieldset">
        <legend className="label">Tipo de público</legend>
        <div className="anu-chips" role="group" aria-label="Tipo de público">
          {Object.entries(TIPOS_CONJUNTO).map(([t, d]) => (
            <button key={t} type="button" className="filter-chip" aria-pressed={c.tipo === t} title={d.ayuda}
              disabled={especial && t === "similares"} onClick={() => ponerC({ tipo: t })}>{d.nombre}</button>
          ))}
        </div>
        <p className="hint">{TIPOS_CONJUNTO[c.tipo]?.ayuda}</p>
      </fieldset>

      {(c.tipo === "intereses" || c.tipo === "advantage") && (
        <>
          <BuscarEnMeta id={`${id}-int`} etiqueta={c.tipo === "advantage" ? "Intereses como sugerencia (opcional)" : "Intereses"} placeholder="Ej.: muebles, decoración, hogar"
            buscar={(q) => api.buscarIntereses(clientId, q)} yaEsta={(x) => pub.intereses.some((y) => y.id === x.id)}
            pintar={(x) => `${x.nombre}${millones(x.tamano)}${x.ruta ? ` · ${x.ruta}` : ""}`}
            onElegir={(x) => ponerPub({ intereses: [...pub.intereses, { id: x.id, nombre: x.nombre }] })} />
          {sugeridos.length > 0 && (
            <div className="anu-sugeridos">
              <span className="hint">Sugeridos por el estratega:</span>
              <div className="anu-chips" role="group" aria-label="Intereses sugeridos">
                {sugeridos.map((w) => (
                  <button key={w} type="button" className="filter-chip" disabled={resolviendo} onClick={() => resolver([w])}><Icon name="plus" size={12} /> {w}</button>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" disabled={resolviendo} onClick={() => resolver(sugeridos)}>{resolviendo ? "Buscando en Meta…" : "Buscar todos en Meta"}</button>
              </div>
              {fallo && <p className="hint" role="alert">{fallo}</p>}
            </div>
          )}
          {pub.intereses.length > 0 && (
            <div className="anu-chips" role="group" aria-label="Intereses escogidos">
              {pub.intereses.map((x) => (
                <button key={x.id} type="button" className="filter-chip" aria-pressed="true" aria-label={`Quitar ${x.nombre}`}
                  onClick={() => ponerPub({ intereses: pub.intereses.filter((y) => y.id !== x.id) })}>{x.nombre} <Icon name="close" size={12} /></button>
              ))}
            </div>
          )}
        </>
      )}

      {c.tipo === "similares" && (
        <div className="field">
          <label className="label" htmlFor={`${id}-sim`}>Público similar</label>
          <select id={`${id}-sim`} className="input" value={pub.similares[0]?.id ?? ""}
            onChange={(e) => { const p = (publicos ?? []).find((x) => x.id === e.target.value); ponerPub({ similares: p ? [{ id: p.id, nombre: p.nombre }] : [] }); }}>
            <option value="">{publicos === null ? "Cargando públicos…" : "Escoge un público"}</option>
            {(publicos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.similar ? " (similar)" : ""}{p.tamano ? ` · ${p.tamano.toLocaleString("es")} personas` : ""}</option>)}
          </select>
          {(publicos ?? []).some((p) => !p.similar) && (
            <div className="anu-similar-nuevo">
              <label className="label" htmlFor={`${id}-origen`}>O crea uno similar al 1 % de…</label>
              <div className="anu-buscar">
                <select id={`${id}-origen`} className="input" value={origen} onChange={(e) => setOrigen(e.target.value)}>
                  <option value="">Escoge el público de origen</option>
                  {publicos.filter((p) => !p.similar).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" disabled={!origen || creando} onClick={crearSimilar}>{creando ? "Creando…" : "Crear similar"}</button>
              </div>
              <p className="hint">Un público no gasta nada. Meta tarda unas horas en llenarlo.</p>
            </div>
          )}
          {publicos?.length === 0 && <p className="hint">Esta cuenta no tiene públicos. Créalos en el Administrador de anuncios (clientes, quien escribió por WhatsApp, quien vio un video) y vuelve.</p>}
          {fallo && <p className="hint" role="alert">{fallo}</p>}
        </div>
      )}

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

      <BuscarEnMeta id={`${id}-ciudad`} etiqueta="Ciudades (en vez del país entero)" placeholder="Ej.: David, Chiriquí"
        buscar={(q) => api.buscarCiudades(clientId, q)} yaEsta={(x) => pub.ciudades.some((y) => y.key === x.key)}
        pintar={(x) => `${x.nombre}${x.region ? `, ${x.region}` : ""} · ${nombrePais(x.pais)}`}
        onElegir={(x) => ponerPub({ ciudades: [...pub.ciudades, { ...x, radio: especial ? RADIO_MIN_ESPECIAL_KM : 10 }] })} />
      {pub.ciudades.length > 0 && (
        <ul className="anu-ciudades">
          {pub.ciudades.map((x) => (
            <li key={x.key}>
              <span>{x.nombre} · {nombrePais(x.pais)}</span>
              <label className="sr-only" htmlFor={`${id}-radio-${x.key}`}>Radio alrededor de {x.nombre}</label>
              <select id={`${id}-radio-${x.key}`} className="input anu-radio" value={x.radio}
                onChange={(e) => ponerPub({ ciudades: pub.ciudades.map((y) => (y.key === x.key ? { ...y, radio: Number(e.target.value) } : y)) })}>
                {[0, 10, 17, 25, 40, 80].filter((r) => !especial || r >= RADIO_MIN_ESPECIAL_KM).map((r) => <option key={r} value={r}>{r ? `+${r} km` : "Sólo la ciudad"}</option>)}
              </select>
              <button type="button" className="btn-icon" aria-label={`Quitar ${x.nombre}`} onClick={() => ponerPub({ ciudades: pub.ciudades.filter((y) => y.key !== x.key) })}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="anu-fechas">
        <div className="field">
          <label className="label" htmlFor={`${id}-emin`}>Edad desde</label>
          <select id={`${id}-emin`} className="input" value={pub.edadMin} disabled={especial} onChange={(e) => ponerPub({ edadMin: Number(e.target.value) })}>
            {edades.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-emax`}>hasta</label>
          <select id={`${id}-emax`} className="input" value={pub.edadMax} disabled={especial || c.tipo === "advantage"} onChange={(e) => ponerPub({ edadMax: Number(e.target.value) })}>
            {edades.map((n) => <option key={n} value={n}>{n === EDAD_MAX ? `${n}+` : n}</option>)}
          </select>
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Sexo">
        {[["todos", "Todos"], ["mujeres", "Mujeres"], ["hombres", "Hombres"]].map(([s, nombre]) => (
          <button key={s} type="button" className={`segmented-btn ${pub.sexo === s ? "active" : ""}`} aria-pressed={pub.sexo === s}
            disabled={especial && s !== "todos"} onClick={() => ponerPub({ sexo: s })}>
            {nombre}
          </button>
        ))}
      </div>
      {especial && <p className="hint">Con categoría especial, Meta exige todas las edades y los dos sexos.</p>}
      {c.tipo === "advantage" && <p className="hint">Con Advantage+, Meta puede salirse de la edad y los intereses si encuentra mejores resultados; el lugar sí se respeta.</p>}
    </div>
  );
}

function PasoPublicos({ b, poner, ids, clientId, cuenta }) {
  const [activo, setActivo] = useState(0);
  const [publicos, setPublicos] = useState(null);
  const especial = b.categorias.length > 0;
  const i = Math.min(activo, b.conjuntos.length - 1);
  const c = b.conjuntos[i];
  const ponerC = (cambios) => poner((p) => ({ conjuntos: p.conjuntos.map((x, j) => (j === i ? { ...x, ...cambios } : x)) }));
  const necesitaPublicos = b.conjuntos.some((x) => x.tipo === "similares");

  useEffect(() => {
    if (!necesitaPublicos || publicos !== null) return;
    api.publicos(clientId).then(setPublicos).catch(() => setPublicos([]));
  }, [necesitaPublicos, publicos, clientId]);

  const anadir = () => {
    // El que sigue en la receta de la agencia: intereses, Advantage+, similares.
    const tipos = ["intereses", "advantage", "similares"].filter((t) => !b.conjuntos.some((x) => x.tipo === t));
    const nuevo = { ...conjuntoVacio(tipos[0] ?? "abierto"), publico: { ...c.publico, intereses: [], similares: [] }, presupuesto: { ...c.presupuesto } };
    poner((p) => ({ conjuntos: [...p.conjuntos, nuevo] }));
    setActivo(b.conjuntos.length);
  };
  const total = presupuestoDelBorrador(b);

  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        Cada conjunto es un público con su presupuesto; los anuncios van en todos. Lo habitual en ventas: uno por intereses, uno
        Advantage+ y uno de similares.
      </p>
      <Selector etiqueta="Conjuntos" lista={b.conjuntos} activo={i} onActivo={setActivo} max={MAX_CONJUNTOS} onAnadir={anadir} textoAnadir="Añadir público"
        nombreDe={(x, k) => x.nombre || `${k + 1}. ${TIPOS_CONJUNTO[x.tipo]?.nombre ?? "Conjunto"}`} />
      <EditorConjunto key={i} c={c} i={i} especial={especial} cuenta={cuenta} ids={ids} clientId={clientId} ponerC={ponerC} publicos={publicos} onPublicos={setPublicos} />
      {b.conjuntos.length > 1 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { poner((p) => ({ conjuntos: p.conjuntos.filter((_, j) => j !== i) })); setActivo(0); }}>
          <Icon name="trash" size={14} /> Quitar este conjunto
        </button>
      )}
      {(total.diario || total.total) && (
        <p className="hint" role="status">
          En total: {[total.diario && `${formatoMoneda(total.diario, cuenta.moneda)} al día`, total.total && `${formatoMoneda(total.total, cuenta.moneda)} en total`].filter(Boolean).join(" + ")}
          {b.fin && total.diario ? ` · como mucho ${formatoMoneda(total.diario * diasEntre(b.inicio, b.fin), cuenta.moneda)} hasta el ${b.fin}` : ""}.
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------
// 3. Anuncios
// ------------------------------------------------------------

function Galeria({ lista, elegido, subiendo, onEscoger, soloImagen = false }) {
  if (lista === null) return <p className="hint" role="status">Cargando…</p>;
  const visibles = soloImagen ? lista.filter((m) => m.tipo === "imagen") : lista;
  if (!visibles.length) return <p className="hint">Este cliente aún no tiene {soloImagen ? "imágenes" : "imágenes ni videos"} en el Estudio ni en sus publicaciones.</p>;
  return (
    <ul className="anu-medios">
      {visibles.map((m) => (
        <li key={m.clave}>
          <button type="button" className="anu-medio" aria-pressed={elegido === m.clave} disabled={subiendo}
            aria-label={`${m.tipo === "video" ? "Video" : "Imagen"}${m.nombre ? `: ${m.nombre}` : ""}`} onClick={() => onEscoger(m)}>
            {m.tipo === "video" ? <span className="anu-medio-video"><Icon name="video" size={24} /></span> : <img src={m.src} alt="" loading="lazy" />}
            <span className="anu-medio-origen">{m.origen === "estudio" ? "Estudio" : "Publicación"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EditorAnuncio({ a, i, ids, whatsapp, lista, subir, subiendo, ponerA }) {
  const id = `${ids}-a${i}`;
  const [tarjeta, setTarjeta] = useState(0);
  const t = Math.min(tarjeta, Math.max(0, a.tarjetas.length - 1));
  const estado = (m) => (!m ? "" : m.tipo === "video" && !m.listo ? "Meta está procesando el video…" : m.hash || m.listo ? "Listo en Meta." : "Subiendo a Meta…");

  return (
    <div className="anu-conjunto">
      <div className="anu-fechas">
        <div className="field">
          <label className="label" htmlFor={`${id}-nombre`}>Nombre del anuncio</label>
          <input id={`${id}-nombre`} className="input" value={a.nombre} maxLength={80} onChange={(e) => ponerA({ nombre: e.target.value })} placeholder={`Anuncio ${i + 1}`} />
        </div>
        <div className="field">
          <span className="label">Formato</span>
          <div className="segmented" role="group" aria-label="Formato del anuncio">
            {[["unico", "Imagen o video"], ["carrusel", "Carrusel"]].map(([f, nombre]) => (
              <button key={f} type="button" className={`segmented-btn ${a.formato === f ? "active" : ""}`} aria-pressed={a.formato === f}
                onClick={() => ponerA({ formato: f, ...(f === "carrusel" && !a.tarjetas.length ? { tarjetas: [tarjetaVacia(), tarjetaVacia()] } : {}) })}>{nombre}</button>
            ))}
          </div>
        </div>
      </div>

      {a.pieza && <p className="hint"><Icon name="image" size={12} /> Pieza sugerida por el estratega: {a.pieza}</p>}
      {a.formato === "carrusel" ? (
        <fieldset className="anu-fieldset">
          <legend className="label">Tarjetas del carrusel</legend>
          <Selector etiqueta="Tarjetas" lista={a.tarjetas} activo={t} onActivo={setTarjeta} max={MAX_TARJETAS} textoAnadir="Tarjeta"
            onAnadir={() => { ponerA((x) => ({ tarjetas: [...x.tarjetas, tarjetaVacia()] })); setTarjeta(a.tarjetas.length); }}
            nombreDe={(x, k) => `Tarjeta ${k + 1}${x.medio?.hash ? "" : " · sin imagen"}`} />
          {a.tarjetas[t] && (
            <>
              <Galeria lista={lista} soloImagen elegido={a.tarjetas[t].medio?.clave} subiendo={subiendo}
                onEscoger={(m) => subir(m, (medio) => ponerA((x) => ({ tarjetas: x.tarjetas.map((y, k) => (k === t ? { ...y, medio } : y)) })))} />
              <p className="hint" role="status">{estado(a.tarjetas[t].medio)}</p>
              <div className="anu-fechas">
                <div className="field">
                  <label className="label" htmlFor={`${id}-t${t}-tit`}>Título de la tarjeta {t + 1}</label>
                  <input id={`${id}-t${t}-tit`} className="input" value={a.tarjetas[t].titulo} maxLength={255}
                    onChange={(e) => ponerA((x) => ({ tarjetas: x.tarjetas.map((y, k) => (k === t ? { ...y, titulo: e.target.value } : y)) }))} placeholder="Ej.: Sofá gris · $400" />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`${id}-t${t}-desc`}>Descripción (opcional)</label>
                  <input id={`${id}-t${t}-desc`} className="input" value={a.tarjetas[t].descripcion} maxLength={120}
                    onChange={(e) => ponerA((x) => ({ tarjetas: x.tarjetas.map((y, k) => (k === t ? { ...y, descripcion: e.target.value } : y)) }))} placeholder="Ej.: Entrega gratis" />
                </div>
              </div>
              {!whatsapp && (
                <div className="field">
                  <label className="label" htmlFor={`${id}-t${t}-enl`}>Enlace de la tarjeta (opcional: si no, el del anuncio)</label>
                  <input id={`${id}-t${t}-enl`} className="input" type="url" inputMode="url" value={a.tarjetas[t].enlace}
                    onChange={(e) => ponerA((x) => ({ tarjetas: x.tarjetas.map((y, k) => (k === t ? { ...y, enlace: e.target.value.trim() } : y)) }))} placeholder="https://" />
                </div>
              )}
              {a.tarjetas.length > 2 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { ponerA((x) => ({ tarjetas: x.tarjetas.filter((_, k) => k !== t) })); setTarjeta(0); }}>
                  <Icon name="trash" size={14} /> Quitar la tarjeta {t + 1}
                </button>
              )}
            </>
          )}
        </fieldset>
      ) : (
        <fieldset className="anu-fieldset">
          <legend className="label">Imagen o video</legend>
          <p className="hint">Del Estudio o de una publicación del cliente. El video lo descarga Meta y tarda uno o dos minutos en procesarlo.</p>
          <Galeria lista={lista} elegido={a.medio?.clave} subiendo={subiendo}
            onEscoger={(m) => subir(m, (medio) => ponerA((x) => ({ medio, ...(m.texto && !x.texto ? { texto: m.texto.slice(0, MAX_TEXTO) } : {}) })))} />
          {a.medio && <p className="hint" role="status">{estado(a.medio)}</p>}
        </fieldset>
      )}

      <div className="field">
        <label className="label" htmlFor={`${id}-texto`}>Texto principal</label>
        <textarea id={`${id}-texto`} className="textarea" value={a.texto} maxLength={MAX_TEXTO} onChange={(e) => ponerA({ texto: e.target.value })} placeholder="Lo que se lee encima de la imagen." />
      </div>
      {a.formato !== "carrusel" && (
        <div className="anu-fechas">
          <div className="field">
            <label className="label" htmlFor={`${id}-titulo`}>Título (opcional)</label>
            <input id={`${id}-titulo`} className="input" value={a.titulo} maxLength={255} onChange={(e) => ponerA({ titulo: e.target.value })} placeholder="Ej.: Sofá cama desde $400" />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-desc`}>Descripción (opcional)</label>
            <input id={`${id}-desc`} className="input" value={a.descripcion} maxLength={120} onChange={(e) => ponerA({ descripcion: e.target.value })} placeholder="Ej.: Entrega gratis en la ciudad" />
          </div>
        </div>
      )}
      {whatsapp ? (
        <p className="hint"><Icon name="message" size={14} /> El botón es «Enviar mensaje de WhatsApp».</p>
      ) : (
        <div className="anu-fechas">
          <div className="field">
            <label className="label" htmlFor={`${id}-enlace`}>Enlace</label>
            <input id={`${id}-enlace`} className="input" type="url" inputMode="url" value={a.enlace} onChange={(e) => ponerA({ enlace: e.target.value.trim() })} placeholder="https://" />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-boton`}>Botón</label>
            <select id={`${id}-boton`} className="input" value={a.boton} onChange={(e) => ponerA({ boton: e.target.value })}>
              {BOTONES.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function PasoAnuncios({ b, poner, ids, clientId }) {
  const [activo, setActivo] = useState(0);
  const [lista, setLista] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState("");
  const i = Math.min(activo, b.anuncios.length - 1);
  const whatsapp = destinoDe(b) === "whatsapp";
  const ponerA = (cambios) => poner((p) => ({
    anuncios: p.anuncios.map((x, j) => (j === i ? { ...x, ...(typeof cambios === "function" ? cambios(x) : cambios) } : x)),
  }));

  useEffect(() => {
    let vivo = true;
    api.medios(clientId).then((l) => vivo && setLista(l)).catch((e) => vivo && (setLista([]), setFallo(e.message)));
    return () => { vivo = false; };
  }, [clientId]);

  /** Sube a Meta lo escogido y lo pone con `poner(medio)` (primero el aviso de «subiendo», después el hash o el id). */
  const subir = async (m, ponerMedio) => {
    setFallo("");
    setSubiendo(true);
    ponerMedio({ clave: m.clave, tipo: m.tipo, src: m.src });
    try {
      const r = await api.prepararMedio(clientId, m.clave);
      ponerMedio({ ...r, src: m.src });
    } catch (e) {
      setFallo(e.message);
      ponerMedio(null);
    }
    setSubiendo(false);
  };

  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        De 4 a 6 anuncios distintos (foto del producto, reel, carrusel…) para que Meta encuentre el que mejor funciona. Cada
        anuncio va en todos los públicos.
      </p>
      <Selector etiqueta="Anuncios" lista={b.anuncios} activo={i} onActivo={setActivo} max={MAX_ANUNCIOS} textoAnadir="Añadir anuncio"
        onAnadir={() => { poner((p) => ({ anuncios: [...p.anuncios, { ...anuncioVacio(), texto: p.anuncios[i]?.texto ?? "", enlace: p.anuncios[i]?.enlace ?? "", boton: p.anuncios[i]?.boton ?? "LEARN_MORE" }] })); setActivo(b.anuncios.length); }}
        nombreDe={(x, k) => x.nombre || `${k + 1}. ${x.formato === "carrusel" ? "Carrusel" : x.medio?.tipo === "video" ? "Video" : "Imagen"}`} />
      <EditorAnuncio key={i} a={b.anuncios[i]} i={i} ids={ids} whatsapp={whatsapp} lista={lista} subir={subir} subiendo={subiendo} ponerA={ponerA} />
      {fallo && <p className="hint" role="alert">{fallo}</p>}
      {b.anuncios.length > 1 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { poner((p) => ({ anuncios: p.anuncios.filter((_, j) => j !== i) })); setActivo(0); }}>
          <Icon name="trash" size={14} /> Quitar este anuncio
        </button>
      )}
    </>
  );
}

// ------------------------------------------------------------
// 4. Revisar
// ------------------------------------------------------------

function PasoRevisar({ b, cuenta }) {
  const obj = OBJETIVOS[b.objetivo];
  const total = presupuestoDelBorrador(b);
  const lugares = (pub) => [...pub.paises.map(nombrePais), ...pub.ciudades.map((c) => `${c.nombre}${c.radio ? ` (+${c.radio} km)` : ""}`)].join(", ");
  const filas = [
    ["Campaña", b.nombre],
    ["Objetivo", `${obj?.nombre}${destinoDe(b) === "whatsapp" ? " · a WhatsApp" : ""}`],
    ["Categoría especial", b.categorias.length ? CATEGORIAS_ESPECIALES.filter((c) => b.categorias.includes(c.id)).map((c) => c.nombre).join(", ") : "Ninguna"],
    ["Presupuesto", [total.diario && `${formatoMoneda(total.diario, cuenta.moneda)} al día`, total.total && `${formatoMoneda(total.total, cuenta.moneda)} en total`].filter(Boolean).join(" + ")],
    ["Fechas", `${b.inicio}${b.fin ? ` → ${b.fin}` : " · sin fecha de fin"}`],
    ["En Meta", `${b.conjuntos.length} ${b.conjuntos.length === 1 ? "conjunto" : "conjuntos"} × ${b.anuncios.length} ${b.anuncios.length === 1 ? "anuncio" : "anuncios"} = ${b.conjuntos.length * b.anuncios.length} anuncios`],
  ];
  return (
    <>
      <dl className="anu-revision">
        {filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <h3 className="anu-revision-titulo">Públicos</h3>
      <ul className="anu-revision-lista">
        {b.conjuntos.map((c, i) => (
          <li key={i}>
            <strong>{c.nombre || TIPOS_CONJUNTO[c.tipo]?.nombre}</strong> · {formatoMoneda(Number(c.presupuesto.monto), cuenta.moneda)} {c.presupuesto.tipo === "total" ? "en total" : "al día"}
            <span className="hint"> · {lugares(c.publico)} · {c.publico.edadMin}–{c.publico.edadMax === EDAD_MAX ? `${EDAD_MAX}+` : c.publico.edadMax} años
              {c.publico.intereses.length ? ` · ${c.publico.intereses.map((x) => x.nombre).join(", ")}` : ""}
              {c.tipo === "similares" && c.publico.similares[0] ? ` · ${c.publico.similares[0].nombre}` : ""}</span>
          </li>
        ))}
      </ul>
      <h3 className="anu-revision-titulo">Anuncios</h3>
      <ul className="anu-revision-anuncios">
        {b.anuncios.map((a, i) => {
          const src = a.formato === "carrusel" ? a.tarjetas[0]?.medio?.src : a.medio?.tipo !== "video" ? a.medio?.src : null;
          return (
            <li key={i}>
              {src ? <img src={src} alt="" /> : <span className="anu-medio-video"><Icon name={a.formato === "carrusel" ? "formatCarrusel" : "video"} size={20} /></span>}
              <div>
                <strong>{a.nombre || `Anuncio ${i + 1}`}</strong>
                <span className="hint">{a.formato === "carrusel" ? `Carrusel de ${a.tarjetas.length}` : a.medio?.tipo === "video" ? "Video" : "Imagen"}{a.titulo ? ` · ${a.titulo}` : ""}</span>
                <p>{a.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="notice notice-ok" role="note">
        <Icon name="pause" size={16} /> Se crea <strong>en pausa</strong>: la campaña, sus conjuntos y sus anuncios. No gasta nada hasta que el administrador la active.
      </p>
    </>
  );
}

export default function AsistenteCampana({ clientId, cuenta, inicial = null, onClose, onCreada }) {
  const ids = useId();
  const hoy = useMemo(() => fechaEnZona(new Date(), cuenta.zona || "America/Panama"), [cuenta.zona]);
  const [b, setB] = useState(() => normalizarBorrador(inicial ? { ...borradorVacio(hoy), ...inicial, inicio: inicial.inicio && inicial.inicio >= hoy ? inicial.inicio : hoy } : borradorVacio(hoy)));
  const [paso, setPaso] = useState(1);
  const [intentado, setIntentado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [fallo, setFallo] = useState("");
  const [pixelesCuenta, setPixeles] = useState(null);
  const cuerpoRef = useRef(null);
  const ref = useDialogA11y(() => { if (!creando) onClose(); });

  // Estable: el sondeo de los videos depende de ella y no debe reiniciarse con cada tecla.
  const poner = useCallback((cambios) => setB((p) => ({ ...p, ...(typeof cambios === "function" ? cambios(p) : cambios) })), []);
  const errores = validarBorrador(b, { moneda: cuenta.moneda, minimoDiario: cuenta.minimoDiario, hoy });
  const delPaso = paso < PASOS_CAMPANA.length ? erroresDelPaso(errores, paso) : errores;
  const necesitaPixel = destinoDe(b) === "web" && Boolean(OBJETIVOS[b.objetivo]?.pixel);

  useEffect(() => {
    if (!necesitaPixel || pixelesCuenta !== null) return;
    api.pixeles(clientId).then(setPixeles).catch(() => setPixeles([]));
  }, [necesitaPixel, pixelesCuenta, clientId]);

  // Los videos los procesa Meta: se pregunta cada pocos segundos por los que no están listos (de todos los anuncios).
  const pendientes = b.anuncios.map((a) => (a.formato !== "carrusel" && a.medio?.tipo === "video" && a.medio.videoId && !a.medio.listo ? a.medio.videoId : null));
  const clavePendientes = pendientes.filter(Boolean).join(",");
  useEffect(() => {
    if (!clavePendientes) return undefined;
    let vivo = true;
    const t = setInterval(async () => {
      for (const videoId of clavePendientes.split(",")) {
        try {
          const v = await api.estadoVideo(clientId, videoId);
          if (!vivo) return;
          if (v.fallo || v.listo) {
            poner((p) => ({
              anuncios: p.anuncios.map((a) => (a.medio?.videoId !== videoId ? a
                : { ...a, medio: v.fallo ? null : { ...a.medio, listo: true, miniatura: v.miniatura } })),
            }));
            if (v.fallo) setFallo("Meta no pudo procesar un video. Prueba con otro (MP4, H.264).");
          }
        } catch (e) { if (vivo) setFallo(e.message); }
      }
    }, ESPERA_VIDEO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [clavePendientes, clientId, poner]);

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
    // Sin cerrar al pulsar el fondo: un toque de más perdería todo lo escrito. Escape y la X sí cierran.
    <div className="overlay overlay-sheet">
      <div ref={ref} className="sheet anu-asistente" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} className="anu-asistente-titulo"><Icon name="megaphone" size={20} /> Nueva campaña</h2>
            <p className="hint">Paso {paso} de {PASOS_CAMPANA.length}: {PASOS_CAMPANA[paso - 1]} · cuenta {cuenta.nombre} ({cuenta.moneda})</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={creando} aria-label="Cerrar el asistente">
            <Icon name="close" size={18} />
          </button>
        </div>
        <ol className="anu-pasos" aria-label="Pasos">
          {PASOS_CAMPANA.map((nombre, i) => (
            <li key={nombre} aria-current={paso === i + 1 ? "step" : undefined} data-hecho={i + 1 < paso || undefined}>
              <span aria-hidden="true">{i + 1}</span> {nombre}
            </li>
          ))}
        </ol>
        <div className="sheet-body anu-asistente-cuerpo" ref={cuerpoRef}>
          {paso === 1 && <PasoObjetivo b={b} poner={poner} ids={ids} pixelesCuenta={pixelesCuenta} />}
          {paso === 2 && <PasoPublicos b={b} poner={poner} ids={ids} clientId={clientId} cuenta={cuenta} />}
          {paso === 3 && <PasoAnuncios b={b} poner={poner} ids={ids} clientId={clientId} />}
          {paso === 4 && <PasoRevisar b={b} cuenta={cuenta} />}
          {(intentado || paso === PASOS_CAMPANA.length) && <Errores lista={delPaso} />}
          {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-secondary" onClick={() => (paso > 1 ? ir(paso - 1) : onClose())} disabled={creando}>
            {paso > 1 ? "Atrás" : "Cancelar"}
          </button>
          {paso < PASOS_CAMPANA.length ? (
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
