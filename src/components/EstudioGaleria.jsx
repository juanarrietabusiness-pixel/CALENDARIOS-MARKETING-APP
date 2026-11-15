import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Pieza } from "./EstudioVisor";
import ExploradorDrive from "./ExploradorDrive";
import { OverflowMenu } from "./calendario/primitivas";
import FiltrosGaleria, { ChipsDeVistas } from "./FiltrosGaleria";
import { useBusquedaGaleria } from "../hooks/useBusquedaGaleria";
import { idDeCarpeta } from "../lib/drive";
import { ideaDelPedido } from "../lib/kitMarca";
import { textoCosto } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import {
  filtrarArchivos, contarVistas, agruparGaleria, apilarVersiones, esGrupo, esCarpetaAutomatica, esCarpetaCompetencia, porSemanas,
  fechaDeTarjeta, idsDeLaSeleccion, insigniasDe, piezasDeGrupo, textoDeGrupo, modeloDeLaPieza, hace, formaDe, cuantosFiltros, FILTROS_VACIOS,
} from "../lib/estudio";
import "./EstudioGaleria.css";

const PonerEnPublicacion = lazy(() => import("./PonerEnPublicacion"));
const EstudioPapelera = lazy(() => import("./EstudioPapelera"));

// ============================================================
// La GALERÍA del Estudio (Crear → Galería y el diálogo «Crear en el Estudio»), en su chunk: el del Estudio estaba en su
// tope (20 kB) y lo nuevo de la galería no cabía.
//
// · Va POR PÁGINAS: «Cargar más» pide la siguiente por fecha (antes, las 300 más recientes y ya: en Baby Caleb 101
//   piezas no se veían), y lo que no está cargado se busca en el servidor (hooks/useBusquedaGaleria.js).
// · Vistas: «Lo último» (una tarjeta por pieza: los carruseles y reels juntos, las versiones apiladas; sin la competencia
//   ni lo de la marca), «Carruseles y reels», «Me gusta», «Marca», «Competencia» y «Sin carpeta»; y por semanas.
// · Seleccionar: lo que se VE (una pila de versiones es la que se ve; un carrusel, sus piezas), y en grupo: papelera,
//   mover a carpeta, «Me gusta», agrupar como carrusel y poner en una publicación.
//
// Lo que toca el compositor o el visor (referencia, animar, otra versión, abrir) llega de Estudio.jsx por `tarjeta`.
// ============================================================

/** Las carpetas que van como chip (las de la persona, si son pocas); las demás, en el desplegable. */
const MAX_CHIPS_CARPETA = 4;

