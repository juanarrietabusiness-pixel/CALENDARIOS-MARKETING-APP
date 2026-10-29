import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import Compositor, { QueCrear } from "./EstudioCompositor";
import Visor, { Pieza } from "./EstudioVisor";
import {
  kitVacio, limpiarKit, textoPreset, bloqueDeMarca, presetActual, ponerLogo, ideaDelPedido, conOtraEscena, nombreDePreset,
  estiloDeLaPieza, lineaDeEstilo, nombreDeEstilo, estiloValido, TIPOS_PRESET, referenciaDePlantilla, lineaDePlantillaEnPedido,
} from "../lib/kitMarca";
import { presetDePilar, nombreDePilar } from "../lib/pilares";
import { ideaDesdeAngulo } from "../lib/estudioMercado";
import { pedidoDePieza, apoyosDelCompositor } from "../lib/pieza";
import { segundosParaModelo, ajusteDeDuracion } from "../lib/videoCorto";
import BancoSelector from "./BancoSelector";
import ExploradorDrive from "./ExploradorDrive";
import { idDeCarpeta } from "../lib/drive";
import { OverflowMenu } from "./calendario/primitivas";
import { soloLectura } from "../lib/sesionActual";
import * as api from "../lib/estudio";
import { MEDIOS_VACIOS, recortarMedios, clavesDe, formularioInicial } from "../lib/estudio";
import { estampaSola, estamparEnGaleria, conLogoSiToca } from "../lib/logoEstudio";
import { terminarTrabajo } from "../lib/controlEstudio";
import {
  modeloPorId, nombreDelModelo, estimar, textoCosto, pideConfirmar, ajustesDe, estaVivo, maxPorPedido, PRECIOS_AL, MAX_PROMPT,
} from "../lib/estudioCatalogo";
import {
  filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, nombreDeDescarga,
  proporcionDeMedidas, modeloDeEdicion, originalDe, FILTROS_GALERIA, agruparGaleria, esGrupo, estaUsado, textoDeGrupo,
  modeloDeLaPieza,
} from "../lib/estudio";
import { FiltroDeModelo } from "./SelectorModelo";
import "./Estudio.css";

const EstudioLote = lazy(() => import("./EstudioLote"));
// Sólo cuando una imagen de la galería cabe en más de un sitio: aparte, el chunk del Estudio está en su tope.
const EleccionRanura = lazy(() => import("./EleccionRanura"));
// El kit va plegado y sólo en la pestaña: en su chunk (el del Estudio tiene tope, rendimiento.bundle.test.js).
const EstudioKit = lazy(() => import("./EstudioKit"));
const EstudioRecrear = lazy(() => import("./EstudioRecrear"));
const FlujoCarrusel = lazy(() => import("./FlujoCarrusel"));
const FlujoReel = lazy(() => import("./FlujoReel"));
/** Lo que se crea con pasos (no de una vez): el carrusel por láminas y el reel por planos. */
const GUIADOS = [["carrusel", "Carrusel", "formatCarrusel"], ["reel", "Video", "formatReel"]];

// ============================================================
// El Estudio de un cliente: la pestaña y el diálogo «Crear con IA»
//
// Se pide una imagen o un video, se ve aparecer y queda en la galería del cliente
// con su prompt, su modelo y lo que costó. De ahí se descarga, se usa de referencia
// (o de imagen inicial de un video: «Animar»), se guarda en una carpeta o se manda
// a la papelera (30 días).
//
// DOS PUERTAS AL MISMO SERVICIO:
//   · la PESTAÑA del cliente (`modo="pestana"`);
//   · el DIÁLOGO del panel de una publicación (`modo="dialogo"`): el compositor sale ya
//     preparado con el formato y la idea de la publicación, y cada pieza tiene «Usar en
//     la publicación», que la pone ahí sin pasar por la galería.
//
// LO QUE PASA AL PEDIR. El servidor crea un TRABAJO y esta pantalla lo va avanzando un
// paso a la vez —una imagen por paso; un video se envía y después se mira cómo va—,
// porque el Worker no puede esperar. Si se cierra la pestaña a medias, el servidor
// sigue solo (el cron del minuto). Cada modelo dice cuánto cuesta ANTES de pedir, y
// desde 0,50 $ pide un segundo toque.
//
// Ningún motor se llama desde el navegador: todo va por /api/estudio.
// ============================================================

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const FILTROS_FIJOS = FILTROS_GALERIA;
// Un carrusel o un reel de la galería con todas sus piezas y la descarga en ZIP: sólo al abrirlo.
const VisorGrupo = lazy(() => import("./VisorGrupo"));
// La papelera, igual: sólo al abrirla (la pestaña tiene tope de 20 kB comprimidos).
const EstudioPapelera = lazy(() => import("./EstudioPapelera"));

const reemplazar = (lista = [], t) => (lista.some((x) => x.id === t.id) ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]);

