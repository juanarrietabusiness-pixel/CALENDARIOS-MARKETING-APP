import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { useDialogA11y } from "../hooks/useDialogA11y";
import * as api from "../lib/estudio";
import { leerMercado } from "../lib/mercado";
import { productosActivos } from "../lib/estudioMercado";
import { NIVELES_CONSCIENCIA, nombreDeNivel } from "../lib/consciencia";
import { MODELOS, modeloPorId, estimar, textoCosto } from "../lib/estudioCatalogo";
import { TIPOS_PRESET, limpiarKit, kitVacio } from "../lib/kitMarca";
import { MODOS_TEXTO } from "../lib/carrusel";
import {
  FORMATOS_LOTE, MAX_POR_NIVEL, MAX_LOTE, MAX_TITULAR, MAX_APOYO, MAX_ESCENA, cuantasPorDefecto, limpiarCuantas, totalDeCuantas,
  nombreCarpetaLote, publicacionDeAnuncio, COMPOSICIONES, PUERTAS, titularesUsados,
} from "../lib/loteAnuncios";
import { pedidoDeLote, crearLote } from "../lib/loteEstudio";
import { DIAS_LOTE, MAX_DESCRIPCION, diasDelLote, diasConTipo, publicacionDelMes, carpetaDelMes, fechaCortaLote, mesDe, textoMes } from "../lib/loteMes";
import { presetDePilar, nombreDePilar } from "../lib/pilares";
import { fechasDelMes } from "../lib/fechasEspeciales";
import { fechaEnZona } from "../lib/agenda";
import { MONTHS } from "../constants";
import { uid } from "../utils";
import "./EstudioLote.css";

// ============================================================
// «Lote de anuncios»: varias piezas por nivel de consciencia
//
// Tres pasos, y nada se cobra en el motor hasta el último:
//   1. Qué: producto, cuántas por nivel, formato, tipo de pieza, modelo y
//      cómo va el texto (plantilla con el texto exacto, o lo escribe la IA).
//   2. Ideas: la IA las escribe con el estudio de mercado y el cerebro; se
//      revisan, se corrigen, se quitan, y se ve el costo total.
//   3. Crear: en cola, con el kit, el logo y las fotos del producto, en una
//      carpeta del lote. Cada pieza va al calendario con un botón.
//
// Cada idea trae del servidor su composición, su fondo, su puerta y su
// producto (planDeLote): que no salgan todas iguales. La composición se
// puede cambiar aquí antes de crear.
// ============================================================

const PASOS = ["Qué", "Ideas", "Crear"];
const diaCorto = (fecha) => new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });

const nombrePuerta = (id) => PUERTAS.find(([x]) => x === id)?.[1] ?? "";

/** Este mes y los dos siguientes, para el lote del mes («2026-10»). */
const mesesParaLote = (hoy) => {
  const y = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7)) - 1;
  return [0, 1, 2].map((k) => textoMes(y + Math.floor((m + k) / 12), (m + k) % 12));
};

