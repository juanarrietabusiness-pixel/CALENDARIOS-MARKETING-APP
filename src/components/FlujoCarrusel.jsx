import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { textoCosto, costoDePieza, CONFIRMAR_DESDE } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, estiloDeMarca, limpiarKit, referenciasDePersonajes } from "../lib/kitMarca";
import { partirGuion, MODOS_TEXTO, PLANTILLAS_TEXTO, MAX_LAMINAS, coloresPlantilla, costoCarrusel } from "../lib/carrusel";
import { crearCarrusel, crearLamina, corregirLamina, modelosParaCarrusel, modeloParaCarrusel } from "../lib/carruselEstudio";
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
  const [productoId, setProductoId] = useState(inicial.productoId ?? "");
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
    fotos: api.fotosDelProducto(productos, productoId).map((f) => f.clave),
    personajes: referenciasDePersonajes(kit, personajes, estudio?.archivos ?? []),
    // Con el logo estampado (kit), el modelo no lo recibe: se pega encima de cada lámina final.
    logo: estampaSola(kit) ? "" : kit.logo, estampar: estampaSola(kit) ? kit : null, colores: coloresPlantilla(kit), familia: kit.tipografia, carpetaId: carpeta.current,
    calendarId: inicial.calendarId ?? null, postId: inicial.postId ?? null, seguir: () => vivo.current,
  });

  const proponer = async () => {
    setProponiendo(true);
    setAviso(null);
    try {
      const r = await api.proponerCarrusel(clienteId, { guion, tema, preset, estilo, productoId: productoId || undefined, personajes });
      setHilo(r.hilo ?? "");
      setLaminas(r.laminas);
      setPaso("propuesta");
      setAviso({ ok: true, texto: ["Revisa la propuesta: qué se ve, el texto exacto y la composición de cada lámina.", r.aviso ?? ""].filter(Boolean).join(" ") });
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

  const crear = async () => {
    setConfirmar(false);
    setPaso("laminas");
    setAviso(null);
    onCreando(true);
    setResultados(laminas.map(() => ({ cargando: true })));
    await prepararCarpeta();
    const salida = await crearCarrusel({
      ...comun(), laminas,
      alAvanzar: (i, r) => { if (vivo.current) setResultados((x) => x.map((y, j) => (j === i ? r : y))); },
    });
    onCreando(false);
    if (!vivo.current) return;
    setResultados(laminas.map((_, i) => salida[i] ?? { error: "No se pidió." }));
    window.dispatchEvent(new Event("ia:gasto"));
    const bien = salida.filter((r) => r?.final).length;
    setAviso({ ok: bien > 0, texto: bien === laminas.length ? "Listas. Si una tiene un error, corrígela sola: el resto no se toca." : `Salieron ${bien} de ${laminas.length}. Rehaz las que fallaron.` });
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
  const rehacer = (i) => una(i, () => crearLamina({
    ...comun(), lamina: laminas[i], total: laminas.length,
    anterior: (i > 0 ? resultados[i - 1]?.crudo : resultados[1]?.crudo) ?? null, portada: i > 1 ? resultados[0]?.crudo ?? null : null,
  }));
  /** Corregir una sola con una indicación: se edita esa lámina, nada más. */
  const corregir = async (i) => {
    await una(i, () => corregirLamina({
      ...comun(), resultado: resultados[i], instruccion: correcciones[i], ejemplos: ejemplos[i] ?? [], lamina: laminas[i],
    }));
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
                <label className="label" htmlFor={`${ids}-prod`}>Producto (sus fotos van de referencia)</label>
                <select id={`${ids}-prod`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                  <option value="">Ninguno</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
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
            <input id={`${ids}-hilo`} className="input" maxLength={300} value={hilo} onChange={(e) => setHilo(e.target.value)} placeholder="Fondo crema liso, luz natural suave, el mismo bebé pelirrojo con su traje verde" />
          </div>
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
                      <label className="sr-only" htmlFor={`${ids}-esc-${i}`}>Qué se ve en la lámina {l.n}</label>
                      <textarea id={`${ids}-esc-${i}`} className="textarea" rows={2} maxLength={300} value={l.escena ?? ""} placeholder="Qué se ve (vacío: lo decide el modelo)" onChange={(e) => cambiar(i, "escena", e.target.value)} />
                      <label className="sr-only" htmlFor={`${ids}-tx-${i}`}>Texto de la lámina {l.n}</label>
                      <textarea id={`${ids}-tx-${i}`} className="textarea" rows={2} maxLength={400} value={l.texto} placeholder="Titular (primera línea) y apoyo" onChange={(e) => cambiar(i, "texto", e.target.value)} />
                      <label className="sr-only" htmlFor={`${ids}-co-${i}`}>Composición de la lámina {l.n}</label>
                      <input id={`${ids}-co-${i}`} className="input" maxLength={200} value={l.composicion ?? ""} placeholder="Composición: dónde va el sujeto y dónde el texto" onChange={(e) => cambiar(i, "composicion", e.target.value)} />
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
              <button type="button" className="btn btn-primary" onClick={crear}>Sí, crear {laminas.length} láminas por {textoCosto(total)}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPaso("guion")}>Volver</button>
              <p className="lote-costo">{laminas.length} láminas · <strong>{textoCosto(total)}</strong> (aprox.){modelo?.motor === "prueba" ? " · prueba: tarjetas, no imágenes" : ""}</p>
              <button type="button" className="btn btn-primary" disabled={!modelo || !listas} onClick={() => (total >= CONFIRMAR_DESDE ? setConfirmar(true) : crear())}>
                <Icon name="image" size={18} /> Crear {laminas.length} láminas
              </button>
            </>
          )
        )}
        {paso === "laminas" && (
          <>
            <p className="lote-costo">{creando ? `Creando… lámina a lámina, no cierres` : `${finales.length} de ${laminas.length} listas · en la galería, en su carpeta`}</p>
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
