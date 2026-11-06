import "./ParaPautar.css";
import { lazy, Suspense, useCallback, useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { paraPautarDelCliente, marcarParaPautar } from "../../lib/enPautaApi";
import { ETAPAS_CICLO, nombreEtapaCiclo } from "../../lib/cicloVentas";
import { fraseParaPautar } from "../../lib/enPauta";
import { REDES } from "../../lib/publicacion";

// ============================================================
// «Para pautar» en Resultados → Anuncios (curso de campañas, entrega 7)
//
// No hay que reinventar: lo orgánico que ya funcionó es lo primero que se pauta. Aquí sale lo publicado de los
// últimos 60 días que rindió (interacciones, guardados y compartidos frente a la mediana de SU cuenta: la medida de lo
// propio en «Lo mejor») y que no corre ni corrió en el Ads Manager, con la etapa que le toca y su texto revisado como
// anuncio: en el Ads Manager, el texto de una publicación ya hecha no se cambia. «Marcar Va a pauta» escribe la marca
// en su publicación (worker/lib/enPauta.js); lo que no salió desde el calendario sólo se puede ver y escribir como
// anuncio («Versión para anuncio»).
//
// Debajo, lo que se aprende de lo que ya corrió (src/lib/aprenderAnuncios.js): qué tipo de arte, nivel, composición y
// etapa salen más baratos para este cliente, o qué falta para saberlo.
// ============================================================

const VersionAnuncio = lazy(() => import("../VersionAnuncio"));

const fechaLegible = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "");
const numero = (n) => new Intl.NumberFormat("es").format(Number(n) || 0);

/** La publicación del calendario de una candidata (para «Versión para anuncio»), como hace Resultados. */
function versionDe(client, x) {
  for (const cal of client?.calendars ?? []) {
    if (!x.calendarId || (cal.id !== x.calendarId && cal.dbId !== x.calendarId)) continue;
    for (const d of cal.days ?? []) {
      const post = (d.posts ?? []).find((p) => p.id === x.postId);
      if (post) return { client, cal, post, day: d };
    }
  }
  return { client, cal: null, post: x.post ?? { id: x.externoId, format: x.formato || "post", descripcion: x.texto }, day: {} };
}

export function Candidata({ x, ctx }) {
  const ids = useId();
  const etapa = ctx.etapas[x.clave] ?? x.etapa;
  const marcada = ctx.marcadas[x.clave] ?? (x.marcada ? x.etapa : "");
  const icono = REDES[x.red]?.icono ?? "globe";
  const red = REDES[x.red]?.nombre ?? x.red;
  return (
    <li className="pp-item">
      <div className="pp-cabeza">
        {x.miniatura ? <img src={x.miniatura} alt="" loading="lazy" className="pp-mini" /> : <span className="pp-mini pp-mini-vacia"><Icon name="file" size={20} /></span>}
        <div className="pp-texto">
          <p className="pp-meta">
            <Icon name={icono} size={12} /> {red} · {fechaLegible(x.fecha)}
            {x.delCalendario && <span className="badge">Del calendario</span>}
          </p>
          <p className="pp-titulo">{x.titulo || x.texto || "Sin texto"}</p>
          <p className="pp-frase"><strong>{fraseParaPautar(x.rinde, nombreEtapaCiclo(marcada || etapa))}</strong></p>
          <p className="hint pp-cifras">
            {numero(x.cifras?.interacciones)} interacciones · {numero(x.cifras?.guardados)} guardados · {numero(x.cifras?.compartidos)} compartidos
          </p>
        </div>
      </div>

      {x.problemas?.length > 0 && (
        <div className="pp-problemas">
          <p className="hint" style={{ margin: 0 }}>Su texto como anuncio (en el Ads Manager ya no se cambia):</p>
          <ul>{x.problemas.map((p) => <li key={p.codigo}>{p.texto}</li>)}</ul>
        </div>
      )}
      {!x.delCalendario && (
        <p className="hint" style={{ margin: 0 }}>No salió desde el calendario: se pauta escogiéndola en el Ads Manager; aquí sólo se puede escribir su versión para anuncio.</p>
      )}

      <div className="pp-botones">
        {x.delCalendario && !marcada && !ctx.soloLectura && (
          <>
            <label className="sr-only" htmlFor={`${ids}-etapa`}>Etapa del ciclo de ventas</label>
            <select id={`${ids}-etapa`} className="input pp-etapa" value={etapa} onChange={(e) => ctx.onEtapa(x.clave, e.target.value)}>
              {ETAPAS_CICLO.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={ctx.marcando === x.clave} onClick={() => ctx.onMarcar(x, etapa)}>
              <Icon name="megaphone" size={14} /> {ctx.marcando === x.clave ? "Marcando…" : "Marcar «Va a pauta»"}
            </button>
          </>
        )}
        {marcada && <span className="hint pp-marcada"><Icon name="check" size={12} /> Va a pauta en {nombreEtapaCiclo(marcada)}: falta montarla en el Ads Manager.</span>}
        {(x.problemas?.length > 0 || !x.conTextosDeAnuncio) && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => ctx.onVersion(x)}>
            <Icon name="sparkles" size={14} /> Versión para anuncio
          </button>
        )}
        {x.delCalendario ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ctx.onAbrir?.(x)}><Icon name="calendar" size={14} /> Abrir la publicación</button>
        ) : x.enlace ? (
          <a className="btn btn-ghost btn-sm" href={x.enlace} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} /> Ver en {red}<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * @param onAbrir  ({ calendarId, postId }) → abre la publicación en su calendario
 */
