import { useId, useState } from "react";
import Icon from "./Icon";
import * as api from "../lib/bibliotecaApi";
import { agregarReferencia } from "../lib/mercado";
import { anadirAlBanco } from "../lib/bancoIdeasApi";
import { nuevaIdea } from "../lib/bancoIdeas";
import { PAISES } from "../lib/biblioteca";
import { MODOS_SC, ESTADOS_SC, MEDIOS_SC, ORDENES_SC, consultaSC, esDelCdnDeMeta } from "../lib/scrapeCreators";
import { cifraDe, diasDeAnuncio } from "../lib/loMejor";

// ============================================================
// La Biblioteca de anuncios por Scrape Creators
//
// La API de Meta fuera de la UE sólo enseña anuncios de política; ésta lee la
// Biblioteca pública entera, así que sale la competencia comercial de Panamá.
// Dos formas de buscar: una EMPRESA (se busca por su nombre y se escoge la buena:
// así va por su pageId y no confunde dos que se llamen parecido) o una PALABRA
// clave. Cada pedido gasta un crédito; lo repetido en unas horas sale gratis de
// la caché del servidor y la pantalla lo dice.
//
// Cada anuncio se puede traer a la galería del cliente (sus archivos del CDN de
// Meta caducan), analizar como referencia (el estudio de mercado: de ahí salen
// «Adaptar», «Recrear con mi marca» y «Seguir este video»), guardar en el banco
// de ideas o, si es video, transcribir. Las imágenes pasan por el proxy de
// miniaturas: la CSP sólo deja `img-src 'self'`.
// ============================================================

const VACIA = { modo: "empresa", pageId: "", empresa: "", q: "", exacta: false, pais: "PA", idioma: "", estado: "ACTIVE", medio: "ALL", orden: "total_impressions" };
const proxy = (u) => (u && esDelCdnDeMeta(u) ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");
const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : "");
const PLATAFORMA = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads" };