export default function EstudioLote({ client, motores, productosConFotos = [], archivos = [], kit, onCerrar, onHecho, onLlevar = null }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const activos = useMemo(() => Object.fromEntries(Object.entries(motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)])), [motores]);
  const modelos = useMemo(() => MODELOS.filter((m) => m.tipo === "imagen" && !m.necesitaImagen && (m.motor === "prueba" || activos[m.motor])), [activos]);

  const [paso, setPaso] = useState(0);
  // Anuncios por nivel de consciencia, o el MES completo con el ritmo del cliente.
  const [alcance, setAlcance] = useState("niveles");
  const hoy = fechaEnZona();
  const [mes, setMes] = useState(() => {
    // Pasado el día 20, lo normal es preparar el mes que viene.
    const [este, siguiente] = mesesParaLote(hoy);
    return Number(hoy.slice(8, 10)) > 20 ? siguiente : este;
  });
  const [diasSel, setDiasSel] = useState(null); // null: los del ritmo
  const [catalogo, setCatalogo] = useState(null);
  const [productoId, setProductoId] = useState("");
  const [cuantas, setCuantas] = useState(cuantasPorDefecto);
  const [formato, setFormato] = useState("post");
  const [preset, setPreset] = useState("anuncio");
  // El modelo: el que se fijó en el Estudio («Usar siempre este»); si no, el predeterminado.
  const [modeloId, setModeloId] = useState(() => api.modeloPreferido(activos, "imagen", kit?.modelos?.imagen).id);
  const [productosIdeas, setProductosIdeas] = useState([]);
  const [modo, setModo] = useState("plantilla");
  const [ideas, setIdeas] = useState([]);
  const [escribiendo, setEscribiendo] = useState(false);
  const [resultados, setResultados] = useState({}); // id → { cargando } | { crudo, final } | { error }
  const [llevadas, setLlevadas] = useState({}); // id → fecha
  const [fechas, setFechas] = useState({}); // id → fecha escogida
  const [aviso, setAviso] = useState(null);
  const vivo = useRef(true);
  const creando = Object.values(resultados).some((r) => r.cargando);
  const ref = useDialogA11y(() => { if (!creando) onCerrar(); });

  useEffect(() => () => { vivo.current = false; }, []);
  useEffect(() => {
    leerMercado(clienteId).then((m) => setCatalogo(productosActivos(m.catalogo ?? []))).catch(() => setCatalogo([]));
  }, [clienteId]);

  const modelo = modeloPorId(modeloId) ?? modelos[0];
  const producto = catalogo?.find((p) => p.id === productoId) ?? null;
  const fotos = api.fotosDelProducto(productosConFotos, productoId);
  const total = totalDeCuantas(cuantas);
  const elegidas = ideas.filter((i) => i.elegida);
  // Cada pieza con las fotos de SU producto (con «la marca en general» rotan por el catálogo).
  const fotosDe = (idea) => api.fotosDelProducto(productosConFotos, idea.productoId || productoId);
  // En el lote del mes, cada pieza con el tipo de pieza de SU día (lunes Anuncio, martes Beneficios…).
  const presetDe = (idea) => (idea.pilar ? presetDePilar(idea.pilar, idea.pilarSub) : preset);
  const pedidoDe = (idea) => pedidoDeLote({ idea, kit, preset: presetDe(idea), modo, formato, modelo, fotos: fotosDe(idea), archivos, marca: client.name, rubro: client.industry ?? "" });
  const esMes = alcance === "mes";
  const mesElegido = mesDe(mes);
  const diasRitmo = mesElegido ? diasConTipo(client.ritmoContenido, mesElegido.year, mesElegido.month) : [];
  const dias = diasSel ?? diasRitmo;
  const diasDelMes = esMes && mesElegido ? diasDelLote({
    ...mesElegido, ritmo: client.ritmoContenido, fechas: fechasDelMes(mesElegido.year, mesElegido.month, client.fechasEspeciales),
    dias, desde: mes === hoy.slice(0, 7) ? hoy : "",
  }) : [];
  const cuantasDelMes = diasDelMes.length;
  const tiposDelMes = Object.entries(diasDelMes.reduce((m, d) => ({ ...m, [d.pilar]: (m[d.pilar] ?? 0) + 1 }), {}));
  const alternarDia = (d) => setDiasSel((l) => { const actual = l ?? diasRitmo; return actual.includes(d) ? actual.filter((x) => x !== d) : [...actual, d]; });
  const hayFotos = productoId ? fotos.length > 0 : productosConFotos.length > 0;
  const sinReferencias = hayFotos && !(modelo?.referencias > 0);
  const productoDe = (idea) => (catalogo ?? []).find((p) => p.id === (idea.productoId || productoId)) ?? productosIdeas.find((p) => p.id === idea.productoId) ?? null;
  const costoUna = modelo ? estimar(modelo, 1, pedidoDe({ id: "x", titular: "x", escena: "x" }).ajustes) : 0;
  const costoTotal = Math.round(costoUna * elegidas.length * 1000) / 1000;
  const kitListo = !kitVacio(kit);

  const escribirIdeas = async () => {
    setEscribiendo(true);
    setAviso(null);
    try {
      // Otro punto de partida en cada lote, y lo que ya salió para no repetirlo.
      const comun = { formato, semilla: Math.floor(Math.random() * 1000), usados: titularesUsados(archivos) };
      const r = esMes
        ? await api.ideasDelMes(clienteId, { ...comun, mes, dias })
        : await api.ideasDeLote(clienteId, { ...comun, productoId: productoId || undefined, cuantas: limpiarCuantas(cuantas) });
      setIdeas(r.ideas);
      setProductosIdeas(r.productos ?? []);
      setResultados({});
      setPaso(1);
      const faltan = (esMes ? cuantasDelMes : total) - r.ideas.length;
      setAviso({ ok: true, texto: [
        `La IA escribió ${r.ideas.length} ${r.ideas.length === 1 ? "idea" : "ideas"}${faltan > 0 ? ` (pediste ${esMes ? cuantasDelMes : total})` : ""}. Revisa, corrige y quita las que no.`,
        r.conEstudio ? "" : "Sin estudio de mercado aprobado: las escribió con el catálogo y el cerebro.",
        r.aviso ?? "",
      ].filter(Boolean).join(" ") });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setEscribiendo(false);
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  const cambiarIdea = (id, campo, valor) => setIdeas((l) => l.map((x) => (x.id === id ? { ...x, [campo]: valor } : x)));

  const crear = async () => {
    if (!elegidas.length || !modelo) return;
    setPaso(2);
    setAviso(null);
    let carpetaId = null;
    try {
      const nombre = esMes && mesElegido ? carpetaDelMes(mesElegido.year, mesElegido.month) : nombreCarpetaLote(producto?.nombre ?? "");
      const r = await api.crearCarpeta(clienteId, nombre).catch(async (e) => {
        // Ya existe (otro lote del mismo mes o del mismo día): se reusa.
        const g = await api.leerEstudio(clienteId);
        const hay = (g?.carpetas ?? []).find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
        if (hay) return { carpeta: hay };
        throw e;
      });
      carpetaId = r?.carpeta?.id ?? null;
    } catch { /* sin carpeta, van a la galería igual */ }
    await crearLote({
      ideas: elegidas, clienteId, modo, formato, kit, carpetaId, pedidoDe,
      seguir: () => vivo.current,
      alAvanzar: (id, r) => { if (vivo.current) setResultados((m) => ({ ...m, [id]: r })); },
    });
    if (!vivo.current) return;
    onHecho?.();
    setAviso({ ok: true, texto: esMes
      ? "Listo. Están en la galería, en la carpeta del lote. «Llevar todas al calendario» las pone cada una en su día, como ideas para aprobar."
      : "Listo. Están en la galería, en la carpeta del lote. Lleva al calendario las que quieras." });
  };

  const llevar = async (idea) => {
    // En el lote del mes, cada una va a SU día; en el de niveles, al que se escoja.
    const fecha = idea.fecha ?? fechas[idea.id];
    const r = resultados[idea.id];
    if (!fecha || !r?.final || !onLlevar) return;
    try {
      const post = idea.fecha
        ? publicacionDelMes({ id: uid(), idea, archivo: r.final, formato })
        : publicacionDeAnuncio({ id: uid(), idea, archivo: r.final, formato, producto: productoDe(idea) });
      const calendarId = await onLlevar(fecha, post);
      setLlevadas((m) => ({ ...m, [idea.id]: fecha }));
      // Apuntar que la usa una publicación: así la papelera no se lleva el archivo. Si falla, la pieza ya está.
      if (calendarId) await api.apuntarUso(clienteId, r.final.id, { calendarId, postId: post.id }).catch(() => {});
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
  };

  /** Todas las que salieron y faltan por llevar, una tras otra (cada una espera a la anterior: el mismo calendario). */
  const [llevandoTodas, setLlevandoTodas] = useState(false);
  const llevarTodas = async () => {
    setLlevandoTodas(true);
    for (const i of elegidas) if (resultados[i.id]?.final && !llevadas[i.id] && i.fecha) await llevar(i);
    setLlevandoTodas(false);
  };
  const porLlevar = elegidas.filter((i) => i.fecha && resultados[i.id]?.final && !llevadas[i.id]).length;

  const porNivel = esMes
    ? [{ clave: "mes", nombre: `${MONTHS[mesElegido?.month ?? 0]} ${mesElegido?.year ?? ""}`, ayuda: "una pieza por día, con el tipo de su día", ideas }]
    : NIVELES_CONSCIENCIA.map((n) => ({ ...n, ideas: ideas.filter((i) => i.nivel === n.clave) })).filter((n) => n.ideas.length);
  const listas = Object.values(resultados).filter((r) => r.final).length;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !creando) onCerrar(); }}>
      <div ref={ref} className="dialog lote-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="lote-cabecera">
          <h3 id={`${ids}-t`}>{esMes ? "Lote del mes completo" : "Lote de anuncios por nivel de consciencia"}</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" disabled={creando} onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <ol className="lote-pasos" aria-label="Pasos">
          {PASOS.map((p, i) => <li key={p} aria-current={i === paso ? "step" : undefined} data-hecho={i < paso || undefined}>{i + 1}. {p}</li>)}
        </ol>

        <div className="lote-cuerpo">
          {paso === 0 && (
            <div className="est-tipos" role="group" aria-label="Qué lote">
              <button type="button" className="filter-chip" aria-pressed={!esMes} onClick={() => setAlcance("niveles")}>Anuncios por nivel</button>
              <button type="button" className="filter-chip" aria-pressed={esMes} onClick={() => setAlcance("mes")}><Icon name="calendar" size={14} /> Mes completo</button>
            </div>
          )}
          {paso === 0 && esMes && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-mes`}>Mes</label>
                <select id={`${ids}-mes`} className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
                  {mesesParaLote(hoy).map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
                </select>
              </div>
              <div className="field">
                <span className="label" id={`${ids}-dias`}>Qué días se publica</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-dias`}>
                  {DIAS_LOTE.map(([d, n]) => <button key={d} type="button" className="filter-chip" aria-pressed={dias.includes(d)} onClick={() => alternarDia(d)}>{n}</button>)}
                </div>
                <p className="hint">
                  {cuantasDelMes} {cuantasDelMes === 1 ? "pieza" : "piezas"}{mes === hoy.slice(0, 7) ? " (desde hoy)" : ""}. Cada día lleva el tipo de su ritmo
                  {tiposDelMes.length ? `: ${tiposDelMes.map(([t, n]) => `${nombreDePilar(t)} ${n}`).join(", ")}` : ""}.
                  {diasDelMes.some((d) => d.cambio) ? ` Ajustes de temporada: ${diasDelMes.filter((d) => d.cambio).map((d) => `${fechaCortaLote(d.fecha)} (${d.cambio})`).join("; ")}.` : ""}
                  {" "}Los productos, niveles, deseos y perfiles rotan como en «Planificar mes»; el ritmo se cambia en la ficha del cliente.
                </p>
              </div>
            </>
          )}
          {paso === 0 && !esMes && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-p`}>Producto o servicio</label>
                <select id={`${ids}-p`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)} disabled={!catalogo}>
                  <option value="">{catalogo === null ? "Cargando el catálogo…" : "La marca en general (sin producto)"}</option>
                  {(catalogo ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.precio ? ` · ${p.precio}` : ""}</option>)}
                </select>
                {productoId
                  ? <p className="hint">{fotos.length ? `Van de referencia ${fotos.length === 1 ? "su foto" : `sus ${fotos.length} fotos`} del catálogo: sale el producto real.` : "Este producto no tiene fotos en el catálogo: la IA lo imaginará. Súbelas en Cerebro → Catálogo."}</p>
                  : catalogo?.length > 0 && <p className="hint">Los productos del catálogo se reparten entre las piezas, y cada una lleva las fotos reales del suyo{productosConFotos.length ? "" : " (ninguno tiene fotos todavía: súbelas en Cerebro → Catálogo)"}.</p>}
              </div>

              <fieldset className="lote-niveles">
                <legend className="label">Cuántas por nivel</legend>
                {NIVELES_CONSCIENCIA.map((n) => (
                  <div key={n.clave} className="lote-nivel">
                    <label htmlFor={`${ids}-n-${n.clave}`}><strong>{n.nombre}</strong><span className="hint"> · {n.ayuda}</span></label>
                    <input
                      id={`${ids}-n-${n.clave}`} type="number" className="input lote-numero" min={0} max={MAX_POR_NIVEL} inputMode="numeric"
                      value={cuantas[n.clave] ?? 0} onChange={(e) => setCuantas((c) => ({ ...c, [n.clave]: Math.max(0, Math.min(MAX_POR_NIVEL, Number(e.target.value) || 0)) }))}
                    />
                  </div>
                ))}
                <p className="hint">{total} en total{totalDeCuantas({ ...cuantas }) >= MAX_LOTE ? ` (como mucho ${MAX_LOTE} por lote)` : ""}.</p>
              </fieldset>
            </>
          )}
          {paso === 0 && (
            <>
              <div className="field">
                <span className="label" id={`${ids}-f`}>Formato</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-f`}>
                  {Object.entries(FORMATOS_LOTE).map(([id, f]) => <button key={id} type="button" className="filter-chip" aria-pressed={formato === id} onClick={() => setFormato(id)}>{f.nombre}</button>)}
                </div>
              </div>
              <div className="lote-fila">
                {!esMes && (
                  <div className="field">
                    <label className="label" htmlFor={`${ids}-pr`}>Tipo de pieza</label>
                    <select id={`${ids}-pr`} className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                      {Object.entries(TIPOS_PRESET).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                      {limpiarKit(kit).propios.map((p) => <option key={p.id} value={p.id}>{p.nombre} (propio)</option>)}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label className="label" htmlFor={`${ids}-m`}>Modelo</label>
                  <select id={`${ids}-m`} className="input" value={modelo?.id ?? ""} onChange={(e) => setModeloId(e.target.value)}>
                    {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {textoCosto(m.costo)}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <span className="label" id={`${ids}-x`}>El texto de la pieza</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-x`}>
                  {["plantilla", "ia"].map((id) => <button key={id} type="button" className="filter-chip" aria-pressed={modo === id} onClick={() => setModo(id)}>{MODOS_TEXTO[id].nombre}</button>)}
                </div>
                <p className="hint">{MODOS_TEXTO[modo].ayuda}</p>
              </div>
              {sinReferencias && <p className="notice notice-warn">{modelo.nombre} no admite imágenes de referencia: las fotos del catálogo no irán y la IA imaginará el producto. Escoge un modelo que las admita (Nano Banana, por ejemplo).</p>}
              <p className="hint">Cada pieza sale con una composición, un fondo y una forma de entrar al tema distintos: lo decide la aplicación, no el azar del modelo.</p>
              {!kitListo && <p className="notice notice-warn">Este cliente no tiene kit de marca: las piezas no sabrán sus colores ni su estilo. Prepáralo arriba, en «Kit de marca».</p>}
            </>
          )}

          {paso === 1 && (
            <div className="lote-ideas">
              {porNivel.map((n) => (
                <section key={n.clave} aria-labelledby={`${ids}-g-${n.clave}`}>
                  <h4 id={`${ids}-g-${n.clave}`} className="lote-nivel-titulo">{n.nombre} <span className="hint">· {n.ayuda}</span></h4>
                  <ul className="lote-lista">
                    {n.ideas.map((i) => (
                      <li key={i.id} className="lote-idea" data-quitada={!i.elegida || undefined}>
                        <label className="lote-elegir">
                          <input type="checkbox" checked={i.elegida} onChange={(e) => cambiarIdea(i.id, "elegida", e.target.checked)} /> Crear esta
                        </label>
                        {i.fecha && (
                          <p className="lote-dia">
                            <strong>{fechaCortaLote(i.fecha)}</strong> <span className="lote-insignia">{nombreDePilar(i.pilar, i.pilarSub)}</span>
                            {i.cambio && <span className="hint"> · {i.cambio}</span>}
                          </p>
                        )}
                        {(i.composicion || i.productoId) && (
                          <div className="lote-forma">
                            {i.composicion && (
                              <label className="lote-forma-campo">
                                <span className="label">Composición</span>
                                <select className="input" value={i.composicion} onChange={(e) => {
                                  const c = COMPOSICIONES.find((x) => x.id === e.target.value);
                                  setIdeas((l) => l.map((x) => (x.id === i.id ? { ...x, composicion: c.id, plantilla: formato === "historia" && c.plantilla === "banda" ? "centro" : c.plantilla } : x)));
                                }}>
                                  {COMPOSICIONES.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                              </label>
                            )}
                            <p className="hint">
                              {i.puerta ? `Entra por ${nombrePuerta(i.puerta)}.` : ""}
                              {i.productoId && productoDe(i) ? ` Producto: ${productoDe(i).nombre}${fotosDe(i).length ? " (con sus fotos)" : " (sin fotos)"}.` : ""}
                            </p>
                          </div>
                        )}
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-ti-${i.id}`}>Titular</label>
                          <input id={`${ids}-ti-${i.id}`} className="input" maxLength={MAX_TITULAR} value={i.titular} onChange={(e) => cambiarIdea(i.id, "titular", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-ap-${i.id}`}>Apoyo</label>
                          <input id={`${ids}-ap-${i.id}`} className="input" maxLength={MAX_APOYO} value={i.apoyo} onChange={(e) => cambiarIdea(i.id, "apoyo", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-es-${i.id}`}>Qué se ve</label>
                          <textarea id={`${ids}-es-${i.id}`} className="input" rows={2} maxLength={MAX_ESCENA} value={i.escena} onChange={(e) => cambiarIdea(i.id, "escena", e.target.value)} />
                        </div>
                        {i.fecha && (
                          <div className="field">
                            <label className="label" htmlFor={`${ids}-de-${i.id}`}>Descripción</label>
                            <textarea id={`${ids}-de-${i.id}`} className="input" rows={3} maxLength={MAX_DESCRIPCION} value={i.descripcion ?? ""} onChange={(e) => cambiarIdea(i.id, "descripcion", e.target.value)} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {paso === 2 && (
            <ul className="lote-resultados">
              {elegidas.map((i) => {
                const r = resultados[i.id];
                return (
                  <li key={i.id} className="lote-resultado">
                    <div className="lote-miniatura">
                      {r?.final ? <img src={r.final.src} alt={`Anuncio: ${i.titular}`} /> : (
                        <span className="hint">{r?.error ? "No salió" : r?.cargando ? "Creando…" : "En cola"}</span>
                      )}
                    </div>
                    <div className="lote-resultado-texto">
                      <span className="lote-insignia">{i.fecha ? `${fechaCortaLote(i.fecha)} · ${nombreDePilar(i.pilar, i.pilarSub)}` : nombreDeNivel(i.nivel)}</span>
                      <strong>{i.titular}</strong>
                      {r?.error && <p role="alert" className="cerebro-error">{r.error}</p>}
                      {r?.final && onLlevar && (
                        llevadas[i.id] ? (
                          <p className="hint"><Icon name="check" size={14} /> En el calendario, el {diaCorto(llevadas[i.id])}.</p>
                        ) : i.fecha ? (
                          <div className="lote-llevar">
                            <button type="button" className="btn btn-secondary btn-sm" disabled={llevandoTodas} onClick={() => llevar(i)}>
                              <Icon name="calendar" size={14} /> Llevar al {fechaCortaLote(i.fecha)}
                            </button>
                          </div>
                        ) : (
                          <div className="lote-llevar">
                            <SelectorFecha value={fechas[i.id] ?? ""} onChange={(f) => setFechas((m) => ({ ...m, [i.id]: f }))} etiqueta="Día" vacio="Escoger día" prefijo="Día" />
                            <button type="button" className="btn btn-secondary btn-sm" disabled={!fechas[i.id]} onClick={() => llevar(i)}>
                              <Icon name="calendar" size={14} /> Llevar al calendario
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div aria-live="polite">
            {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "cerebro-aviso" : "cerebro-error"}>{aviso.texto}</p>}
          </div>
        </div>

        <div className="lote-pie">
          {paso === 0 && (
            <button type="button" className="btn btn-primary" disabled={escribiendo || !(esMes ? cuantasDelMes : total) || !modelo} onClick={escribirIdeas}>
              <Icon name="sparkles" size={18} /> {escribiendo ? "Escribiendo las ideas…" : `Escribir ${esMes ? cuantasDelMes : total} ${(esMes ? cuantasDelMes : total) === 1 ? "idea" : "ideas"} con IA`}
            </button>
          )}
          {paso === 1 && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPaso(0)}>Volver</button>
              <p className="lote-costo">{elegidas.length} de {ideas.length} · <strong>{textoCosto(costoTotal)}</strong>{modelo?.estimado ? " (aprox.)" : ""}</p>
              <button type="button" className="btn btn-primary" disabled={!elegidas.length} onClick={crear}>
                <Icon name="image" size={18} /> Crear {elegidas.length} {esMes ? (elegidas.length === 1 ? "pieza" : "piezas") : elegidas.length === 1 ? "anuncio" : "anuncios"} · {textoCosto(costoTotal)}
              </button>
            </>
          )}
          {paso === 2 && (
            <>
              <p className="lote-costo">{listas} de {elegidas.length} listas</p>
              {!creando && onLlevar && porLlevar > 0 && (
                <button type="button" className="btn btn-secondary" disabled={llevandoTodas} onClick={llevarTodas}>
                  <Icon name="calendar" size={18} /> {llevandoTodas ? "Llevando…" : `Llevar las ${porLlevar} al calendario`}
                </button>
              )}
              {creando
                ? <button type="button" className="btn btn-secondary" onClick={() => { vivo.current = false; setAviso({ ok: true, texto: "Se detiene después de las que están en marcha." }); }}>Detener</button>
                : <button type="button" className="btn btn-primary" onClick={onCerrar}>Cerrar</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
