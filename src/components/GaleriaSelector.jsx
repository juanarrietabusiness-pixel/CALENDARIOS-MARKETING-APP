import { useEffect, useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { Pieza } from "./EstudioVisor";
import FiltrosGaleria, { ChipsDeVistas } from "./FiltrosGaleria";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useBusquedaGaleria } from "../hooks/useBusquedaGaleria";
import {
  leerEstudio, leerPaginaGaleria, conPagina, agruparGaleria, apilarVersiones, filtrarArchivos, contarVistas, porSemanas, fechaDeTarjeta,
  textoDeGrupo, estaUsado, FILTROS_VACIOS,
} from "../lib/estudio";
import "./VisorGrupo.css";

/**
 * «De la galería» del panel de una publicación: lo que ya está hecho en el Estudio del cliente, sin crearlo otra vez.
 * Un carrusel o un reel es UNA tarjeta, como en la galería: tocarla escoge TODAS sus piezas en su orden. Una imagen
 * suelta se escoge y se quita con un toque. El orden en que se tocan es el de la publicación.
 *
 * Con lo mismo que la galería del Estudio (components/FiltrosGaleria.jsx): buscar (también en lo no cargado, en el
 * servidor), vistas, filtros, las versiones de una pieza en una tarjeta, por semanas y «Cargar más». Arranca en «Sin
 * usar» (de verdad: lo que ninguna publicación lleva hoy), que es lo que casi siempre se busca aquí.
 *
 *   maximo      cuántas caben (Instagram: 10)
 *   yaTiene     cuántas tiene ya la publicación (entonces se pregunta añadir o reemplazar)
 *   onElegir    (archivos, { reemplazar }) => void
 *   destino     «la publicación» o «el chat»: lo que dice el botón (el asistente también escoge de aquí)
 *   una         modo de UNA imagen (la portada de un reel): sólo imágenes, sueltas, y tocar otra cambia la escogida
 */
