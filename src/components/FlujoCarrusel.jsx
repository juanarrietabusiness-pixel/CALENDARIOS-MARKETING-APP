import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { textoCosto, costoDePieza, CONFIRMAR_DESDE } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { AJUSTES_DE_TEXTO, IGUALAR_TEXTO, ejemploParaIgualar } from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, estiloDeMarca, limpiarKit, referenciasDePersonajes, referenciaDeTipografia } from "../lib/kitMarca";
import { controlEncendido } from "../lib/controlEstudio";
import { partirGuion, MODOS_TEXTO, PLANTILLAS_TEXTO, MAX_LAMINAS, coloresPlantilla, costoCarrusel } from "../lib/carrusel";
import { productosDelPost } from "../lib/pilares";
import { crearLamina, corregirLamina, modelosParaCarrusel, modeloParaCarrusel, sistemaDeLaPortada } from "../lib/carruselEstudio";
import { lanzarCarrusel, seguirEncargo, terminarEncargo, laminasDeEncargo } from "../lib/encargosApi";
import { resumenSistema } from "../lib/sistemaCarrusel";
import ReferenciasGaleria from "./ReferenciasGaleria";
import IdeasDeFormato from "./IdeasDeFormato";
import GuardarRegla from "./GuardarRegla";
import { estampaSola } from "../lib/logoEstudio";
import "./calendario/RevisionMes.css";
import "./calendario/CarruselIA.css";
import "./EstudioLote.css";

// ============================================================
// El carrusel con IA, como en Flow, en tres pasos
//
//   1. Guion: el de la publicación, uno escrito aquí o sólo el tema. Se
//      escoge el tipo de pieza, el estilo visual, el producto y los
//      personajes de la marca que salen.
//   2. Propuesta: la IA, como director de arte, devuelve el plan lámina por
//      lámina —qué se ve, el texto EXACTO con su jerarquía, la composición—
//      y el hilo que comparten todas. Se corrige antes de gastar.
//   3. Láminas: una a una, cada una con la anterior, la portada y los
//      personajes de referencia (lib/carruselEstudio.js). «Corregir esta»
//      edita sólo esa lámina con una indicación; «Rehacer esta» la vuelve a
//      pedir. Todas quedan en la galería, en la carpeta del carrusel, que la
//      galería enseña como UNA tarjeta con las láminas en orden (y el ZIP).
//      Con «Primero la portada», se crea sólo la portada; al aprobarla, su
//      SISTEMA DE DISEÑO (lib/sistemaCarrusel.js: titular, zona del texto,
//      márgenes, colores) va en palabras en el pedido de cada lámina y en su
//      control de calidad, que dice lo que se sale de la serie.
//
// Lo usan la pestaña Estudio («Carrusel») y «Crear carrusel con IA» del
// panel de una publicación (que además lo pone en la publicación).
// ============================================================

const ROL = { portada: "Portada", contenido: "Contenido", cierre: "Cierre" };
const renumerar = (lista) => lista.map((l, i) => ({ ...l, n: i + 1, rol: i === 0 ? "portada" : i === lista.length - 1 && lista.length >= 3 ? "cierre" : "contenido" }));
const PASOS = [["guion", "Guion"], ["propuesta", "Propuesta"], ["laminas", "Láminas"]];