export default function BibliotecaSC({ clients = [], filtros = [], lectura = false, onCambio }) {
  const ids = useId();
  const [consulta, setConsulta] = useState(VACIA);
  const [empresas, setEmpresas] = useState(null);
  const [resultado, setResultado] = useState(null); // { anuncios, cursor, consulta, creditos, cache, total }
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState({ texto: "", error: false });
  const [cliente, setCliente] = useState(clients[0]?.id ?? "");
  const cambiar = (k, v) => setConsulta((c) => ({ ...c, [k]: v }));
  const avisar = (texto, error = false) => setAviso({ texto, error });
  // Lo buscado a mano no se bloquea, pero suma al tope semanal (el de «Lo mejor»: anuncios y TikTok): si se pasó, se dice.
  const pasado = (r) => (r.semana && r.semana.total > r.semana.tope
    ? ` Esta semana van ${r.semana.total} créditos de ${r.semana.tope}: lo automático (anuncios guardados y TikTok) espera al lunes.`
    : "");
  const conCreditos = (r, base) => `${base}${r.cache ? " (de la caché: no gastó créditos)" : ""}${r.creditos !== null && r.creditos !== undefined ? ` · Te quedan ${r.creditos} créditos.` : ""}${pasado(r)}`;

  const buscarEmpresa = async (e) => {
    e?.preventDefault();
    if (!consulta.empresa.trim()) return;
    setOcupado("empresas");
    avisar("");
    try {
      const r = await api.empresasSC(consulta.empresa);
      setEmpresas(r.empresas);
      avisar(conCreditos(r, r.empresas.length ? `${r.empresas.length} empresa${r.empresas.length === 1 ? "" : "s"}: escoge la buena.` : "Ninguna empresa con ese nombre."));
    } catch (err) { avisar(err.message, true); }
    setOcupado("");
  };

  const buscar = async (entrada = consulta, { mas = false } = {}) => {
    const { consulta: limpia, errores } = consultaSC(entrada);
    if (errores.length) { avisar(errores.join(" "), true); return; }
    setOcupado("anuncios");
    avisar("");
    try {
      const r = await api.anunciosSC(limpia, mas ? resultado.cursor : "");
      setResultado(mas ? { ...r, anuncios: [...resultado.anuncios, ...r.anuncios] } : r);
      avisar(conCreditos(r, r.anuncios.length ? `${mas ? "Llegaron" : "Salieron"} ${r.anuncios.length} anuncio${r.anuncios.length === 1 ? "" : "s"}.` : "Ningún anuncio con esos filtros."));
    } catch (err) { avisar(err.message, true); }
    setOcupado("");
  };

  const escogerEmpresa = (e) => {
    const nueva = { ...consulta, modo: "empresa", pageId: e.pageId, empresa: e.nombre };
    setConsulta(nueva);
    setEmpresas(null);
    void buscar(nueva);
  };

  const guardadas = filtros.filter((f) => f.consulta?.fuente === "sc");
  const guardar = async () => {
    const { consulta: limpia, errores } = consultaSC(consulta);
    if (errores.length) { avisar(errores.join(" "), true); return; }
    const nombre = limpia.modo === "empresa" ? limpia.empresa || `Página ${limpia.pageId}` : `«${limpia.q}»`;
    try {
      await api.guardarFiltro({ nombre, clientId: cliente || null, consulta: limpia });
      avisar(`Guardada: «${nombre}». Sale arriba para volver a mirarla.`);
      onCambio?.();
    } catch (err) { avisar(err.message, true); }
  };

  return (
    <div className="bib-rejilla">
      <aside className="bib-lateral">
        <form className="card bib-sc-form" onSubmit={(e) => { e.preventDefault(); void buscar(); }} aria-label="Buscar anuncios">
          <div className="segmented" role="group" aria-label="Cómo buscar">
            {MODOS_SC.map((m) => (
              <button key={m.id} type="button" className={`segmented-btn ${consulta.modo === m.id ? "active" : ""}`} aria-pressed={consulta.modo === m.id} onClick={() => cambiar("modo", m.id)}>{m.nombre}</button>
            ))}
          </div>

          {consulta.modo === "empresa" ? (
            <div className="field">
              <label className="label" htmlFor={`${ids}-empresa`}>Empresa</label>
              <div className="bib-sc-fila">
                <input id={`${ids}-empresa`} className="input" value={consulta.empresa} placeholder="Ej.: Mueblería del Centro"
                  onChange={(e) => setConsulta((c) => ({ ...c, empresa: e.target.value, pageId: "" }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscarEmpresa(); } }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={buscarEmpresa} disabled={!consulta.empresa.trim() || ocupado === "empresas"}>
                  <Icon name="search" size={14} /> {ocupado === "empresas" ? "Buscando…" : "Buscar"}
                </button>
              </div>
              {consulta.pageId && <p className="hint">Escogida: {consulta.empresa} (página {consulta.pageId}).</p>}
            </div>
          ) : (
            <div className="field">
              <label className="label" htmlFor={`${ids}-q`}>Palabra clave</label>
              <input id={`${ids}-q`} className="input" value={consulta.q} placeholder="Ej.: sofá cama" onChange={(e) => cambiar("q", e.target.value)} />
              <label className="bib-sc-check"><input type="checkbox" checked={consulta.exacta} onChange={(e) => cambiar("exacta", e.target.checked)} /> Frase exacta</label>
            </div>
          )}

          {empresas && (
            <ul className="bib-sc-empresas" aria-label="Empresas encontradas">
              {empresas.map((e) => (
                <li key={e.pageId}>
                  <button type="button" className="bib-sc-empresa" onClick={() => escogerEmpresa(e)}>
                    {proxy(e.foto) ? <img src={proxy(e.foto)} alt="" width={36} height={36} /> : <span className="bib-sc-sinfoto"><Icon name="building" size={16} /></span>}
                    <span>
                      <strong>{e.nombre}</strong>
                      <span className="hint">{[e.verificada && "Verificada", e.categoria, e.instagram && `@${e.instagram}`, e.seguidores !== null && `${e.seguidores.toLocaleString("es")} seguidores`].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="bib-sc-filtros">
            <label className="label" htmlFor={`${ids}-pais`}>País</label>
            <select id={`${ids}-pais`} className="input" value={consulta.pais} onChange={(e) => cambiar("pais", e.target.value)}>
              <option value="ALL">Todos los países</option>
              {PAISES.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-estado`}>Estado</label>
            <select id={`${ids}-estado`} className="input" value={consulta.estado} onChange={(e) => cambiar("estado", e.target.value)}>
              {ESTADOS_SC.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-medio`}>Formato</label>
            <select id={`${ids}-medio`} className="input" value={consulta.medio} onChange={(e) => cambiar("medio", e.target.value)}>
              {MEDIOS_SC.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-orden`}>Orden</label>
            <select id={`${ids}-orden`} className="input" value={consulta.orden} onChange={(e) => cambiar("orden", e.target.value)}>
              {ORDENES_SC.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-idioma`}>Idioma</label>
            <select id={`${ids}-idioma`} className="input" value={consulta.idioma} onChange={(e) => cambiar("idioma", e.target.value)}>
              <option value="">Cualquiera</option>
              <option value="ES">Español</option>
              <option value="EN">Inglés</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={ocupado === "anuncios"}>
            <Icon name="search" size={16} /> {ocupado === "anuncios" ? "Buscando…" : "Buscar anuncios"}
          </button>
          <p className="hint">Cada búsqueda gasta un crédito de Scrape Creators; la misma en las próximas horas no gasta.</p>
          {!lectura && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={guardar}>
              <Icon name="bookmark" size={14} /> Guardar esta búsqueda{cliente ? " para el cliente escogido" : ""}
            </button>
          )}
        </form>

        {guardadas.length > 0 && (
          <section className="card" aria-labelledby={`${ids}-g`}>
            <h2 id={`${ids}-g`} className="bib-sc-titulo">Competencia guardada</h2>
            <ul className="bib-chips">
              {guardadas.map((f) => (
                <li key={f.id}>
                  <button type="button" className="filter-chip" onClick={() => { setConsulta({ ...VACIA, ...f.consulta }); void buscar(f.consulta); }}
                    title={f.clientId ? clients.find((c) => c.id === f.clientId)?.name : "De la agencia"}>
                    {f.nombre}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <section className="bib-resultados" aria-labelledby={`${ids}-r`}>
        <div className="bib-barra">
          <h2 id={`${ids}-r`}>Anuncios{resultado ? ` (${resultado.anuncios.length})` : ""}</h2>
          <span className="toolbar-spacer" />
          <label className="label" htmlFor={`${ids}-cliente`} style={{ margin: 0 }}>Para el cliente</label>
          <select id={`${ids}-cliente`} className="input bib-sc-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Ninguno (sólo mirar)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div role="status" aria-live="polite">{aviso.texto && !aviso.error && <p className="notice notice-ok">{aviso.texto}</p>}</div>
        <div role="alert">{aviso.error && <p className="notice notice-error">{aviso.texto}</p>}</div>
        {!resultado && <p className="hint">Busca una empresa (por su nombre) o una palabra clave. Salen TODOS los anuncios de la Biblioteca, también los comerciales de Panamá.</p>}
        {resultado?.anuncios.length > 0 && (
          <ul className="bib-tarjetas">
            {resultado.anuncios.map((a) => (
              <TarjetaSC key={a.id} a={a} cliente={clients.find((c) => c.id === cliente) ?? null} lectura={lectura} onAviso={avisar} />
            ))}
          </ul>
        )}
        {resultado?.cursor && (
          <button type="button" className="btn btn-secondary" onClick={() => buscar(resultado.consulta, { mas: true })} disabled={ocupado === "anuncios"}>
            {ocupado === "anuncios" ? "Cargando…" : "Cargar más (un crédito)"}
          </button>
        )}
      </section>
    </div>
  );
}

function TarjetaSC({ a, cliente, lectura, onAviso }) {
  const [ocupado, setOcupado] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [transcripcion, setTranscripcion] = useState(null);
  const [verTodo, setVerTodo] = useState(false);
  const [sinImagen, setSinImagen] = useState(false);
  const video = a.videos[0] ?? null;
  const imagen = video?.portada || a.imagenes[0] || "";
  const archivoUrl = video?.video || a.imagenes[0] || "";

  const hacer = async (que, fn) => {
    setOcupado(que);
    try { await fn(); } catch (e) { onAviso(e.message, true); }
    setOcupado("");
  };
  const traer = async () => {
    if (archivo) return archivo;
    const r = await api.traerAnuncioSC({ clientId: cliente.id, url: archivoUrl, tipo: video ? "video" : "imagen", id: a.id, pagina: a.pagina });
    setArchivo(r.archivo);
    return r.archivo;
  };
  const alaGaleria = () => hacer("traer", async () => {
    await traer();
    onAviso(`En la galería de ${cliente.name}, carpeta «Competencia».`);
  });
  const analizar = () => hacer("analizar", async () => {
    const arch = await traer();
    const r = await agregarReferencia(cliente.id, {
      archivoId: arch.id, competidor: a.pagina, enlace: a.enlace, origen: "anuncio",
      nota: [a.activo ? `activo desde el ${a.inicio}` : `corrió del ${a.inicio} al ${a.fin}`, a.texto && `su texto: ${a.texto.slice(0, 400)}`, a.cta && `botón: ${a.cta}`].filter(Boolean).join("; "),
    }, arch.tipo === "video" ? arch.src : "");
    onAviso(r.aviso ? `Guardado, pero sin analizar: ${r.aviso}` : `Analizado y guardado en las referencias de ${cliente.name} (Cerebro → Estudio de mercado → Competencia): desde ahí, «Adaptar» o «Recrear con mi marca».`);
  });
  const alBanco = () => hacer("banco", async () => {
    const idea = nuevaIdea({
      id: crypto.randomUUID(), idea: `Anuncio de ${a.pagina}: ${a.titulo || a.texto.slice(0, 120)}`, referenceLink: a.enlace,
      descripcion: [a.texto, transcripcion && `Lo que dice el video: ${transcripcion}`].filter(Boolean).join("\n\n"),
      format: video ? "reel" : a.formato === "carrusel" ? "carrusel" : "post",
    });
    // La cifra y la vista viajan con la idea (como desde «Lo mejor»): cuántos días lleva y su imagen del CDN de Meta.
    const dias = cifraDe({ fuente: "anuncio", cifras: { dias: diasDeAnuncio(a), activo: a.activo, versiones: Math.max(a.versiones?.length ?? 0, a.relacionados ?? 0) } });
    const vista = [a.imagenes?.[0], a.videos?.[0]?.portada].find((u) => u && esDelCdnDeMeta(u));
    await anadirAlBanco({ ...idea, cifra: [dias.texto, dias.detalle].filter(Boolean).join(" · "), ...(vista ? { miniatura: vista } : {}) }, cliente?.id ?? null);
    onAviso(`Guardado en el banco de ideas${cliente ? ` de ${cliente.name}` : " (general)"}.`);
  });
  const transcribir = () => hacer("transcribir", async () => {
    const r = await api.anuncioSC(a.id, { transcripcion: true });
    setTranscripcion(r.transcripcion ?? "");
    if (!r.transcripcion) onAviso("Este video no tiene voz que transcribir.");
  });

  const largo = a.texto.length > 280;
  return (
    <li className="bib-tarjeta">
      <div className="bib-tarjeta-cabecera">
        <span className="bib-tarjeta-pagina">{a.pagina || "Página sin nombre"}</span>
        <span className="bib-estado" data-activo={a.activo}>{a.activo ? "Activo" : "Ya no corre"}</span>
      </div>
      {imagen && proxy(imagen) && (
        <div className="bib-sc-medio">
          {sinImagen
            ? <span className="bib-sc-caducada"><Icon name="image" size={20} /> La imagen ya no está en Facebook: «Ver en la Biblioteca».</span>
            : <img src={proxy(imagen)} alt={`Anuncio de ${a.pagina}`} loading="lazy" onError={() => setSinImagen(true)} />}
          {video && <span className="bib-sc-video"><Icon name="play" size={14} /> Video</span>}
          {a.formato === "carrusel" && <span className="bib-sc-video"><Icon name="layers" size={14} /> {a.versiones.length || a.imagenes.length} versiones</span>}
        </div>
      )}
      <p className="bib-tarjeta-fechas">
        {a.inicio ? `Desde el ${fechaCorta(a.inicio)}` : "Sin fecha de inicio"}{!a.activo && a.fin ? ` hasta el ${fechaCorta(a.fin)}` : ""}
        {a.relacionados ? ` · ${a.relacionados} anuncios de la misma campaña` : ""}
      </p>
      {a.titulo && <p className="bib-tarjeta-titulo">{a.titulo}</p>}
      {a.texto ? (
        <p className="bib-tarjeta-texto" style={verTodo ? { WebkitLineClamp: "unset", display: "block" } : undefined}>{a.texto}</p>
      ) : <p className="bib-tarjeta-texto hint">Sin texto (sólo imagen o video).</p>}
      {largo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerTodo((v) => !v)} aria-expanded={verTodo}>{verTodo ? "Ver menos" : "Ver todo el texto"}</button>}
      {a.cta && <p className="hint">Botón: «{a.cta}»{a.destino ? ` → ${new URL(a.destino).hostname}` : ""}</p>}
      {transcripcion && <blockquote className="bib-sc-transcripcion"><strong>Lo que dice:</strong> {transcripcion}</blockquote>}
      <div className="bib-tarjeta-pie">
        <ul className="bib-plataformas" aria-label="Plataformas">
          {a.plataformas.map((p) => <li key={p}>{PLATAFORMA[p] ?? p}</li>)}
        </ul>
        {a.enlace && (
          <a className="btn btn-ghost btn-sm" href={a.enlace} target="_blank" rel="noopener noreferrer">
            Ver en la Biblioteca <Icon name="link" size={14} /><span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
      </div>
      {!lectura && (
        <div className="bib-sc-acciones">
          {cliente && archivoUrl && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={analizar} disabled={Boolean(ocupado)} title="Lo baja a la galería y la IA lo analiza como referencia de la competencia">
                <Icon name="sparkles" size={14} /> {ocupado === "analizar" ? "Analizando…" : "Analizar como referencia"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={alaGaleria} disabled={Boolean(ocupado) || Boolean(archivo)}>
                <Icon name="download" size={14} /> {archivo ? "En la galería" : ocupado === "traer" ? "Trayendo…" : "Traer a la galería"}
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={alBanco} disabled={Boolean(ocupado)}>
            <Icon name="bulb" size={14} /> Al banco de ideas
          </button>
          {video && transcripcion === null && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={transcribir} disabled={Boolean(ocupado)} title="Un crédito (videos de hasta 2 minutos)">
              <Icon name="file" size={14} /> {ocupado === "transcribir" ? "Transcribiendo…" : "Transcribir"}
            </button>
          )}
          {!cliente && <span className="hint">Escoge un cliente arriba para traerlo o analizarlo.</span>}
        </div>
      )}
    </li>
  );
}
