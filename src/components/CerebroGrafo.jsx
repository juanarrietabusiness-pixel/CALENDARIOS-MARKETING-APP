import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { iniciarCerebro3D } from "./cerebro3d/escena";
import { leerGrafo, buscarEnCerebro } from "../lib/cerebro";
import {
  armarGrafo, colorDeNota, esVisible, coincidencias, vecinas, etiquetasPara, regiones, resumenDelMapa, pocasConexiones,
  FILTROS_INICIALES, COLOR_MENCION, COLOR_INTERNA,
} from "../lib/cerebroGrafo";
import { nombreDeTipo, TIPOS_VISTA, formatoCaracteres } from "../lib/cerebroVista";
import "./CerebroGrafo.css";

// ============================================================
// El cerebro de un cliente como red neuronal
//
// Cada nota es una neurona y cada conexión una sinapsis, dentro de un
// cerebro que gira solo. Se explora igual que la lista —filtrar por tipo,
// buscar, ver lo interno— pero con la forma delante: qué notas se
// conectan, cuáles son el centro, qué queda aislado.
//
// El lienzo es un dibujo: no tiene nada que un lector de pantalla o un
// teclado puedan recorrer. Para eso está la lista de notas de la izquierda,
// que hace lo mismo que tocar un punto. Y las flechas giran el cerebro, +/−
// acercan y 0 lo devuelve a su sitio cuando el lienzo tiene el foco.
// ============================================================

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : "");
const ORIGEN = { repositorio: "Del repositorio", ia: "Escrita por la IA", documento: "Documento", manual: "A mano", app: "A mano" };