export default function Estudio({ client, pulso = 0, modo = "pestana", inicial = null, uso = null, onUsar = null, onUsarVarias = null, onCerrar = null, onLlevarAlCalendario = null }) {
  const ids = useId();
  const lectura = soloLectura();
  const dialogo = modo === "dialogo";
  const [datos, setDatos] = useState(null);
  const [motores, setMotores] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null); // { ok, texto }

  const [form, setForm] = useState(null);
  const [confirmando, setConfirmando] = useState(null); // el costo a confirmar, o null
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  // «Mejorar idea»: mientras la IA la reescribe, y lo que había antes para poder volver.
  const [mejorando, setMejorando] = useState(false);
  const [ideaAnterior, setIdeaAnterior] = useState(null);
  // El agente diseñador: qué preset de la marca va delante de la idea (se
  // recuerda por cliente) y si el logo va de referencia.
  const clavePreset = `estudio-preset:${client.id}`;
  // Desde una publicación manda SU tipo de contenido (`inicial.preset`; sin tipo, ninguno): lo recordado de la
  // pestaña es de otra cosa. Y lo que se escoja ahí no se recuerda para la pestaña.
  const desdePost = Boolean(inicial?.post);
  const [preset, setPresetEstado] = useState(() => {
    if (desdePost || inicial?.preset) return inicial?.preset ?? "";
    try { return localStorage.getItem(clavePreset) ?? ""; } catch { return ""; }
  });
  const setPreset = (v) => {
    setPresetEstado(v);
    if (!desdePost) try { localStorage.setItem(clavePreset, v); } catch { /* sin almacenamiento */ }
  };
  const [conLogo, setConLogo] = useState(true);
  // Un flujo guiado abierto en lugar del compositor ("" = el compositor de imagen o video).
  const [guiado, setGuiado] = useState("");
  const [vueltaGuiado, setVueltaGuiado] = useState(0);
  // Los personajes de la marca que salen en esta pieza (sus imágenes van de referencia: que salgan IGUAL).
  const [personajesSel, setPersonajesSel] = useState([]);
  // Una plantilla del kit: la pieza repite su diseño (su imagen de referencia y su sistema escrito).
  const [plantillaSel, setPlantillaSel] = useState("");
  // «Fijar para este cliente»: el modelo va en su kit (lo comparte el equipo) y arranca el compositor, el lote y
  // «Producir el mes». Se guarda con el kit; `fijar` se define abajo, con el guardado del kit.

  // «Usar mis Me gusta como referencia de estilo» (se recuerda por cliente; apagado por defecto).
  const claveGustos = `estudio-gustos:${client.id}`;
  const [conGustos, setConGustosEstado] = useState(() => { try { return localStorage.getItem(claveGustos) === "1"; } catch { return false; } });
  const setConGustos = (v) => { setConGustosEstado(v); try { localStorage.setItem(claveGustos, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  // El kit va en TODA pieza mientras esto esté encendido (se recuerda por cliente), y el estilo visual («» = el del tipo).
  const claveUsarKit = `estudio-usar-kit:${client.id}`;
  const [usarKit, setUsarKitEstado] = useState(() => { try { return localStorage.getItem(claveUsarKit) !== "0"; } catch { return true; } });
  const setUsarKit = (v) => { setUsarKitEstado(v); try { localStorage.setItem(claveUsarKit, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  // El estilo visual escogido se recuerda por cliente («» = el del tipo); el «acabado» de antes tenía los mismos ids.
  const claveEstilo = `estudio-estilo:${client.id}`;
  const [estiloEscogido, setEstiloEstado] = useState(() => {
    if (desdePost) return "";
    try { return localStorage.getItem(claveEstilo) ?? localStorage.getItem(`estudio-acabado:${client.id}`) ?? ""; } catch { return ""; }
  });
  const setEstilo = (v) => {
    setEstiloEstado(v);
    if (!desdePost) try { localStorage.setItem(claveEstilo, v); } catch { /* sin almacenamiento */ }
  };
  // Traer de Drive: el papel (referencia, inicial…) para el que se abrió el selector.
  const [driveRol, setDriveRol] = useState(null);
  // «¿Dónde va esta imagen?» y «De la galería» en un sitio concreto del compositor.
  const [eligiendoRanura, setEligiendoRanura] = useState(null);
  const [destinoGaleria, setDestinoGaleria] = useState(null);
  const galeriaRef = useRef(null);
  // La galería: lo que no se pudo pintar (el archivo ya no está) y lo marcado para mandar varias a la papelera.
  const [perdidos, setPerdidos] = useState(() => new Set());
  const [seleccion, setSeleccion] = useState(null); // null = no se está seleccionando; si no, un Set de ids
  // La revisión de marca de cada imagen: id → { cargando } | { datos } | { error }.
  const [revisiones, setRevisiones] = useState({});

  const [filtro, setFiltro] = useState("todas");
  const [texto, setTexto] = useState("");
  const [modeloFiltro, setModeloFiltro] = useState(""); // el nombre de un modelo de la galería («Nano Banana»), o todos
  const [enPapelera, setEnPapeleraEstado] = useState(false);
  // La carpeta de Drive del cliente, dentro de la galería: de ahí se traen referencias sin salir.
  const [enDrive, setEnDrive] = useState(false);
  const setEnPapelera = (v) => { setEnPapeleraEstado(v); if (v) setEnDrive(false); };
  const [visor, setVisor] = useState(null);
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [descartados, setDescartados] = useState(() => new Set());
  // «Producir el mes» del calendario llega con «?lote=mes&mes=AAAA-MM»: abre el lote en «Mes completo» con ese mes.
  const [loteAbierto, setLoteAbierto] = useState(() => {
    const q = modo === "pestana" ? new URLSearchParams(window.location.search) : null;
    return !lectura && q?.get("lote") === "mes" ? { alcance: "mes", mes: q.get("mes") ?? "" } : false;
  });
  useEffect(() => {
    if (loteAbierto?.alcance) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [loteAbierto]);
  const [recrear, setRecrear] = useState(null); // null, o { archivo }: «Recrear un anuncio» abierto (con uno ya escogido)
  const [carpetaNueva, setCarpetaNueva] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [borrando, setBorrando] = useState(null);

  const siguiendo = useRef(new Set());
  // Los trabajos del compositor cuyas imágenes llevan el logo ESTAMPADO al terminar (kit.logoModo «estampado»).
  // Los trabajos de imagen del compositor: al terminar pasan por el control (lib/controlEstudio.js); el valor dice si
  // además se estampa el logo.
  const paraEstampar = useRef(new Map());
  const kitRef = useRef(null);
  const montado = useRef(true);
  const promptRef = useRef(null);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // ---------- Cargar ----------
  const cargar = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([api.leerEstudio(client.id), api.leerMotores()]);
      if (!montado.current) return;
      setDatos(g);
      setMotores(m.motores);
      setError("");
    } catch (e) {
      if (montado.current) setError(e.message);
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [client.id]);

  useEffect(() => { cargar(); }, [cargar, pulso]);

  // Desde una publicación («Corregir esta», «Otra versión», «Recrear con mi marca»): la pieza que se tocó ya abierta en
  // el visor, o en el recreador. Una vez: cerrarla deja la galería del diálogo, con «Usar» en cada pieza.
  const abierta = useRef(false);
  useEffect(() => {
    if (!datos || abierta.current || !inicial?.abrir) return;
    abierta.current = true;
    if (inicial.accion === "recrear") setRecrear({ archivo: inicial.abrir }); else setVisor(inicial.abrir);
  }, [datos, inicial]);

  // El formulario de partida, una vez que se sabe qué motores tienen llave.
  useEffect(() => {
    if (motores && datos && !form) setForm(formularioInicial(motores, inicial, datos.productos ?? [], datos.kit?.modelos ?? {}));
  }, [motores, datos, form, inicial]);

  const modelo = form ? modeloPorId(form.modelo) : null;
  const motorActivo = (m) => Boolean(motores?.[m.motor]?.activo);
  // Qué motores tienen llave ({ motor: bool }): lo piden los cálculos de modelo, el visor y los flujos.
  const activos = useMemo(() => Object.fromEntries(Object.entries(motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)])), [motores]);
  const ajustes = form && modelo ? ajustesDe(modelo, form.ajustes, clavesDe(form.medios)) : {};
  const costo = form && modelo ? estimar(modelo, form.n, ajustes) : 0;
  const kit = datos?.kit ?? null;
  const fijados = kit?.modelos ?? {};
  const kitListo = !kitVacio(kit);
  // Un preset guardado de antes (producto, corporativo…) se traduce al de ahora.
  const presetVigente = presetActual(preset, kit);
  const textoDelPreset = presetVigente ? textoPreset(kit, presetVigente, { marca: client.name, rubro: client.industry ?? "" }) : "";
  // El estilo visual: el escogido (si sigue existiendo) o el del tipo de pieza.
  const estiloVigente = estiloValido(estiloEscogido, kit) ? estiloEscogido : "";
  const estiloDeEsta = estiloDeLaPieza(kit, presetVigente, estiloVigente);
  const lineaDelEstilo = lineaDeEstilo(kit, estiloDeEsta);
  const conKit = usarKit && kitListo;
  const bloqueMarca = conKit ? bloqueDeMarca(kit) : "";
  const puedeLogo = Boolean(conKit && form && modelo && ponerLogo({ kit, tipo: form.tipo, modelo, referencias: clavesDe(form.medios).reference }));
  // Con el logo estampado (kit), el modelo no lo recibe: la aplicación lo pega encima al terminar.
  const estampa = Boolean(conKit && form && form.tipo !== "video" && estampaSola(kit));
  kitRef.current = kit;
  // Lo que va de referencia además de lo puesto a mano (lib/pieza.js): las fotos de los productos que nombra la idea,
  // los personajes, la tipografía de la marca, las referencias del tipo y del estilo, y los «Me gusta».
  const hayGustos = (datos?.archivos ?? []).some((a) => a.favorito && a.tipo === "imagen");
  const { fotosNombradas, nombrado, deLosPersonajes, deLaLetra, refsTipo, gustos } = apoyosDelCompositor({
    kit, form, modelo, conKit, reservaLogo: puedeLogo && conLogo, preset: presetVigente, estilo: estiloDeEsta, personajes: personajesSel,
    archivos: datos?.archivos ?? [], productos: datos?.productos ?? [], conGustos, perdidos, puestas: form ? clavesDe(form.medios).reference : [],
  });

  // ---------- Seguir un trabajo: un paso, y otro, hasta que termine ----------
  const seguir = useCallback(async (id) => {
    if (siguiendo.current.has(id)) return;
    siguiendo.current.add(id);
    let vistas = -1;
    let ultimo = null;
    try {
      while (montado.current) {
        let r;
        try {
          r = await api.avanzarTrabajo(client.id, id);
        } catch (e) {
          if (montado.current) setAviso({ ok: false, texto: e.message });
          break;
        }
        if (!montado.current) break;
        const t = r.trabajo;
        ultimo = t;
        setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, t) } : d));
        const hechas = t.archivos?.length ?? 0;
        if (hechas !== vistas) { vistas = hechas; cargar(); } // las piezas van apareciendo
        if (!estaVivo(t.estado)) break;
        // Otro tiene el paso, el motor pidió esperar (saturación) o el video aún se hace: sin prisa.
        // Si no, el siguiente ya. Nunca más de 15 s: por si acaso se cierra el diálogo y hay que enterarse.
        await dormir(Math.min(15_000, Math.max(r.espera ?? 0, r.ocupado ? 2500 : t.nota ? 3000 : 200)));
      }
      // Terminado: si se pidió con el logo estampado, cada imagen sale otra vez con el logo encima (la cruda se queda).
      if (ultimo && !estaVivo(ultimo.estado) && paraEstampar.current.has(id)) {
        const estampar = paraEstampar.current.get(id);
        paraEstampar.current.delete(id);
        if (await terminarTrabajo({ clienteId: client.id, trabajo: ultimo, kit: kitRef.current, estampar, conLogo: conLogoSiToca })) cargar();
      }
    } finally {
      siguiendo.current.delete(id);
    }
  }, [client.id, cargar]);

  // Lo que quedó a medias al recargar se retoma (el cron también lo haría, pero más despacio).
  useEffect(() => {
    if (lectura || !datos) return;
    for (const t of datos.trabajos) if (estaVivo(t.estado)) seguir(t.id);
  }, [datos, lectura, seguir]);

  // ---------- El compositor ----------
  const avisar = (ok, textoAviso) => setAviso({ ok, texto: textoAviso });
  const enfocarPrompt = () => {
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const cambiarTipo = (tipo) => {
    if (!motores || tipo === form.tipo) return;
    const m = api.modeloPreferido(activos, tipo, fijados[tipo]);
    setConfirmando(null);
    setForm((f) => {
      const medios = recortarMedios(f.medios, m);
      return { ...f, tipo, modelo: m.id, n: 1, medios, ajustes: ajustesDe(m, { aspectRatio: f.ajustes.aspectRatio }, clavesDe(medios)) };
    });
  };

  const cambiarModelo = (id) => {
    const m = modeloPorId(id);
    setConfirmando(null);
    setForm((f) => {
      const medios = recortarMedios(f.medios, m);
      // Un modelo con voz escogible (Omni por Kie) arranca con la voz fija del cliente, si el kit la tiene.
      const voz = m?.ajustes?.voz && !f.ajustes?.voz && kit?.voz ? { voz: kit.voz } : {};
      return { ...f, modelo: id, n: Math.min(f.n, maxPorPedido(m)), medios, ajustes: ajustesDe(m, { ...f.ajustes, ...voz }, clavesDe(medios)) };
    });
  };

  // Nunca queda escogido un modelo sin llave (un borrador de antes, una llave que se quitó): pasa al preferido.
  useEffect(() => {
    if (!form || !motores) return;
    const m = modeloPorId(form.modelo);
    if (m && (m.motor === "prueba" || motores[m.motor]?.activo)) return;
    cambiarModelo(api.modeloPreferido(activos, form.tipo, fijados[form.tipo]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.modelo, form?.tipo, motores]);

  /** La IA devuelve la idea más clara y sencilla, en el mismo campo. No gasta en el motor. */
  const mejorarConIA = async ({ alAbrir = false } = {}) => {
    if (!form || mejorando) return;
    if (!form.prompt.trim()) { avisar(false, "Escribe primero la idea, con tus palabras."); promptRef.current?.focus(); return; }
    setMejorando(true);
    setAviso(null);
    const antes = form.prompt;
    try {
      const r = await api.mejorarIdea(client.id, {
        idea: antes, tipo: form.tipo, pieza: presetVigente ? nombreDePreset(presetVigente, kit) : "",
        proporcion: form.ajustes?.aspectRatio ?? "", productoId: inicial?.post?.productoId ?? "", productoIds: inicial?.post?.productoIds,
      });
      setConfirmando(null);
      setIdeaAnterior(antes);
      setForm((f) => ({ ...f, prompt: r.idea.slice(0, MAX_PROMPT) }));
      // La de al abrir desde un post se queda en él: la próxima vez sale lista (lib/promptImagen.js).
      if (alAbrir && form.tipo === "imagen") inicial?.alMejorar?.(r.idea);
      avisar(true, ["Listo: revísala antes de crear.", r.aviso ?? ""].filter(Boolean).join(" "));
      enfocarPrompt();
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setMejorando(false);
    }
  };

  // ---------- El guion de un video corto (8 o 10 s según el modelo) ----------
  const [guion, setGuion] = useState(null);
  const [escribiendoGuion, setEscribiendoGuion] = useState(false);
  const segundosGuion = modelo?.tipo === "video" ? segundosParaModelo(modelo) : 8;
  const escribirGuion = async () => {
    if (!form || escribiendoGuion) return;
    setEscribiendoGuion(true);
    setAviso(null);
    try {
      // Desde una publicación viaja su tipo de contenido y su producto (inicial.post).
      const r = await api.escribirGuionCorto(client.id, { idea: form.prompt, segundos: segundosGuion, post: inicial?.post ?? null });
      setGuion(r);
      if (r.aviso) avisar(true, r.aviso);
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setEscribiendoGuion(false);
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };
  /** El guion pasa a ser el pedido, y la duración del modelo, la del guion. */
  const usarGuion = () => {
    if (!guion) return;
    const dur = ajusteDeDuracion(modelo, guion.guion.segundos);
    setConfirmando(null);
    setIdeaAnterior(form.prompt);
    setForm((f) => ({ ...f, prompt: guion.prompt.slice(0, MAX_PROMPT), ajustes: dur ? { ...f.ajustes, duration: dur } : f.ajustes }));
    setGuion(null);
    enfocarPrompt();
  };

  // «Mejorar idea» SOLO al abrir desde una publicación: su idea + el texto de la pieza + el contexto llegan juntos y
  // largos, y el motor los entiende mucho mejor resumidos en una o dos frases (el texto exacto entre comillas se
  // conserva). Una vez por apertura, apagable, y «Volver a mi idea» lo deshace. Es texto: no gasta en el motor.
  const claveAuto = "estudio-mejorar-solo";
  const [mejorarSolo, setMejorarSoloEstado] = useState(() => { try { return localStorage.getItem(claveAuto) !== "0"; } catch { return true; } });
  const setMejorarSolo = (v) => { setMejorarSoloEstado(v); try { localStorage.setItem(claveAuto, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  const yaMejorado = useRef(false);
  useEffect(() => {
    if (yaMejorado.current || !desdePost || !mejorarSolo || lectura || !form?.prompt?.trim()) return;
    yaMejorado.current = true;
    // El pedido ya llega listo (lo escribió el motor de ideas): mejorarlo otra vez sólo haría esperar.
    if (inicial?.listo) return;
    mejorarConIA({ alAbrir: true });
  });

  // ---------- «Dame ideas» ----------
  const [ideasGen, setIdeasGen] = useState({ generando: false, lista: [], productos: [] });
  const generarIdeas = async (tipo) => {
    if (!form || ideasGen.generando) return;
    setIdeasGen((x) => ({ ...x, generando: true }));
    setAviso(null);
    try {
      const r = await api.ideasDelEstudio(client.id, {
        tipo, n: 6, video: form.tipo === "video", tema: form.prompt.trim().slice(0, 300), semilla: Math.floor(Math.random() * 1000),
      });
      setIdeasGen({ generando: false, lista: r.ideas, productos: r.productos ?? [] });
      if (r.aviso) avisar(true, r.aviso);
    } catch (e) {
      setIdeasGen((x) => ({ ...x, generando: false }));
      avisar(false, e.message);
    } finally {
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };
  /** «Usar»: la idea al pedido, su tipo de pieza y, en una imagen, las fotos de su producto. */
  const usarIdeaGenerada = (idea) => {
    setConfirmando(null);
    setIdeaAnterior(form.prompt || null);
    setForm((f) => ({ ...f, prompt: (f.tipo === "video" ? idea.escena : api.ideaAlPedido(idea)).slice(0, MAX_PROMPT) }));
    setPreset(presetDePilar(idea.tipo));
    if (form.tipo === "imagen" && idea.productoId) ponerFotosDeProducto(idea.productoId);
    avisar(true, "Idea puesta en el pedido. Revísala (o pulsa «Diseñar con el director») y crea.");
    enfocarPrompt();
  };

  /** Deshace la mejora: vuelve lo que la persona había escrito. */
  const volverAMiIdea = () => {
    if (ideaAnterior == null) return;
    setForm((f) => ({ ...f, prompt: ideaAnterior }));
    setIdeaAnterior(null);
    enfocarPrompt();
  };

  /** «Editar»: la imagen va de referencia a un modelo que edita, con la indicación y la orden de no tocar lo demás. */
  const editar = async (a, instruccion, ejemplos = [], escogido = "") => {
    if (!String(instruccion ?? "").trim() || !motores) return;
    const proporcion = a.ajustes?.aspectRatio ?? proporcionDeMedidas(a.ancho, a.alto);
    // El que escogió la persona en el visor (si edita); si no, el de editar. Si no hace la proporción, el que sí.
    const m = modeloDeEdicion(activos, escogido, proporcion);
    // La imagen primero; los ejemplos de la galería detrás, los que quepan en el modelo.
    const { prompt, medios } = api.pedidoDeCorreccion({ clave: a.clave, instruccion, ejemplos, modelo: m });
    try {
      const { trabajo } = await api.pedirImagenes(client.id, {
        modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: proporcion }, medios),
        medios, confirmado: true,
        ...(a.carpetaId ? { carpetaId: a.carpetaId } : {}),
      });
      setVisor(null);
      setEnPapelera(false);
      setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
      seguir(trabajo.id);
      avisar(true, `Editando con ${m.nombre}: sale como una imagen NUEVA y la original no se toca.`);
    } catch (e) {
      avisar(false, e.message);
    }
  };

  const enviar = async (confirmado = false) => {
    if (!form || !modelo || enviando) return;
    if (!form.prompt.trim()) {
      avisar(false, "Escribe qué quieres crear.");
      promptRef.current?.focus();
      return;
    }
    if (!confirmado && pideConfirmar(costo)) { setConfirmando(costo); return; }
    setConfirmando(null);
    setEnviando(true);
    setAviso(null);
    setEnPapelera(false); // lo que se pide aparece en la galería: que se vea
    try {
      // El tipo de pieza delante de la escena, la identidad de la marca detrás y el logo de referencia si se pidió:
      // lo que se manda es lo que queda escrito.
      // Las fotos del producto que nombra la idea van DELANTE (cuanto cabe), y cada referencia dice qué se toma de ella.
      const delNombrado = fotosNombradas;
      const dePlantilla = form.tipo === "imagen" && plantillaSel ? referenciaDePlantilla(kit, plantillaSel, datos?.archivos ?? []) : null;
      const refs = [...delNombrado, ...(dePlantilla ? [dePlantilla] : []), ...deLosPersonajes, ...deLaLetra, ...form.medios.reference, ...refsTipo, ...gustos];
      // El MISMO camino que el lote y «Producir el mes» (lib/pieza.js); aquí la resolución la escoge la persona.
      const pieza = pedidoDePieza({
        kit, idea: form.prompt, preset: presetVigente, estilo: estiloVigente, apoyos: refs, modelo, marca: client.name, rubro: client.industry ?? "",
        usarKit: conKit, conLogo, video: form.tipo === "video", altaResolucion: false, ajustes: form.ajustes, n: form.n,
        extra: dePlantilla ? lineaDePlantillaEnPedido(kit, plantillaSel) : "",
      });
      const medios = { ...clavesDe(form.medios), ...pieza.medios };
      const { trabajo } = await api.pedirImagenes(client.id, {
        modelo: form.modelo, prompt: pieza.prompt,
        n: form.n, ajustes: ajustesDe(modelo, form.ajustes, medios),
        medios, confirmado: true,
        ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}),
      });
      setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
      if (form.tipo === "imagen") paraEstampar.current.set(trabajo.id, estampa && conLogo);
      seguir(trabajo.id);
      setIdeaAnterior(null);
      if (delNombrado.length) {
        setForm((f) => ({ ...f, medios: { ...f.medios, reference: [...delNombrado, ...f.medios.reference.filter((x) => !delNombrado.some((n) => n.id === x.id))].slice(0, modelo.referencias || 0) } }));
        avisar(true, `Van de referencia ${delNombrado.length === 1 ? "la foto" : `${delNombrado.length} fotos`} del catálogo de ${nombrado.nombres.map((n) => `«${n}»`).join(" y ")}.`);
      }
    } catch (e) {
      if (e.datos?.codigo === "confirmar") setConfirmando(e.datos.costo);
      else avisar(false, e.message);
    } finally {
      setEnviando(false);
    }
  };

  // ---------- Imágenes de apoyo: referencias, inicial y final ----------
  const quitarMedio = (rol, a) => {
    setConfirmando(null);
    setForm((f) => ({ ...f, medios: { ...f.medios, [rol]: f.medios[rol].filter((x) => x.id !== a.id) } }));
  };

  /** Qué se toma de una referencia y su comentario: viajan en el mismo archivo puesto (`toma`, `nota`). */
  const marcarReferencia = (a, cambios) => {
    setConfirmando(null);
    setForm((f) => ({ ...f, medios: { ...f.medios, reference: f.medios.reference.map((x) => (x.id === a.id ? { ...x, ...cambios } : x)) } }));
  };

  /**
   * «Fotos de un producto»: las suyas van de referencia, delante de las demás. Si ya iban las de OTRO producto, se
   * reparten los huecos (una de cada uno primero): una pieza general con varios productos los lleva a todos.
   */
  const ponerFotosDeProducto = (productoId) => {
    setConfirmando(null);
    setForm((f) => {
      const m = modeloPorId(f.modelo);
      const productos = datos?.productos ?? [];
      const yaVan = [...new Set(f.medios.reference.filter((x) => x.producto).map((x) => productos.find((p) => p.nombre === x.producto.nombre)?.id).filter(Boolean))];
      const otras = f.medios.reference.filter((x) => !x.producto);
      const huecos = Math.max(1, (m?.referencias || 0) - otras.length);
      const fotos = api.fotosDeVariosProductos(productos, [...yaVan.filter((id) => id !== productoId), productoId], huecos);
      return { ...f, medios: { ...f.medios, reference: [...fotos, ...otras].slice(0, m?.referencias || 0) } };
    });
  };

  const NOMBRE_RANURA = { start: "imagen inicial", end: "imagen final", reference: "referencia", video: "video de referencia" };

  /**
   * Un archivo de la galería al pedido. Con `rol` (lo escogió la persona, o pulsó «De la galería» en ese sitio) va
   * ahí; si no, al único sitio libre, y si hay más de uno se pregunta (`EleccionRanura`).
   */
  const usarComoMedio = (a, rol = null) => {
    if (!form || !modelo) return;
    if (Object.values(form.medios).some((l) => l.some((x) => x.id === a.id))) { avisar(true, "Ya está puesta."); return; }
    const libres = api.ranurasLibres(form.medios, modelo, a);
    if (!libres.length && a.tipo === "video") {
      avisar(false, modelo.video
        ? "Ya hay un video de referencia en el pedido. Quítalo para poner otro."
        : `${modelo.nombre} no sigue videos. Escoge uno que siga videos, como «Gemini Omni Flash (Kie)» o «Kling 3.0 Omni (Kie)».`);
      return;
    }
    if (!libres.length) {
      avisar(false, modelo.inicial || modelo.referencias
        ? `${modelo.nombre} no admite más imágenes de apoyo. Quita alguna o escoge otro modelo.`
        : `${modelo.nombre} no admite imágenes de referencia. Escoge otro modelo.`);
      return;
    }
    const destino = rol && libres.includes(rol) ? rol : libres.length === 1 ? libres[0] : null;
    if (rol && !libres.includes(rol)) { avisar(false, `Ya no queda sitio en «${NOMBRE_RANURA[rol]}». Quita alguna o ponla en otro sitio.`); return; }
    if (!destino) { setEligiendoRanura({ archivo: a, opciones: libres }); return; }
    setEligiendoRanura(null);
    setDestinoGaleria(null);
    setConfirmando(null);
    setForm((f) => ({ ...f, medios: { ...f.medios, [destino]: [...f.medios[destino], a] } }));
    avisar(true, `Puesta como ${NOMBRE_RANURA[destino]}. Escribe qué quieres hacer con ella.`);
    enfocarPrompt();
  };

  /** «De la galería» en un sitio del compositor: la siguiente imagen que se toque en la galería va ahí. */
  const escogerDeLaGaleria = (rol) => {
    setDestinoGaleria(rol);
    setEnPapelera(false);
    setEnDrive(false);
    galeriaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** «Recrear un anuncio» terminado: la versión entra en el compositor (con el anuncio y las fotos del producto) para revisar y crear. */
  const desdeRecrear = (pedido) => {
    setRecrear(null);
    cargar();
    if (!motores) return;
    setConfirmando(null);
    setVisor(null);
    setEnPapelera(false);
    // El modelo lo propone el recreador entre los que tienen llave (lib/motorRecrear.js); sin llave no se respeta.
    setForm(formularioInicial(motores, pedido, [], fijados));
    setPreset(pedido.preset ?? "anuncio");
    setIdeaAnterior(null);
    avisar(true, pedido.tipo === "video"
      ? `Lista para recrear el video con tu marca${pedido.referencias?.length ? " y las fotos del producto" : ""}. Revisa el pedido y pulsa «Crear video».`
      : "Lista para recrear con tu marca: el anuncio va de referencia sólo por su composición y su estilo, con las fotos del producto. Revisa y pulsa «Crear imagen».");
    enfocarPrompt();
  };

  /** «Animar»: la imagen pasa a ser el primer fotograma de un video. */
  const animar = (a) => {
    if (!motores) return;
    const m = modeloPorId(form.modelo)?.tipo === "video" ? modeloPorId(form.modelo) : api.modeloPreferido(activos, "video", fijados.video);
    const proporcion = proporcionDeMedidas(a.ancho, a.alto);
    const medios = { ...MEDIOS_VACIOS(), start: [a] };
    setConfirmando(null);
    setVisor(null);
    setEnPapelera(false);
    setForm({
      tipo: "video", modelo: m.id, n: 1, medios,
      prompt: `Anima esta imagen con un movimiento suave y natural: ${a.prompt}`.slice(0, MAX_PROMPT),
      ajustes: ajustesDe(m, { aspectRatio: proporcion === "16:9" || proporcion === "1:1" ? proporcion : "9:16" }, clavesDe(medios)),
    });
    avisar(true, "Lista para animar. Ajusta el texto (qué se mueve) y pulsa «Crear video».");
    enfocarPrompt();
  };

  /** «Ajustar y pedir»: la pieza vuelve al compositor para cambiar algo antes de pedirla otra vez. */
  const repetir = (a) => {
    const m = modeloPorId(a.modelo);
    const usable = m && motorActivo(m);
    // Un modelo sin llave o retirado: el que esté escogido si es del mismo tipo; si no, el predeterminado de ese tipo.
    const escogido = modeloPorId(form.modelo);
    const destino = usable ? m : escogido?.tipo === a.tipo ? escogido : api.modeloPreferido(activos, a.tipo, fijados[a.tipo]);
    const medios = MEDIOS_VACIOS();
    setConfirmando(null);
    setForm({ tipo: destino.tipo, modelo: destino.id, prompt: a.prompt, n: 1, medios, ajustes: ajustesDe(destino, a.ajustes, clavesDe(medios)) });
    setVisor(null);
    setEnPapelera(false);
    setAviso(usable || !a.modelo ? null : { ok: false, texto: `${nombreDelModelo(a.modelo)} no está disponible${m ? " en este servidor" : ""}: se usó ${destino.nombre}.` });
    enfocarPrompt();
  };

  // ---------- «Otra igual» y «Otra versión distinta»: salen ya, sin pasar por el compositor ----------
  /** El pedido con que se creó una pieza: su prompt, su modelo, sus ajustes y sus imágenes de apoyo (las de su trabajo). */
  const pedidoDe = (a, otro = "") => {
    const t = (datos?.trabajos ?? []).find((x) => x.id === a.trabajoId);
    // `otro`: el modelo escogido en el visor para esta vez; sus referencias, las que le quepan.
    const o = api.modeloParaOtra(activos, otro, a, t?.medios?.reference?.length ?? 0);
    const m = o ?? modeloPorId(a.modelo);
    if (!m || !motorActivo(m)) return { error: `${nombreDelModelo(a.modelo) || "Ese modelo"} no está disponible: usa «Ajustar y pedir» para escoger otro.` };
    const medios = Object.fromEntries(Object.entries(t?.medios ?? {}).filter(([, l]) => Array.isArray(l) && l.length).map(([k, l]) => [k, m === o && k === "reference" ? l.slice(0, m.referencias || 0) : l]));
    return { modelo: m, medios, ajustes: ajustesDe(m, a.ajustes ?? t?.ajustes ?? {}, medios), carpetaId: a.carpetaId ?? null };
  };
  /** Lo que cuesta una pieza más como esta (lo enseña el visor antes de pedir). */
  const costoDeOtra = (a) => {
    const p = pedidoDe(a);
    return p.error ? null : estimar(p.modelo, 1, p.ajustes);
  };
  const [versionando, setVersionando] = useState(false);
  /**
   * Una pieza con el texto de la plantilla encima (del lote): la nueva sale cruda y aquí se le pone el MISMO texto, en
   * el mismo sitio, con los colores del kit. Corre sola: la persona sigue trabajando mientras tanto.
   */
  const conTextoEncima = async (a, trabajo) => {
    try {
      // En diferido: el lienzo y el texto de la plantilla sólo hacen falta aquí, y el chunk del Estudio tiene tope.
      const [{ esperarArchivo }, { ponerTexto }] = await Promise.all([import("../lib/carruselEstudio"), import("../lib/loteEstudio")]);
      const crudo = await esperarArchivo(client.id, trabajo, { seguir: () => montado.current });
      const p = a.ajustes.plantilla;
      await ponerTexto({ clienteId: client.id, crudo, texto: p.texto, plantilla: p.plantilla, kit, carpetaId: a.carpetaId ?? null, nombre: "version" });
      if (montado.current) await cargar();
    } catch (e) {
      if (montado.current) avisar(false, `La nueva salió, pero sin el texto encima: ${e.message}`);
    }
  };
  const pedirOtras = async (a, prompts, otro = "") => {
    const p = pedidoDe(a, otro);
    if (p.error) throw new Error(p.error);
    for (const prompt of prompts) {
      const { trabajo } = await api.pedirImagenes(client.id, {
        modelo: p.modelo.id, prompt: prompt.slice(0, MAX_PROMPT), n: 1, ajustes: p.ajustes, medios: p.medios, confirmado: true,
        ...(p.carpetaId ? { carpetaId: p.carpetaId } : {}),
        ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}),
      });
      setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
      if (a.ajustes?.plantilla?.texto) conTextoEncima(a, trabajo);
      else seguir(trabajo.id);
    }
    return p.modelo.nombre;
  };
  /** «Otra igual»: el mismo pedido otra vez (el motor no repite la imagen: sale otra con lo mismo). */
  const otraIgual = async (a, otro = "") => {
    try {
      const con = await pedirOtras(a, [a.prompt], otro);
      setVisor(null);
      setEnPapelera(false);
      avisar(true, `Pedida otra igual con ${con}: aparece en la galería en unos segundos.`);
    } catch (e) {
      setVisor(null);
      avisar(false, e.message);
    }
  };
  /**
   * «Otra versión distinta»: la IA escribe 1–3 escenas nuevas con la misma información (con una ficha, el director
   * mirando la original y con el mismo texto); el tipo, la marca y las referencias se quedan. Sale YA, sin pasar por el compositor (también desde la tarjeta de la galería). Lo que la
   * escena manda sobre el texto («NO escribas…», «Texto en la imagen…») no se le da a reescribir: se vuelve a poner.
   */
  const otrasVersiones = async (a, n, otro = "") => {
    if (versionando) return;
    setVersionando(true);
    avisar(true, n === 1 ? "Escribiendo otra versión con la misma información…" : `Escribiendo ${n} versiones con la misma información…`);
    try {
      const { escena, cola } = api.partirEscena(ideaDelPedido(a.prompt));
      const r = await api.versionesDeIdea(client.id, { idea: escena, n, tipo: a.tipo, original: a.src });
      const con = await pedirOtras(a, r.versiones.map((v) => conOtraEscena(a.prompt, [v, cola].filter(Boolean).join(" "))), otro);
      setVisor(null);
      setEnPapelera(false);
      avisar(true, [`${r.versiones.length === 1 ? "Pedida 1 versión distinta" : `Pedidas ${r.versiones.length} versiones distintas`} con ${con}: aparecen en la galería.`, r.aviso ?? ""].filter(Boolean).join(" "));
    } catch (e) {
      avisar(false, e.message);
    } finally {
      // El visor se cierra también si falla: el aviso está en la pantalla de detrás.
      setVisor(null);
      setVersionando(false);
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  const subirArchivos = async (archivos, rol) => {
    if (!form || !modelo) return;
    setSubiendo(true);
    setAviso(null);
    try {
      let ultima = null;
      let repetidas = 0;
      const enCarpeta = !FILTROS_FIJOS.includes(filtro) ? filtro : null;
      for (const f of archivos.slice(0, 6)) {
        const subida = await api.subirImagen(client.id, f, { carpetaId: enCarpeta });
        ultima = subida.archivo;
        if (subida.repetido) repetidas += 1;
        const limite = { reference: modelo.referencias, start: modelo.inicial, end: modelo.final, video: modelo.video }[rol];
        setForm((fm) => ((fm.medios[rol] ?? []).length < (limite || 0) ? { ...fm, medios: { ...fm.medios, [rol]: [...(fm.medios[rol] ?? []), ultima] } } : fm));
      }
      avisar(true, api.fraseDeSubida(Math.min(archivos.length, 6), repetidas, rol === "video"));
      await cargar();
    } catch (err) {
      avisar(false, err.message);
    } finally {
      setSubiendo(false);
    }
  };

  /** «Desde Drive»: el archivo se baja de la carpeta del cliente y se sube a la galería como cualquier otro. */
  const traerDeDrive = async (elegidos) => {
    const rol = driveRol;
    setDriveRol(null);
    if (!rol || !elegidos?.length) return;
    try {
      const archivos = await Promise.all(elegidos.map(api.archivoDeDrive));
      await subirArchivos(archivos, rol);
    } catch (e) {
      avisar(false, e.message);
    }
  };

  /** Desde la pestaña Drive: lo tocado se trae a la galería y entra en el pedido (imagen inicial, referencia o video). */
  const traerDeDriveAlPedido = async (elegidos) => {
    if (!elegidos?.length || !form || !modelo) return;
    const video = elegidos[0].tipo === "video";
    const rol = video ? "video" : modelo.inicial && !form.medios.start.length ? "start" : "reference";
    if (!{ reference: modelo.referencias, start: modelo.inicial, video: modelo.video }[rol]) {
      avisar(false, video ? `${modelo.nombre} no sigue videos.` : `${modelo.nombre} no admite imágenes de referencia. Escoge otro modelo.`);
      return;
    }
    try {
      await subirArchivos(await Promise.all(elegidos.map(api.archivoDeDrive)), rol);
      enfocarPrompt();
    } catch (e) {
      avisar(false, e.message);
    }
  };

  // ---------- La galería ----------
  const accion = async (hacer, exito) => {
    try {
      await hacer();
      if (exito) avisar(true, exito);
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    }
  };
  const alternarFavorito = (a) => accion(async () => {
    const { archivo } = await api.cambiarArchivo(client.id, a.id, { favorito: !a.favorito });
    setVisor((v) => (v?.id === a.id ? archivo : v));
  });
  /** «Estampar el logo»: el original del kit encima, en su esquina; sale una pieza nueva y ésta se queda. */
  const estampar = (a) => accion(async () => {
    setVisor(await estamparEnGaleria({ clienteId: client.id, archivo: a, kit }));
  }, "Listo: sale como una pieza nueva con el logo encima; la original se queda.");
  const aPapelera = (a) => accion(async () => { await api.mandarAPapelera(client.id, a.id); setVisor(null); }, "Movida a la papelera. Puedes recuperarla 30 días.");
  /** Varias de una vez: una por una (cada una es su fila), y se relee la galería una sola vez al terminar. */
  // Varias de una vez (lo de la marca se salta y se dice: lib/estudio.js); se relee la galería una sola vez al terminar.
  const variasAPapelera = async (todas) => {
    try {
      avisar(true, await api.variasALaPapelera(client.id, todas, archivos));
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setSeleccion(null);
      await cargar();
    }
  };
  /** Las escogidas, en el orden en que se tocaron, a un carrusel (una tarjeta en la galería). */
  const agrupar = () => accion(async () => {
    await api.agruparComoCarrusel(client.id, [...seleccion].filter((id) => archivos.some((a) => a.id === id && a.tipo === "imagen")));
    setSeleccion(null);
  }, "Agrupadas como carrusel, en el orden en que las tocaste.");
  const alternarSeleccion = (a) => setSeleccion((sel) => {
    const nueva = new Set(sel ?? []);
    if (nueva.has(a.id)) nueva.delete(a.id); else nueva.add(a.id);
    return nueva;
  });
  /** Una ficha cuyo archivo ya no está: el servidor lo comprueba en R2 antes de quitarla. */
  const quitarPerdidas = (ids) => accion(async () => {
    for (const id of ids) await api.quitarPerdido(client.id, id);
    setPerdidos(new Set());
  }, ids.length === 1 ? "Quitada de la galería." : `${ids.length} quitadas de la galería.`);
  const recuperar = (a) => accion(() => api.recuperarArchivo(client.id, a.id), "Recuperada.");
  const moverA = (a, carpetaId) => accion(async () => {
    const { archivo } = await api.cambiarArchivo(client.id, a.id, { carpetaId: carpetaId || null });
    setVisor((v) => (v?.id === a.id ? archivo : v));
  });
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
  // Todo de una vez y qué se queda y por qué (lib/estudio.js).
  const vaciar = () => accion(async () => avisar(true, await api.vaciarDelTodo(client.id)));
  const descargar = (a) => {
    const enlace = document.createElement("a");
    enlace.href = a.src;
    enlace.download = nombreDeDescarga(a);
    enlace.click();
  };

  /** Ponerla en la publicación: se apunta el uso (para que la papelera no se la lleve) y se la pasa a quien abrió el diálogo. */
  const usarEnLaPublicacion = async (a) => {
    try {
      if (uso) await api.apuntarUso(client.id, a.id, uso);
      onUsar?.(a);
    } catch (e) {
      avisar(false, e.message);
    }
  };

  /** Un carrusel entero (o el video de un reel) a la publicación, en orden, con su uso apuntado. */
  const usarVarias = async (lista) => {
    try {
      if (uso) for (const a of lista) await api.apuntarUso(client.id, a.id, uso);
      setGrupoAbierto(null);
      onUsarVarias(lista);
    } catch (e) {
      avisar(false, e.message);
    }
  };
  /** «Mandar el carrusel a la papelera»: todo lo de su carpeta, también las crudas. */
  const grupoAPapelera = async (todas) => {
    const dicho = await api.variasALaPapelera(client.id, todas, archivos);
    setGrupoAbierto(null);
    avisar(true, dicho);
    await cargar();
  };

  // ---------- El kit de marca ----------
  const guardarKitDeMarca = async (nuevo) => {
    const r = await api.guardarKit(client.id, nuevo);
    setDatos((d) => (d ? { ...d, kit: r.kit } : d));
    avisar(true, "Kit de marca guardado: los presets ya lo usan.");
    return r.kit;
  };
  /** Fija (o suelta, con "") el modelo de ese tipo para ESTE cliente: va en su kit. */
  const fijar = async (tipo, id) => {
    try {
      await guardarKitDeMarca({ ...(kit ?? {}), modelos: { ...(kit?.modelos ?? {}), [tipo]: id || undefined } });
      avisar(true, id ? `Fijado para ${client.name}: arranca con él en el Estudio, el lote y «Producir el mes».` : "Ya no hay modelo fijado para este cliente.");
    } catch (e) {
      avisar(false, e.message);
    }
  };
  /** Fija (o suelta, con "") el estilo visual de un tipo de pieza para ESTE cliente: va en su kit. */
  const fijarEstilo = async (tipo, id) => {
    try {
      const actual = { ...(limpiarKit(kit).estiloPorTipo) };
      if (id) actual[tipo] = id; else delete actual[tipo];
      await guardarKitDeMarca({ ...(kit ?? {}), estiloPorTipo: actual });
      avisar(true, id ? `Las piezas «${TIPOS_PRESET[tipo]?.nombre ?? tipo}» de ${client.name} salen con el estilo ${nombreDeEstilo(kit, id)}.` : "El tipo vuelve a su estilo de siempre.");
    } catch (e) {
      avisar(false, e.message);
    }
  };
  const usarComoLogo = async (a) => {
    try {
      await guardarKitDeMarca({ ...(kit ?? {}), logo: a.clave });
      avisar(true, "Logo guardado: irá de referencia en cada imagen mientras se use el kit.");
    } catch (e) {
      avisar(false, e.message);
    }
  };
  const revisar = async (a) => {
    setRevisiones((r) => ({ ...r, [a.id]: { cargando: true } }));
    try {
      const datosRevision = await api.revisarMarca(client.id, a.id);
      setRevisiones((r) => ({ ...r, [a.id]: { datos: datosRevision } }));
    } catch (e) {
      setRevisiones((r) => ({ ...r, [a.id]: { error: e.message } }));
    }
  };

  // ---------- Carpetas ----------
  const crearCarpeta = async (e) => {
    e.preventDefault();
    if (!carpetaNueva?.trim()) return;
    try {
      const { carpeta } = await api.crearCarpeta(client.id, carpetaNueva);
      setCarpetaNueva(null);
      setFiltro(carpeta.id);
      await cargar();
    } catch (err) {
      avisar(false, err.message);
    }
  };
  const guardarNombre = async (e) => {
    e.preventDefault();
    try {
      await api.renombrarCarpeta(client.id, renombrando.id, renombrando.nombre);
      setRenombrando(null);
      await cargar();
    } catch (err) {
      avisar(false, err.message);
    }
  };
  const quitarCarpeta = (c) => accion(async () => { await api.borrarCarpeta(client.id, c.id); setFiltro("todas"); }, `Carpeta «${c.nombre}» quitada. Sus archivos siguen en la galería.`);

  // ---------- Derivados ----------
  const archivos = useMemo(() => datos?.archivos ?? [], [datos]);
  const carpetas = useMemo(() => datos?.carpetas ?? [], [datos]);
  const papelera = datos?.papelera ?? [];
  const cuentas = useMemo(() => contarFiltros(archivos, carpetas), [archivos, carpetas]);
  const visibles = useMemo(() => filtrarArchivos(archivos, { filtro, texto, modelo: modeloFiltro }), [archivos, filtro, texto, modeloFiltro]);
  // En «Todas», cada carrusel y cada reel es UNA tarjeta; en sus filtros (o en el de su carpeta), pieza a pieza.
  // En «Todas», un carrusel o un reel es UNA tarjeta y las versiones de una pieza también (lib/estudio.js).
  const vista = useMemo(() => (filtro === "todas" ? agruparGaleria(api.apilarVersiones(visibles, carpetas, datos?.trabajos), carpetas, archivos) : visibles), [visibles, carpetas, archivos, filtro, datos]);
  const carpetasPropias = useMemo(() => carpetas.filter((c) => !esGrupo(c)), [carpetas]);
  const abrirPieza = (a) => (seleccion ? alternarSeleccion(a) : destinoGaleria ? usarComoMedio(a, destinoGaleria) : setVisor(a));
  const enCurso = useMemo(() => trabajosVisibles(datos?.trabajos ?? [], { descartados }), [datos, descartados]);
  const carpetaActiva = carpetas.find((c) => c.id === filtro) ?? null;
  const soloPrueba = motores && !Object.entries(motores).some(([id, m]) => id !== "prueba" && m.activo);
  const llavesQueFaltan = Object.values(motores ?? {}).map((m) => m.llave).filter(Boolean);
  const enMedios = (a) => form && Object.values(form.medios).some((l) => l.some((x) => x.id === a.id));

  if (cargando || (!form && !error)) return <p role="status" className="est-nota">Cargando el Estudio…</p>;
  if (error && !datos) return <div className="est-error" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={cargar}>Reintentar</button></div>;

  const TituloH = dialogo ? "h3" : "h2";

  return (
    <section className={`estudio${dialogo ? " estudio-dialogo" : ""}`} aria-labelledby={`${ids}-h`}>
      <header className="est-cabecera">
        <div>
          <TituloH id={`${ids}-h`} className="est-titulo">{dialogo ? "Crear con IA" : "Estudio"}</TituloH>
          <p className="est-sub">
            {dialogo
              ? "Crea una imagen o un video para esta publicación, o escoge uno que ya hayas hecho."
              : `Crea imágenes y videos para ${client.name}. Cada uno queda aquí, con su prompt y lo que costó.`}
          </p>
        </div>
        {dialogo && onCerrar && <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>}
      </header>

      <div className="est-aviso-region" role="status" aria-live="polite">
        {aviso && (
          <p className={aviso.ok ? "est-aviso" : "est-aviso est-aviso-mal"}>
            {aviso.texto}
            <button type="button" className="btn-icon est-cerrar" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}><Icon name="close" size={16} /></button>
          </p>
        )}
      </div>

      {soloPrueba && (
        <p className="est-aviso est-aviso-info">
          Ahora mismo sólo está activo el motor de <strong>prueba</strong> (gratis): saca una tarjeta con tu texto, no una imagen ni un video reales.
          Para eso de verdad, el administrador tiene que poner la llave de un proveedor como secreto del Worker:{" "}
          {llavesQueFaltan.map((l, i) => <span key={l}>{i > 0 ? (i === llavesQueFaltan.length - 1 ? " o " : ", ") : ""}<code>{l}</code></span>)}.
        </p>
      )}

      {/* ---------- El kit de marca ---------- */}
      {!dialogo && datos && (
        <Suspense fallback={null}>
          <EstudioKit
            client={client}
            kit={kit}
            archivos={archivos}
            perdidas={datos.perdidas}
            onCambio={cargar}
            lectura={lectura}
            onPreparar={() => api.prepararKit(client.id)}
            onGuardar={guardarKitDeMarca}
          />
        </Suspense>
      )}

      {/* ---------- Un lote de anuncios por nivel de consciencia ---------- */}
      {!lectura && !dialogo && motores && (
        <div className="card est-lote-entrada">
          <div>
            <strong>En lote</strong>
            <p className="hint">De la idea a la imagen: anuncios en matriz (deseos × perfiles × niveles), por tipo de pieza o el MES completo con el ritmo del cliente. La IA escribe título, brief y texto de cada pieza, tú revisas y ves el costo, y cada una llega al calendario lista para revisión. O recrea con la marca un anuncio que te guste.</p>
          </div>
          <div className="est-lote-botones">
            <button type="button" className="btn btn-secondary" onClick={() => setLoteAbierto(true)}><Icon name="megaphone" size={16} /> Producir en lote</button>
            <button type="button" className="btn btn-secondary" onClick={() => setRecrear({ archivo: null })}><Icon name="refresh" size={16} /> Recrear un anuncio</button>
          </div>
        </div>
      )}
      {recrear && (
        <Suspense fallback={null}>
          <EstudioRecrear
            client={client} archivos={datos?.archivos ?? []} productosConFotos={datos?.productos ?? []} inicial={recrear.archivo}
            activos={activos}
            onCerrar={() => { setRecrear(null); cargar(); }} onCrear={desdeRecrear}
          />
        </Suspense>
      )}
      {loteAbierto && motores && datos && (
        <Suspense fallback={null}>
          <EstudioLote
            client={client} motores={motores} productosConFotos={datos?.productos ?? []} archivos={datos?.archivos ?? []} papelera={datos?.papelera ?? []} kit={kit}
            inicial={loteAbierto?.alcance ? loteAbierto : null}
            onCerrar={() => setLoteAbierto(false)} onHecho={cargar} onLlevar={onLlevarAlCalendario}
          />
        </Suspense>
      )}

      {/* ---------- Pedir ---------- */}
      {!lectura && form && modelo && guiado && (
        <Suspense fallback={<p className="hint">Cargando…</p>}>
          {(() => {
            const Flujo = guiado === "reel" ? FlujoReel : FlujoCarrusel;
            return (
              <Flujo
                key={`${guiado}-${vueltaGuiado}`} client={client}
                estudio={{ kit, productos: datos?.productos ?? [], archivos: datos?.archivos ?? [], activos }}
                inicial={{ preset: presetVigente }}
                cabecera={<QueCrear actual={guiado} guiados={GUIADOS} onCambiar={(t) => { if (GUIADOS.some(([x]) => x === t)) setGuiado(t); else { setGuiado(""); cambiarTipo(t); } }} />}
                onCreando={(si) => { if (!si) cargar(); }}
                // «Listo»: todo quedó en la galería; el flujo vuelve a empezar, limpio, para el siguiente.
                onListo={() => { setVueltaGuiado((n) => n + 1); cargar(); avisar(true, guiado === "reel" ? "Reel listo: está en la galería, en su carpeta." : "Carrusel listo: está en la galería, en su carpeta."); }}
              />
            );
          })()}
        </Suspense>
      )}
      {!lectura && form && modelo && !guiado && (
        <Compositor
          ids={ids} form={{ ...form, ajustes }} setForm={setForm} modelo={modelo} motores={motores} costo={costo}
          confirmando={confirmando} enviando={enviando} subiendo={subiendo} promptRef={promptRef}
          onEnviar={enviar} onConfirmar={() => enviar(true)} onNo={() => setConfirmando(null)}
          onModelo={cambiarModelo} onTipo={cambiarTipo} onQuitarMedio={quitarMedio} onMarcarReferencia={marcarReferencia} nombrado={nombrado} onSubirArchivos={subirArchivos}
          onDrive={client.driveFolder ? (rol) => setDriveRol(rol) : null}
          onGaleria={escogerDeLaGaleria}
          mejorando={mejorando} onMejorar={mejorarConIA} onVolverIdea={ideaAnterior != null ? volverAMiIdea : null}
          mejorarSolo={desdePost ? { activo: mejorarSolo, onCambiar: setMejorarSolo } : null}
          estilo={{
            preset: presetVigente, onPreset: setPreset, kitListo, kit: limpiarKit(kit), marca: client.name, textoPreset: textoDelPreset, refsTipo, sinIdea: !form.prompt.trim(),
            bloqueMarca, usarKit, onUsarKit: setUsarKit,
            estilo: estiloVigente, estiloResuelto: estiloDeEsta, nombreEstilo: nombreDeEstilo(kit, estiloDeEsta), lineaEstilo: lineaDelEstilo, onEstilo: setEstilo,
            fijadoTipo: limpiarKit(kit).estiloPorTipo[presetVigente.split("-")[0]] ?? "", onFijarEstilo: lectura ? null : fijarEstilo,
            conLogo, onConLogo: setConLogo, puedeLogo, estampa,
            angulos: datos?.angulos ?? [],
            onAngulo: (a) => { setConfirmando(null); setForm((f) => ({ ...f, prompt: ideaDesdeAngulo(a) })); },
            productos: modelo.referencias > 0 ? datos?.productos ?? [] : [],
            gustos: hayGustos && modelo.referencias > 0 ? { activo: conGustos, onCambiar: setConGustos, van: gustos.length } : null,
            personajes: modelo.referencias > 0 && limpiarKit(kit).personajes.length
              ? { lista: limpiarKit(kit).personajes, escogidos: personajesSel, onCambiar: setPersonajesSel, van: deLosPersonajes.length }
              : null,
            onProducto: ponerFotosDeProducto,
            plantillas: form.tipo === "imagen" && modelo.referencias > 0 && limpiarKit(kit).plantillas.length
              ? { lista: limpiarKit(kit).plantillas, escogida: plantillaSel, onCambiar: setPlantillaSel }
              : null,
          }}
          fijado={fijados[form.tipo] ?? ""} onFijar={(id) => fijar(form.tipo, id)}
          guiados={dialogo ? [] : GUIADOS} onGuiado={setGuiado}
          ideas={{
            generando: ideasGen.generando, lista: ideasGen.lista, conTema: Boolean(form.prompt.trim()),
            deTipo: presetVigente && !presetVigente.startsWith("propio-") ? presetVigente.split("-")[0] : "",
            onGenerar: generarIdeas, onUsar: usarIdeaGenerada, onCerrar: () => setIdeasGen((x) => ({ ...x, lista: [] })),
            nombreDeTipo: (id) => nombreDePilar(id) || nombreDePreset(id, kit),
            nombreDeProducto: (id) => ideasGen.productos.find((p) => p.id === id)?.nombre ?? "",
          }}
          guionCorto={{
            segundos: segundosGuion, escribiendo: escribiendoGuion, resultado: guion,
            onEscribir: escribirGuion, onUsar: usarGuion, onDescartar: () => setGuion(null),
          }}
        />
      )}

      {/* ---------- En curso ---------- */}
      {enCurso.length > 0 && (
        <ul className="est-trabajos" aria-label="Pedidos en curso">
          {enCurso.map((t) => (
            <li key={t.id} className={`est-trabajo est-trabajo-${t.estado}`}>
              <div className="est-trabajo-texto">
                <p className="est-trabajo-prompt">{t.prompt}</p>
                <p className="est-trabajo-estado">
                  {nombreDelModelo(t.modelo) || "Aplicación"} · {fraseDeTrabajo(t)}
                </p>
                {estaVivo(t.estado) && t.n > 1 && (
                  <progress className="est-progreso" max={t.n} value={t.archivos?.length ?? 0} aria-label={`${t.archivos?.length ?? 0} de ${t.n}`} />
                )}
                {estaVivo(t.estado) && t.tipo === "video" && <p className="hint">Un video tarda de uno a diez minutos. Puedes cerrar esta pantalla: sigue solo.</p>}
              </div>
              {!lectura && (
                <div className="est-trabajo-acciones">
                  {estaVivo(t.estado) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => accion(() => api.cancelarTrabajo(client.id, t.id))}>Cancelar</button>}
                  {(t.estado === "fallido" || t.estado === "cancelado") && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => accion(async () => { await api.reintentarTrabajo(client.id, t.id); seguir(t.id); })}>Reintentar</button>
                  )}
                  {!estaVivo(t.estado) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDescartados((s) => new Set(s).add(t.id))}>Descartar</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Galería ---------- */}
      <div className="est-galeria-cabecera" ref={galeriaRef}>
        {destinoGaleria && (
          <p className="notice est-destino" role="status">
            Toca una imagen para ponerla como <strong>{NOMBRE_RANURA[destinoGaleria]}</strong>.
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDestinoGaleria(null)}>Cancelar</button>
          </p>
        )}
        <h3 className="est-subtitulo">{enPapelera ? "Papelera" : enDrive ? "Drive de " + client.name : "Galería"}</h3>
        <div className="est-filtros" role="group" aria-label="Filtrar la galería">
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && !enDrive && filtro === "todas"} onClick={() => { setEnPapelera(false); setEnDrive(false); setFiltro("todas"); }}>Todas ({cuentas.todas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && !enDrive && filtro === "favoritas"} onClick={() => { setEnPapelera(false); setEnDrive(false); setFiltro("favoritas"); }}><Icon name="heart" size={13} /> Me gusta ({cuentas.favoritas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && !enDrive && filtro === "subidas"} onClick={() => { setEnPapelera(false); setEnDrive(false); setFiltro("subidas"); }}>Subidas ({cuentas.subidas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && !enDrive && filtro === "usadas"} onClick={() => { setEnPapelera(false); setEnDrive(false); setFiltro("usadas"); }} title="Las que ya están en una publicación">Usadas ({cuentas.usadas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && !enDrive && filtro === "sin-usar"} onClick={() => { setEnPapelera(false); setEnDrive(false); setFiltro("sin-usar"); }}>Sin usar ({cuentas["sin-usar"]})</button>
          {carpetas.filter((c) => !esGrupo(c) || filtro === c.id).map((c) => (
            <button key={c.id} type="button" className="filter-chip" aria-pressed={!enPapelera && !enDrive && filtro === c.id} onClick={() => { setEnPapelera(false); setEnDrive(false); setFiltro(c.id); }}>
              <Icon name={esGrupo(c) ? (c.tipo === "reel" ? "video" : "copy") : "folder"} size={13} /> {c.nombre} ({cuentas[c.id] ?? 0})
            </button>
          ))}
          {!lectura && carpetaNueva === null && (
            <button type="button" className="filter-chip est-chip-nueva" onClick={() => setCarpetaNueva("")}><Icon name="plus" size={13} /> Carpeta</button>
          )}
          {client.driveFolder && (
            <button type="button" className="filter-chip" aria-pressed={!enPapelera && enDrive} onClick={() => { setEnPapelera(false); setEnDrive(true); }}><Icon name="cloud" size={13} /> Drive</button>
          )}
          <button type="button" className="filter-chip" aria-pressed={enPapelera} onClick={() => setEnPapelera(true)}><Icon name="trash" size={13} /> Papelera ({papelera.length})</button>
        </div>
        {carpetaNueva !== null && (
          <form className="est-carpeta-form" onSubmit={crearCarpeta}>
            <label className="est-solo-lector" htmlFor={`${ids}-cn`}>Nombre de la carpeta</label>
            <input id={`${ids}-cn`} className="input" value={carpetaNueva} maxLength={40} autoFocus placeholder="Nombre de la carpeta" onChange={(e) => setCarpetaNueva(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!carpetaNueva.trim()}>Crear</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCarpetaNueva(null)}>Cancelar</button>
          </form>
        )}
        {!enPapelera && !enDrive && carpetaActiva && !lectura && (
          renombrando ? (
            <form className="est-carpeta-form" onSubmit={guardarNombre}>
              <label className="est-solo-lector" htmlFor={`${ids}-rn`}>Nuevo nombre</label>
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
        {!enPapelera && !enDrive && !lectura && visibles.length > 0 && (
          <div className="est-seleccion" role="group" aria-label="Seleccionar varias">
            {seleccion ? (
              <>
                <span className="est-seleccion-cuenta">{seleccion.size} seleccionada{seleccion.size === 1 ? "" : "s"}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(new Set(visibles.map((a) => a.id)))}>Todas las que se ven</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={seleccion.size < 2 || lectura} onClick={agrupar}>Agrupar como carrusel</button>
                <button type="button" className="btn btn-danger btn-sm" disabled={!seleccion.size} onClick={() => variasAPapelera([...seleccion])}>
                  <Icon name="trash" size={14} /> Mandar {seleccion.size || ""} a la papelera
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(null)}>Cancelar</button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(new Set())}><Icon name="checkSquare" size={14} /> Seleccionar</button>
            )}
          </div>
        )}
        {!enPapelera && !enDrive && perdidos.size > 0 && !lectura && (
          <p className="est-aviso est-aviso-mal est-perdidos">
            {perdidos.size === 1 ? "Una pieza de la galería ya no tiene su archivo." : `${perdidos.size} piezas de la galería ya no tienen su archivo.`}{" "}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitarPerdidas([...perdidos])}>Quitarlas de la galería</button>
          </p>
        )}
        {!enPapelera && !enDrive && archivos.length > 1 && (
          <div className="est-buscar">
            <label className="est-solo-lector" htmlFor={`${ids}-b`}>Buscar en la galería</label>
            <input id={`${ids}-b`} type="search" className="input" placeholder="Buscar por lo que pediste o el modelo…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <FiltroDeModelo archivos={archivos} valor={modeloFiltro} onCambiar={setModeloFiltro} />
          </div>
        )}
      </div>

      {enDrive && !enPapelera ? (
        <div className="est-drive">
          {!lectura && <p className="hint" style={{ marginTop: 0 }}>Toca una imagen para traerla a la galería y ponerla en el pedido (de referencia, o de imagen inicial en un video).</p>}
          <ExploradorDrive
            clienteId={client.dbId || client.id} raiz={idDeCarpeta(client.driveFolder)} modo="escoger" tipos={["imagen", "video"]} maximo={1} pulso={pulso}
            onSelect={lectura ? undefined : traerDeDriveAlPedido}
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
      ) : visibles.length === 0 ? (
        <p className="est-vacio">No hay nada con ese filtro.</p>
      ) : (
        <ul className="est-rejilla">
          {vista.map((a) => {
            if (a.grupo) {
              const { carpeta, piezas, portada } = a.grupo;
              const nombre = textoDeGrupo(carpeta, piezas);
              return (
                <li key={a.id} className="est-tarjeta est-tarjeta-grupo">
                  <button type="button" className="est-img" aria-label={`Abrir ${nombre}: ${carpeta.nombre}`} onClick={() => setGrupoAbierto(a.grupo)}>
                    <Pieza archivo={portada} />
                    <span className="est-marca-grupo"><Icon name={carpeta.tipo === "reel" ? "video" : "copy"} size={12} /> {nombre}</span>
                    {piezas.some(estaUsado) && <span className="est-marca-usada">Usado</span>}
                  </button>
                  <div className="est-pie">
                    <p className="est-prompt" title={carpeta.nombre}>{carpeta.nombre}</p>
                    <p className="est-meta">{nombre} · {hace(portada.creado)}</p>
                  </div>
                </li>
              );
            }
            const escena = ideaDelPedido(a.prompt);
            const marcada = Boolean(seleccion?.has(a.id));
            const perdida = perdidos.has(a.id);
            return (
            <li key={a.id} className={`est-tarjeta${marcada ? " est-tarjeta-marcada" : ""}`}>
              <button
                type="button" className="est-img" data-control={a.ajustes?.control?.estado}
                aria-label={seleccion ? `${marcada ? "Quitar de" : "Añadir a"} la selección: ${escena}` : destinoGaleria ? `Poner como ${NOMBRE_RANURA[destinoGaleria]}: ${escena}` : `Abrir: ${escena}`}
                aria-pressed={seleccion ? marcada : undefined}
                onClick={() => abrirPieza(a)}
              >
                {perdida ? (
                  <span className="est-perdida"><Icon name="alert" size={20} /> Archivo perdido</span>
                ) : (
                  <Pieza archivo={a} onError={() => setPerdidos((p) => (p.has(a.id) ? p : new Set(p).add(a.id)))} />
                )}
                {a.tipo === "video" && <span className="est-marca-video"><Icon name="video" size={12} /> Video</span>}
                {enMedios(a) && <span className="est-marca-ref">En el pedido</span>}
                {a.deLaMarca && <span className="est-marca-marca" title={a.deLaMarca}><Icon name="lock" size={12} /> Marca</span>}
                {a.anteriores && <span className="est-marca-grupo">{a.anteriores.length + 1} versiones</span>}
                {estaUsado(a) && <span className="est-marca-usada" title={`En ${a.usadoEn.length} publicación${a.usadoEn.length === 1 ? "" : "es"}`}>Usada</span>}
                {seleccion && <span className="est-marca-check" aria-hidden="true"><Icon name={marcada ? "checkSquare" : "square"} size={18} /></span>}
              </button>
              {!lectura && !seleccion && !a.deLaMarca && (
                <button type="button" className="btn-icon est-a-papelera" aria-label={`Mandar a la papelera: ${escena}`} title="Mandar a la papelera" onClick={() => aPapelera(a)}>
                  <Icon name="trash" size={16} />
                </button>
              )}
              <div className="est-pie">
                <p className="est-prompt" title={a.prompt}>{escena}</p>
                <p className="est-meta">{modeloDeLaPieza(a)}{a.costo > 0 ? ` · ${textoCosto(a.costo)}` : ""} · {hace(a.creado)}</p>
                {onUsar && (
                  <button type="button" className="btn btn-primary btn-sm est-usar" onClick={() => usarEnLaPublicacion(a)}>
                    <Icon name="check" size={14} /> {inicial?.etiquetaUsar ?? "Usar en la publicación"}
                  </button>
                )}
                <div className="est-acciones">
                  {!lectura && (
                    <>
                      <button type="button" className="btn-icon est-me-gusta" aria-pressed={a.favorito} aria-label={a.favorito ? "Quitar «Me gusta»" : "Me gusta"} title="Me gusta: el cerebro aprende de lo que eliges" onClick={() => alternarFavorito(a)}>
                        <Icon name="heart" size={18} />
                      </button>
                      {a.tipo !== "video" && !a.subido && a.modelo && (
                        <button
                          type="button" className="btn-icon" disabled={versionando}
                          aria-label={`Otra versión: la misma información con otra escena${costoDeOtra(a) != null ? ` (${textoCosto(costoDeOtra(a))})` : ""}`}
                          title={`Otra versión: la misma información con otra escena${costoDeOtra(a) != null ? ` · ${textoCosto(costoDeOtra(a))}` : ""}`}
                          onClick={() => otrasVersiones(a, 1)}
                        >
                          <Icon name="sparkles" size={18} />
                        </button>
                      )}
                      {a.tipo !== "video" && (
                        <>
                          <button type="button" className="btn-icon" aria-pressed={enMedios(a)} aria-label={enMedios(a) ? "Quitar del pedido" : "Usar de referencia"} title="Usar de referencia" onClick={() => (enMedios(a) ? quitarMedio(Object.keys(form.medios).find((rol) => form.medios[rol].some((x) => x.id === a.id)), a) : usarComoMedio(a))}>
                            <Icon name="paperclip" size={18} />
                          </button>
                          <button type="button" className="btn-icon" aria-label="Animar: convertirla en video" title="Animar: convertirla en video" onClick={() => animar(a)}>
                            <Icon name="video" size={18} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <OverflowMenu items={[
                    { icon: "download", label: "Descargar", onClick: () => descargar(a) },
                    ...(perdida && !lectura ? [{ icon: "close", label: "Quitar de la galería", danger: true, onClick: () => quitarPerdidas([a.id]) }] : []),
                  ]} />
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      <p className="est-precios">Los precios son aproximados y de {new Date(PRECIOS_AL).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" })}. Lo que se gasta aquí suma al presupuesto de IA del mes.</p>

      {eligiendoRanura && (
        <Suspense fallback={null}>
          <EleccionRanura
            archivo={eligiendoRanura.archivo} opciones={eligiendoRanura.opciones} modelo={modelo}
            onElegir={(rol) => usarComoMedio(eligiendoRanura.archivo, rol)} onCerrar={() => setEligiendoRanura(null)}
          />
        </Suspense>
      )}
      {driveRol && (
        <BancoSelector
          clientId={client.dbId || client.id}
          driveFolder={client.driveFolder}
          tipos={driveRol === "video" ? ["video"] : ["image"]}
          maximo={driveRol === "reference" ? Math.max(1, (modelo?.referencias ?? 1) - (form?.medios.reference.length ?? 0)) : 1}
          titulo={driveRol === "video" ? "Traer un video de Drive" : "Traer imágenes de Drive"}
          onSelect={traerDeDrive}
          onClose={() => setDriveRol(null)}
        />
      )}

      {grupoAbierto && (
        <Suspense fallback={null}>
          <VisorGrupo
            grupo={grupoAbierto} onCerrar={() => setGrupoAbierto(null)}
            todas={archivos.filter((a) => a.carpetaId === grupoAbierto.carpeta.id)}
            onUsar={onUsarVarias ? usarVarias : null} onPapelera={lectura ? null : grupoAPapelera}
            onAbrir={(a) => { setGrupoAbierto(null); abrirPieza(a); }}
            onSueltas={() => { setFiltro(grupoAbierto.carpeta.id); setGrupoAbierto(null); }}
            onOrdenar={lectura ? null : (orden) => api.ordenarCarpeta(client.id, grupoAbierto.carpeta.id, orden).then(cargar)}
            onDesagrupar={lectura ? null : () => api.desagrupar(client.id, grupoAbierto.carpeta.id).then(() => { setGrupoAbierto(null); return cargar(); })}
          />
        </Suspense>
      )}
      {visor && (
        <Visor
          archivo={visor} carpetas={carpetasPropias} lectura={lectura} cliente={client}
          onCerrar={() => setVisor(null)}
          onFavorito={() => alternarFavorito(visor)}
          onPapelera={() => aPapelera(visor)}
          onMover={(c) => moverA(visor, c)}
          onRepetir={() => repetir(visor)}
          onRecrear={dialogo && !inicial?.abrir ? null : () => { const a = visor; setVisor(null); setRecrear({ archivo: a }); }}
          costoOtra={costoDeOtra(visor)}
          onOtraIgual={(otro) => otraIgual(visor, otro)}
          onOtrasVersiones={(n, otro) => otrasVersiones(visor, n, otro)}
          versionando={versionando}
          onReferencia={() => { const a = visor; setVisor(null); usarComoMedio(a); }}
          onAnimar={() => animar(visor)}
          onEditar={(instruccion, ejemplos, otro) => editar(visor, instruccion, ejemplos, otro)}
          activos={activos}
          desdePost={inicial?.abrir?.id === visor.id ? inicial : null}
          galeria={datos?.archivos ?? []}
          clienteId={client.id}
          onEstampar={limpiarKit(kit).logo && visor.tipo !== "video" ? () => estampar(visor) : null}
          original={originalDe(visor, datos?.trabajos ?? [], datos?.archivos ?? [])} anteriores={visor.anteriores}
          onVerOriginal={(o) => setVisor(o)}
          onPlantilla={(r) => setDatos((d) => (d ? { ...d, kit: r.kit } : d))}
          onUsar={onUsar ? () => usarEnLaPublicacion(visor) : null} etiquetaUsar={inicial?.etiquetaUsar}
          esLogo={Boolean(kit?.logo) && kit.logo === visor.clave}
          onLogo={/^image\/(png|jpeg|webp)$/.test(visor.mime ?? "") ? () => usarComoLogo(visor) : null}
          revision={revisiones[visor.id] ?? null}
          onRevisar={kitVacio(kit) || !/^image\/(png|jpeg|webp|gif)$/.test(visor.mime ?? "") ? null : () => revisar(visor)}
          onCorregir={(sugerencia) => {
            const a = visor;
            setVisor(null);
            setForm((f) => ({ ...f, prompt: `${ideaDelPedido(a.prompt)} ${sugerencia}`.trim().slice(0, MAX_PROMPT) }));
            enfocarPrompt();
          }}
        />
      )}
    </section>
  );
}