export default function EstudioGaleria({
  client, lectura, dialogo, pulso = 0, datos, setDatos, cargar, accion, avisar, hastaRef,
  filtro, setFiltro, enPapelera, setEnPapelera, enDrive, setEnDrive, perdidos, setPerdidos,
  cabeceraRef = null, destino = "", onCancelarDestino, onAbrir, onAbrirGrupo, variasAPapelera, onDrive, tarjeta = {},
}) {
  const ids = useId();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [seleccion, setSeleccion] = useState(null); // null = no se está seleccionando; si no, un Set de ids de TARJETA
  const [poner, setPoner] = useState(null);
  const [carpetaNueva, setCarpetaNueva] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const subirRef = useRef(null);

  const archivos = useMemo(() => datos?.archivos ?? [], [datos]);
  const carpetas = useMemo(() => datos?.carpetas ?? [], [datos]);
  const trabajos = datos?.trabajos;
  const papelera = datos?.papelera ?? [];
  const todoCargado = !datos?.siguiente;
  const busqueda = useBusquedaGaleria(client.id, filtros.texto, { todoCargado, version: datos });
  // Lo cargado y lo que encontró el servidor de lo que aún no se cargó.
  const todos = useMemo(() => {
    if (!busqueda.extra.length) return archivos;
    const ya = new Set(archivos.map((a) => a.id));
    return [...archivos, ...busqueda.extra.filter((a) => !ya.has(a.id))];
  }, [archivos, busqueda.extra]);
  const productos = useMemo(() => [...(datos?.productos ?? []), ...(datos?.sinFotos ?? [])], [datos]);
  const opciones = useMemo(() => ({ ...filtros, producto: productos.find((p) => p.id === filtros.producto) ?? null, carpetas, productos: datos?.productos ?? [] }),
    [filtros, productos, carpetas, datos]);
  const visibles = useMemo(() => filtrarArchivos(todos, { ...opciones, filtro }), [todos, opciones, filtro]);
  // En «Lo último», cada carrusel y cada reel es UNA tarjeta, y las versiones de una pieza también; en «Carruseles y
  // reels», cada uno su tarjeta; en lo demás (y en su carpeta), pieza a pieza.
  const vista = useMemo(() => (filtro === "todas" ? agruparGaleria(apilarVersiones(visibles, carpetas, trabajos), carpetas, todos)
    : filtro === "grupos" ? agruparGaleria(visibles, carpetas, todos) : visibles), [visibles, carpetas, trabajos, todos, filtro]);
  const deTodas = useMemo(() => (filtro === "todas" && !cuantosFiltros(filtros) && !filtros.texto ? vista
    : agruparGaleria(apilarVersiones(filtrarArchivos(archivos, { carpetas }), carpetas, trabajos), carpetas, archivos)), [filtro, filtros, vista, archivos, carpetas, trabajos]);
  const cuentas = useMemo(() => contarVistas(archivos, carpetas, deTodas), [archivos, carpetas, deTodas]);
  const semanas = useMemo(() => porSemanas(vista, fechaDeTarjeta), [vista]);

  const personales = carpetas.filter((c) => !esGrupo(c) && !esCarpetaAutomatica(c));
  const automaticas = carpetas.filter((c) => !esGrupo(c) && esCarpetaAutomatica(c) && !esCarpetaCompetencia(c));
  const enDesplegable = [...(personales.length > MAX_CHIPS_CARPETA ? personales : []), ...automaticas];
  const enChips = personales.length > MAX_CHIPS_CARPETA ? [] : personales;
  const carpetaActiva = carpetas.find((c) => c.id === filtro) ?? null;
  const enGaleria = !enPapelera && !enDrive;
  const irA = (f) => { setEnPapelera(false); setEnDrive(false); setFiltro(f); };

  // ---------- Más páginas ----------
  const cargarMas = async () => {
    if (!datos?.siguiente || cargandoMas) return;
    setCargandoMas(true);
    try {
      const p = await api.leerPaginaGaleria(client.id, datos.siguiente);
      // Lo que se relee después (un aviso del espacio) va hasta aquí: si no, volvería a la primera página.
      if (hastaRef) hastaRef.current = p.siguiente ?? p.archivos.at(-1)?.creado ?? hastaRef.current;
      setDatos((d) => api.conPagina(d, p));
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setCargandoMas(false);
    }
  };

  // ---------- Seleccionar y hacer en grupo ----------
  const abrir = (x) => {
    if (seleccion) { alternar(x); return; }
    if (x.grupo) onAbrirGrupo(x.grupo); else onAbrir(x);
  };
  const alternar = (x) => setSeleccion((sel) => {
    const nueva = new Set(sel ?? []);
    if (nueva.has(x.id)) nueva.delete(x.id); else nueva.add(x.id);
    return nueva;
  });
  const marcadas = [...(seleccion ?? [])];
  const sueltas = marcadas.filter((id) => !String(id).startsWith("grupo-"));
  const hayGrupos = sueltas.length < marcadas.length;
  const terminar = () => setSeleccion(null);
  const aLaPapelera = async () => { await variasAPapelera(idsDeLaSeleccion(seleccion, todos)); terminar(); };
  const agrupar = () => accion(async () => {
    await api.agruparComoCarrusel(client.id, sueltas.filter((id) => todos.some((a) => a.id === id && a.tipo === "imagen")));
    terminar();
  }, "Agrupadas como carrusel, en el orden en que las tocaste.");
  // Un carrusel marcado va entero y en su orden.
  const ponerEnPost = () => setPoner(marcadas.flatMap((id) => {
    if (!String(id).startsWith("grupo-")) return [id];
    const c = carpetas.find((x) => `grupo-${x.id}` === id);
    return c ? piezasDeGrupo(c, todos).map((a) => a.id) : [];
  }));
  const fuera = hayGrupos ? " Los carruseles y reels marcados se quedan en su carpeta." : "";
  const moverVarias = (carpetaId) => accion(async () => {
    for (const id of sueltas) await api.cambiarArchivo(client.id, id, { carpetaId: carpetaId || null });
    terminar();
  }, `${sueltas.length} ${sueltas.length === 1 ? "movida" : "movidas"} ${carpetaId ? `a «${carpetas.find((c) => c.id === carpetaId)?.nombre ?? "la carpeta"}»` : "fuera de su carpeta"}.${fuera}`);
  const gustanTodas = sueltas.length > 0 && sueltas.every((id) => todos.find((a) => a.id === id)?.favorito);
  const meGustaVarias = () => accion(async () => {
    for (const id of sueltas) await api.cambiarArchivo(client.id, id, { favorito: !gustanTodas });
    terminar();
  }, `${gustanTodas ? "Quitado «Me gusta» a" : "«Me gusta» en"} ${sueltas.length}.${fuera}`);

  // ---------- Carpetas ----------
  const crearCarpeta = async (e) => {
    e.preventDefault();
    if (!carpetaNueva?.trim()) return;
    try {
      const { carpeta } = await api.crearCarpeta(client.id, carpetaNueva);
      setCarpetaNueva(null);
      irA(carpeta.id);
      await cargar();
    } catch (err) {
      avisar(false, err.message);
    }
  };
  const guardarNombre = (e) => {
    e.preventDefault();
    accion(async () => { await api.renombrarCarpeta(client.id, renombrando.id, renombrando.nombre); setRenombrando(null); });
  };
  const quitarCarpeta = (c) => accion(async () => { await api.borrarCarpeta(client.id, c.id); setFiltro("todas"); }, `Carpeta «${c.nombre}» quitada. Sus archivos siguen en la galería.`);

  /** «Subir a la galería»: sueltas, sin tocar el pedido; a la carpeta que se mira. */
  const subirSueltas = async (fs) => {
    if (!fs.length) return;
    setSubiendo(true);
    try { avisar(true, await api.subirALaGaleria(client.id, fs, { carpetaId: carpetaActiva?.id ?? null })); await cargar(); }
    catch (e) { avisar(false, e.message); } finally { setSubiendo(false); }
  };
  const quitarPerdidas = (lista) => accion(async () => {
    for (const id of lista) await api.quitarPerdido(client.id, id);
    setPerdidos(new Set());
  }, lista.length === 1 ? "Quitada de la galería." : `${lista.length} quitadas de la galería.`);

  // ---------- La papelera ----------
  const vaciar = () => accion(async () => avisar(true, await api.vaciarDelTodo(client.id)));
  const recuperar = (a) => accion(() => api.recuperarArchivo(client.id, a.id), "Recuperada.");
  const borrarDeVerdad = async (a, forzar = false) => {
    try {
      await api.borrarDelTodo(client.id, a.id, { forzar });
      setBorrando(null);
      avisar(true, "Borrada del todo.");
      await cargar();
    } catch (e) {
      if (e.datos?.codigo === "en_uso") setBorrando({ id: a.id, usos: e.datos.usos });
      else avisar(false, e.message);
    }
  };

  const chip = (c) => (
    <button key={c.id} type="button" className="filter-chip" aria-pressed={enGaleria && filtro === c.id} onClick={() => irA(c.id)}>
      <Icon name={esGrupo(c) ? (c.tipo === "reel" ? "video" : "copy") : "folder"} size={13} /> {c.nombre} ({cuentas[c.id] ?? 0})
    </button>
  );
  const filtrando = cuantosFiltros(filtros) > 0 || Boolean(filtros.texto.trim());

  return (
    <>
      <div className="est-galeria-cabecera" ref={cabeceraRef}>
        {destino && (
          <p className="notice est-destino" role="status">
            Toca una imagen para ponerla como <strong>{destino}</strong>.
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelarDestino}>Cancelar</button>
          </p>
        )}
        <h3 className="est-subtitulo">{enPapelera ? "Papelera" : enDrive ? "Drive de " + client.name : "Galería"}</h3>
        <ChipsDeVistas filtro={filtro} cuentas={cuentas} onFiltro={irA} activo={enGaleria} mas={!todoCargado}>
          {[...enChips, ...carpetas.filter((c) => esGrupo(c) && c.id === filtro)].map(chip)}
          {enDesplegable.length > 0 && (
            <select
              className="input est-carpetas-select" aria-label="Otras carpetas"
              value={enGaleria && enDesplegable.some((c) => c.id === filtro) ? filtro : ""} onChange={(e) => e.target.value && irA(e.target.value)}
            >
              <option value="">{personales.length > MAX_CHIPS_CARPETA ? "Carpetas…" : "Más carpetas…"}</option>
              {personales.length > MAX_CHIPS_CARPETA && <optgroup label="Tuyas">{personales.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({cuentas[c.id] ?? 0})</option>)}</optgroup>}
              {automaticas.length > 0 && <optgroup label="De la aplicación (lotes, variaciones)">{automaticas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({cuentas[c.id] ?? 0})</option>)}</optgroup>}
            </select>
          )}
          {!lectura && carpetaNueva === null && (
            <button type="button" className="filter-chip est-chip-nueva" onClick={() => setCarpetaNueva("")}><Icon name="plus" size={13} /> Carpeta</button>
          )}
          {client.driveFolder && (
            <button type="button" className="filter-chip" aria-pressed={!enPapelera && enDrive} onClick={() => { setEnPapelera(false); setEnDrive(true); }}><Icon name="cloud" size={13} /> Drive</button>
          )}
          <button type="button" className="filter-chip" aria-pressed={enPapelera} onClick={() => setEnPapelera(true)}><Icon name="trash" size={13} /> Papelera ({papelera.length})</button>
        </ChipsDeVistas>
        {carpetaNueva !== null && (
          <form className="est-carpeta-form" onSubmit={crearCarpeta}>
            <label className="sr-only" htmlFor={`${ids}-cn`}>Nombre de la carpeta</label>
            <input id={`${ids}-cn`} className="input" value={carpetaNueva} maxLength={40} autoFocus placeholder="Nombre de la carpeta" onChange={(e) => setCarpetaNueva(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!carpetaNueva.trim()}>Crear</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCarpetaNueva(null)}>Cancelar</button>
          </form>
        )}
        {enGaleria && carpetaActiva && !lectura && (
          renombrando ? (
            <form className="est-carpeta-form" onSubmit={guardarNombre}>
              <label className="sr-only" htmlFor={`${ids}-rn`}>Nuevo nombre</label>
              <input id={`${ids}-rn`} className="input" value={renombrando.nombre} maxLength={40} autoFocus onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!renombrando.nombre.trim()}>Guardar</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenombrando(null)}>Cancelar</button>
            </form>
          ) : (
            <div className="est-carpeta-acciones">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenombrando({ id: carpetaActiva.id, nombre: carpetaActiva.nombre })}><Icon name="pencil" size={14} /> Renombrar «{carpetaActiva.nombre}»</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarCarpeta(carpetaActiva)}><Icon name="trash" size={14} /> Quitar la carpeta</button>
            </div>
          )
        )}
        {enGaleria && archivos.length > 1 && (
          <FiltrosGaleria valor={filtros} onCambiar={setFiltros} archivos={archivos} productos={productos} buscando={busqueda.buscando} aviso={busqueda.aviso} />
        )}
        {enGaleria && !lectura && (
          <div className="est-seleccion" role="group" aria-label={seleccion ? "Lo seleccionado" : "Subir y seleccionar"}>
            {seleccion ? (
              <>
                <span className="est-seleccion-cuenta">{seleccion.size} seleccionada{seleccion.size === 1 ? "" : "s"}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(new Set(vista.map((x) => x.id)))}>Todas las que se ven ({vista.length})</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!sueltas.length} onClick={meGustaVarias}><Icon name="heart" size={14} /> {gustanTodas ? "Quitar «Me gusta»" : "Me gusta"}</button>
                <label className="sr-only" htmlFor={`${ids}-mv`}>Mover a una carpeta</label>
                <select id={`${ids}-mv`} className="input est-carpetas-select" disabled={!sueltas.length} value="" onChange={(e) => e.target.value && moverVarias(e.target.value === "-" ? "" : e.target.value)}>
                  <option value="">Mover a carpeta…</option>
                  <option value="-">Sin carpeta</option>
                  {carpetas.filter((c) => !esGrupo(c)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" disabled={sueltas.length < 2} onClick={agrupar}>Agrupar como carrusel</button>
                {!dialogo && <button type="button" className="btn btn-secondary btn-sm" disabled={!seleccion.size} onClick={ponerEnPost}><Icon name="send" size={14} /> Poner en una publicación…</button>}
                <button type="button" className="btn btn-danger btn-sm" disabled={!seleccion.size} onClick={aLaPapelera}>
                  <Icon name="trash" size={14} /> Mandar {seleccion.size || ""} a la papelera
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={terminar}>Cancelar</button>
              </>
            ) : (
              <>
                <input ref={subirRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { const fs = [...e.target.files]; e.target.value = ""; subirSueltas(fs); }} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => subirRef.current?.click()}>
                  <Icon name="upload" size={14} /> {subiendo ? "Subiendo…" : carpetaActiva ? `Subir a «${carpetaActiva.nombre}»` : "Subir a la galería"}
                </button>
                {visibles.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(new Set())}><Icon name="checkSquare" size={14} /> Seleccionar</button>}
              </>
            )}
          </div>
        )}
        {enGaleria && perdidos.size > 0 && !lectura && (
          <p className="est-aviso est-aviso-mal est-perdidos">
            {perdidos.size === 1 ? "Una pieza de la galería ya no tiene su archivo." : `${perdidos.size} piezas de la galería ya no tienen su archivo.`}{" "}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitarPerdidas([...perdidos])}>Quitarlas de la galería</button>
          </p>
        )}
      </div>

      {enDrive && !enPapelera ? (
        <div className="est-drive">
          {!lectura && <p className="hint" style={{ marginTop: 0 }}>Toca una imagen para traerla a la galería y ponerla en el pedido (de referencia, o de imagen inicial en un video).</p>}
          <ExploradorDrive
            clienteId={client.dbId || client.id} raiz={idDeCarpeta(client.driveFolder)} modo="escoger" tipos={["imagen", "video"]} maximo={1} pulso={pulso}
            onSelect={lectura ? undefined : onDrive}
          />
        </div>
      ) : enPapelera ? (
        <Suspense fallback={<p className="est-vacio">Abriendo la papelera…</p>}>
          <EstudioPapelera
            papelera={papelera} lectura={lectura} borrando={borrando} onVaciar={vaciar}
            onRecuperar={recuperar} onBorrar={borrarDeVerdad} onNoBorrar={() => setBorrando(null)}
          />
        </Suspense>
      ) : archivos.length === 0 ? (
        <div className="card est-vacio-grande">
          <h3>Todavía no hay nada de {client.name}</h3>
          <p>Escribe qué quieres arriba y pulsa «Crear». Cada pieza que salga queda aquí, y puedes usarla de referencia para la siguiente o animarla para sacar un video.</p>
        </div>
      ) : (
        <>
          {filtrando && <p className="est-buscar-estado" role="status">{vista.length === 1 ? "1 resultado" : `${vista.length} resultados`}{todoCargado ? "" : " entre lo cargado y lo encontrado"}.</p>}
          {vista.length === 0 ? (
            <p className="est-vacio">
              No hay nada {filtrando ? "con esa búsqueda o esos filtros" : "en esta vista"}.
              {filtrando && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTROS_VACIOS)}>Quitar la búsqueda y los filtros</button>}
            </p>
          ) : semanas.map((s) => (
            <section key={s.clave} className="est-semana" aria-labelledby={`${ids}-s-${s.clave}`}>
              <h4 id={`${ids}-s-${s.clave}`} className="est-semana-titulo">{s.titulo} <span>· {s.items.length}</span></h4>
              <ul className="est-rejilla">
                {s.items.map((x) => (
                  <Tarjeta
                    key={x.id} x={x} t={tarjeta} lectura={lectura} seleccion={seleccion} destino={destino}
                    perdida={perdidos.has(x.id)} onPerdida={() => setPerdidos((p) => (p.has(x.id) ? p : new Set(p).add(x.id)))}
                    onAbrir={() => abrir(x)} onQuitarPerdida={() => quitarPerdidas([x.id])}
                  />
                ))}
              </ul>
            </section>
          ))}
          {!todoCargado && (
            <div className="est-cargar-mas">
              <button type="button" className="btn btn-secondary" disabled={cargandoMas} onClick={cargarMas}>
                <Icon name="chevronDown" size={16} /> {cargandoMas ? "Cargando…" : "Cargar más (las anteriores)"}
              </button>
              <p className="hint">Se ven las {archivos.length} más recientes.</p>
            </div>
          )}
        </>
      )}

      {poner && (
        <Suspense fallback={null}>
          <PonerEnPublicacion cliente={client} archivoIds={poner} descripcion={poner.length === 1 ? "la escogida" : `las ${poner.length} escogidas, en el orden en que las tocaste`} onCerrar={() => { setPoner(null); terminar(); }} />
        </Suspense>
      )}
    </>
  );
}