export default function CerebroGrafo({ client, version, onAbrir }) {
  const ids = useId();
  const host = useRef(null);
  const escena = useRef(null);
  const escenarioEl = useRef(null);
  const fichaEl = useRef(null);
  const [grafo, setGrafo] = useState(null);
  const [error, setError] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [texto, setTexto] = useState("");
  const [deTexto, setDeTexto] = useState(null);      // { q, indices: Set } de la búsqueda por pasajes
  const [buscando, setBuscando] = useState(false);
  const [elegida, setElegida] = useState(null);
  const [sobre, setSobre] = useState(null);           // { n, x, y }: la nota que señala el ratón
  const [girando, setGirando] = useState(true);

  // ---------- Cargar el mapa ----------
  useEffect(() => {
    let vivo = true;
    setError("");
    leerGrafo(client.id)
      .then((r) => { if (vivo) setGrafo(armarGrafo(r)); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [client.id, version]);

  const nodos = grafo?.nodos;
  const coinciden = useMemo(() => (nodos ? coincidencias(nodos, texto, deTexto?.q === texto.trim() ? deTexto.indices : null) : null), [nodos, texto, deTexto]);
  const partes = useMemo(() => (nodos ? regiones(nodos) : []), [nodos]);
  const nInternas = useMemo(() => (nodos ? nodos.filter((n) => n.interna).length : 0), [nodos]);
  const vistas = useMemo(() => (nodos ?? []).filter((n) => esVisible(n, filtros)), [nodos, filtros]);

  // El lienzo llama a estas funciones cuando quiere; siempre ven lo último gracias a las referencias.
  const vivas = useRef({});
  vivas.current = {
    visible: (n) => esVisible(n, filtros),
    etiquetas: () => (grafo ? etiquetasPara(grafo, { elegida, coinciden }) : []),
  };

  // ---------- El lienzo: se crea una vez ----------
  const elegir = useCallback((n) => {
    setElegida(n);
    if (n && escena.current) { escena.current.fly(n); escena.current.pulseFrom(n.i, 6); }
  }, []);

  useEffect(() => {
    if (!host.current) return undefined;
    const e = iniciarCerebro3D({
      host: host.current,
      colorDe: colorDeNota,
      visible: (n) => vivas.current.visible(n),
      etiquetas: () => vivas.current.etiquetas(),
      onElegir: (n) => elegir(n),
      onVacio: () => setElegida(null),
      onHover: (n, x, y) => setSobre(n ? { n, x, y } : null),
    });
    escena.current = e;
    setGirando(e.spinning); // con «reducir movimiento» el cerebro no gira solo, y el botón lo tiene que decir
    e.start();
    return () => { e.destroy(); escena.current = null; };
  }, [elegir]);

  // Un mapa nuevo (o el primero): se coloca. Lo elegido ya no existe.
  useEffect(() => {
    if (!escena.current || !grafo) return;
    escena.current.setData(grafo.nodos, grafo.enlaces, { menciones: grafo.menciones, clave: client.id });
    setElegida(null);
    setSobre(null);
  }, [grafo, client.id]);

  // Lo que cambia sin cambiar el mapa: los filtros, la búsqueda, la nota elegida o señalada.
  useEffect(() => {
    const e = escena.current;
    if (!e || !grafo) return;
    e.setLayers(filtros.menciones);
    e.refresh();
    e.setFocus(elegida, sobre?.n ?? null, coinciden);
  }, [grafo, filtros, elegida, sobre, coinciden]);

  // A lo ancho la nota elegida flota sobre el lienzo, y el cerebro se centra en el hueco que queda a su lado. En el
  // teléfono la tarjeta va debajo y no tapa nada: no hay nada que compensar.
  const ajustarMargenes = useCallback(() => {
    const e = escena.current;
    const s = escenarioEl.current?.getBoundingClientRect();
    const f = fichaEl.current?.getBoundingClientRect();
    if (!e || !s || !f) return;
    const tapa = elegida && f.width > 0 && f.height > 0 && f.top < s.bottom - 1 && f.bottom > s.top + 1 && f.left < s.right && f.right > s.left;
    e.setInsets(0, tapa ? Math.max(0, s.right - f.left + 8) : 0);
  }, [elegida]);
  useEffect(() => {
    ajustarMargenes();
    window.addEventListener("resize", ajustarMargenes);
    return () => window.removeEventListener("resize", ajustarMargenes);
  }, [ajustarMargenes, grafo]);

  // ---------- Buscar por pasajes (Intro): encuentra lo que dice el TEXTO, no sólo el título ----------
  const buscar = async (ev) => {
    ev.preventDefault();
    const q = texto.trim();
    if (!q || !grafo) return;
    setBuscando(true);
    try {
      const r = await buscarEnCerebro(client.id, q, { para: "chat", n: 20 });
      const porRuta = new Map(grafo.nodos.map((n) => [n.ruta, n.i]));
      const indices = new Set((r.resultados ?? []).map((x) => porRuta.get(x.ruta)).filter((i) => i !== undefined));
      setDeTexto({ q, indices });
      const primera = [...indices][0];
      if (primera !== undefined && escena.current) escena.current.pulseFrom(primera, 6);
    } catch (e) {
      setError(e.message);
    } finally {
      setBuscando(false);
    }
  };

  // ---------- Los controles ----------
  const alternarTipo = (tipo) => setFiltros((f) => {
    const t = new Set(f.tiposOcultos);
    if (t.has(tipo)) t.delete(tipo); else t.add(tipo);
    return { ...f, tiposOcultos: t };
  });
  const alternarGiro = () => setGirando(escena.current ? escena.current.spin() : true);
  const teclas = (e) => {
    const s = escena.current;
    if (!s || e.target !== e.currentTarget) return;
    const paso = 0.2;
    const mapa = {
      ArrowLeft: () => s.rotateBy(-paso, 0), ArrowRight: () => s.rotateBy(paso, 0),
      ArrowUp: () => s.rotateBy(0, -paso), ArrowDown: () => s.rotateBy(0, paso),
      "+": () => s.zoomBy(0.85), "=": () => s.zoomBy(0.85), "-": () => s.zoomBy(1 / 0.85), 0: () => s.reset(),
      Escape: () => setElegida(null),
    };
    if (mapa[e.key]) { e.preventDefault(); mapa[e.key](); }
  };

  const vecindad = useMemo(() => (grafo && elegida ? vecinas(grafo, elegida.i) : []), [grafo, elegida]);

  if (error && !grafo) return <p role="alert" className="cerebro-error">{error}</p>;

  const hayFiltro = filtros.tiposOcultos.size > 0 || filtros.soloInternas;
  const pocas = grafo && pocasConexiones(grafo);

  return (
    <section className="cg" aria-labelledby={`${ids}-t`}>
      <div className="cg-cabecera">
        <h3 id={`${ids}-t`} className="cg-titulo">Mapa del cerebro</h3>
        {grafo && <p className="cg-cifras" role="status">{resumenDelMapa(grafo)}</p>}
      </div>
      {pocas && (
        <p className="cerebro-aviso" role="note">
          Casi no hay conexiones entre estas notas, así que el mapa se parece a una lista. La ficha técnica que escribe la IA cita las notas y las conecta: pulsa «Preparar ficha con IA».
        </p>
      )}

      <div className="cg-cuerpo">
        {/* ---------- Explorar ---------- */}
        <aside className="cg-explorar" aria-label="Explorar el mapa">
          <form className="cg-buscar" role="search" onSubmit={buscar}>
            <label className="label" htmlFor={`${ids}-q`}>Buscar en el mapa</label>
            <div className="cerebro-buscar-fila">
              <input id={`${ids}-q`} className="input" type="search" placeholder="Título o tema" value={texto}
                onChange={(e) => { setTexto(e.target.value); setDeTexto(null); }} />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={buscando || !texto.trim()}
                title="Busca también dentro del texto de las notas, no sólo en el título">
                {buscando ? "Buscando…" : "En el texto"}
              </button>
            </div>
            {coinciden && (
              <p className="hint" role="status">
                {coinciden.size ? `${coinciden.size === 1 ? "1 nota coincide" : `${coinciden.size} notas coinciden`}; el resto se apaga.` : "Ninguna nota coincide."}
              </p>
            )}
          </form>

          <div className="cg-grupo" role="group" aria-label="Regiones del cerebro">
            <p className="cg-etiqueta-grupo">Regiones</p>
            <div className="cg-chips">
              {partes.map((r) => (
                <button key={r.tipo} type="button" className="filter-chip cg-chip" aria-pressed={!filtros.tiposOcultos.has(r.tipo)}
                  onClick={() => alternarTipo(r.tipo)} title={TIPOS_VISTA[r.tipo]?.ayuda}>
                  <span className="cg-punto" style={{ background: r.color }} aria-hidden="true" />
                  {r.nombre} <span className="cerebro-cuenta">{r.n}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cg-grupo" role="group" aria-label="Qué se ve">
            <label className="cerebro-casilla" htmlFor={`${ids}-m`}>
              <input id={`${ids}-m`} type="checkbox" checked={filtros.menciones} onChange={(e) => setFiltros((f) => ({ ...f, menciones: e.target.checked }))} />
              <span>Menciones <span className="hint">(una nota nombra a otra sin enlazarla)</span></span>
            </label>
            {nInternas > 0 && (
              <label className="cerebro-casilla" htmlFor={`${ids}-i`}>
                <input id={`${ids}-i`} type="checkbox" checked={filtros.soloInternas} onChange={(e) => setFiltros((f) => ({ ...f, soloInternas: e.target.checked }))} />
                <span>Sólo las internas <span className="cerebro-cuenta">{nInternas}</span></span>
              </label>
            )}
            {hayFiltro && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros((f) => ({ ...FILTROS_INICIALES, menciones: f.menciones }))}>
                Mostrar todo
              </button>
            )}
          </div>

          <div className="cg-grupo">
            <p className="cg-etiqueta-grupo" id={`${ids}-l`}>Notas <span className="cerebro-cuenta">{vistas.length}</span></p>
            <ul className="cg-lista" aria-labelledby={`${ids}-l`}>
              {vistas.map((n) => (
                <li key={n.id}>
                  <button type="button" className="cg-fila" aria-pressed={elegida?.id === n.id}
                    data-apagada={coinciden && !coinciden.has(n.i) ? "" : undefined} onClick={() => elegir(n)}>
                    <span className="cg-punto" style={{ background: colorDeNota(n) }} aria-hidden="true" />
                    <span className="cg-fila-titulo">{n.titulo}</span>
                    {n.interna && <><Icon name="lock" size={14} /><span className="sr-only">(interna)</span></>}
                  </button>
                </li>
              ))}
              {!vistas.length && <li className="hint">Ninguna nota con estos filtros.</li>}
            </ul>
          </div>
        </aside>

        {/* ---------- El lienzo ---------- */}
        <div className="cg-centro">
          <div className="cg-escenario" ref={escenarioEl} tabIndex={0} role="group" onKeyDown={teclas}
            aria-label="Mapa del cerebro en 3D. Es un dibujo: para leer las notas usa la lista. Con el foco aquí, las flechas lo giran, más y menos lo acercan, cero lo devuelve a su sitio.">
            <div className="cg-lienzo-host" ref={host} />
            {!grafo && <p className="cg-cargando" role="status">Dibujando el cerebro…</p>}
            <div className="cg-controles" role="group" aria-label="Mover el cerebro">
              <button type="button" className="btn-icon btn-icon-on-color" onClick={() => escena.current?.zoomBy(0.8)} aria-label="Acercar" title="Acercar"><Icon name="plus" /></button>
              <button type="button" className="btn-icon btn-icon-on-color" onClick={() => escena.current?.zoomBy(1.25)} aria-label="Alejar" title="Alejar"><Icon name="minus" /></button>
              <button type="button" className="btn-icon btn-icon-on-color" onClick={() => escena.current?.reset()} aria-label="Volver a la vista inicial" title="Volver a la vista inicial"><Icon name="refresh" /></button>
              <button type="button" className="btn-icon btn-icon-on-color" onClick={alternarGiro} aria-pressed={girando}
                aria-label={girando ? "Parar el giro" : "Que gire solo"} title={girando ? "Parar el giro" : "Que gire solo"}><Icon name={girando ? "pause" : "play"} /></button>
            </div>
            <p className="cg-ayuda" aria-hidden="true">Arrastra para girar · rueda o pellizco para acercar · toca una neurona</p>
            {sobre && elegida?.id !== sobre.n.id && (
              <div className="cg-vista" style={{ left: Math.max(8, sobre.x + 14), top: Math.max(8, sobre.y + 14) }} role="presentation">
                <strong>{sobre.n.titulo}</strong>
                <span>{nombreDeTipo(sobre.n.tipo)}{sobre.n.interna ? " · interna" : ""}</span>
                {sobre.n.resumen && <em>{sobre.n.resumen.length > 130 ? `${sobre.n.resumen.slice(0, 130)}…` : sobre.n.resumen}</em>}
              </div>
            )}
          </div>
          <ul className="cg-leyenda" aria-label="Cómo leer el mapa">
            <li><span className="cg-punto" style={{ background: COLOR_INTERNA }} aria-hidden="true" /> Anillo naranja: nota interna</li>
            <li><span className="cg-linea" style={{ background: "#fff" }} aria-hidden="true" /> Línea clara: un [[enlace]]</li>
            <li><span className="cg-linea" style={{ background: COLOR_MENCION }} aria-hidden="true" /> Línea azul: una mención</li>
            <li>Más grande y más al centro: más conexiones</li>
          </ul>

          {/* ---------- La nota elegida ---------- */}
          <aside className="cg-ficha" ref={fichaEl} aria-label="La nota elegida" aria-live="polite">
            {elegida ? (
              <div className="card cg-tarjeta">
                <div className="cg-tarjeta-cabeza">
                  <h4 className="cg-tarjeta-titulo">{elegida.titulo}</h4>
                  <button type="button" className="btn-icon" onClick={() => setElegida(null)} aria-label="Cerrar la nota"><Icon name="close" /></button>
                </div>
                <p className="cerebro-meta">
                  <span className="badge cerebro-tipo" style={{ borderColor: colorDeNota(elegida) }} title={TIPOS_VISTA[elegida.tipo]?.ayuda}>{nombreDeTipo(elegida.tipo)}</span>
                  {elegida.interna && <span className="badge cerebro-interna" title="La ve el equipo, pero no sale en los textos que se publican"><Icon name="lock" size={12} /> Interna</span>}
                  <span>{formatoCaracteres(elegida.caracteres)} car.</span>
                  <span>{ORIGEN[elegida.origen] ?? "A mano"}</span>
                  <span>{fecha(elegida.actualizada)}</span>
                </p>
                <p className="cg-grupo-de">Región: {elegida.g}</p>
                {elegida.resumen && <p className="cerebro-resumen">{elegida.resumen}</p>}
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onAbrir(elegida)}>
                  <Icon name="pencil" size={16} /> Abrir la nota
                </button>
                <div className="cg-vecinas">
                  <p className="cg-etiqueta-grupo">{vecindad.length ? `Conectada con ${vecindad.length}` : "Sin conexiones"}</p>
                  {!vecindad.length && <p className="hint">Nadie la enlaza ni la nombra, y ella no nombra a nadie.</p>}
                  <ul className="cg-lista">
                    {vecindad.map(({ nota, clase }) => (
                      <li key={nota.id}>
                        <button type="button" className="cg-fila" onClick={() => elegir(nota)} title={clase === "enlace" ? "Enlazada con [[ ]]" : "Mencionada sin enlazar"}>
                          <span className="cg-punto" style={{ background: colorDeNota(nota) }} aria-hidden="true" />
                          <span className="cg-fila-titulo">{nota.titulo}</span>
                          <span className="cg-clase">{clase === "enlace" ? "enlace" : "mención"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="hint cg-pista">Toca una neurona, o elige una nota de la lista: verás qué es y con quién se conecta.</p>
            )}
          </aside>
        </div>

      </div>
    </section>
  );
}
