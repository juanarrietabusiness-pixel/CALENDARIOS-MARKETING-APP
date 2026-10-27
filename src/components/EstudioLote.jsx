import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { useDialogA11y } from "../hooks/useDialogA11y";
import * as api from "../lib/estudio";
import { leerMercado } from "../lib/mercado";
import { productosActivos, limpiarEstudio } from "../lib/estudioMercado";
import { NIVELES_CONSCIENCIA, CLAVES_NIVEL, nombreDeNivel } from "../lib/consciencia";
import { MODELOS, modeloPorId, estimar, textoCosto, porPrecio, costoDePieza, etiquetaDeCosto } from "../lib/estudioCatalogo";
import { TIPOS_PRESET, ESTILOS_VISUALES, limpiarKit, kitVacio, nombreDePreset, referenciasDePersonajes } from "../lib/kitMarca";
import { deMisGustos } from "../lib/aprendizajeVisual";
import { MODOS_TEXTO } from "../lib/carrusel";
import {
  FORMATOS_LOTE, MAX_POR_NIVEL, MAX_LOTE, MAX_TITULAR, MAX_APOYO, MAX_ESCENA, MAX_BRIEF, MAX_DESCRIPCION, MAX_GUION, cuantasPorDefecto, limpiarCuantas,
  totalDeCuantas, nombreCarpetaLote, publicacionDePieza, COMPOSICIONES, TACTICAS, titularesUsados, aprenderComposiciones, celdasMatriz, celdasPorTipos,
} from "../lib/loteAnuncios";
import { pedidoDeLote, crearLote, crearCarruselDeIdea, crearReelDeIdea } from "../lib/loteEstudio";
import { controlEncendido, encenderControl } from "../lib/controlEstudio";
import { resumenControl } from "../lib/control";
import { modelosParaCarrusel, modeloParaCarrusel } from "../lib/carruselEstudio";
import { modelosParaReel, modeloRecomendadoParaReel } from "../lib/reelEstudio";
import { DIAS_LOTE, diasDelLote, diasConTipo, carpetaDelMes, fechaCortaLote, mesDe, textoMes, diasConPublicacion, casillasConPlantilla, diasConPlantilla } from "../lib/loteMes";
import { leerPlantillas } from "../lib/plantillasApi";
import { plantillaDelCliente, configDeFormatos, resumenPlantilla } from "../lib/plantillasPlan";
import { estrategiaDelCalendario } from "../lib/ideaPublicacion";
import { PILARES, presetDePilar, nombreDePilar } from "../lib/pilares";
import { fechasDelMes } from "../lib/fechasEspeciales";
import { fechaEnZona } from "../lib/agenda";
import { MONTHS } from "../constants";
import { uid } from "../utils";
import { avisoDeLoQueFalta } from "../lib/materialTipo";
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
//      descripción de cada pieza (y el guion en un carrusel o un reel), de
//      TANDA en TANDA; se revisan, se corrigen, se quitan, y se ve el costo
//      total. Aquí se puede parar: «Sólo las ideas al calendario» las lleva
//      sin diseñar, para que el cliente apruebe la idea (fase 1).
//   3. Crear: en cola, con el kit, el logo y las fotos del producto (sólo
//      donde el producto se ve). Si hay variantes, se escoge una; cada pieza
//      va al calendario como publicación lista para revisión. Un carrusel o
//      un reel sigue el MISMO camino que a mano (FlujoCarrusel, FlujoReel),
//      uno detrás de otro.
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
/** Cuántas ideas escribe la IA por llamada: con más, cada pieza recibía muy poca atención y salían planas. */
const TANDA = 6;
/** Lo que se calcula por pieza en un carrusel o un reel del lote (para el costo, aproximado). */
const LAMINAS_APROX = 6;
const PLANOS_APROX = 5;

/**
 * @param inicial  { alcance, mes }: desde «Producir el mes» del calendario abre en «Mes completo» con ESE mes.
 */