export default function GaleriaSelector({ clienteId, maximo = 10, yaTiene = 0, onElegir, onCerrar, destino = "la publicación", una = false }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [elegidas, setElegidas] = useState([]); // archivos, en orden
  const [reemplazar, setReemplazar] = useState(false);
  const [filtro, setFiltro] = useState("todas");
  const [filtros, setFiltros] = useState(() => ({ ...FILTROS_VACIOS, uso: "sin-usar" }));
  const [cargandoMas, setCargandoMas] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerEstudio(clienteId).then((d) => { if (vivo) setDatos(d); }).catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [clienteId]);

  const cargarMas = async () => {
    if (!datos?.siguiente || cargandoMas) return;
    setCargandoMas(true);
    try { const p = await leerPaginaGaleria(clienteId, datos.siguiente); setDatos((d) => conPagina(d, p)); }
    catch (e) { setError(e.message); } finally { setCargandoMas(false); }
  };

  const busqueda = useBusquedaGaleria(clienteId, filtros.texto, { todoCargado: !datos?.siguiente, version: datos });
  const archivos = useMemo(() => {
    const ya = new Set((datos?.archivos ?? []).map((a) => a.id));
    const todos = [...(datos?.archivos ?? []), ...busqueda.extra.filter((a) => !ya.has(a.id))].filter((a) => !a.borradoAt);
    // Con `una`, sólo las imágenes (también las láminas de un carrusel: cualquiera puede ser la portada).
    return una ? todos.filter((a) => a.tipo === "imagen") : todos;
  }, [datos, busqueda.extra, una]);
  const carpetas = useMemo(() => datos?.carpetas ?? [], [datos]);
  const productos = useMemo(() => [...(datos?.productos ?? []), ...(datos?.sinFotos ?? [])], [datos]);
  const opciones = useMemo(() => ({ ...filtros, producto: productos.find((p) => p.id === filtros.producto) ?? null, carpetas, productos: datos?.productos ?? [] }),
    [filtros, productos, carpetas, datos]);
  const visibles = useMemo(() => filtrarArchivos(archivos, { ...opciones, filtro }), [archivos, opciones, filtro]);
  const vista = useMemo(() => {
    const apiladas = filtro === "todas" || una ? apilarVersiones(visibles, carpetas, datos?.trabajos) : visibles;
    if (una) return apiladas;
    return filtro === "todas" || filtro === "grupos" ? agruparGaleria(apiladas, carpetas, archivos) : visibles;
  }, [visibles, carpetas, datos, archivos, filtro, una]);
  const cuentas = useMemo(() => contarVistas(archivos, carpetas), [archivos, carpetas]);
  const semanas = useMemo(() => porSemanas(vista, fechaDeTarjeta), [vista]);

  const caben = una ? 1 : reemplazar || !yaTiene ? maximo : Math.max(0, maximo - yaTiene);
  const marcada = (a) => elegidas.some((x) => x.id === a.id);
  const alternar = (a) => setElegidas((l) => (l.some((x) => x.id === a.id) ? l.filter((x) => x.id !== a.id) : una ? [a] : [...l, a]));
  const alternarGrupo = (piezas) => setElegidas((l) => (piezas.every((p) => l.some((x) => x.id === p.id))
    ? l.filter((x) => !piezas.some((p) => p.id === x.id))
    : [...l, ...piezas.filter((p) => !l.some((x) => x.id === p.id))]));
  const sobran = elegidas.length > caben;
  const soloSinUsar = filtros.uso === "sin-usar";

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog visor-grupo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="visor-grupo-cabecera">
          <div>
            <h3 id={`${ids}-t`}>{una ? "Escoger la portada de la galería" : "Escoger de la galería"}</h3>
            <p className="hint" style={{ margin: 0 }}>
              {una ? "Toca la imagen que va de portada del video. La vertical (9:16) es la que mejor queda." : "Toca un carrusel para ponerlo entero y en orden, o las imágenes una a una."}
            </p>
          </div>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
        {!datos && !error && <p role="status" className="hint">Abriendo la galería…</p>}
        {datos && (datos.archivos ?? []).length > 0 && (
          <>
            <ChipsDeVistas filtro={filtro} cuentas={cuentas} onFiltro={setFiltro} sin={una ? ["grupos"] : []} mas={Boolean(datos.siguiente)} />
            <FiltrosGaleria valor={filtros} onCambiar={setFiltros} archivos={archivos} productos={productos} soloImagenes={una} buscando={busqueda.buscando} aviso={busqueda.aviso} />
          </>
        )}
        {datos && !(datos.archivos ?? []).length && <p className="hint">{una ? "La galería de este cliente no tiene imágenes todavía. Crea la portada en el Estudio o con «Portada que da clic»." : "La galería de este cliente está vacía. Crea algo en el Estudio o con «Crear con IA»."}</p>}
        {datos && (datos.archivos ?? []).length > 0 && (
          <div className="galeria-selector-cuerpo">
            {!vista.length && (
              <p className="hint">
                {soloSinUsar ? "No hay nada sin usar con eso." : "No hay nada con esa búsqueda o esos filtros."}{" "}
                {soloSinUsar && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros((f) => ({ ...f, uso: "" }))}>Ver también las usadas</button>}
              </p>
            )}
            {semanas.map((s) => (
              <section key={s.clave} className="est-semana" aria-labelledby={`${ids}-s-${s.clave}`}>
                <h4 id={`${ids}-s-${s.clave}`} className="est-semana-titulo">{s.titulo} <span>· {s.items.length}</span></h4>
                <ul className="visor-grupo-piezas galeria-selector">
                  {s.items.map((x) => {
                    if (x.grupo) {
                      const { carpeta, piezas, portada } = x.grupo;
                      const todas = piezas.every(marcada);
                      const nombre = textoDeGrupo(carpeta, piezas);
                      return (
                        <li key={x.id}>
                          <button type="button" className="visor-grupo-pieza" aria-pressed={todas} aria-label={`${nombre}: ${carpeta.nombre}`} onClick={() => alternarGrupo(piezas)}>
                            <Pieza archivo={portada} />
                            <span className="visor-grupo-num">{todas ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />}</span>
                            <span className="galeria-selector-pie">{nombre}</span>
                          </button>
                        </li>
                      );
                    }
                    const i = elegidas.findIndex((e) => e.id === x.id);
                    return (
                      <li key={x.id}>
                        <button type="button" className="visor-grupo-pieza" aria-pressed={i >= 0} aria-label={`${i >= 0 ? "Quitar" : "Escoger"}: ${x.prompt || "pieza"}`} onClick={() => alternar(x)}>
                          <Pieza archivo={x} />
                          {i >= 0 && <span className="visor-grupo-num">{una ? <Icon name="check" size={12} /> : i + 1}</span>}
                          {estaUsado(x) && <span className="visor-grupo-usada">Usada</span>}
                          {x.anteriores && <span className="galeria-selector-pie">{x.anteriores.length + 1} versiones (se pone ésta)</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {datos.siguiente && (
              <div className="est-cargar-mas">
                <button type="button" className="btn btn-secondary btn-sm" disabled={cargandoMas} onClick={cargarMas}>
                  <Icon name="chevronDown" size={14} /> {cargandoMas ? "Cargando…" : "Cargar más (las anteriores)"}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="visor-grupo-pie">
          {yaTiene > 0 && !una && (
            <label className="galeria-selector-reemplazar">
              <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} /> Reemplazar lo que ya tiene ({yaTiene})
            </label>
          )}
          {sobran && <p role="alert" className="hint" style={{ margin: 0 }}>Caben {caben}{destino === "la publicación" ? `: Instagram admite ${maximo} por publicación` : ` en ${destino}`}.</p>}
          <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!elegidas.length || sobran} onClick={() => onElegir(elegidas, { reemplazar })}>
            <Icon name="check" size={18} /> {una ? (elegidas.length ? "Usar como portada" : "Escoge una imagen") : elegidas.length ? `Poner ${elegidas.length} en ${destino}` : "Escoge algo"}
          </button>
        </div>
      </div>
    </div>
  );
}