export default function ParaPautar({ client, soloLectura = false, onAbrir = null }) {
  const ids = useId();
  const clientId = client?.dbId || client?.id;
  const [d, setD] = useState(null);
  const [fallo, setFallo] = useState("");
  const [etapas, setEtapas] = useState({});
  const [marcadas, setMarcadas] = useState({});
  const [marcando, setMarcando] = useState("");
  const [aviso, setAviso] = useState("");
  const [version, setVersion] = useState(null);

  const leer = useCallback(async () => {
    try {
      setD(await paraPautarDelCliente(clientId));
      setFallo("");
    } catch (e) {
      setFallo(e.message);
    }
  }, [clientId]);
  useEffect(() => { void leer(); }, [leer]);

  const ctx = {
    soloLectura, etapas, marcadas, marcando, onAbrir,
    onEtapa: (clave, etapa) => setEtapas((x) => ({ ...x, [clave]: etapa })),
    onVersion: (x) => setVersion(versionDe(client, x)),
    onMarcar: async (x, etapa) => {
      setMarcando(x.clave);
      setAviso("");
      try {
        const r = await marcarParaPautar(clientId, { calendarId: x.calendarId, postId: x.postId, etapa });
        setMarcadas((m) => ({ ...m, [x.clave]: r.pauta?.etapa ?? etapa }));
        setAviso(`«${x.titulo || "La publicación"}» va a pauta en ${nombreEtapaCiclo(r.pauta?.etapa ?? etapa)}: sale en «Se va a pautar» de su publicación.`);
      } catch (e) {
        setAviso(e.message);
      }
      setMarcando("");
    },
  };

  const lista = d?.candidatas ?? [];
  const pref = d?.preferencias;
  return (
    <section className="r3q-tarjeta pp" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="r3q-titulo"><Icon name="trending" size={18} /> Para pautar: lo orgánico que ya funcionó</h2>
      <p className="hint" style={{ margin: 0 }}>
        Lo publicado en los últimos 60 días que rindió al menos 1,5 veces lo normal de su cuenta (interacciones, guardados y
        compartidos) y que no corre ni corrió en el Ads Manager. Es lo primero que conviene pautar: ya demostró que engancha.
      </p>
      <div role="status" aria-live="polite">{aviso && <p className="hint" style={{ margin: "var(--sp-2) 0 0" }}>{aviso}</p>}</div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {!d && !fallo && <p className="hint">Buscando lo que rindió…</p>}
      {d && !lista.length && (
        <p className="hint">Nada por ahora: o no hay publicaciones medidas de los últimos 60 días por encima de lo normal, o ya están en pauta. Las cifras de cada publicación las trae la foto diaria de Resultados → Redes.</p>
      )}
      {lista.length > 0 && <ul className="pp-lista">{lista.map((x) => <Candidata key={x.clave} x={x} ctx={ctx} />)}</ul>}

      <h3 className="pp-subtitulo"><Icon name="bulb" size={16} /> Lo que se aprende de sus anuncios</h3>
      <p className="hint" style={{ margin: 0 }}>
        {pref?.linea || pref?.motivo || "Cuando sus anuncios corran casados con publicaciones del calendario, aquí sale qué tipo de arte, nivel y composición salen más baratos."}
      </p>
      {pref?.linea && <p className="hint" style={{ margin: 0 }}>Lo leen el motor de ideas y el director cuando escriben y diseñan lo que va a pauta.</p>}

      {version && (
        <Suspense fallback={null}>
          <VersionAnuncio {...version} onClose={() => setVersion(null)} />
        </Suspense>
      )}
    </section>
  );
}