/**
 * Una tarjeta: la miniatura en la proporción del feed (un 9:16 se ve grande y recortado arriba y abajo; entera al
 * abrirla), como mucho tres marcas abajo sin pisarse, la papelera (o el candado de la marca) arriba a la derecha y la
 * casilla de seleccionar arriba a la izquierda. `t`: lo que hace con el compositor y el visor (de Estudio.jsx).
 */
function Tarjeta({ x, t, lectura, seleccion, destino, perdida, onPerdida, onAbrir, onQuitarPerdida }) {
  const marcada = Boolean(seleccion?.has(x.id));
  const insignias = insigniasDe(x, { enPedido: !x.grupo && Boolean(t.enMedios?.(x)) });
  const portada = x.grupo ? x.grupo.portada : x;
  const marcas = (
    <>
      {insignias.length > 0 && (
        <span className="est-insignias">
          {insignias.map((i) => <span key={i.clave} className={`est-insignia${i.tono ? ` est-insignia-${i.tono}` : ""}`}>{i.clave === "control" && i.tono === "bien" ? <Icon name="check" size={11} /> : null}{i.texto}</span>)}
        </span>
      )}
      {seleccion && <span className="est-marca-check" aria-hidden="true"><Icon name={marcada ? "checkSquare" : "square"} size={18} /></span>}
    </>
  );
  if (x.grupo) {
    const { carpeta, piezas } = x.grupo;
    const nombre = textoDeGrupo(carpeta, piezas);
    return (
      <li className={`est-tarjeta est-tarjeta-grupo${marcada ? " est-tarjeta-marcada" : ""}`}>
        <button
          type="button" className="est-img" data-forma={formaDe(portada)} aria-pressed={seleccion ? marcada : undefined}
          aria-label={seleccion ? `${marcada ? "Quitar de" : "Añadir a"} la selección: ${nombre}, ${carpeta.nombre}` : `Abrir ${nombre}: ${carpeta.nombre}`} onClick={onAbrir}
        >
          <Pieza archivo={portada} />
          {marcas}
        </button>
        <div className="est-pie">
          <p className="est-prompt" title={carpeta.nombre}>{carpeta.nombre}</p>
          <p className="est-meta">{nombre} · {hace(fechaDeTarjeta(x))}</p>
        </div>
      </li>
    );
  }
  const escena = ideaDelPedido(x.prompt);
  const costo = x.tipo !== "video" && !x.subido && x.modelo ? t.costoDeOtra?.(x) : null;
  return (
    <li className={`est-tarjeta${marcada ? " est-tarjeta-marcada" : ""}`}>
      <button
        type="button" className="est-img" data-forma={formaDe(x)}
        aria-label={seleccion ? `${marcada ? "Quitar de" : "Añadir a"} la selección: ${escena}` : destino ? `Poner como ${destino}: ${escena}` : `Abrir: ${escena}`}
        aria-pressed={seleccion ? marcada : undefined} onClick={onAbrir}
      >
        {perdida ? <span className="est-perdida"><Icon name="alert" size={20} /> Archivo perdido</span> : <Pieza archivo={x} onError={onPerdida} />}
        {marcas}
        {x.deLaMarca && <span className="est-marca-marca" title={x.deLaMarca}><Icon name="lock" size={12} /> Marca</span>}
      </button>
      {!lectura && !seleccion && !x.deLaMarca && t.onPapelera && (
        <button type="button" className="btn-icon est-a-papelera" aria-label={`Mandar a la papelera: ${escena}`} title="Mandar a la papelera" onClick={() => t.onPapelera(x)}>
          <Icon name="trash" size={16} />
        </button>
      )}
      <div className="est-pie">
        <p className="est-prompt" title={x.prompt}>{escena}</p>
        <p className="est-meta">{modeloDeLaPieza(x)}{x.costo > 0 ? ` · ${textoCosto(x.costo)}` : ""} · {hace(x.creado)}</p>
        {t.onUsar && (
          <button type="button" className="btn btn-primary btn-sm est-usar" onClick={() => t.onUsar(x)}>
            <Icon name="check" size={14} /> {t.etiquetaUsar ?? "Usar en la publicación"}
          </button>
        )}
        <div className="est-acciones">
          {!lectura && (
            <>
              <button type="button" className="btn-icon est-me-gusta" aria-pressed={x.favorito} aria-label={x.favorito ? "Quitar «Me gusta»" : "Me gusta"} title="Me gusta: el cerebro aprende de lo que eliges" onClick={() => t.onFavorito?.(x)}>
                <Icon name="heart" size={18} />
              </button>
              {x.tipo !== "video" && !x.subido && x.modelo && t.onOtra && (
                <button
                  type="button" className="btn-icon" disabled={t.versionando}
                  aria-label={`Otra versión: la misma información con otra escena${costo != null ? ` (${textoCosto(costo)})` : ""}`}
                  title={`Otra versión: la misma información con otra escena${costo != null ? ` · ${textoCosto(costo)}` : ""}`}
                  onClick={() => t.onOtra(x)}
                >
                  <Icon name="sparkles" size={18} />
                </button>
              )}
              {x.tipo !== "video" && t.onReferencia && (
                <>
                  <button type="button" className="btn-icon" aria-pressed={Boolean(t.enMedios?.(x))} aria-label={t.enMedios?.(x) ? "Quitar del pedido" : "Usar de referencia"} title="Usar de referencia" onClick={() => t.onReferencia(x)}>
                    <Icon name="paperclip" size={18} />
                  </button>
                  <button type="button" className="btn-icon" aria-label="Animar: convertirla en video" title="Animar: convertirla en video" onClick={() => t.onAnimar?.(x)}>
                    <Icon name="video" size={18} />
                  </button>
                </>
              )}
            </>
          )}
          <OverflowMenu items={[
            { icon: "download", label: "Descargar", onClick: () => t.onDescargar?.(x) },
            ...(perdida && !lectura ? [{ icon: "close", label: "Quitar de la galería", danger: true, onClick: onQuitarPerdida }] : []),
          ]} />
        </div>
      </div>
    </li>
  );
}
