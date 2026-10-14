import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { useDialogA11y } from "../hooks/useDialogA11y";
import * as api from "../lib/estudio";
import { leerMercado } from "../lib/mercado";
import { productosActivos, limpiarEstudio } from "../lib/estudioMercado";
import { NIVELES_CONSCIENCIA, CLAVES_NIVEL, nombreDeNivel } from "../lib/consciencia";
import { MODELOS, modeloPorId, estimar, textoCosto } from "../lib/estudioCatalogo";
import { TIPOS_PRESET, ESTILOS_VISUALES, limpiarKit, kitVacio, nombreDePreset } from "../lib/kitMarca";
import { deMisGustos } from "../lib/aprendizajeVisual";
import { MODOS_TEXTO } from "../lib/carrusel";
import {
  FORMATOS_LOTE, MAX_POR_NIVEL, MAX_LOTE, MAX_TITULAR, MAX_APOYO, MAX_ESCENA, MAX_BRIEF, MAX_DESCRIPCION, cuantasPorDefecto, limpiarCuantas,
  totalDeCuantas, nombreCarpetaLote, publicacionDePieza, COMPOSICIONES, TACTICAS, titularesUsados, aprenderComposiciones, celdasMatriz, celdasPorTipos,
} from "../lib/loteAnuncios";
import { pedidoDeLote, crearLote, pulirArchivo } from "../lib/loteEstudio";
import { DIAS_LOTE, diasDelLote, diasConTipo, carpetaDelMes, fechaCortaLote, mesDe, textoMes } from "../lib/loteMes";
import { PILARES, presetDePilar, nombreDePilar } from "../lib/pilares";
import { fechasDelMes } from "../lib/fechasEspeciales";
import { fechaEnZona } from "../lib/agenda";
import { MONTHS } from "../constants";
import { uid } from "../utils";
import "./EstudioLote.css";

// ============================================================
// «Producir en lote»: de la idea a la imagen, para todos los tipos de pieza
//
// Tres pasos, y nada se cobra en el motor hasta el último:
//   1. Qué: anuncios (la MATRIZ deseos × perfiles × niveles del estudio de
//      mercado, o por niveles), por TIPO de pieza, o el MES completo con el
//      ritmo; el formato, el modelo, cómo va el texto, cuántas imágenes por
//      idea (1–3) y si la escena se mejora sola antes de crear.
//   2. Ideas: la IA escribe título, brief, titular, apoyo, escena y
//      descripción de cada pieza; se revisan, se corrigen, se quitan, y se ve
//      el costo total.
//   3. Crear: en cola, con el kit, el logo y las fotos del producto (sólo
//      donde el producto se ve). Si hay variantes, se escoge una; cada pieza
//      va al calendario como publicación lista para revisión.
//
// La forma de cada pieza (composición, fondo, gancho, producto) la decide la
// aplicación, y aprende qué composiciones le gustan a este cliente por sus
// «Me gusta», lo que se usó y la papelera (`aprenderComposiciones`).
// ============================================================

const PASOS = ["Qué", "Ideas", "Crear"];
const diaCorto = (fecha) => new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
const nombreTactica = (id) => TACTICAS.find(([x]) => x === id)?.[1]?.split(":")[0] ?? "";
/** Este mes y los dos siguientes, para el lote del mes («2026-10»). */
const mesesParaLote = (hoy) => {
  const y = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7)) - 1;
  return [0, 1, 2].map((k) => textoMes(y + Math.floor((m + k) / 12), (m + k) % 12));
};
const MODOS = [["anuncios", "Anuncios"], ["tipos", "Por tipo de pieza"], ["mes", "Mes completo"]];

