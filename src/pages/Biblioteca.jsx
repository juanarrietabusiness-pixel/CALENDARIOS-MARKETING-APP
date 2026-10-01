import "./Biblioteca.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";import Icon from "../components/Icon";
import SelectorFecha from "../components/SelectorFecha";
import { navegar } from "../lib/rutas";
import { soloLectura } from "../lib/sesionActual";
import { fechaEnZona } from "../lib/agenda";
import {
  normalizarConsulta, urlBibliotecaWeb, anunciosACSV, nombreCSV, coberturaDe,
  PAISES, ESTADOS, TIPOS, PLATAFORMAS, IDIOMAS, AVISO_COBERTURA, MAX_PAGINAS_FB, LIMITE_MAX, MAX_PAGINAS,
} from "../lib/biblioteca";
import * as api from "../lib/bibliotecaApi";

// ============================================================
// /biblioteca — la Biblioteca de anuncios de Meta
//
// Buscar anuncios por palabras, por páginas, por país, estado, fechas,
// tipo, plataforma e idioma; guardar la búsqueda (la competencia de un
// cliente) y relanzarla; exportar lo encontrado a CSV.
//
// El límite de la API va ARRIBA y siempre a la vista: fuera de la UE sólo
// salen anuncios de temas sociales, elecciones o política. Para lo
// comercial de Panamá, el enlace a la web con la misma búsqueda.
// ============================================================

const VACIA = {
  texto: "", exacta: false, paginas: [], paises: ["PA"], estado: "ACTIVE", desde: "", hasta: "",
  tipo: "POLITICAL_AND_ISSUE_ADS", plataformas: [], idiomas: [], limite: 25,
};

const nombrePais = (c) => PAISES.find((p) => p.codigo === c)?.nombre ?? c;
const nombrePlataforma = (v) => PLATAFORMAS.find((p) => p.valor.toLowerCase() === String(v).toLowerCase())?.nombre ?? v;
const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : "");
const alternar = (lista, v) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