export default function EstudioLote({ client, motores, productosConFotos = [], archivos = [], papelera = [], kit, inicial = null, onCerrar, onHecho, onLlevar = null }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const activos = useMemo(() => Object.fromEntries(Object.entries(motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)])), [motores]);
  // Del más barato al más caro (la prueba al final).
  const modelos = useMemo(() => porPrecio(MODELOS.filter((m) => m.tipo === "imagen" && !m.necesitaImagen && (m.motor === "prueba" || activos[m.motor])), activos), [activos]);
  const hoy = fechaEnZona();

  const [paso, setPaso] = useState(0);
  const [alcance, setAlcance] = useState(() => (MODOS.some(([id]) => id === inicial?.alcance) ? inicial.alcance : "anuncios"));
  const [mercado, setMercado] = useState(null); // { catalogo, general }
  const [productoId, setProductoId] = useState("");
  // Anuncios: la matriz del estudio (si lo hay) o por niveles.
  const [porMatriz, setPorMatriz] = useState(true);
  const [deseosSel, setDeseosSel] = useState(null);
  const [perfilesSel, setPerfilesSel] = useState(null);
  const [nivelesSel, setNivelesSel] = useState(CLAVES_NIVEL);
  const [cuantas, setCuantas] = useState(cuantasPorDefecto);
  const [tipos, setTipos] = useState(() => Object.fromEntries(PILARES.map((p) => [p.id, p.id === "anuncio" ? 0 : 2])));
  // Los meses que se ofrecen: este y los dos siguientes, más el que pidió el calendario si es más adelante.
  const meses = useMemo(() => {
    const lista = mesesParaLote(hoy);
    return mesDe(inicial?.mes) && inicial.mes > lista[0] && !lista.includes(inicial.mes) ? [...lista, inicial.mes] : lista;
  }, [hoy, inicial?.mes]);
  const [mes, setMes] = useState(() => {
    if (meses.includes(inicial?.mes)) return inicial.mes;
    const [este, siguiente] = meses;
    return Number(hoy.slice(8, 10)) > 20 ? siguiente : este;
  });
  const [diasSel, setDiasSel] = useState(null);
  const [formato, setFormato] = useState("post");
  // La plantilla de plan del cliente: con ella, «Mes completo» sale con SUS formatos (post, carrusel, reel…) y varias
  // por día, como «Planificar mes». `formato: "plan"` la usa.
  const [plantillaPlan, setPlantillaPlan] = useState(null);
  const formatoTocado = useRef(false);
  const [preset, setPreset] = useState("anuncio");
  // El modelo fijado de este cliente (su kit); si no, el predeterminado.
  const [modeloId, setModeloId] = useState(() => api.modeloPreferido(activos, "imagen", kit?.modelos?.imagen).id);
  // El texto lo escribe el motor por defecto: el modelo DISEÑA la pieza con él (con la plantilla salía plana).
  const [modo, setModo] = useState("ia");
  // El estilo visual del lote ("" = el de cada tipo de pieza) y los «Me gusta» como referencia de estilo.
  const [estilo, setEstilo] = useState("");
  const claveGustos = `estudio-gustos:${clienteId}`;
  const [conGustos, setConGustos] = useState(() => { try { return localStorage.getItem(claveGustos) === "1"; } catch { return false; } });
  const [variantes, setVariantes] = useState(1);
  const [mejorar, setMejorar] = useState(true);
  // Lo que la agencia pide para TODA la tanda (lo lee el director de arte al diseñar cada pieza).
  const [indicacion, setIndicacion] = useState("");
  // Una plantilla del kit para toda la tanda ("" = la que escoja el director, si alguna encaja).
  const [plantillaLote, setPlantillaLote] = useState("");
  // El control de calidad de cada pieza (y corregir el texto solo): se recuerda por navegador.
  const [controlar, setControlar] = useState(controlEncendido);
  // Los personajes de la marca que salen en el lote (van de referencia: salen iguales).
  const [personajesSel, setPersonajesSel] = useState([]);
  // En un reel: el modelo del video (los fotogramas, con el de imagen).
  const [modeloVideoId, setModeloVideoId] = useState("");
  const [progreso, setProgreso] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [productosIdeas, setProductosIdeas] = useState([]);
  const [escribiendo, setEscribiendo] = useState(false);
  const [resultados, setResultados] = useState({}); // id → { cargando } | { opciones, elegida } | { error }
  const [llevadas, setLlevadas] = useState({}); // id → fecha
  const [fechas, setFechas] = useState({}); // id → fecha escogida
  const [llevandoTodas, setLlevandoTodas] = useState(false);
  const [aviso, setAviso] = useState(null);
  const vivo = useRef(true);
  const creando = Object.values(resultados).some((r) => r.cargando);

  // ---------- El BORRADOR: las ideas escritas (y pagadas) no se pierden al cerrar ----------
  const claveBorrador = `estudio-lote-borrador:${clienteId}`;
  const [borrador, setBorrador] = useState(() => {
    try {
      const b = JSON.parse(localStorage.getItem(claveBorrador) ?? "null");
      return b?.ideas?.length && Date.now() - (b.guardado ?? 0) < 7 * 86_400_000 ? b : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!ideas.length) return;
    try {
      // Todo lo escogido ya está en el calendario: no queda nada por terminar.
      const terminadas = ideas.filter((i) => i.elegida).every((i) => llevadas[i.id]);
      if (terminadas) localStorage.removeItem(claveBorrador);
      else localStorage.setItem(claveBorrador, JSON.stringify({ alcance, formato, mes, ideas, llevadas, guardado: Date.now() }));
    } catch { /* sin almacenamiento: el lote sigue, sin borrador */ }
  }, [ideas, llevadas, alcance, formato, mes, claveBorrador]);
  const seguirBorrador = () => {
    setAlcance(borrador.alcance);
    formatoTocado.current = true;
    setFormato(borrador.formato);
    if (borrador.mes) setMes(borrador.mes);
    setIdeas(borrador.ideas);
    setLlevadas(borrador.llevadas ?? {});
    setBorrador(null);
    setPaso(1);
  };
  const descartarBorrador = () => {
    try { localStorage.removeItem(claveBorrador); } catch { /* nada */ }
    setBorrador(null);
  };

  // ---------- «Otra» para UNA idea, con lo que se pide (texto: no gasta en el motor de imagen) ----------
  const [otras, setOtras] = useState({}); // id → { abierta, nota, cargando, error }
  const ponerOtra = (id, cambios) => setOtras((m) => ({ ...m, [id]: { ...m[id], ...cambios } }));
  const pedirOtra = async (i) => {
    ponerOtra(i.id, { cargando: true, error: "" });
    try {
      const casilla = {
        clave: i.id, ...(i.fecha ? { fecha: i.fecha } : {}), formato: fmtDe(i),
        ...Object.fromEntries([["pilar", i.tipo ?? i.pilar], ["pilarSub", i.pilarSub], ["productoId", i.productoId], ["nivel", i.nivel], ["deseo", i.deseo], ["perfil", i.perfil]].filter(([, v]) => v)),
        antes: i.titular || i.titulo || "", ...(otras[i.id]?.nota?.trim() ? { pide: otras[i.id].nota.trim() } : {}),
      };
      const r = await api.ideasDeLote(clienteId, {
        modo: "plan", formato: "post", casillas: [casilla], estrategia, semilla: Math.floor(Math.random() * 1000),
        usados: ideas.filter((x) => x.id !== i.id).map((x) => x.titular).filter(Boolean).slice(0, 30),
      });
      const nueva = r?.ideas?.[0];
      if (!nueva) throw new Error("La IA no devolvió otra idea. Inténtalo otra vez.");
      // Lo que pidió la agencia se queda en la idea: también lo lee el director de arte al diseñarla.
      const pide = otras[i.id]?.nota?.trim() ?? "";
      setIdeas((l) => l.map((x) => (x.id === i.id ? { ...x, ...nueva, id: x.id, elegida: x.elegida, fecha: x.fecha, ...(pide ? { pide } : {}) } : x)));
      ponerOtra(i.id, { cargando: false, abierta: false, nota: "" });
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      ponerOtra(i.id, { cargando: false, error: e.message });
    }
  };
  const ref = useDialogA11y(() => { if (!creando) onCerrar(); });

  useEffect(() => () => { vivo.current = false; }, []);
  useEffect(() => {
    leerPlantillas().then((lista) => setPlantillaPlan(plantillaDelCliente(client.planContenido, lista) ?? null)).catch(() => setPlantillaPlan(null));
  }, [client.planContenido]);
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
  const formatosPlan = useMemo(() => (plantillaPlan ? configDeFormatos(plantillaPlan) : null), [plantillaPlan]);
  const esPlan = esMes && formato === "plan" && Boolean(formatosPlan);
  // Con la plantilla, el mes arranca con ella (si nadie escogió otro formato a mano); fuera del mes, «plan» no existe.
  useEffect(() => {
    if (esMes && formatosPlan && !formatoTocado.current && formato === "post") setFormato("plan");
    if (!esMes && formato === "plan") setFormato("post");
  }, [esMes, formatosPlan, formato]);
  /** El formato de UNA idea: el suyo (el plan los mezcla) o el escogido. */
  const fmtDe = (i) => (FORMATOS_LOTE[i?.formato] ? i.formato : FORMATOS_LOTE[formato] ? formato : "post");
  const guiadoDe = (i) => Boolean(FORMATOS_LOTE[fmtDe(i)]?.guiado);
  const esMatriz = alcance === "anuncios" && porMatriz && hayMatriz;

  const guiado = !esPlan && Boolean(FORMATOS_LOTE[formato]?.guiado);
  // Un carrusel o un reel necesitan un modelo de imagen que admita referencias (la lámina o el fotograma anterior).
  const modelosDelFormato = guiado ? modelosParaCarrusel(activos) : modelos;
  const modelo = modelosDelFormato.find((m) => m.id === modeloId) ?? (guiado ? modelosDelFormato.find((m) => m.id === modeloParaCarrusel(activos).id) : null) ?? modelosDelFormato[0];
  const modelosVideo = useMemo(() => modelosParaReel(activos), [activos]);
  // En el plan, las láminas de los carruseles con el modelo escogido si admite referencias (la anterior y la portada).
  const modeloCarrusel = esPlan && !(modelo?.referencias > 0) ? modeloParaCarrusel(activos) : modelo;
  const modeloVideo = modelosVideo.find((m) => m.id === modeloVideoId) ?? modeloRecomendadoParaReel(activos) ?? modeloPorId("prueba-video");
  const producto = catalogo?.find((p) => p.id === productoId) ?? null;
  const fotos = api.fotosDelProducto(productosConFotos, productoId);
  // Lo que se aprendió de este cliente: qué composiciones le gustan (y cuáles manda a la papelera).
  const aprendido = useMemo(() => aprenderComposiciones(archivos, papelera), [archivos, papelera]);

  // ---------- Cuántas piezas ----------
  const mesElegido = mesDe(mes);
  const diasRitmo = esPlan ? diasConPlantilla(formatosPlan) : mesElegido ? diasConTipo(client.ritmoContenido, mesElegido.year, mesElegido.month) : [];
  const dias = diasSel ?? diasRitmo;
  // Los días que ya tienen publicación se saltan: no se crea una segunda encima de lo que ya hay.
  const ocupados = esMes ? diasConPublicacion(client.calendars, mes) : [];
  const diasDelMesTodos = esMes && mesElegido ? diasDelLote({
    ...mesElegido, ritmo: client.ritmoContenido, fechas: fechasDelMes(mesElegido.year, mesElegido.month, client.fechasEspeciales),
    dias, desde: mes === hoy.slice(0, 7) ? hoy : "",
  }) : [];
  const diasDelMes = diasDelMesTodos.filter((d) => !ocupados.includes(d.fecha));
  // Con la plantilla: una casilla por publicación (varias por día, cada una con su formato).
  const casillasPlan = esPlan && mesElegido ? casillasConPlantilla({
    ...mesElegido, ritmo: client.ritmoContenido, fechas: fechasDelMes(mesElegido.year, mesElegido.month, client.fechasEspeciales),
    formatos: formatosPlan, dias, desde: mes === hoy.slice(0, 7) ? hoy : "", omitir: ocupados,
  }) : [];
  const saltados = esPlan ? new Set(ocupados).size : diasDelMesTodos.length - diasDelMes.length;
  // La estrategia del mes (campaña, ofertas, código, el concepto de cada semana), del calendario de ese mes si lo tiene.
  const calDelMes = mesElegido ? (client.calendars ?? []).find((c) => c.year === mesElegido.year && c.month === mesElegido.month) : null;
  const estrategia = estrategiaDelCalendario(calDelMes);
  const tiposDelMes = Object.entries(diasDelMes.reduce((m, d) => ({ ...m, [d.pilar]: (m[d.pilar] ?? 0) + 1 }), {}));
  const total = esPlan ? casillasPlan.length : esMes ? diasDelMes.length
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
  const personajes = referenciasDePersonajes(kit, personajesSel, archivos);
  const listaPersonajes = limpiarKit(kit).personajes;
  // El MISMO camino que una pieza hecha a mano (lib/pieza.js): la escena mejorada llega de crearPieza.
  const pedidoDe = (idea, n = 1, escena = null) => pedidoDeLote({
    idea, escena, kit, preset: presetDe(idea), estilo, modo, formato: fmtDe(idea), modelo, fotos: fotosDe(idea), archivos, gustos, personajes, marca: client.name, rubro: client.industry ?? "", n, activos,
  });
  const nombreTipo = (idea) => nombreDePreset(presetDe(idea), kit);
  const hayFotos = productoId ? fotos.length > 0 : productosConFotos.length > 0;
  const sinReferencias = hayFotos && !(modelo?.referencias > 0);
  const productoDe = (idea) => (catalogo ?? []).find((p) => p.id === (idea.productoId || productoId)) ?? productosIdeas.find((p) => p.id === idea.productoId) ?? null;
  // Por pieza: una imagen (× variantes); un carrusel, sus láminas; un reel, sus fotogramas y el video de 10 s.
  const costoDeFormato = (f) => {
    if (!modelo) return 0;
    const deLaminas = modeloCarrusel ? estimar(modeloCarrusel, 1, { imageSize: "2K", aspectRatio: FORMATOS_LOTE[f]?.aspectRatio }) : 0;
    if (f === "carrusel") return deLaminas * LAMINAS_APROX;
    if (f === "reel") return deLaminas * PLANOS_APROX + (modeloVideo ? estimar(modeloVideo, 1, { duration: "10" }) : 0);
    return estimar(modelo, 1, pedidoDe({ id: "x", titular: "x", escena: "x", formato: f }).ajustes) * variantes;
  };
  // Lo que ya se llevó como idea sola no se vuelve a crear aquí: se diseña desde el calendario. Un video con rostro
  // (UGC) tampoco: lo graba una persona, así que va al calendario como idea con su guion para grabar.
  const porCrear = elegidas.filter((i) => !llevadas[i.id] && !i.rostro);
  const conRostro = elegidas.filter((i) => i.rostro && !llevadas[i.id] && (i.fecha || fechas[i.id]));
  const costoTotal = Math.round(porCrear.reduce((t, i) => t + costoDeFormato(fmtDe(i)), 0) * 1000) / 1000;
  // Un video con rostro (UGC) no se crea con IA: no cuenta como reel que pida modelo de video.
  const hayGuiadas = esPlan ? ideas.some((i) => guiadoDe(i) && !i.rostro) || casillasPlan.some((c) => FORMATOS_LOTE[c.formato]?.guiado && !c.rostro) : guiado;
  const hayReels = esPlan ? casillasPlan.some((c) => c.formato === "reel" && !c.rostro) || ideas.some((i) => fmtDe(i) === "reel" && !i.rostro) : formato === "reel";
  const kitListo = !kitVacio(kit);

  /** Las ideas, de TANDA en TANDA: cada llamada sabe lo que ya salió (`usados`) y el plan sale igual con la misma semilla. */
  const escribirIdeas = async () => {
    setEscribiendo(true);
    setAviso(null);
    try {
      // Otro punto de partida en cada lote, lo que ya salió para no repetirlo y las composiciones que funcionan.
      const comun = { formato, semilla: Math.floor(Math.random() * 1000), composiciones: aprendido.orden };
      const cuerpo = esPlan ? { ...comun, formato: "post", modo: "plan", casillas: casillasPlan, estrategia }
        : esMes ? { ...comun, mes, dias, omitir: ocupados, estrategia }
        : alcance === "tipos" ? { ...comun, modo: "tipos", tipos }
          : esMatriz ? { ...comun, modo: "matriz", productoId: productoId || undefined, deseos: deseosElegidos, perfiles: perfilesElegidos, niveles: nivelesSel }
            : { ...comun, modo: "niveles", productoId: productoId || undefined, cuantas: limpiarCuantas(cuantas) };
      let todas = [];
      let usados = titularesUsados(archivos);
      let ultima = null;
      // Lo que al cerebro le falta para algún tipo (testimonios, garantía…), junto de todas las tandas.
      const faltanMaterial = new Set();
      for (let desde = 0, cuantasHay = total; desde < cuantasHay && vivo.current; desde += TANDA) {
        setProgreso(`Escribiendo ${desde + 1}–${Math.min(desde + TANDA, cuantasHay)} de ${cuantasHay}…`);
        const pedir = esMes && !esPlan ? api.ideasDelMes : api.ideasDeLote;
        ultima = await pedir(clienteId, { ...cuerpo, usados: usados.slice(0, 30), desde, tamano: TANDA });
        cuantasHay = ultima.total ?? cuantasHay;
        for (const k of ultima.faltan ?? []) faltanMaterial.add(k);
        // El id por su número en el plan: dos tandas pueden repetir «producto-1».
        const nuevas = ultima.ideas.map((i) => ({ ...i, id: i.fecha ? i.id : `n${i.n}` }));
        todas = [...todas, ...nuevas];
        usados = [...nuevas.map((i) => i.titular), ...usados];
        setIdeas(todas);
      }
      setProductosIdeas(ultima?.productos ?? []);
      setResultados({});
      setPaso(1);
      const faltan = total - todas.length;
      setAviso({ ok: true, texto: [
        `La IA escribió ${todas.length} ${todas.length === 1 ? "pieza" : "piezas"}${faltan > 0 ? ` (pediste ${total})` : ""}, de ${TANDA} en ${TANDA}. Revisa, corrige y quita las que no.`,
        ultima?.conEstudio ? "" : "Sin estudio de mercado aprobado: las escribió con el catálogo y el cerebro.",
        avisoDeLoQueFalta([...faltanMaterial]),
        ultima?.aviso ?? "",
      ].filter(Boolean).join(" ") });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setEscribiendo(false);
      setProgreso("");
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  /** Sólo las IDEAS al calendario, sin diseñar: cada una en su día, para que el cliente apruebe la idea. */
  const [llevandoIdeas, setLlevandoIdeas] = useState(false);
  const ideasConDia = elegidas.filter((i) => (i.fecha || fechas[i.id]) && !llevadas[i.id]);
  const llevarIdeas = async () => {
    if (!onLlevar) return;
    setLlevandoIdeas(true);
    let n = 0;
    for (const idea of ideasConDia) {
      try {
        const fecha = idea.fecha ?? fechas[idea.id];
        await onLlevar(fecha, publicacionDePieza({ id: uid(), idea, formato: fmtDe(idea), producto: productoDe(idea) }));
        setLlevadas((m) => ({ ...m, [idea.id]: fecha }));
        n += 1;
      } catch (e) {
        setAviso({ ok: false, texto: e.message });
        break;
      }
    }
    setLlevandoIdeas(false);
    if (n) setAviso({ ok: true, texto: `${n} ${n === 1 ? "idea llevada" : "ideas llevadas"} al calendario, cada una en su día, para que el cliente las apruebe. «Qué se ve» queda en cada una: «Crear con IA» y «Producir el mes» la usan para diseñarla después.` });
  };

  const cambiarIdea = (id, campo, valor) => setIdeas((l) => l.map((x) => (x.id === id ? { ...x, [campo]: valor } : x)));

  const crear = async () => {
    if ((!porCrear.length && !conRostro.length) || !modelo) return;
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
    const pendientes = porCrear;
    // Los videos con rostro van ya al calendario como idea (con su guion para grabar): no cuestan nada.
    let grabar = 0;
    for (const idea of conRostro) {
      if (!vivo.current || !onLlevar) break;
      try {
        const fecha = idea.fecha ?? fechas[idea.id];
        await onLlevar(fecha, publicacionDePieza({ id: uid(), idea, formato: "reel", producto: productoDe(idea) }));
        setLlevadas((m) => ({ ...m, [idea.id]: fecha }));
        grabar += 1;
      } catch (e) {
        setAviso({ ok: false, texto: e.message });
        break;
      }
    }
    // Primero las de una imagen (de dos en dos, por formato: la proporción y la plantilla cambian), después los
    // carruseles y los reels, uno detrás de otro: cada uno es una serie de pasos (y un reel tarda minutos).
    const sueltas = pendientes.filter((i) => !guiadoDe(i));
    for (const f of [...new Set(sueltas.map(fmtDe))]) {
      if (!vivo.current) break;
      await crearLote({
        ideas: sueltas.filter((i) => fmtDe(i) === f).map((i) => (plantillaLote ? { ...i, plantilla: plantillaLote } : i)), clienteId, modo, formato: f, kit, carpetaId, pedidoDe, mejorar, n: variantes, piezaDe: nombreTipo,
        indicacion: indicacion.trim(),
        controlar, activos,
        seguir: () => vivo.current,
        alAvanzar: (id, r) => { if (vivo.current) setResultados((m) => ({ ...m, [id]: r.opciones ? { ...r, elegida: 0 } : r })); },
      });
    }
    for (const idea of pendientes.filter(guiadoDe)) {
      if (!vivo.current) break;
      const poner = (r) => { if (vivo.current) setResultados((m) => ({ ...m, [idea.id]: r })); };
      poner({ cargando: true, paso: "En cola" });
      const comun = {
        clienteId, idea, kit, preset: presetDe(idea), estilo, fotos: fotosDe(idea).map((f) => f.clave), personajes, personajesIds: personajesSel,
        marca: client.name, rubro: client.industry ?? "", carpetaId, seguir: () => vivo.current, alPaso: (paso) => poner({ cargando: true, paso }),
        controlar, activos,
      };
      try {
        const r = fmtDe(idea) === "carrusel"
          ? await crearCarruselDeIdea({ ...comun, modelo: modeloCarrusel })
          : await crearReelDeIdea({ ...comun, modeloImagen: modeloCarrusel, modeloVideo });
        poner({ opciones: [{ final: r.archivos[0], archivos: r.archivos }], elegida: 0 });
      } catch (e) {
        poner({ error: e.message });
        if (e.datos?.codigo === "presupuesto") break;
      }
    }
    if (!vivo.current) return;
    onHecho?.();
    setAviso({ ok: true, texto: [
      "Listo. Están en la galería, en la carpeta del lote.",
      grabar ? `${grabar === 1 ? "El UGC va" : `Los ${grabar} UGC van`} al calendario como idea, con su guion para grabar.` : "",
      variantes > 1 ? "Escoge una imagen de cada pieza." : "",
      esMes ? "«Llevar las N al calendario» las pone cada una en su día, listas para revisión." : "Lleva al calendario las que quieras.",
    ].filter(Boolean).join(" ") });
  };

  const elegida = (id) => {
    const r = resultados[id];
    return r?.opciones?.[r.elegida ?? 0]?.final ?? null;
  };

  const llevar = async (idea) => {
    // En el lote del mes, cada una va a SU día; en los demás, al que se escoja.
    const fecha = idea.fecha ?? fechas[idea.id];
    const archivo = elegida(idea.id);
    if (!fecha || !archivo || !onLlevar) return;
    try {
      // Un carrusel lleva todas sus láminas; un reel, su video; lo demás, la imagen escogida.
      const r = resultados[idea.id];
      const lista = guiadoDe(idea) ? (r?.opciones?.[0]?.archivos ?? [archivo]) : [archivo];
      const post = publicacionDePieza({ id: uid(), idea, archivos: lista, formato: fmtDe(idea), producto: productoDe(idea) });
      const calendarId = await onLlevar(fecha, post);
      setLlevadas((m) => ({ ...m, [idea.id]: fecha }));
      // Apuntar que la usa una publicación: así la papelera no se lleva el archivo. Si falla, la pieza ya está.
      if (calendarId) for (const a of lista) await api.apuntarUso(clienteId, a.id, { calendarId, postId: post.id }).catch(() => {});
    } catch (e) {
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
  if (esMes) grupos = [{ clave: "mes", titulo: `${MONTHS[mesElegido?.month ?? 0]} ${mesElegido?.year ?? ""}`, ayuda: esPlan ? "con la plantilla de plan del cliente: cada día sus formatos" : "una pieza por día, con el tipo de su día", ideas }];
  else if (alcance === "tipos") grupos = PILARES.map((p) => ({ clave: p.id, titulo: p.nombre, ayuda: p.datos, ideas: ideas.filter((i) => i.tipo === p.id) })).filter((g) => g.ideas.length);
  else if (ideas.some((i) => i.deseo || i.perfil)) {
    grupos = [...new Set(ideas.map((i) => `${i.deseo ?? ""}|${i.perfil ?? ""}`))].map((k) => {
      const [d, p] = k.split("|");
      return { clave: k, titulo: [d && `Deseo de ${d}`, p].filter(Boolean).join(" · "), ayuda: "del inconsciente al listo para comprar", ideas: ideas.filter((i) => `${i.deseo ?? ""}|${i.perfil ?? ""}` === k) };
    });
  } else grupos = NIVELES_CONSCIENCIA.map((n) => ({ clave: n.clave, titulo: n.nombre, ayuda: n.ayuda, ideas: ideas.filter((i) => i.nivel === n.clave) })).filter((g) => g.ideas.length);
  const listas = Object.values(resultados).filter((r) => r.opciones).length;
  // En el paso 3: lo que se está creando (lo que se llevó como idea sola no).
  const delPaso3 = elegidas.filter((i) => resultados[i.id] || !llevadas[i.id]);
  const nombreDePiezas = (n) => (esPlan ? (n === 1 ? "pieza" : "piezas") : formato === "carrusel" ? (n === 1 ? "carrusel" : "carruseles") : formato === "reel" ? (n === 1 ? "reel" : "reels") : n === 1 ? "pieza" : "piezas");
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
              {borrador && (
                <div className="notice lote-borrador" role="group" aria-label="Ideas sin terminar">
                  <span>Tienes {borrador.ideas.length} {borrador.ideas.length === 1 ? "idea" : "ideas"} sin terminar del {new Date(borrador.guardado).toLocaleDateString("es-PA", { day: "numeric", month: "short" })}.</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={seguirBorrador}>Seguir con ellas</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={descartarBorrador}>Descartarlas</button>
                </div>
              )}
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
                      {meses.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
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
                      {" "}El plan de cada día se cambia tocando la barra de los días del calendario.
                    </p>
                    {saltados > 0 && (
                      <p className="hint">
                        Se saltan {saltados} {saltados === 1 ? "día que ya tiene" : "días que ya tienen"} publicación. Para diseñar lo que ya hay, en el calendario: «Producir el mes» → «Diseñar las que ya hay».
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="field">
                <span className="label" id={`${ids}-f`}>Formato</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-f`}>
                  {esMes && formatosPlan && (
                    <button type="button" className="filter-chip" aria-pressed={formato === "plan"} onClick={() => { formatoTocado.current = true; setFormato("plan"); }}>Según su plan</button>
                  )}
                  {Object.entries(FORMATOS_LOTE).map(([id, f]) => <button key={id} type="button" className="filter-chip" aria-pressed={formato === id} onClick={() => { formatoTocado.current = true; setFormato(id); }}>{f.nombre}</button>)}
                </div>
                {esPlan && <p className="hint">La plantilla de plan de {client.name}: {resumenPlantilla(plantillaPlan)}. Cada día sale con sus formatos; los directos no se diseñan.</p>}
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
                  <label className="label" htmlFor={`${ids}-m`}>{esPlan ? "Modelo de las imágenes" : formato === "reel" ? "Modelo de los fotogramas" : formato === "carrusel" ? "Modelo de las láminas" : "Modelo"}</label>
                  <select id={`${ids}-m`} className="input" value={modelo?.id ?? ""} onChange={(e) => setModeloId(e.target.value)}>
                    {modelosDelFormato.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {textoCosto(costoDePieza(m))}</option>)}
                  </select>
                </div>
                {hayReels && (
                  <div className="field">
                    <label className="label" htmlFor={`${ids}-mv`}>Modelo del video</label>
                    <select id={`${ids}-mv`} className="input" value={modeloVideo?.id ?? ""} onChange={(e) => setModeloVideoId(e.target.value)}>
                      {modelosVideo.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {etiquetaDeCosto(m)}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {esPlan && hayGuiadas && (
                <p className="hint">Los carruseles y los reels del plan salen como hechos a mano (láminas una a una; el reel con su storyboard y su video), uno detrás de otro, después de las imágenes.{modeloCarrusel && modeloCarrusel.id !== modelo?.id ? ` Las láminas van con ${modeloCarrusel.nombre}, que admite la anterior de referencia.` : ""}</p>
              )}
              {guiado ? (
                <p className="hint">
                  {formato === "carrusel"
                    ? "Cada idea sale como un carrusel hecho a mano: la IA escribe el guion por láminas, el director de arte lo propone y las láminas se crean una a una, con la anterior y la portada de referencia. El texto lo escribe el modelo."
                    : "Cada idea sale como un reel de 10 s hecho a mano: guion por planos, un fotograma por plano (el storyboard) y el video con ellos. Cada reel tarda unos minutos; los tramos se corrigen después desde el Estudio."}
                  {" "}Van uno detrás de otro.
                </p>
              ) : (
                <>
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
                </>
              )}
              {listaPersonajes.length > 0 && (
                <div className="field">
                  <span className="label" id={`${ids}-pj`}>Personajes de la marca</span>
                  <div className="est-tipos" role="group" aria-labelledby={`${ids}-pj`}>
                    {listaPersonajes.map((p) => (
                      <button key={p.id} type="button" className="filter-chip" aria-pressed={personajesSel.includes(p.id)} title={p.descripcion}
                        onClick={() => setPersonajesSel((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}>{p.nombre}</button>
                    ))}
                  </div>
                  <p className="hint">Los escogidos van de referencia en cada pieza: salen iguales (cara, pelo, ropa).</p>
                </div>
              )}
              <div className="field">
                <label className="label" htmlFor={`${ids}-est`}>Estilo visual</label>
                <select id={`${ids}-est`} className="input" value={estilo} onChange={(e) => setEstilo(e.target.value)}>
                  <option value="">El de cada tipo de pieza</option>
                  {Object.entries(ESTILOS_VISUALES).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                  {limpiarKit(kit).estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre} (propio)</option>)}
                </select>
              </div>
              <label className="est-logo-casilla">
                <input type="checkbox" checked={controlar} onChange={(e) => { setControlar(e.target.checked); encenderControl(e.target.checked); }} />
                {" "}Revisar cada pieza al terminar y corregir solo el texto mal escrito (recomendado: la IA la mira y, si sólo falla una letra, edita la misma imagen; céntimos por pieza)
              </label>
              <label className="est-logo-casilla">
                <input type="checkbox" checked={mejorar} onChange={(e) => setMejorar(e.target.checked)} /> Que el director de arte diseñe la tanda antes de crear (recomendado: una ficha de diseño por pieza, todas como una serie; las que ya traen su pedido listo no esperan; costo de texto mínimo)
              </label>
              <div className="field">
                <label className="label" htmlFor={`${ids}-indicacion`}>Indicación para toda la tanda (opcional)</label>
                <textarea id={`${ids}-indicacion`} className="textarea" rows={2} maxLength={400} value={indicacion} onChange={(e) => setIndicacion(e.target.value)}
                  placeholder="Ej.: fondo blanco en todas, el precio siempre grande en amarillo, nada de personas" />
                <p className="hint" style={{ margin: 0 }}>Manda sobre todo lo demás al diseñar cada pieza.</p>
              </div>
              {limpiarKit(kit).plantillas.length > 0 && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-plantilla`}>Plantilla</label>
                  <select id={`${ids}-plantilla`} className="input" value={plantillaLote} onChange={(e) => setPlantillaLote(e.target.value)}>
                    <option value="">La que escoja el director (si alguna encaja)</option>
                    {limpiarKit(kit).plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <p className="hint" style={{ margin: 0 }}>Todas las piezas repiten el diseño de esa plantilla, cada una con su contenido.</p>
                </div>
              )}
              {archivos.some((a) => a.favorito && a.tipo === "imagen") && (
                <label className="est-logo-casilla">
                  <input type="checkbox" checked={conGustos} onChange={(e) => { setConGustos(e.target.checked); try { localStorage.setItem(claveGustos, e.target.checked ? "1" : "0"); } catch { /* sin almacenamiento */ } }} />
                  {" "}Usar mis «Me gusta» como referencia de estilo (las dos últimas)
                </label>
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
                        <div className="lote-elegir-fila">
                          <label className="lote-elegir">
                            <input type="checkbox" checked={i.elegida} onChange={(e) => cambiarIdea(i.id, "elegida", e.target.checked)} /> Crear esta
                          </label>
                          {!llevadas[i.id] && (otras[i.id]?.abierta ? (
                            <span className="lote-otra">
                              <input className="input" aria-label={`Qué quieres distinto en «${i.titulo || i.titular}» (opcional)`} maxLength={300} placeholder="Qué quieres distinto (opcional)"
                                value={otras[i.id]?.nota ?? ""} onChange={(e) => ponerOtra(i.id, { nota: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!otras[i.id]?.cargando) void pedirOtra(i); } }} />
                              <button type="button" className="btn btn-secondary btn-sm" aria-disabled={Boolean(otras[i.id]?.cargando)} onClick={() => !otras[i.id]?.cargando && pedirOtra(i)}>
                                <Icon name="sparkles" size={14} /> {otras[i.id]?.cargando ? "Escribiendo…" : "Pedir otra"}
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ponerOtra(i.id, { abierta: true })}><Icon name="refresh" size={14} /> Otra</button>
                          ))}
                        </div>
                        {otras[i.id]?.error && <p role="alert" className="cerebro-error">{otras[i.id].error}</p>}
                        <p className="lote-dia">
                          {i.fecha && <strong>{fechaCortaLote(i.fecha)}</strong>}
                          {esPlan && <span className="lote-insignia">{FORMATOS_LOTE[fmtDe(i)]?.nombre}</span>}
                          <span className="lote-insignia">{etiquetaDe(i)}</span>
                          {i.cambio && <span className="hint">{i.cambio}</span>}
                        </p>
                        <div className="lote-forma">
                          <label className="lote-forma-campo">
                            <span className="label">Composición</span>
                            <select className="input" value={i.composicion} onChange={(e) => {
                              const c = COMPOSICIONES.find((x) => x.id === e.target.value);
                              setIdeas((l) => l.map((x) => (x.id === i.id ? { ...x, composicion: c.id, plantilla: fmtDe(i) === "historia" && c.plantilla === "banda" ? "centro" : c.plantilla } : x)));
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
                        {guiadoDe(i) && (
                          <div className="field">
                            <label className="label" htmlFor={`${ids}-gu-${i.id}`}>{i.rostro ? "Guion para grabar (toma por toma)" : fmtDe(i) === "reel" ? "Guion (planos de 10 s)" : "Guion (lámina por lámina)"}</label>
                            <textarea id={`${ids}-gu-${i.id}`} className="input" rows={5} maxLength={MAX_GUION} value={i.guion ?? ""} onChange={(e) => cambiarIdea(i.id, "guion", e.target.value)} />
                          </div>
                        )}
                        {i.rostro && (
                          <p className="hint"><Icon name="user" size={14} /> UGC · guion para grabar: lo graba una persona. No se crea con IA: va al calendario como idea con este guion.</p>
                        )}
                        {!i.fecha && onLlevar && !llevadas[i.id] && (
                          <div className="lote-llevar">
                            <SelectorFecha value={fechas[i.id] ?? ""} onChange={(f) => setFechas((m) => ({ ...m, [i.id]: f }))} etiqueta="Día" vacio="Escoger día" prefijo="Día" />
                          </div>
                        )}
                        {llevadas[i.id] && <p className="hint"><Icon name="check" size={14} /> En el calendario, el {diaCorto(llevadas[i.id])}.</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {paso === 2 && (
            <ul className="lote-resultados">
              {delPaso3.map((i) => {
                const r = resultados[i.id];
                const final = elegida(i.id);
                return (
                  <li key={i.id} className="lote-resultado">
                    <div className="lote-miniatura">
                      {final?.tipo === "video" ? <video src={final.src} controls playsInline preload="metadata" aria-label={`Reel: ${i.titulo || i.titular}`} />
                        : final ? <img src={final.src} alt={`Pieza: ${i.titulo || i.titular}`} /> : (
                          <span className="hint">{r?.error ? "No salió" : r?.cargando ? (r.paso || "Creando…") : "En cola"}</span>
                        )}
                    </div>
                    <div className="lote-resultado-texto">
                      <span className="lote-insignia">{[i.fecha && fechaCortaLote(i.fecha), etiquetaDe(i)].filter(Boolean).join(" · ")}</span>
                      <strong>{i.titulo || i.titular}</strong>
                      {r?.error && <p role="alert" className="cerebro-error">{r.error}</p>}
                      {r?.opciones?.[r.elegida ?? 0]?.control && (
                        <p className="lote-control" data-estado={r.opciones[r.elegida ?? 0].control.estado}>
                          <Icon name={r.opciones[r.elegida ?? 0].control.estado === "ok" ? "checkCircle" : "alert"} size={14} /> {resumenControl(r.opciones[r.elegida ?? 0].control)}
                        </p>
                      )}
                      {r?.cargando && r.paso && final && <p className="hint">{r.paso}</p>}
                      {guiadoDe(i) && r?.opciones?.[0]?.archivos?.length > 1 && (
                        <div className="lote-laminas" aria-label={`Las ${r.opciones[0].archivos.length} láminas`}>
                          {r.opciones[0].archivos.map((a, k) => <img key={a.id} src={a.src} alt={`Lámina ${k + 1}`} />)}
                        </div>
                      )}
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
              <Icon name="sparkles" size={18} /> {escribiendo ? (progreso || "Escribiendo las piezas…") : `Escribir ${total} ${total === 1 ? "pieza" : "piezas"} con IA`}
            </button>
          )}
          {paso === 1 && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPaso(0)}>Volver</button>
              {onLlevar && (
                <button type="button" className="btn btn-secondary" disabled={!ideasConDia.length || llevandoIdeas}
                  title={ideasConDia.length ? "" : "Escoge el día de cada idea"} onClick={llevarIdeas}>
                  <Icon name="calendar" size={18} /> {llevandoIdeas ? "Llevando…" : `Sólo las ideas al calendario (${ideasConDia.length})`}
                </button>
              )}
              <p className="lote-costo">{porCrear.length} de {ideas.length}{variantes > 1 && !hayGuiadas ? ` × ${variantes}` : ""} · <strong>{textoCosto(costoTotal)}</strong>{modelo?.estimado || hayGuiadas ? " (aprox.)" : ""}{conRostro.length ? ` · ${conRostro.length} con rostro van como idea` : ""}</p>
              <button type="button" className="btn btn-primary" disabled={(!porCrear.length && !conRostro.length) || llevandoIdeas} onClick={crear}>
                <Icon name={formato === "reel" ? "video" : "image"} size={18} /> Crear {porCrear.length} {nombreDePiezas(porCrear.length)} · {textoCosto(costoTotal)}
              </button>
            </>
          )}
          {paso === 2 && (
            <>
              <p className="lote-costo">{listas} de {delPaso3.length} {listas === 1 ? "lista" : "listas"}</p>
              {!creando && onLlevar && porLlevar > 0 && (
                <button type="button" className="btn btn-secondary" disabled={llevandoTodas} onClick={llevarTodas}>
                  <Icon name="calendar" size={18} /> {llevandoTodas ? "Llevando…" : porLlevar === 1 ? "Llevar al calendario" : `Llevar las ${porLlevar} al calendario`}
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