export default function FlujoCarrusel({ client, estudio, inicial = {}, onPoner = null, onListo = null, yaTiene = false, cabecera = null, onCreando = () => {} }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const kit = limpiarKit(estudio?.kit);
  const [paso, setPaso] = useState("guion");
  const [tema, setTema] = useState(inicial.tema ?? "");
  const [guion, setGuion] = useState(inicial.guion ?? "");
  const [preset, setPreset] = useState(inicial.preset ?? "");
  const [estilo, setEstilo] = useState("");
  // Varios a la vez: un carrusel puede hablar de varios productos (sus fotos reales van en todas las láminas).
  const [productoIds, setProductoIds] = useState(() => productosDelPost(inicial));
  const productoId = productoIds[0] ?? "";
  const [personajes, setPersonajes] = useState([]);
  const [hilo, setHilo] = useState("");
  const [laminas, setLaminas] = useState([]);
  const [modo, setModo] = useState("ia");
  const [plantilla, setPlantilla] = useState("banda");
  const [modeloId, setModeloId] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [proponiendo, setProponiendo] = useState(false);
  const [resultados, setResultados] = useState([]); // por lámina: { crudo, final } | { error } | { cargando }
  const [correcciones, setCorrecciones] = useState({}); // i → texto
  const [ejemplos, setEjemplos] = useState({}); // i → ejemplos de la galería para corregir esa lámina
  const [aviso, setAviso] = useState(null);
  // El sistema de diseño de la portada (lo siguen las demás) y si se aprueba la portada antes de crear el resto.
  const [sistema, setSistema] = useState(null);
  const [primeroPortada, setPrimeroPortada] = useState(true);
  const carpeta = useRef(null);
  const vivo = useRef(true);
  const creando = resultados.some((r) => r?.cargando);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const modelos = useMemo(() => modelosParaCarrusel(estudio?.activos ?? {}), [estudio]);
  // La lista va del más barato al más caro; si nadie escoge, el recomendado (Nano Banana).
  const modelo = modelos.find((m) => m.id === modeloId) ?? modelos.find((m) => m.id === modeloParaCarrusel(estudio?.activos ?? {}).id) ?? modelos[0] ?? null;
  const total = costoCarrusel(laminas, modelo?.costo);
  const productos = estudio?.productos ?? [];
  const delGuion = partirGuion(guion);

  /** Lo común a todas las láminas: el tipo, el estilo visual y la marca; las fotos del producto, los personajes, el logo. */
  const comun = () => ({
    clienteId, modelo, modo, plantilla, hilo, idea: tema || inicial.tema || "",
    preset: estiloDeMarca(kit, preset, { marca: client.name, rubro: client.industry ?? "", estilo }),
    fotos: api.fotosDeVariosProductos(productos, productoIds, 4).map((f) => f.clave),
    personajes: referenciasDePersonajes(kit, personajes, estudio?.archivos ?? []),
    // Con el logo estampado (kit), el modelo no lo recibe: se pega encima de cada lámina final.
    logo: estampaSola(kit) ? "" : kit.logo, estampar: estampaSola(kit) ? kit : null, colores: coloresPlantilla(kit), familia: kit.tipografia, fuente: kit.fuente, carpetaId: carpeta.current,
    calendarId: inicial.calendarId ?? null, postId: inicial.postId ?? null, seguir: () => vivo.current,
    // La tipografía de la marca de referencia y el control de calidad de cada lámina (corrige solo una letra mal).
    tipografia: referenciaDeTipografia(kit), controlar: controlEncendido(), activos: estudio?.activos ?? {},
  });

  const proponer = async () => {
    setProponiendo(true);
    setAviso(null);
    try {
      const r = await api.proponerCarrusel(clienteId, { guion, tema, preset, estilo, productoId: productoId || undefined, productoIds, personajes });
      setHilo(r.hilo ?? "");
      setLaminas(r.laminas);
      setPaso("propuesta");
      setAviso({ ok: true, texto: ["El director diseñó la serie: revisa el texto de cada lámina y, si quieres, su ficha de diseño.", r.aviso ?? ""].filter(Boolean).join(" ") });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setProponiendo(false);
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };
  const talCual = () => {
    setLaminas(delGuion.map((l) => ({ ...l, escena: "", composicion: "" })));
    setHilo("");
    setPaso("propuesta");
  };

  /** La carpeta del carrusel: la galería la enseña como UNA tarjeta, con las láminas finales en orden. */
  const prepararCarpeta = async () => {
    if (!carpeta.current) carpeta.current = await api.carpetaDeGrupo(clienteId, "carrusel", tema || laminas[0]?.texto || "");
  };
  const ordenFinal = resultados.map((r) => r?.final?.id).filter(Boolean).join(",");
  useEffect(() => {
    if (!carpeta.current || creando || !ordenFinal) return;
    api.ordenarCarpeta(clienteId, carpeta.current, ordenFinal.split(",")).catch(() => { /* sin orden, la galería lo deduce */ });
  }, [ordenFinal, creando, clienteId]);

  /**
   * Crea de `desde` en adelante (o sólo la portada, si se aprueba antes). Lo lleva el SERVIDOR (un encargo): las
   * láminas en orden, con la anterior y la portada de referencia, el sistema de la portada y el control. Se puede
   * cerrar: el carrusel queda en su carpeta de la galería, y el texto de la plantilla o el logo estampado se ponen al
   * volver a abrir la aplicación (lib/encargosApi.js).
   */
  const crear = async ({ desde = 0, soloPortada = primeroPortada && laminas.length > 2 } = {}) => {
    setConfirmar(false);
    setPaso("laminas");
    setAviso(null);
    const hasta = soloPortada ? 1 : laminas.length;
    if (desde === 0) setSistema(null);
    setResultados(laminas.map((_, i) => (i < desde ? resultados[i] : i < hasta ? { cargando: true } : undefined)));
    onCreando(true);
    let lanzado;
    try {
      await prepararCarpeta();
      const c = comun();
      lanzado = await lanzarCarrusel({
        clienteId, comun: c, laminas: laminas.slice(desde, hasta), total: laminas.length,
        previas: desde > 0 ? { portada: resultados[0]?.crudo?.clave ?? "", anterior: resultados.slice(0, desde).reverse().find((x) => x?.crudo)?.crudo?.clave ?? "" } : null,
        sistema: desde > 0 ? sistema : null, conSistema: modo !== "plantilla", carpetaId: carpeta.current, controlar: c.controlar,
        logoEstampado: Boolean(c.estampar), titulo: tema || laminas[0]?.texto || "Carrusel",
      });
    } catch (e) {
      onCreando(false);
      setResultados((x) => x.map((y, i) => (i >= desde && i < hasta ? { error: e.message } : y)));
      setAviso({ ok: false, texto: e.message });
      return;
    }
    onCreando(false);
    setAviso({ ok: true, texto: "Se está creando en el servidor: puedes cerrar. El carrusel queda en la galería, en su carpeta; desde la publicación se pone con «De la galería»." });
    let ultimo = {};
    const e = await seguirEncargo({
      clienteId, id: lanzado.encargo.id, seguir: () => vivo.current,
      alCambio: (enc, archivos) => {
        ultimo = laminasDeEncargo(enc, archivos);
        setResultados((x) => laminas.map((_, i) => (ultimo[i] !== undefined ? ultimo[i] : x[i])));
        if (enc.sistema) setSistema(enc.sistema);
        void terminarEncargo({ clienteId, encargo: enc, archivos, kit });
      },
    });
    if (!vivo.current || !e) return;
    // Terminado: quien lo enseña relee (la galería del Estudio).
    onCreando(false);
    window.dispatchEvent(new Event("ia:gasto"));
    if (soloPortada) {
      setAviso(ultimo[0]?.final
        ? { ok: true, texto: "Revisa la portada: las demás láminas seguirán su sistema (tamaño del titular, dónde va el texto, márgenes y colores). Corrígela o rehazla si hace falta." }
        : { ok: false, texto: `La portada no salió: ${ultimo[0]?.error ?? "inténtalo otra vez"}.` });
      return;
    }
    const bien = laminas.filter((_, i) => i >= desde && ultimo[i]?.final).length + desde;
    setAviso({ ok: bien > 0, texto: bien === laminas.length ? "Listas. Si una tiene un error, corrígela sola: el resto no se toca." : `Salieron ${bien} de ${laminas.length}. Rehaz las que fallaron.` });
  };
  /** La portada va: el resto, con su sistema de diseño. */
  const seguirConElResto = () => crear({ desde: 1, soloPortada: false });
  const faltanTrasPortada = paso === "laminas" && resultados[0]?.final && resultados.length > 1 && resultados.slice(1).every((r) => r === undefined);

  /** Si cambia la portada (rehecha o corregida), su sistema se saca otra vez. */
  const nuevoSistema = async (r) => {
    if (modo === "plantilla" || !r?.crudo) return;
    const s = await sistemaDeLaPortada(clienteId, r.crudo, laminas[0]?.texto ?? "");
    if (vivo.current) setSistema(s);
  };

  const una = async (i, hacer) => {
    setResultados((x) => x.map((y, j) => (j === i ? { ...y, cargando: true } : y)));
    try {
      const r = await hacer();
      if (vivo.current) setResultados((x) => x.map((y, j) => (j === i ? r : y)));
      setCorrecciones((c) => ({ ...c, [i]: "" }));
    } catch (e) {
      if (vivo.current) setResultados((x) => x.map((y, j) => (j === i ? { ...y, cargando: false, error: e.message } : y)));
    }
    window.dispatchEvent(new Event("ia:gasto"));
  };
  /** Rehacer una sola: con la de antes de referencia (o, si es la portada, la siguiente) para no romper la serie. */
  const rehacer = (i) => una(i, async () => {
    const r = await crearLamina({
      ...comun(), lamina: laminas[i], total: laminas.length, sistema: i > 0 ? sistema : null,
      anterior: (i > 0 ? resultados[i - 1]?.crudo : resultados[1]?.crudo) ?? null, portada: i > 1 ? resultados[0]?.crudo ?? null : null,
    });
    if (i === 0) await nuevoSistema(r);
    return r;
  });
  /** Corregir una sola con una indicación: se edita esa lámina, nada más. */
  /** Corrige la lámina `i` con lo escrito, o con un ajuste de un toque (`instruccion`, `ejemplo`: «Igualar a la portada»). */
  const corregir = async (i, instruccion = null, ejemplo = null) => {
    await una(i, async () => {
      const r = await corregirLamina({
        ...comun(), resultado: resultados[i], instruccion: instruccion ?? correcciones[i], ejemplos: ejemplo ? [ejemplo] : ejemplos[i] ?? [], lamina: laminas[i],
      });
      if (i === 0) await nuevoSistema(r);
      return r;
    });
    setEjemplos((e) => ({ ...e, [i]: [] }));
  };

  const finales = resultados.map((r) => r?.final).filter(Boolean);
  const cambiar = (i, campo, valor) => setLaminas((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  const quitar = (i) => setLaminas((l) => renumerar(l.filter((_, j) => j !== i)));
  const anadir = () => setLaminas((l) => renumerar([...l, { n: l.length + 1, rol: "contenido", texto: "", escena: "", composicion: "" }]));
  const listas = laminas.length >= 2 && laminas.every((l) => l.texto.trim());

  return (
    <section className="card flujo-carrusel" aria-labelledby={`${ids}-t`}>
      {cabecera}
      <h3 id={`${ids}-t`} className="sr-only">Crear un carrusel</h3>
      <ol className="lote-pasos" aria-label="Pasos">
        {PASOS.map(([id, n], k) => <li key={id} aria-current={id === paso ? "step" : undefined} data-hecho={PASOS.findIndex(([x]) => x === paso) > k || undefined}>{k + 1}. {n}</li>)}
      </ol>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>

      {paso === "guion" && (
        <div className="carrusel-opciones">
          <div className="lote-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-tipo`}>Tipo de pieza</label>
              <select id={`${ids}-tipo`} className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="">Sin tipo</option>
                {Object.entries(TIPOS_PRESET).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                {kit.propios.map((p) => <option key={p.id} value={p.id}>{p.nombre} (propio)</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-est`}>Estilo visual</label>
              <select id={`${ids}-est`} className="input" value={estilo} onChange={(e) => setEstilo(e.target.value)}>
                <option value="">{preset ? "El del tipo" : "Ninguno"}</option>
                {Object.entries(ESTILOS_VISUALES).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                {kit.estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre} (propio)</option>)}
              </select>
            </div>
            {productos.length > 0 && (
              <div className="field">
                <span className="label" id={`${ids}-prod`}>Productos (sus fotos van de referencia; puedes escoger varios)</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-prod`}>
                  {productos.map((p) => (
                    <button key={p.id} type="button" className="filter-chip" aria-pressed={productoIds.includes(p.id)}
                      onClick={() => setProductoIds((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id].slice(0, 6)))}>{p.nombre}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {kit.personajes.length > 0 && (
            <div className="field">
              <span className="label" id={`${ids}-pers`}>Personajes que salen</span>
              <div className="est-tipos" role="group" aria-labelledby={`${ids}-pers`}>
                {kit.personajes.map((p) => (
                  <button key={p.id} type="button" className="filter-chip" aria-pressed={personajes.includes(p.id)} title={p.descripcion}
                    onClick={() => setPersonajes((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}>{p.nombre}</button>
                ))}
              </div>
            </div>
          )}
          <IdeasDeFormato clienteId={clienteId} formato="carrusel" preset={preset} productoId={productoId} tema={tema}
            onUsar={(i) => { setTema(i.tema || i.titulo); setGuion(i.guion ?? ""); }} />
          <div className="field">
            <label className="label" htmlFor={`${ids}-tema`}>Tema o idea central</label>
            <input id={`${ids}-tema`} className="input" maxLength={300} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="¿Por qué nos llamamos Baby Caleb?" />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-guion`}>Guion por láminas (opcional)</label>
            <textarea id={`${ids}-guion`} className="input" rows={6} maxLength={6000} value={guion} onChange={(e) => setGuion(e.target.value)}
              placeholder={"Portada: ¿Por qué nos llamamos Baby Caleb?\nSlide 1: Caleb fue uno de los doce espías…\nCTA: Escríbenos por WhatsApp"} />
            <p className="hint">{delGuion.length >= 2 ? `${delGuion.length} láminas en el guion.` : "Sin guion, la IA escribe de 5 a 7 láminas desde el tema."}</p>
          </div>
        </div>
      )}

      {paso === "propuesta" && (
        <div className="carrusel-opciones">
          <div className="field">
            <label className="label" htmlFor={`${ids}-hilo`}>Lo que comparten todas las láminas</label>
            <input id={`${ids}-hilo`} className="input" maxLength={400} value={hilo} onChange={(e) => setHilo(e.target.value)} placeholder="Fondo crema liso, luz natural suave, el mismo bebé pelirrojo con su traje verde" />
          </div>
          {laminas.length > 2 && (
            <label className="cerebro-casilla">
              <input type="checkbox" checked={primeroPortada} onChange={(e) => setPrimeroPortada(e.target.checked)} />
              <span>Primero la portada: la apruebo y las demás siguen su sistema de diseño (titular, zona del texto, márgenes, colores)</span>
            </label>
          )}
          <div className="produccion-filtro" role="group" aria-label="Quién escribe el texto">
            <span className="hint">Texto</span>
            {Object.entries(MODOS_TEXTO).map(([k, v]) => (
              <button key={k} type="button" className="filter-chip" aria-pressed={modo === k} onClick={() => setModo(k)}>{v.nombre}</button>
            ))}
          </div>
          {modo === "plantilla" && (
            <div className="produccion-filtro" role="group" aria-label="Dónde va el texto">
              <span className="hint">Plantilla</span>
              {Object.entries(PLANTILLAS_TEXTO).map(([k, v]) => (
                <button key={k} type="button" className="filter-chip" aria-pressed={plantilla === k} onClick={() => setPlantilla(k)}>{v.nombre}</button>
              ))}
            </div>
          )}
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor={`${ids}-modelo`}>Modelo</label>
            <select id={`${ids}-modelo`} className="input" value={modelo?.id ?? ""} onChange={(e) => setModeloId(e.target.value)}>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${textoCosto(costoDePieza(m))} por lámina`}</option>)}
            </select>
          </div>
        </div>
      )}

      {paso !== "guion" && (
        <ol className="carrusel-laminas">
          {laminas.map((l, i) => {
            const r = resultados[i];
            return (
              <li key={i} className="revision-item carrusel-lamina">
                <div className="carrusel-lamina-vista">
                  {r?.final && !r?.cargando ? <img src={r.final.src} alt={`Lámina ${l.n}`} loading="lazy" />
                    : <span className="hint">{r?.cargando ? "Creando…" : r?.error ? "Falló" : l.n}</span>}
                </div>
                <div className="carrusel-lamina-texto">
                  <strong>{l.n}. {ROL[l.rol]}</strong>
                  {paso === "propuesta" ? (
                    <>
                      {/* Con la propuesta del director, su ficha de diseño; con el guion tal cual, qué se ve y la composición. */}
                      {l.ficha === undefined ? (
                        <>
                          <label className="sr-only" htmlFor={`${ids}-esc-${i}`}>Qué se ve en la lámina {l.n}</label>
                          <textarea id={`${ids}-esc-${i}`} className="textarea" rows={2} maxLength={300} value={l.escena ?? ""} placeholder="Qué se ve (vacío: lo decide el modelo)" onChange={(e) => cambiar(i, "escena", e.target.value)} />
                        </>
                      ) : null}
                      <label className="sr-only" htmlFor={`${ids}-tx-${i}`}>Texto de la lámina {l.n}</label>
                      <textarea id={`${ids}-tx-${i}`} className="textarea" rows={2} maxLength={400} value={l.texto} placeholder="Titular (primera línea) y apoyo" onChange={(e) => cambiar(i, "texto", e.target.value)} />
                      {l.ficha === undefined ? (
                        <>
                          <label className="sr-only" htmlFor={`${ids}-co-${i}`}>Composición de la lámina {l.n}</label>
                          <input id={`${ids}-co-${i}`} className="input" maxLength={200} value={l.composicion ?? ""} placeholder="Composición: dónde va el sujeto y dónde el texto" onChange={(e) => cambiar(i, "composicion", e.target.value)} />
                        </>
                      ) : (
                        <details>
                          <summary className="hint">Ficha de diseño del director</summary>
                          <label className="sr-only" htmlFor={`${ids}-fi-${i}`}>Ficha de diseño de la lámina {l.n}</label>
                          <textarea id={`${ids}-fi-${i}`} className="textarea" rows={6} maxLength={1800} value={l.ficha} onChange={(e) => cambiar(i, "ficha", e.target.value)} />
                        </details>
                      )}
                      {laminas.length > 2 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(i)}><Icon name="trash" size={14} /> Quitar</button>}
                    </>
                  ) : (
                    <>
                      <p className="hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{l.texto}</p>
                      {r?.error && <p className="revision-problema">{r.error}</p>}
                      {!creando && r && (
                        <div className="carrusel-lamina-acciones">
                          {r.final && (
                            <>
                              <form className="carrusel-corregir" onSubmit={(e) => { e.preventDefault(); if (correcciones[i]?.trim()) corregir(i); }}>
                                <label className="sr-only" htmlFor={`${ids}-cor-${i}`}>Qué corregir en la lámina {l.n}</label>
                                <input id={`${ids}-cor-${i}`} className="input" maxLength={300} value={correcciones[i] ?? ""} placeholder="Cambia «en ca» por «en»…" onChange={(e) => setCorrecciones((c) => ({ ...c, [i]: e.target.value }))} />
                                <button type="submit" className="btn btn-secondary btn-sm" disabled={!correcciones[i]?.trim()}><Icon name="wand" size={14} /> Corregir esta</button>
                              </form>
                              <ReferenciasGaleria compacto archivos={estudio?.archivos ?? []} elegidas={ejemplos[i] ?? []} onCambiar={(lista) => setEjemplos((e) => ({ ...e, [i]: lista }))}
                                max={Math.max(1, (modelo?.referencias ?? 2) - 1)} etiqueta="Ejemplo de la galería" />
                              <GuardarRegla clienteId={clienteId} texto={correcciones[i]} />
                              {/* El texto, de un toque; y la lámina que se sale de la serie, igual que la portada. */}
                              {modo === "ia" && (
                                <div className="est-editar-atajos" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)" }} role="group" aria-label={`Ajustar el texto de la lámina ${l.n}`}>
                                  {i > 0 && resultados[0]?.crudo && (
                                    <button type="button" className="filter-chip" onClick={() => corregir(i, IGUALAR_TEXTO, ejemploParaIgualar(resultados[0].crudo))}>Igualar el texto a la portada</button>
                                  )}
                                  {AJUSTES_DE_TEXTO.map((x) => <button key={x.id} type="button" className="filter-chip" onClick={() => corregir(i, x.instruccion)}>{x.etiqueta}</button>)}
                                </div>
                              )}
                            </>
                          )}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => rehacer(i)}>
                            <Icon name="refresh" size={14} /> {r.error && !r.final ? "Intentar otra vez" : "Rehacer esta"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {paso === "laminas" && sistema && (
        <p className="hint carrusel-sistema"><strong>Sistema de la serie</strong> (sacado de la portada; las demás láminas lo siguen y el control avisa si se salen): {resumenSistema(sistema)}</p>
      )}
      {paso === "propuesta" && laminas.length < MAX_LAMINAS && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={anadir}><Icon name="plus" size={14} /> Añadir lámina</button>
      )}

      <div className="lote-pie">
        {paso === "guion" && (
          <>
            {delGuion.length >= 2 && <button type="button" className="btn btn-ghost" disabled={proponiendo} onClick={talCual}>Usar el guion tal cual</button>}
            <button type="button" className="btn btn-primary" disabled={proponiendo || (delGuion.length < 2 && !tema.trim())} onClick={proponer}>
              <Icon name="sparkles" size={18} /> {proponiendo ? "Preparando la propuesta…" : "Proponer las láminas"}
            </button>
          </>
        )}
        {paso === "propuesta" && (
          confirmar ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmar(false)}>No</button>
              <button type="button" className="btn btn-primary" onClick={() => crear()}>{primeroPortada && laminas.length > 2 ? `Sí, empezar por la portada (${textoCosto(total)} en total)` : `Sí, crear ${laminas.length} láminas por ${textoCosto(total)}`}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPaso("guion")}>Volver</button>
              <p className="lote-costo">{laminas.length} láminas · <strong>{textoCosto(total)}</strong> (aprox.){modelo?.motor === "prueba" ? " · prueba: tarjetas, no imágenes" : ""}</p>
              <button type="button" className="btn btn-primary" disabled={!modelo || !listas} onClick={() => (total >= CONFIRMAR_DESDE ? setConfirmar(true) : crear())}>
                <Icon name="image" size={18} /> {primeroPortada && laminas.length > 2 ? "Crear la portada" : `Crear ${laminas.length} láminas`}
              </button>
            </>
          )
        )}
        {paso === "laminas" && (
          <>
            <p className="lote-costo">{creando ? `Creando… lámina a lámina, no cierres` : `${finales.length} de ${laminas.length} listas · en la galería, en su carpeta`}</p>
            {faltanTrasPortada && !creando && (
              <button type="button" className="btn btn-primary" onClick={seguirConElResto}>
                <Icon name="check" size={18} /> La portada va: crear las {laminas.length - 1} que faltan
              </button>
            )}
            {!creando && <button type="button" className="btn btn-ghost" onClick={() => { setResultados([]); setPaso("propuesta"); }}>Volver a la propuesta</button>}
            {onPoner && !creando && finales.length > 0 && (
              <>
                {yaTiene && <button type="button" className="btn btn-secondary" onClick={() => onPoner(finales, { reemplazar: false })}>Añadir al final</button>}
                <button type="button" className="btn btn-primary" onClick={() => onPoner(finales, { reemplazar: true })}>
                  {yaTiene ? "Reemplazar lo que hay" : `Poner las ${finales.length} en la publicación`}
                </button>
              </>
            )}
            {onListo && !creando && finales.length > 0 && (
              <button type="button" className={`btn ${onPoner ? "btn-secondary" : "btn-primary"}`} onClick={onListo}>
                <Icon name="check" size={18} /> Listo
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