export default function EstudioLote({ client, motores, productosConFotos = [], archivos = [], papelera = [], kit, onCerrar, onHecho, onLlevar = null }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const activos = useMemo(() => Object.fromEntries(Object.entries(motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)])), [motores]);
  const modelos = useMemo(() => MODELOS.filter((m) => m.tipo === "imagen" && !m.necesitaImagen && (m.motor === "prueba" || activos[m.motor])), [activos]);
  const hoy = fechaEnZona();

  const [paso, setPaso] = useState(0);
  const [alcance, setAlcance] = useState("anuncios");
  const [mercado, setMercado] = useState(null); // { catalogo, general }
  const [productoId, setProductoId] = useState("");
  // Anuncios: la matriz del estudio (si lo hay) o por niveles.
  const [porMatriz, setPorMatriz] = useState(true);
  const [deseosSel, setDeseosSel] = useState(null);
  const [perfilesSel, setPerfilesSel] = useState(null);
  const [nivelesSel, setNivelesSel] = useState(CLAVES_NIVEL);
  const [cuantas, setCuantas] = useState(cuantasPorDefecto);
  const [tipos, setTipos] = useState(() => Object.fromEntries(PILARES.map((p) => [p.id, p.id === "anuncio" ? 0 : 2])));
  const [mes, setMes] = useState(() => {
    const [este, siguiente] = mesesParaLote(hoy);
    return Number(hoy.slice(8, 10)) > 20 ? siguiente : este;
  });
  const [diasSel, setDiasSel] = useState(null);
  const [formato, setFormato] = useState("post");
  const [preset, setPreset] = useState("anuncio");
  // El modelo fijado de este cliente (su kit); si no, el predeterminado.
  const [modeloId, setModeloId] = useState(() => api.modeloPreferido(activos, "imagen", kit?.modelos?.imagen).id);
  // El texto lo escribe el motor por defecto: el modelo DISEÑA la pieza con él (con la plantilla salía plana).
  const [modo, setModo] = useState("ia");
  // El estilo visual del lote ("" = el de cada tipo de pieza) y los «Me gusta» como referencia de estilo.
  const [estilo, setEstilo] = useState("");
  const claveGustos = `estudio-gustos:${clienteId}`;
  const [conGustos, setConGustos] = useState(() => { try { return localStorage.getItem(claveGustos) === "1"; } catch { return false; } });
  // Pulir cada pieza escogida antes de llevarla al calendario (un modelo de «pulir», si hay llave).
  const pulidores = useMemo(() => MODELOS.filter((m) => m.pulir && m.id !== "recraft-sin-fondo-kie" && activos[m.motor]), [activos]);
  const [pulirCon, setPulirCon] = useState("");
  const [variantes, setVariantes] = useState(1);
  const [mejorar, setMejorar] = useState(true);
  const [ideas, setIdeas] = useState([]);
  const [productosIdeas, setProductosIdeas] = useState([]);
  const [escribiendo, setEscribiendo] = useState(false);
  const [resultados, setResultados] = useState({}); // id → { cargando } | { opciones, elegida } | { error }
  const [llevadas, setLlevadas] = useState({}); // id → fecha
  const [fechas, setFechas] = useState({}); // id → fecha escogida
  const [llevandoTodas, setLlevandoTodas] = useState(false);
  const [aviso, setAviso] = useState(null);
  const vivo = useRef(true);
  const carpetaLote = useRef(null);
  const creando = Object.values(resultados).some((r) => r.cargando);
  const ref = useDialogA11y(() => { if (!creando) onCerrar(); });

  useEffect(() => () => { vivo.current = false; }, []);
  useEffect(() => {
    leerMercado(clienteId)
      .then((m) => setMercado({ catalogo: productosActivos(m.catalogo ?? []), general: limpiarEstudio(m.estudio)?.general ?? null }))
      .catch(() => setMercado({ catalogo: [], general: null }));
  }, [clienteId]);

  const catalogo = mercado?.catalogo ?? null;
  const deseos = (mercado?.general?.deseos ?? []).map((d) => d.deseo);
  const perfiles = (mercado?.general?.perfiles ?? []).map((p) => p.nombre);
  const hayMatriz = deseos.length > 0 && perfiles.length > 0;
  const deseosElegidos = deseosSel ?? deseos;
  const perfilesElegidos = perfilesSel ?? perfiles;
  const esMes = alcance === "mes";
  const esMatriz = alcance === "anuncios" && porMatriz && hayMatriz;

  const modelo = modeloPorId(modeloId) ?? modelos[0];
  const producto = catalogo?.find((p) => p.id === productoId) ?? null;
  const fotos = api.fotosDelProducto(productosConFotos, productoId);
  // Lo que se aprendió de este cliente: qué composiciones le gustan (y cuáles manda a la papelera).
  const aprendido = useMemo(() => aprenderComposiciones(archivos, papelera), [archivos, papelera]);

  // ---------- Cuántas piezas ----------
  const mesElegido = mesDe(mes);
  const diasRitmo = mesElegido ? diasConTipo(client.ritmoContenido, mesElegido.year, mesElegido.month) : [];
  const dias = diasSel ?? diasRitmo;
  const diasDelMes = esMes && mesElegido ? diasDelLote({
    ...mesElegido, ritmo: client.ritmoContenido, fechas: fechasDelMes(mesElegido.year, mesElegido.month, client.fechasEspeciales),
    dias, desde: mes === hoy.slice(0, 7) ? hoy : "",
  }) : [];
  const tiposDelMes = Object.entries(diasDelMes.reduce((m, d) => ({ ...m, [d.pilar]: (m[d.pilar] ?? 0) + 1 }), {}));
  const total = esMes ? diasDelMes.length
    : alcance === "tipos" ? celdasPorTipos(tipos).length
      : esMatriz ? celdasMatriz({ deseos: deseosElegidos, perfiles: perfilesElegidos, niveles: nivelesSel }).length
        : totalDeCuantas(cuantas);
  const alternar = (lista, setLista, valor) => setLista((l) => { const a = l ?? lista; return a.includes(valor) ? a.filter((x) => x !== valor) : [...a, valor]; });

  // ---------- Cada pieza ----------
  const elegidas = ideas.filter((i) => i.elegida);
  const fotosDe = (idea) => api.fotosDelProducto(productosConFotos, idea.productoId || productoId);
  // El tipo de pieza de cada idea: el suyo (por tipo, el mes); en anuncios, el escogido.
  const presetDe = (idea) => (idea.tipo && idea.tipo !== "anuncio" ? presetDePilar(idea.tipo, idea.pilarSub) : preset);
  const gustos = conGustos ? deMisGustos(archivos, { cuantas: 2 }) : [];
  // El MISMO camino que una pieza hecha a mano (lib/pieza.js): la escena mejorada llega de crearPieza.
  const pedidoDe = (idea, n = 1, escena = null) => pedidoDeLote({
    idea, escena, kit, preset: presetDe(idea), estilo, modo, formato, modelo, fotos: fotosDe(idea), archivos, gustos, marca: client.name, rubro: client.industry ?? "", n,
  });
  const nombreTipo = (idea) => nombreDePreset(presetDe(idea), kit);
  const hayFotos = productoId ? fotos.length > 0 : productosConFotos.length > 0;
  const sinReferencias = hayFotos && !(modelo?.referencias > 0);
  const productoDe = (idea) => (catalogo ?? []).find((p) => p.id === (idea.productoId || productoId)) ?? productosIdeas.find((p) => p.id === idea.productoId) ?? null;
  const costoUna = modelo ? estimar(modelo, 1, pedidoDe({ id: "x", titular: "x", escena: "x" }).ajustes) : 0;
  const costoTotal = Math.round(costoUna * variantes * elegidas.length * 1000) / 1000;
  const kitListo = !kitVacio(kit);

  const escribirIdeas = async () => {
    setEscribiendo(true);
    setAviso(null);
    try {
      // Otro punto de partida en cada lote, lo que ya salió para no repetirlo y las composiciones que funcionan.
      const comun = { formato, semilla: Math.floor(Math.random() * 1000), usados: titularesUsados(archivos), composiciones: aprendido.orden };
      const r = esMes
        ? await api.ideasDelMes(clienteId, { ...comun, mes, dias })
        : await api.ideasDeLote(clienteId, alcance === "tipos"
          ? { ...comun, modo: "tipos", tipos }
          : esMatriz
            ? { ...comun, modo: "matriz", productoId: productoId || undefined, deseos: deseosElegidos, perfiles: perfilesElegidos, niveles: nivelesSel }
            : { ...comun, modo: "niveles", productoId: productoId || undefined, cuantas: limpiarCuantas(cuantas) });
      setIdeas(r.ideas);
      setProductosIdeas(r.productos ?? []);
      setResultados({});
      setPaso(1);
      const faltan = total - r.ideas.length;
      setAviso({ ok: true, texto: [
        `La IA escribió ${r.ideas.length} ${r.ideas.length === 1 ? "pieza" : "piezas"}${faltan > 0 ? ` (pediste ${total})` : ""}. Revisa, corrige y quita las que no.`,
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
      ideas: elegidas, clienteId, modo, formato, kit, carpetaId, pedidoDe, mejorar, n: variantes, piezaDe: nombreTipo,
      seguir: () => vivo.current,
      alAvanzar: (id, r) => { if (vivo.current) setResultados((m) => ({ ...m, [id]: r.opciones ? { ...r, elegida: 0 } : r })); },
    });
    if (!vivo.current) return;
    carpetaLote.current = carpetaId;
    onHecho?.();
    setAviso({ ok: true, texto: [
      "Listo. Están en la galería, en la carpeta del lote.",
      variantes > 1 ? "Escoge una imagen de cada pieza." : "",
      esMes ? "«Llevar las N al calendario» las pone cada una en su día, listas para revisión." : "Lleva al calendario las que quieras.",
    ].filter(Boolean).join(" ") });
  };

  const elegida = (id) => {
    const r = resultados[id];
    return r?.pulido ?? r?.opciones?.[r.elegida ?? 0]?.final ?? null;
  };

  const llevar = async (idea) => {
    // En el lote del mes, cada una va a SU día; en los demás, al que se escoja.
    const fecha = idea.fecha ?? fechas[idea.id];
    let archivo = elegida(idea.id);
    if (!fecha || !archivo || !onLlevar) return;
    try {
      const pulidor = pulidores.find((m) => m.id === pulirCon);
      if (pulidor) {
        setResultados((m) => ({ ...m, [idea.id]: { ...m[idea.id], puliendo: true } }));
        archivo = await pulirArchivo({ clienteId, archivo, modelo: pulidor, carpetaId: carpetaLote.current, seguir: () => vivo.current });
        setResultados((m) => ({ ...m, [idea.id]: { ...m[idea.id], puliendo: false, pulido: archivo } }));
      }
      const post = publicacionDePieza({ id: uid(), idea, archivo, formato, producto: productoDe(idea) });
      const calendarId = await onLlevar(fecha, post);
      setLlevadas((m) => ({ ...m, [idea.id]: fecha }));
      // Apuntar que la usa una publicación: así la papelera no se lleva el archivo. Si falla, la pieza ya está.
      if (calendarId) await api.apuntarUso(clienteId, archivo.id, { calendarId, postId: post.id }).catch(() => {});
    } catch (e) {
      setResultados((m) => ({ ...m, [idea.id]: { ...m[idea.id], puliendo: false } }));
      setAviso({ ok: false, texto: e.message });
    }
  };
  /** Todas las que tienen día y faltan por llevar, una tras otra (cada una espera a la anterior: el mismo calendario). */
  const llevarTodas = async () => {
    setLlevandoTodas(true);
    for (const i of elegidas) if (elegida(i.id) && !llevadas[i.id] && (i.fecha || fechas[i.id])) await llevar(i);
    setLlevandoTodas(false);
  };
  const porLlevar = elegidas.filter((i) => elegida(i.id) && !llevadas[i.id] && (i.fecha || fechas[i.id])).length;

  // Los grupos del paso 2: por nivel, por deseo y perfil, por tipo o el mes.
  let grupos;
  if (esMes) grupos = [{ clave: "mes", titulo: `${MONTHS[mesElegido?.month ?? 0]} ${mesElegido?.year ?? ""}`, ayuda: "una pieza por día, con el tipo de su día", ideas }];
  else if (alcance === "tipos") grupos = PILARES.map((p) => ({ clave: p.id, titulo: p.nombre, ayuda: p.datos, ideas: ideas.filter((i) => i.tipo === p.id) })).filter((g) => g.ideas.length);
  else if (ideas.some((i) => i.deseo || i.perfil)) {
    grupos = [...new Set(ideas.map((i) => `${i.deseo ?? ""}|${i.perfil ?? ""}`))].map((k) => {
      const [d, p] = k.split("|");
      return { clave: k, titulo: [d && `Deseo de ${d}`, p].filter(Boolean).join(" · "), ayuda: "del inconsciente al listo para comprar", ideas: ideas.filter((i) => `${i.deseo ?? ""}|${i.perfil ?? ""}` === k) };
    });
  } else grupos = NIVELES_CONSCIENCIA.map((n) => ({ clave: n.clave, titulo: n.nombre, ayuda: n.ayuda, ideas: ideas.filter((i) => i.nivel === n.clave) })).filter((g) => g.ideas.length);
  const listas = Object.values(resultados).filter((r) => r.opciones).length;
  const etiquetaDe = (i) => (i.tipo === "anuncio" || !i.tipo ? nombreDeNivel(i.nivel) : nombreDePilar(i.tipo, i.pilarSub));

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !creando) onCerrar(); }}>
      <div ref={ref} className="dialog lote-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="lote-cabecera">
          <h3 id={`${ids}-t`}>Producir en lote</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" disabled={creando} onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <ol className="lote-pasos" aria-label="Pasos">
          {PASOS.map((p, i) => <li key={p} aria-current={i === paso ? "step" : undefined} data-hecho={i < paso || undefined}>{i + 1}. {p}</li>)}
        </ol>

        <div className="lote-cuerpo">
          {paso === 0 && (
            <>
              <div className="est-tipos" role="group" aria-label="Qué lote">
                {MODOS.map(([id, n]) => <button key={id} type="button" className="filter-chip" aria-pressed={alcance === id} onClick={() => setAlcance(id)}>{n}</button>)}
              </div>

              {alcance === "anuncios" && (
                <>
                  <div className="field">
                    <label className="label" htmlFor={`${ids}-p`}>Producto o servicio</label>
                    <select id={`${ids}-p`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)} disabled={!catalogo}>
                      <option value="">{catalogo === null ? "Cargando el catálogo…" : "La marca en general (rotan los del catálogo)"}</option>
                      {(catalogo ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.precio ? ` · ${p.precio}` : ""}</option>)}
                    </select>
                    <p className="hint">El producto se ve (con sus fotos reales) de «consciente de la solución» en adelante; a quien no sabe que tiene el problema se le habla del problema.</p>
                  </div>
                  {hayMatriz && (
                    <div className="est-tipos" role="group" aria-label="Cómo se reparten">
                      <button type="button" className="filter-chip" aria-pressed={porMatriz} onClick={() => setPorMatriz(true)}>Matriz del estudio</button>
                      <button type="button" className="filter-chip" aria-pressed={!porMatriz} onClick={() => setPorMatriz(false)}>Por niveles</button>
                    </div>
                  )}
                  {esMatriz ? (
                    <fieldset className="lote-niveles">
                      <legend className="label">La matriz: deseos × perfiles × niveles</legend>
                      <div className="est-tipos" role="group" aria-label="Deseos">
                        {deseos.map((d) => <button key={d} type="button" className="filter-chip" aria-pressed={deseosElegidos.includes(d)} onClick={() => alternar(deseos, setDeseosSel, d)}>{d}</button>)}
                      </div>
                      <div className="est-tipos" role="group" aria-label="Perfiles">
                        {perfiles.map((p) => <button key={p} type="button" className="filter-chip" aria-pressed={perfilesElegidos.includes(p)} onClick={() => alternar(perfiles, setPerfilesSel, p)}>{p}</button>)}
                      </div>
                      <div className="est-tipos" role="group" aria-label="Niveles de consciencia">
                        {NIVELES_CONSCIENCIA.map((n) => <button key={n.clave} type="button" className="filter-chip" aria-pressed={nivelesSel.includes(n.clave)} onClick={() => alternar(CLAVES_NIVEL, setNivelesSel, n.clave)} title={n.ayuda}>{n.nombre}</button>)}
                      </div>
                      <p className="hint">{deseosElegidos.length} × {perfilesElegidos.length} × {nivelesSel.length} = {total} piezas{total >= MAX_LOTE ? ` (como mucho ${MAX_LOTE})` : ""}. Salen del estudio de mercado aprobado: una por casilla, cada una con su gancho.</p>
                    </fieldset>
                  ) : (
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
                      <p className="hint">{total} en total{!hayMatriz && mercado ? ". Con el estudio de mercado aprobado (Cerebro → Estudio de mercado) se puede hacer la matriz deseos × perfiles × niveles." : "."}</p>
                    </fieldset>
                  )}
                </>
              )}

              {alcance === "tipos" && (
                <fieldset className="lote-niveles">
                  <legend className="label">Cuántas de cada tipo de pieza</legend>
                  {PILARES.map((p) => (
                    <div key={p.id} className="lote-nivel">
                      <label htmlFor={`${ids}-t-${p.id}`}><strong>{p.nombre}</strong><span className="hint"> · {p.datos}</span></label>
                      <input
                        id={`${ids}-t-${p.id}`} type="number" className="input lote-numero" min={0} max={MAX_POR_NIVEL} inputMode="numeric"
                        value={tipos[p.id] ?? 0} onChange={(e) => setTipos((t) => ({ ...t, [p.id]: Math.max(0, Math.min(MAX_POR_NIVEL, Number(e.target.value) || 0)) }))}
                      />
                    </div>
                  ))}
                  <p className="hint">{total} en total. Los productos, niveles, deseos, perfiles y las 7 maletas rotan como en «Planificar mes».</p>
                </fieldset>
              )}

              {esMes && (
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
                      {DIAS_LOTE.map(([d, n]) => <button key={d} type="button" className="filter-chip" aria-pressed={dias.includes(d)} onClick={() => alternar(diasRitmo, setDiasSel, d)}>{n}</button>)}
                    </div>
                    <p className="hint">
                      {total} {total === 1 ? "pieza" : "piezas"}{mes === hoy.slice(0, 7) ? " (desde hoy)" : ""}. Cada día lleva el tipo de su ritmo
                      {tiposDelMes.length ? `: ${tiposDelMes.map(([t, n]) => `${nombreDePilar(t)} ${n}`).join(", ")}` : ""}.
                      {diasDelMes.some((d) => d.cambio) ? ` Ajustes de temporada: ${diasDelMes.filter((d) => d.cambio).map((d) => `${fechaCortaLote(d.fecha)} (${d.cambio})`).join("; ")}.` : ""}
                      {" "}El ritmo se cambia en la ficha del cliente.
                    </p>
                  </div>
                </>
              )}

              <div className="field">
                <span className="label" id={`${ids}-f`}>Formato</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-f`}>
                  {Object.entries(FORMATOS_LOTE).map(([id, f]) => <button key={id} type="button" className="filter-chip" aria-pressed={formato === id} onClick={() => setFormato(id)}>{f.nombre}</button>)}
                </div>
              </div>
              <div className="lote-fila">
                {alcance === "anuncios" && (
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
                  {["ia", "plantilla"].map((id) => <button key={id} type="button" className="filter-chip" aria-pressed={modo === id} onClick={() => setModo(id)}>{MODOS_TEXTO[id].nombre}</button>)}
                </div>
                <p className="hint">{MODOS_TEXTO[modo].ayuda}</p>
              </div>
              <div className="field">
                <span className="label" id={`${ids}-v`}>Imágenes por idea</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-v`}>
                  {[1, 2, 3].map((n) => <button key={n} type="button" className="filter-chip" aria-pressed={variantes === n} onClick={() => setVariantes(n)}>{n}</button>)}
                </div>
                <p className="hint">{variantes > 1 ? `Salen ${variantes} de cada idea y escoges una antes de llevarla al calendario.` : "Una por idea."}</p>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-est`}>Estilo visual</label>
                <select id={`${ids}-est`} className="input" value={estilo} onChange={(e) => setEstilo(e.target.value)}>
                  <option value="">El de cada tipo de pieza</option>
                  {Object.entries(ESTILOS_VISUALES).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                  {limpiarKit(kit).estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre} (propio)</option>)}
                </select>
              </div>
              <label className="est-logo-casilla">
                <input type="checkbox" checked={mejorar} onChange={(e) => setMejorar(e.target.checked)} /> Mejorar cada idea antes de crear, como «Mejorar idea» (recomendado: escena, composición y texto en una o dos frases claras; costo de texto mínimo)
              </label>
              {archivos.some((a) => a.favorito && a.tipo === "imagen") && (
                <label className="est-logo-casilla">
                  <input type="checkbox" checked={conGustos} onChange={(e) => { setConGustos(e.target.checked); try { localStorage.setItem(claveGustos, e.target.checked ? "1" : "0"); } catch { /* sin almacenamiento */ } }} />
                  {" "}Usar mis «Me gusta» como referencia de estilo (las dos últimas)
                </label>
              )}
              {pulidores.length > 0 && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-pul`}>Pulir antes de llevar al calendario</label>
                  <select id={`${ids}-pul`} className="input" value={pulirCon} onChange={(e) => setPulirCon(e.target.value)}>
                    <option value="">No pulir</option>
                    {pulidores.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {textoCosto(m.costo)} cada una</option>)}
                  </select>
                  <p className="hint">Amplía y limpia la imagen escogida justo antes de llevarla: lo que más se nota en la nitidez final.</p>
                </div>
              )}
              {sinReferencias && <p className="notice notice-warn">{modelo.nombre} no admite imágenes de referencia: las fotos del catálogo no irán y la IA imaginará el producto. Escoge un modelo que las admita (Nano Banana, por ejemplo).</p>}
              <p className="hint">
                Cada pieza sale con una composición y un gancho distintos (lo decide la aplicación) y pasa por el mismo camino que una hecha a mano: idea mejorada, tipo, estilo visual con su acabado, kit y alta resolución.
                {aprendido.orden.length ? ` Con ${client.name} se usan más las composiciones que te gustan (${aprendido.senales} señales de tus «Me gusta», lo usado y la papelera).` : ""}
              </p>
              {!kitListo && <p className="notice notice-warn">Este cliente no tiene kit de marca: las piezas no sabrán sus colores ni su estilo. Prepáralo arriba, en «Kit de marca».</p>}
            </>
          )}

          {paso === 1 && (
            <div className="lote-ideas">
              {grupos.map((g) => (
                <section key={g.clave} aria-labelledby={`${ids}-g-${g.clave}`}>
                  <h4 id={`${ids}-g-${g.clave}`} className="lote-nivel-titulo">{g.titulo} <span className="hint">· {g.ayuda}</span></h4>
                  <ul className="lote-lista">
                    {g.ideas.map((i) => (
                      <li key={i.id} className="lote-idea" data-quitada={!i.elegida || undefined}>
                        <label className="lote-elegir">
                          <input type="checkbox" checked={i.elegida} onChange={(e) => cambiarIdea(i.id, "elegida", e.target.checked)} /> Crear esta
                        </label>
                        <p className="lote-dia">
                          {i.fecha && <strong>{fechaCortaLote(i.fecha)}</strong>}
                          <span className="lote-insignia">{etiquetaDe(i)}</span>
                          {i.cambio && <span className="hint">{i.cambio}</span>}
                        </p>
                        <div className="lote-forma">
                          <label className="lote-forma-campo">
                            <span className="label">Composición</span>
                            <select className="input" value={i.composicion} onChange={(e) => {
                              const c = COMPOSICIONES.find((x) => x.id === e.target.value);
                              setIdeas((l) => l.map((x) => (x.id === i.id ? { ...x, composicion: c.id, plantilla: formato === "historia" && c.plantilla === "banda" ? "centro" : c.plantilla } : x)));
                            }}>
                              {COMPOSICIONES.filter((c) => i.conProducto !== false || !c.objeto).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                          </label>
                          <p className="hint">
                            Gancho: {nombreTactica(i.tactica)}.
                            {i.productoId && productoDe(i) ? ` Producto: ${productoDe(i).nombre}${i.conProducto === false ? " (no se ve: se habla del problema)" : fotosDe(i).length ? " (con sus fotos)" : " (sin fotos)"}.` : ""}
                          </p>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-to-${i.id}`}>Título</label>
                          <input id={`${ids}-to-${i.id}`} className="input" maxLength={60} value={i.titulo ?? ""} onChange={(e) => cambiarIdea(i.id, "titulo", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-br-${i.id}`}>Brief (qué comunica)</label>
                          <textarea id={`${ids}-br-${i.id}`} className="input" rows={2} maxLength={MAX_BRIEF} value={i.brief ?? ""} onChange={(e) => cambiarIdea(i.id, "brief", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-ti-${i.id}`}>Titular <span className="hint">({(i.titular ?? "").length}/{MAX_TITULAR})</span></label>
                          <input id={`${ids}-ti-${i.id}`} className="input" maxLength={60} value={i.titular} onChange={(e) => cambiarIdea(i.id, "titular", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-ap-${i.id}`}>Apoyo</label>
                          <input id={`${ids}-ap-${i.id}`} className="input" maxLength={MAX_APOYO} value={i.apoyo} onChange={(e) => cambiarIdea(i.id, "apoyo", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-es-${i.id}`}>Qué se ve</label>
                          <textarea id={`${ids}-es-${i.id}`} className="input" rows={2} maxLength={MAX_ESCENA} value={i.escena} onChange={(e) => cambiarIdea(i.id, "escena", e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`${ids}-de-${i.id}`}>Descripción</label>
                          <textarea id={`${ids}-de-${i.id}`} className="input" rows={3} maxLength={MAX_DESCRIPCION} value={i.descripcion ?? ""} onChange={(e) => cambiarIdea(i.id, "descripcion", e.target.value)} />
                        </div>
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
                const final = elegida(i.id);
                return (
                  <li key={i.id} className="lote-resultado">
                    <div className="lote-miniatura">
                      {final ? <img src={final.src} alt={`Pieza: ${i.titular}`} /> : (
                        <span className="hint">{r?.error ? "No salió" : r?.cargando ? "Creando…" : "En cola"}</span>
                      )}
                      {r?.puliendo && (
                        <span className="hint lote-puliendo">Puliendo…</span>
                      )}
                    </div>
                    <div className="lote-resultado-texto">
                      <span className="lote-insignia">{[i.fecha && fechaCortaLote(i.fecha), etiquetaDe(i)].filter(Boolean).join(" · ")}</span>
                      <strong>{i.titulo || i.titular}</strong>
                      {r?.error && <p role="alert" className="cerebro-error">{r.error}</p>}
                      {r?.opciones?.length > 1 && !llevadas[i.id] && (
                        <div className="lote-opciones" role="group" aria-label={`Escoger la imagen de «${i.titulo || i.titular}»`}>
                          {r.opciones.map((o, k) => (
                            <button key={o.final.id} type="button" className="lote-opcion" aria-pressed={(r.elegida ?? 0) === k} aria-label={`Opción ${k + 1}`}
                              onClick={() => setResultados((m) => ({ ...m, [i.id]: { ...m[i.id], elegida: k } }))}>
                              <img src={o.final.src} alt="" />
                            </button>
                          ))}
                        </div>
                      )}
                      {final && onLlevar && (
                        llevadas[i.id] ? (
                          <p className="hint"><Icon name="check" size={14} /> En el calendario, el {diaCorto(llevadas[i.id])}, lista para revisión.</p>
                        ) : i.fecha ? (
                          <div className="lote-llevar">
                            <button type="button" className="btn btn-secondary btn-sm" disabled={llevandoTodas} onClick={() => llevar(i)}>
                              <Icon name="calendar" size={14} /> Llevar al {fechaCortaLote(i.fecha)}
                            </button>
                          </div>
                        ) : (
                          <div className="lote-llevar">
                            <SelectorFecha value={fechas[i.id] ?? ""} onChange={(f) => setFechas((m) => ({ ...m, [i.id]: f }))} etiqueta="Día" vacio="Escoger día" prefijo="Día" />
                            <button type="button" className="btn btn-secondary btn-sm" disabled={!fechas[i.id] || llevandoTodas} onClick={() => llevar(i)}>
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
            <button type="button" className="btn btn-primary" disabled={escribiendo || !total || !modelo} onClick={escribirIdeas}>
              <Icon name="sparkles" size={18} /> {escribiendo ? "Escribiendo las piezas…" : `Escribir ${total} ${total === 1 ? "pieza" : "piezas"} con IA`}
            </button>
          )}
          {paso === 1 && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPaso(0)}>Volver</button>
              <p className="lote-costo">{elegidas.length} de {ideas.length}{variantes > 1 ? ` × ${variantes}` : ""} · <strong>{textoCosto(costoTotal)}</strong>{modelo?.estimado ? " (aprox.)" : ""}</p>
              <button type="button" className="btn btn-primary" disabled={!elegidas.length} onClick={crear}>
                <Icon name="image" size={18} /> Crear {elegidas.length} {elegidas.length === 1 ? "pieza" : "piezas"} · {textoCosto(costoTotal)}
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