/** Descarga un texto como archivo. Sin librerías: un Blob y un enlace. */
function descargar(texto, nombre, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Formulario({ consulta, setConsulta, onBuscar, buscando }) {
  const ids = useId();
  const poner = (campo, valor) => setConsulta((c) => ({ ...c, [campo]: valor }));
  // Con países fuera de la UE, «Todos» no existe para la API: el tipo pasa a política.
  const ponerPaises = (paises) => setConsulta((c) => ({
    ...c, paises, tipo: c.tipo === "ALL" && coberturaDe(paises) !== "ue" ? "POLITICAL_AND_ISSUE_ADS" : c.tipo,
  }));
  const cobertura = coberturaDe(consulta.paises);
  // Las páginas se escriben como texto; `normalizarConsulta` lo parte al buscar.
  const paginasTexto = Array.isArray(consulta.paginas) ? consulta.paginas.join(", ") : consulta.paginas;

  const enviar = (e) => {
    e.preventDefault();
    onBuscar(consulta);
  };

  return (
    <form className="bib-form" onSubmit={enviar} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`}>Buscar</h2>

      <div className="field">
        <label className="label" htmlFor={`${ids}-q`}>Palabras clave</label>
        <input id={`${ids}-q`} className="input" value={consulta.texto} maxLength={100} onChange={(e) => poner("texto", e.target.value)} placeholder="Ej.: seguridad vial, vacunación" autoComplete="off" />
        <div className="segmented bib-segmented" role="group" aria-label="Cómo buscar las palabras">
          <button type="button" className={`segmented-btn ${!consulta.exacta ? "active" : ""}`} aria-pressed={!consulta.exacta} onClick={() => poner("exacta", false)}>En cualquier orden</button>
          <button type="button" className={`segmented-btn ${consulta.exacta ? "active" : ""}`} aria-pressed={consulta.exacta} onClick={() => poner("exacta", true)}>Frase exacta</button>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-p`}>Páginas de Facebook (ids, hasta {MAX_PAGINAS_FB})</label>
        <input id={`${ids}-p`} className="input" value={paginasTexto} onChange={(e) => poner("paginas", e.target.value)} placeholder="123456789, 987654321" autoComplete="off" inputMode="numeric" aria-describedby={`${ids}-ph`} />
        <p id={`${ids}-ph`} className="hint">El id sale en la dirección de la página en la web de la Biblioteca (<code>view_all_page_id=…</code>). También vale pegar ese enlace.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-pa`}>Países donde se vio</label>
        <ul className="bib-chips" aria-label="Países elegidos">
          {consulta.paises.map((c) => (
            <li key={c}>
              {consulta.paises.length > 1 ? (
                <button type="button" className="filter-chip bib-quitar" onClick={() => ponerPaises(consulta.paises.filter((x) => x !== c))} aria-label={`Quitar ${nombrePais(c)}`}>
                  {nombrePais(c)} <Icon name="close" size={12} />
                </button>
              ) : (
                <span className="bib-pais">{nombrePais(c)}</span>
              )}
            </li>
          ))}
        </ul>
        <select id={`${ids}-pa`} className="input" value="" onChange={(e) => e.target.value && ponerPaises([...consulta.paises, e.target.value])}>
          <option value="">Añadir un país…</option>
          {PAISES.filter((p) => !consulta.paises.includes(p.codigo)).map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
        </select>
      </div>

      <div className="field">
        <span className="label" id={`${ids}-e`}>Estado</span>
        <div className="segmented bib-segmented" role="group" aria-labelledby={`${ids}-e`}>
          {ESTADOS.map((s) => (
            <button key={s.valor} type="button" className={`segmented-btn ${consulta.estado === s.valor ? "active" : ""}`} aria-pressed={consulta.estado === s.valor} onClick={() => poner("estado", s.valor)}>{s.nombre}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Entregados entre</span>
        <div className="bib-fechas">
          <SelectorFecha value={consulta.desde || null} onChange={(f) => poner("desde", f || "")} etiqueta="Entregados desde" vacio="Desde cualquier día" prefijo="Desde" />
          <SelectorFecha value={consulta.hasta || null} onChange={(f) => poner("hasta", f || "")} etiqueta="Entregados hasta" vacio="Hasta hoy" prefijo="Hasta" />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-ti`}>Tipo de anuncio</label>
        <select id={`${ids}-ti`} className="input" value={consulta.tipo} onChange={(e) => poner("tipo", e.target.value)}>
          {TIPOS.map((t) => <option key={t.valor} value={t.valor} disabled={t.valor === "ALL" && cobertura !== "ue"}>{t.nombre}</option>)}
        </select>
      </div>

      <div className="field">
        <span className="label" id={`${ids}-pl`}>Plataformas</span>
        <div className="bib-chips" role="group" aria-labelledby={`${ids}-pl`}>
          {PLATAFORMAS.map((p) => (
            <button key={p.valor} type="button" className="filter-chip" aria-pressed={consulta.plataformas.includes(p.valor)} onClick={() => poner("plataformas", alternar(consulta.plataformas, p.valor))}>{p.nombre}</button>
          ))}
        </div>
        <p className="hint">Sin ninguna marcada, todas.</p>
      </div>

      <div className="field">
        <span className="label" id={`${ids}-id`}>Idioma del anuncio</span>
        <div className="bib-chips" role="group" aria-labelledby={`${ids}-id`}>
          {IDIOMAS.map((i) => (
            <button key={i.valor} type="button" className="filter-chip" aria-pressed={consulta.idiomas.includes(i.valor)} onClick={() => poner("idiomas", alternar(consulta.idiomas, i.valor))}>{i.nombre}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-l`}>Anuncios por página</label>
        <select id={`${ids}-l`} className="input" value={consulta.limite} onChange={(e) => poner("limite", Number(e.target.value))}>
          {[10, 25, LIMITE_MAX].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <button type="submit" className="btn btn-primary" disabled={buscando}>
        <Icon name="search" size={16} /> {buscando ? "Buscando…" : "Buscar anuncios"}
      </button>
    </form>
  );
}

function Filtros({ filtros, clients, consulta, onLanzar, onAviso, onCambio, lectura }) {
  const ids = useId();
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [editando, setEditando] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const nombreCliente = (id) => clients.find((c) => c.id === id)?.name ?? "";

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.guardarFiltro({ nombre, clientId: cliente || null, consulta });
      setNombre("");
      onCambio();
      onAviso(`Filtro «${nombre.trim()}» guardado.`);
    } catch (err) { onAviso(err.message, true); }
  };
  const renombrar = async (f) => {
    try {
      await api.cambiarFiltro(f.id, { nombre: nuevoNombre });
      setEditando(null);
      onCambio();
      onAviso("Filtro renombrado.");
    } catch (err) { onAviso(err.message, true); }
  };
  const borrar = async (f) => {
    if (!window.confirm(`¿Borrar el filtro «${f.nombre}»?`)) return;
    try { await api.borrarFiltro(f.id); onCambio(); onAviso("Filtro borrado."); } catch (err) { onAviso(err.message, true); }
  };

  return (
    <section className="bib-filtros" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`}>Filtros guardados</h2>
      {filtros.length === 0 && <p className="hint">Todavía no hay ninguno. Guarda una búsqueda para repetirla con un toque: la competencia de un cliente, un tema, unas páginas.</p>}
      <ul>
        {filtros.map((f) => (
          <li key={f.id} className="bib-filtro">
            {editando === f.id ? (
              <form className="bib-filtro-renombrar" onSubmit={(e) => { e.preventDefault(); void renombrar(f); }}>
                <label className="sr-only" htmlFor={`${ids}-r-${f.id}`}>Nuevo nombre</label>
                <input id={`${ids}-r-${f.id}`} className="input" value={nuevoNombre} maxLength={120} onChange={(e) => setNuevoNombre(e.target.value)} autoFocus />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!nuevoNombre.trim()}>Guardar</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
              </form>
            ) : (
              <>
                <button type="button" className="bib-filtro-lanzar" onClick={() => onLanzar(f)}>
                  <span className="bib-filtro-nombre">{f.nombre}</span>
                  <span className="bib-filtro-meta">
                    {f.clientId ? `Competencia de ${nombreCliente(f.clientId) || "un cliente"}` : "De la agencia"}
                    {" · "}{f.consulta.texto ? `«${f.consulta.texto}»` : `${f.consulta.paginas.length} página${f.consulta.paginas.length === 1 ? "" : "s"}`}
                    {" · "}{f.consulta.paises.join(", ")}
                  </span>
                </button>
                {!lectura && (
                  <>
                    <button type="button" className="btn-icon" onClick={() => { setEditando(f.id); setNuevoNombre(f.nombre); }} aria-label={`Renombrar «${f.nombre}»`}><Icon name="pencil" size={16} /></button>
                    <button type="button" className="btn-icon" onClick={() => borrar(f)} aria-label={`Borrar «${f.nombre}»`}><Icon name="trash" size={16} /></button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {!lectura && (
        <form className="bib-guardar" onSubmit={guardar}>
          <h3>Guardar la búsqueda de ahora</h3>
          <div className="field">
            <label className="label" htmlFor={`${ids}-n`}>Nombre</label>
            <input id={`${ids}-n`} className="input" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Competencia de Dcasa" />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-c`}>Es la competencia de (opcional)</label>
            <select id={`${ids}-c`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Ningún cliente: de la agencia</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!nombre.trim()}>
            <Icon name="star" size={16} /> Guardar filtro
          </button>
        </form>
      )}
    </section>
  );
}

function Tarjeta({ a }) {
  const activo = !a.fin;
  return (
    <li className="bib-tarjeta">
      <div className="bib-tarjeta-cabecera">
        <span className="bib-tarjeta-pagina">{a.pagina || "Página sin nombre"}</span>
        <span className="bib-estado" data-activo={activo}>{activo ? "Activo" : "Inactivo"}</span>
      </div>
      <p className="bib-tarjeta-fechas">
        {a.inicio ? `Desde el ${fechaCorta(a.inicio)}` : "Sin fecha de inicio"}
        {a.fin ? ` hasta el ${fechaCorta(a.fin)}` : ""}
        {a.pagadoPor ? ` · Pagado por ${a.pagadoPor}` : ""}
      </p>
      {a.titulos.length > 0 && <p className="bib-tarjeta-titulo">{a.titulos.join(" · ")}</p>}
      {a.textos.length > 0
        ? <p className="bib-tarjeta-texto">{a.textos[0]}</p>
        : <p className="bib-tarjeta-texto hint">Sin texto (sólo imagen o video).</p>}
      {a.textos.length > 1 && <p className="hint">{a.textos.length - 1} versión{a.textos.length - 1 === 1 ? "" : "es"} más del texto (en el CSV).</p>}
      <div className="bib-tarjeta-pie">
        <ul className="bib-plataformas" aria-label="Plataformas">
          {a.plataformas.map((p) => <li key={p}>{nombrePlataforma(p)}</li>)}
        </ul>
        {a.enlace && (
          <a className="btn btn-ghost btn-sm" href={a.enlace} target="_blank" rel="noopener noreferrer">
            Ver en la Biblioteca <Icon name="link" size={14} />
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
      </div>
    </li>
  );
}

export default function Biblioteca({ clients = [], pulso = 0 }) {
  const lectura = soloLectura();
  const [consulta, setConsulta] = useState(VACIA);
  const [estado, setEstado] = useState(null);
  const [resultado, setResultado] = useState(null); // { anuncios, siguiente, pagina, consulta, cobertura, avisos, web }
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState({ texto: "", error: false });
  const resultadosRef = useRef(null);

  const avisar = (texto, error = false) => setAviso({ texto, error });
  // Se relee tras cada cambio PROPIO: el evento «biblioteca» de la propia pestaña se descarta (X-Pestana),
  // así que el pulso sólo trae los cambios de los demás.
  const cargar = useCallback(() => api.estadoBiblioteca().then(setEstado).catch((e) => avisar(e.message, true)), []);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  // El enlace a la web sigue a lo que hay en el formulario, no a la última búsqueda.
  const web = useMemo(() => urlBibliotecaWeb(normalizarConsulta(consulta).consulta), [consulta]);
  const cobertura = coberturaDe(consulta.paises);

  const buscar = async (entrada, { mas = false } = {}) => {
    const { consulta: limpia, errores } = normalizarConsulta(entrada);
    if (errores.length) { avisar(errores.join(" "), true); return; }
    avisar("");
    setBuscando(true);
    try {
      const r = await api.buscarAnuncios(limpia, mas ? { after: resultado.siguiente, pagina: resultado.pagina + 1 } : {});
      setResultado(mas ? { ...r, anuncios: [...resultado.anuncios, ...r.anuncios] } : r);
      if (!mas) setConsulta({ ...limpia });
      // En el teléfono el formulario va encima: sin esto, los resultados quedaban una pantalla más abajo sin que nada lo dijera.
      if (!mas && !window.matchMedia?.("(min-width: 1024px)").matches) {
        requestAnimationFrame(() => resultadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      avisar(r.anuncios.length ? `${mas ? "Llegaron" : "Salieron"} ${r.anuncios.length} anuncio${r.anuncios.length === 1 ? "" : "s"}.` : "La API no devolvió ningún anuncio con esa búsqueda.");
    } catch (e) {
      avisar(e.message, true);
    }
    setBuscando(false);
  };

  const exportar = () => {
    if (!resultado?.anuncios.length) return;
    descargar(anunciosACSV(resultado.anuncios), nombreCSV(resultado.consulta, fechaEnZona()));
  };

  const lanzar = (f) => {
    setConsulta({ ...VACIA, ...f.consulta });
    void buscar(f.consulta);
  };

  return (
    <div className="biblioteca">
      <div className="page-header">
        <h1 className="page-title">Biblioteca de anuncios</h1>
        <p className="page-meta">Los anuncios que se están viendo en Facebook e Instagram, desde la Biblioteca de anuncios de Meta: qué dicen, desde cuándo y dónde.</p>
      </div>

      <div className="notice notice-warn bib-cobertura" role="note">
        <p><strong>Lo que la API de Meta deja ver.</strong> {AVISO_COBERTURA}</p>
        <a className="btn btn-secondary btn-sm" href={web} target="_blank" rel="noopener noreferrer">
          <Icon name="globe" size={16} /> Abrir esta búsqueda en la web de la Biblioteca
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </div>

      {estado && !estado.meta.conectado && (
        <div className="notice notice-action notice-warn" role="note">
          <span>{estado.meta.configurado ? "Meta no está conectado: la búsqueda usa el permiso de quien lo conectó." : "Meta no está configurado en el servidor (META_APP_ID y META_APP_SECRET)."}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navegar("/ajustes")}>Ir a Ajustes</button>
        </div>
      )}

      <div role="status" aria-live="polite" className={aviso.texto && !aviso.error ? undefined : "sr-only"}>
        {aviso.texto && !aviso.error && <p className="notice notice-ok">{aviso.texto}</p>}
      </div>
      <div role="alert" className={aviso.error ? undefined : "sr-only"}>
        {aviso.error && (
          <p className="notice notice-error">
            {aviso.texto}
            {/facebook\.com\/ID/.test(aviso.texto) && (
              <> <a href="https://www.facebook.com/ID" target="_blank" rel="noopener noreferrer">Abrir facebook.com/ID</a> (lo tiene que hacer quien conectó Meta{estado?.meta?.nombre ? `: ${estado.meta.nombre}` : ""}).</>
            )}
          </p>
        )}
      </div>

      <div className="bib-rejilla">
        <aside className="bib-lateral">
          <Formulario consulta={consulta} setConsulta={setConsulta} onBuscar={(c) => buscar(c)} buscando={buscando} />
          <Filtros filtros={estado?.filtros ?? []} clients={clients} consulta={normalizarConsulta(consulta).consulta} onLanzar={lanzar} onAviso={avisar} onCambio={cargar} lectura={lectura} />
        </aside>

        <section ref={resultadosRef} className="bib-resultados" aria-labelledby="bib-resultados-t">
          <div className="bib-barra">
            <h2 id="bib-resultados-t">Resultados{resultado ? ` (${resultado.anuncios.length})` : ""}</h2>
            <span className="toolbar-spacer" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportar} disabled={!resultado?.anuncios.length}>
              <Icon name="download" size={16} /> Exportar CSV
            </button>
          </div>
          {cobertura !== "ue" && resultado && <p className="hint">Buscando en {resultado.consulta.paises.map(nombrePais).join(", ")}: sólo anuncios de temas sociales, elecciones o política.</p>}
          {!resultado && <p className="hint">Escribe palabras clave o los ids de unas páginas y pulsa «Buscar anuncios».</p>}
          {resultado?.anuncios.length === 0 && (
            <div className="empty-state">
              <p className="empty-state-title">Ningún anuncio por la API</p>
              <p className="empty-state-text">Si buscabas anuncios comerciales de Panamá o Latinoamérica, están en la web de la Biblioteca.</p>
              <a className="btn btn-primary btn-sm" href={web} target="_blank" rel="noopener noreferrer" style={{ marginTop: "var(--sp-3)" }}>
                <Icon name="globe" size={16} /> Ver en la web<span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </div>
          )}
          {resultado?.anuncios.length > 0 && (
            <ul className="bib-tarjetas">
              {resultado.anuncios.map((a, i) => <Tarjeta key={a.id || i} a={a} />)}
            </ul>
          )}
          {resultado?.siguiente && (
            <button type="button" className="btn btn-secondary" onClick={() => buscar(resultado.consulta, { mas: true })} disabled={buscando}>
              {buscando ? "Cargando…" : "Cargar más"}
            </button>
          )}
          {resultado && !resultado.siguiente && resultado.pagina >= MAX_PAGINAS && (
            <p className="hint">Llegaste a {MAX_PAGINAS} páginas de esta búsqueda: afínala para ver otros.</p>
          )}
        </section>
      </div>
    </div>
  );
}
