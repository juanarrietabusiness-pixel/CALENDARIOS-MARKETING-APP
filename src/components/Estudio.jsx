import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import Visor from "./EstudioVisor";
import {
  kitVacio, limpiarKit, textoPreset, bloqueDeMarca, presetActual, ponerLogo, nombreDePreset,
  estiloDeLaPieza, lineaDeEstilo, nombreDeEstilo, estiloValido, TIPOS_PRESET, referenciaDePlantilla, lineaDePlantillaEnPedido,
} from "../lib/kitMarca";
import { presetDePilar, nombreDePilar } from "../lib/pilares";
import { ideaDesdeAngulo } from "../lib/estudioMercado";
import { pedidoDePieza, apoyosDelCompositor, lineaDeTexto } from "../lib/pieza";
import { segundosParaModelo, ajusteDeDuracion } from "../lib/videoCorto";
import BancoSelector from "./BancoSelector";
import { soloLectura } from "../lib/sesionActual";
import * as api from "../lib/estudio";
import { MEDIOS_VACIOS, recortarMedios, clavesDe, formularioInicial } from "../lib/estudio";
import { estampaSola, estamparEnGaleria } from "../lib/logoEstudio";
import {
  modeloPorId, nombreDelModelo, estimar, ajustesDe, estaVivo, maxPorPedido, PRECIOS_AL, MAX_PROMPT,
} from "../lib/estudioCatalogo";
import { decidirConfirmacion } from "../lib/sinPreguntar";
import {
  trabajosVisibles, fraseDeTrabajo, nombreDeDescarga, proporcionDeMedidas, originalDe, FILTROS_GALERIA, esGrupo,
} from "../lib/estudio";
import { loteDeLaDireccion } from "../lib/lotePauta";
import "./Estudio.css";

// El compositor (crear A MANO) va en su chunk: el del Estudio estaba en su tope (20,5 kB). «Qué crear» sale del mismo.
const Compositor = lazy(() => import("./EstudioCompositor"));
const QueCrear = lazy(() => import("./EstudioCompositor").then((m) => ({ default: m.QueCrear })));
// «De la galería» del compositor: varias de una vez en un diálogo (sin bajar y subir la página).
const EstudioElegir = lazy(() => import("./EstudioElegir"));
const EstudioLote = lazy(() => import("./EstudioLote"));
// La tarjeta «Muchas de una vez» (casi todo texto): aparte, el chunk del Estudio está en su tope.
const EstudioMuchas = lazy(() => import("./EstudioMuchas"));
// Sólo cuando una imagen de la galería cabe en más de un sitio: aparte, el chunk del Estudio está en su tope.
const EleccionRanura = lazy(() => import("./EleccionRanura"));
const EstudioRecrear = lazy(() => import("./EstudioRecrear"));
const FlujoCarrusel = lazy(() => import("./FlujoCarrusel"));
const FlujoReel = lazy(() => import("./FlujoReel"));
/** La proporción que fija cada formato de «Qué» (el carrusel y el video van por su flujo). */
const PROPORCION_FORMATO = { post: "4:5", historia: "9:16" };

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
// La galería (vistas, filtros, semanas, «Cargar más», seleccionar, la papelera y Drive), en su chunk: el del Estudio
// está en su tope de 20 kB comprimidos.
const EstudioGaleria = lazy(() => import("./EstudioGaleria"));

const reemplazar = (lista = [], t) => (lista.some((x) => x.id === t.id) ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]);

export default function Estudio({ client, pulso = 0, modo = "pestana", inicial = null, uso = null, onUsar = null, onUsarVarias = null, onCerrar = null, onLlevarAlCalendario = null, onDatos = null, onIrAlKit = null, aMano = false, onAMano = null }) {
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
  // Un flujo guiado abierto en lugar del compositor ("" = el compositor de imagen o video), y el tipo de video escogido
  // en «Qué» («clip» es el compositor de video; los demás, el reel guiado en esa forma).
  const [guiado, setGuiado] = useState("");
  const [vueltaGuiado, setVueltaGuiado] = useState(0);
  const [tipoVideo, setTipoVideo] = useState("guion");
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
  // «¿Dónde va esta imagen?» y «De la galería» de un sitio del compositor (un diálogo: varias de una vez).
  const [eligiendoRanura, setEligiendoRanura] = useState(null);
  const [eligiendoDeGaleria, setEligiendoDeGaleria] = useState(null); // el sitio («reference», «start», «end») o null
  const galeriaRef = useRef(null);
  // La galería: lo que no se pudo pintar (el archivo ya no está). Lo demás (vistas, filtros, selección) es suyo.
  const [perdidos, setPerdidos] = useState(() => new Set());
  // La revisión de marca de cada imagen: id → { cargando } | { datos } | { error }.
  const [revisiones, setRevisiones] = useState({});

  const [filtro, setFiltro] = useState("todas");
  // Hasta dónde se cargó la galería con «Cargar más» (una fecha): `cargar` relee eso, no sólo la primera página.
  const hastaRef = useRef(null);
  const [enPapelera, setEnPapeleraEstado] = useState(false);
  // La carpeta de Drive del cliente, dentro de la galería: de ahí se traen referencias sin salir.
  const [enDrive, setEnDrive] = useState(false);
  const setEnPapelera = (v) => { setEnPapeleraEstado(v); if (v) setEnDrive(false); };
  const [visor, setVisor] = useState(null);
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [descartados, setDescartados] = useState(() => new Set());
  // El lote abierto por la dirección (lib/lotePauta.js): «?lote=mes» desde «Producir el mes», «?lote=pauta» desde
  // «Producir los anuncios que faltan» del plan de campañas y «?lote=anuncios» desde la revisión 3Q.
  const [loteAbierto, setLoteAbierto] = useState(() => {
    const q = modo === "pestana" ? new URLSearchParams(window.location.search) : null;
    return !lectura && q ? loteDeLaDireccion(q) : false;
  });
  useEffect(() => {
    if (loteAbierto?.alcance) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [loteAbierto]);
  const [recrear, setRecrear] = useState(null); // null, o { archivo }: «Recrear un anuncio» abierto (con uno ya escogido)
  // Lo manual (el compositor, los flujos, muchas de una vez) se ve en Crear → «A mano» (`aMano`) y siempre en el diálogo
  // de una publicación. Si algo pone una pieza en el compositor desde otra sub-sección, se va a «A mano» (`enfocarPrompt`).
  const conCompositor = dialogo || aMano;
  // Lo último que salió del compositor (se enseña ahí mismo) y lo que se espera en el visor (la corrección, la versión).
  const [ultimas, setUltimas] = useState([]);
  const [enCamino, setEnCamino] = useState(null); // { desde: id de la pieza tocada, texto } o null
  const visorRef = useRef(null);
  visorRef.current = visor;
  // ¿Se ve el compositor? Si no (se bajó a la galería, o se está en otra sub-sección), la tira «En el pedido» lo dice
  // abajo: así escoger referencias en la galería no hace saltar la página. (Ref con limpieza, de React 19.)
  const [compositorALaVista, setCompositorALaVista] = useState(false);
  const zonaCompositor = useCallback((el) => {
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setCompositorALaVista(e.isIntersecting), { threshold: 0.02 });
    io.observe(el);
    return () => { io.disconnect(); setCompositorALaVista(false); };
  }, []);

  const siguiendo = useRef(new Set());
  const montado = useRef(true);
  const promptRef = useRef(null);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // ---------- Cargar ----------
  const cargar = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([api.leerEstudio(client.id, { hasta: hastaRef.current }), api.leerMotores()]);
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

  useEffect(() => { hastaRef.current = null; }, [client.id]);
  useEffect(() => { cargar(); }, [cargar, pulso]);
  // Crear calcula con esto el semáforo del kit (el logo, las fotos del catálogo) sin pedirlo otra vez.
  useEffect(() => { if (datos) onDatos?.(datos); }, [datos, onDatos]);

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
    // En la pestaña arranca en «Post» (4:5): el formato fija la proporción. Desde una publicación, la de su formato.
    if (motores && datos && !form) setForm(formularioInicial(motores, inicial ?? (dialogo ? null : { proporcion: PROPORCION_FORMATO.post }), datos.productos ?? [], datos.kit?.modelos ?? {}));
  }, [motores, datos, form, inicial, dialogo]);

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
  // El kit va en TODA pieza si el cliente lo tiene (decisión de la agencia: ya no es una casilla recordada por navegador).
  const conKit = kitListo;
  const bloqueMarca = conKit ? bloqueDeMarca(kit) : "";
  const puedeLogo = Boolean(conKit && form && modelo && ponerLogo({ kit, tipo: form.tipo, modelo, referencias: clavesDe(form.medios).reference }));
  // Con el logo estampado (kit), el modelo no lo recibe: la aplicación lo pega encima al terminar.
  const estampa = Boolean(conKit && form && form.tipo !== "video" && estampaSola(kit));
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
        setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, t) } : d));
        const hechas = t.archivos?.length ?? 0;
        if (hechas !== vistas) { vistas = hechas; cargar(); } // las piezas van apareciendo
        if (!estaVivo(t.estado)) break;
        // Otro tiene el paso, el motor pidió esperar (saturación) o el video aún se hace: sin prisa.
        // Si no, el siguiente ya. Nunca más de 15 s: por si acaso se cierra el diálogo y hay que enterarse.
        await dormir(Math.min(15_000, Math.max(r.espera ?? 0, r.ocupado ? 2500 : t.nota ? 3000 : 200)));
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
  // Llevar el foco a la idea. Desde fuera del compositor («Animar» en la galería, una idea, el recreador) también se baja
  // hasta él —o se va a «A mano»—; desde dentro (la ficha del director, «Volver a mi idea») sólo el foco, sin mover la
  // página. El compositor se carga aparte: se espera unos cuadros a que esté.
  const [pedirFoco, setPedirFoco] = useState(null); // { desplazar } o null
  const enfocarPrompt = ({ desplazar = true } = {}) => {
    if (!conCompositor) onAMano?.();
    setPedirFoco({ desplazar, n: Date.now() });
  };
  useEffect(() => {
    if (!pedirFoco || !conCompositor) return;
    let vueltas = 0;
    let id = 0;
    const probar = () => {
      const campo = promptRef.current;
      if (!campo) { if (vueltas++ < 60) id = requestAnimationFrame(probar); return; }
      campo.focus({ preventScroll: true });
      if (pedirFoco.desplazar) campo.scrollIntoView?.({ block: "center", behavior: "smooth" });
    };
    id = requestAnimationFrame(probar);
    return () => cancelAnimationFrame(id);
  }, [pedirFoco, conCompositor]);

  const cambiarTipo = (tipo, proporcion = null) => {
    if (!motores || tipo === form.tipo) return;
    const m = api.modeloPreferido(activos, tipo, fijados[tipo]);
    setConfirmando(null);
    setForm((f) => {
      const medios = recortarMedios(f.medios, m);
      return { ...f, tipo, modelo: m.id, n: 1, medios, ajustes: ajustesDe(m, { aspectRatio: proporcion ?? f.ajustes.aspectRatio }, clavesDe(medios)) };
    });
  };

  /**
   * «Qué crear»: Post (4:5) e Historia (9:16) son una imagen con su proporción; Carrusel, su flujo por láminas; Video,
   * el tipo escogido debajo (el clip es el compositor de video; los demás, el reel guiado en esa forma).
   */
  const cambiarFormato = (formato, tipoV = tipoVideo) => {
    setConfirmando(null);
    if (formato === "carrusel") { setGuiado("carrusel"); return; }
    if (formato === "video") {
      setTipoVideo(tipoV);
      if (tipoV !== "clip" && !dialogo) { setGuiado("reel"); return; }
      setGuiado("");
      cambiarTipo("video", "9:16");
      return;
    }
    setGuiado("");
    const proporcion = PROPORCION_FORMATO[formato];
    if (form.tipo !== "imagen") { cambiarTipo("imagen", proporcion); return; }
    setForm((f) => ({ ...f, ajustes: ajustesDe(modeloPorId(f.modelo), { ...f.ajustes, aspectRatio: proporcion }, clavesDe(f.medios)) }));
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
        // El texto exacto escrito en su campo: el director lo pone tal cual en la ficha.
        ...(form.tipo === "imagen" && form.texto?.trim() ? { texto: form.texto.trim() } : {}),
        // «¿Qué quieres?» de la publicación manda; y la plantilla que escoja el director va de referencia (enviar).
        indicacion: inicial?.abrir ? "" : inicial?.indicacion ?? "", plantilla: form.tipo === "imagen" ? plantillaSel : "",
      });
      if (form.tipo === "imagen" && r.plantilla && !plantillaSel) setPlantillaSel(r.plantilla);
      setConfirmando(null);
      setIdeaAnterior(antes);
      setForm((f) => ({ ...f, prompt: r.idea.slice(0, MAX_PROMPT) }));
      // La de al abrir desde un post se queda en él: la próxima vez sale lista (lib/promptImagen.js).
      if (alAbrir && form.tipo === "imagen") inicial?.alMejorar?.(r.idea);
      avisar(true, ["Listo: revísala antes de crear.", r.aviso ?? ""].filter(Boolean).join(" "));
      enfocarPrompt({ desplazar: false });
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

  // Al abrir desde una publicación, el DIRECTOR la diseña sola (siempre: ya no se apaga por navegador): su idea + el texto
  // de la pieza + el contexto llegan juntos y largos. Una vez por apertura, y «Volver a mi idea» lo deshace. Es texto.
  const yaMejorado = useRef(false);
  useEffect(() => {
    if (yaMejorado.current || !desdePost || lectura || !form?.prompt?.trim()) return;
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
    // La escena a la idea y su texto a «Texto exacto»: cada cosa en su campo.
    setForm((f) => ({ ...f, prompt: String(idea.escena ?? "").slice(0, MAX_PROMPT), ...(f.tipo === "video" ? {} : { texto: String(idea.texto ?? "").slice(0, 300) }) }));
    setPreset(presetDePilar(idea.tipo));
    if (form.tipo === "imagen" && idea.productoId) ponerFotosDeProducto(idea.productoId);
    avisar(true, "Idea puesta en el pedido. Revísala (o pulsa «Ver la ficha del director») y crea.");
    enfocarPrompt();
  };

  /** Deshace la mejora: vuelve lo que la persona había escrito. */
  const volverAMiIdea = () => {
    if (ideaAnterior == null) return;
    setForm((f) => ({ ...f, prompt: ideaAnterior }));
    setIdeaAnterior(null);
    enfocarPrompt({ desplazar: false });
  };

  const enviar = async (confirmado = false) => {
    if (!form || !modelo || enviando) return;
    if (!form.prompt.trim()) {
      avisar(false, "Escribe qué quieres crear.");
      promptRef.current?.focus();
      return;
    }
    // Desde 0,50 $ se pregunta, salvo «crear imágenes sin preguntar» del espacio con una imagen dentro del tope.
    if (!confirmado && decidirConfirmacion({ tope: datos?.sinPreguntar, costo, tipo: form.tipo }).preguntar) { setConfirmando(costo); return; }
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
      // El texto exacto de su campo, con la línea de siempre (si la idea ya es una ficha con su «Texto exacto», no se repite).
      const textoExacto = form.tipo === "imagen" ? String(form.texto ?? "").trim() : "";
      // El MISMO camino que el lote y «Producir el mes» (lib/pieza.js); aquí la resolución la escoge la persona.
      const pieza = pedidoDePieza({
        kit, idea: form.prompt, preset: presetVigente, estilo: estiloVigente, apoyos: refs, modelo, marca: client.name, rubro: client.industry ?? "",
        usarKit: conKit, conLogo, video: form.tipo === "video", altaResolucion: false, ajustes: form.ajustes, n: form.n,
        extra: [textoExacto && !/texto exacto/i.test(form.prompt) ? lineaDeTexto(textoExacto) : "", dePlantilla ? lineaDePlantillaEnPedido(kit, plantillaSel) : ""].filter(Boolean).join(" "),
      });
      const medios = { ...clavesDe(form.medios), ...pieza.medios };
      const pedido = { modelo: form.modelo, prompt: pieza.prompt, n: form.n, ajustes: ajustesDe(modelo, form.ajustes, medios), medios };
      if (form.tipo === "imagen") {
        // Por el SERVIDOR, como el lote (lib/visorEstudio.js): control, proporción y logo aunque se cierre la pantalla.
        const v = await import("../lib/visorEstudio");
        await v.pedirDelCompositor({
          clienteId: client.id, ...pedido, kit, estampar: estampa && conLogo, uso, texto: textoExacto, seguir: () => montado.current,
          alFallo: (t) => montado.current && avisar(false, t),
          // Lo que sale se enseña ahí mismo, bajo «Crear», con su visor a un toque.
          alListo: (nuevas) => { if (!montado.current) return; setUltimas(nuevas); cargar(); },
        });
        cargar();
      } else {
        const { trabajo } = await api.pedirImagenes(client.id, { ...pedido, confirmado: true, ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}) });
        setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
        seguir(trabajo.id);
      }
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

  /** Tocar otra vez un producto puesto: sus fotos salen del pedido (las de los demás se quedan). */
  const quitarFotosDeProducto = (productoId) => {
    const p = (datos?.productos ?? []).find((x) => x.id === productoId);
    if (!p) return;
    setConfirmando(null);
    setForm((f) => ({ ...f, medios: { ...f.medios, reference: f.medios.reference.filter((x) => x.producto?.nombre !== p.nombre) } }));
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
    setConfirmando(null);
    setForm((f) => ({ ...f, medios: { ...f.medios, [destino]: [...f.medios[destino], a] } }));
    // Sin mover la página (antes subía al compositor con cada imagen): la tira de abajo dice cuántas van.
    const max = destino === "reference" ? modelo.referencias : 1;
    avisar(true, `Puesta como ${NOMBRE_RANURA[destino]}${destino === "reference" ? ` (${form.medios.reference.length + 1} de ${max})` : ""}.`);
  };

  /** «De la galería» en un sitio del compositor: un diálogo encima, para escoger VARIAS de una vez, sin saltos. */
  const escogerDeLaGaleria = (rol) => setEligiendoDeGaleria(rol);
  /** Lo escogido en ese diálogo, en su orden, al sitio (sólo las que caben). */
  const ponerDeLaGaleria = (rol, lista) => {
    setEligiendoDeGaleria(null);
    if (!form || !modelo) return;
    const max = { reference: modelo.referencias, start: modelo.inicial ? 1 : 0, end: modelo.final ? 1 : 0 }[rol] || 0;
    setConfirmando(null);
    setForm((f) => {
      const ya = f.medios[rol] ?? [];
      const nuevas = lista.filter((a) => !Object.values(f.medios).some((l) => l.some((x) => x.id === a.id)));
      return { ...f, medios: { ...f.medios, [rol]: (max === 1 ? nuevas.slice(0, 1) : [...ya, ...nuevas]).slice(0, max) } };
    });
    avisar(true, lista.length === 1 ? `Puesta como ${NOMBRE_RANURA[rol]}.` : `Puestas ${lista.length} como ${NOMBRE_RANURA[rol]}s, en ese orden.`);
  };

  /**
   * «Recrear un anuncio» terminado: una imagen ya viene CREADA (por el director y el servidor) y se abre; un video entra
   * en el compositor (con las fotos del producto) para revisar y crear.
   */
  const desdeRecrear = (pedido) => {
    setRecrear(null);
    cargar();
    if (pedido?.creada) { setVisor(pedido.creada); avisar(true, "Lista: recreada con tu marca, ya revisada."); return; }
    if (!motores) return;
    setConfirmando(null);
    setVisor(null);
    setEnPapelera(false);
    setGuiado("");
    // El modelo lo propone el recreador entre los que tienen llave (lib/motorRecrear.js); sin llave no se respeta.
    setForm(formularioInicial(motores, pedido, [], fijados));
    setPreset(pedido.preset ?? "anuncio");
    setIdeaAnterior(null);
    avisar(true, `Lista para recrear con tu marca${pedido.referencias?.length ? " y las fotos del producto" : ""}. Revisa el pedido y pulsa «Crear».`);
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
    setGuiado("");
    setForm({
      tipo: "video", modelo: m.id, n: 1, medios,
      prompt: `Anima esta imagen con un movimiento suave y natural: ${a.prompt}`.slice(0, MAX_PROMPT),
      ajustes: ajustesDe(m, { aspectRatio: proporcion === "16:9" || proporcion === "1:1" ? proporcion : "9:16" }, clavesDe(medios)),
    });
    avisar(true, "Lista para animar. Ajusta el texto (qué se mueve) y pulsa «Crear video».");
    enfocarPrompt();
  };

  // ---------- «Otra igual» y «Otra versión distinta»: salen ya, sin pasar por el compositor ----------
  /** El pedido con que se creó una pieza: su prompt, su modelo, sus ajustes y sus imágenes de apoyo (las de su trabajo). */
  const pedidoDe = (a, otro = "") => {
    const t = (datos?.trabajos ?? []).find((x) => x.id === a.trabajoId);
    // `otro`: el modelo escogido en el visor para esta vez; sus referencias, las que le quepan.
    const o = api.modeloParaOtra(activos, otro, a, t?.medios?.reference?.length ?? 0);
    const m = o ?? modeloPorId(a.modelo);
    if (!m || !motorActivo(m)) return { error: `${nombreDelModelo(a.modelo) || "Ese modelo"} no está disponible: escoge otro en «Con qué modelo».` };
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
   * «Otra igual», «Otra versión distinta» y «Editar» del visor (también la versión desde la tarjeta): salen YA, sin pasar
   * por el compositor, y por el SERVIDOR con las mismas reglas que el lote —la proporción, el control con su corrección,
   * el logo estampado y la marca de hoy— (lib/visorEstudio.js, aparte: el chunk del Estudio está en su tope). La
   * versión la diseña el director mirando la original, con el mismo texto.
   */
  const delVisor = async (que, a, extra = {}) => {
    if (versionando || !motores) return;
    const p = que === "edicion" ? null : pedidoDe(a, extra.otro ?? "");
    // Las variaciones para anuncios son otras piezas (van a su carpeta): el visor se cierra. Lo demás (otra igual, otra
    // versión, la corrección) es OTRA VERSIÓN de ésta: el visor se queda abierto y la nueva se abre sola al llegar.
    const variaciones = que === "versiones" && extra.para === "anuncios";
    setVersionando(true);
    if (que === "versiones") avisar(true, "El director está mirando la pieza y diseñando…");
    try {
      if (p?.error) throw new Error(p.error);
      const v = await import("../lib/visorEstudio");
      const comun = {
        clienteId: client.id, a, p, kit, uso, seguir: () => montado.current, alFallo: (t) => { if (montado.current) { setEnCamino(null); avisar(false, t); } },
        alListo: variaciones ? null : (nuevas) => abrirLaNueva(a, nuevas),
      };
      const r = await (que === "igual" ? v.pedirOtraIgual(comun) : que === "versiones" ? v.pedirVersiones({ ...comun, n: extra.n, para: extra.para })
        : v.pedirEdicion({ ...comun, instruccion: extra.instruccion, ejemplos: extra.ejemplos, escogido: extra.otro, activos }));
      for (const t of r.trabajos ?? []) { setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, t) } : d)); seguir(t.id); }
      setEnPapelera(false);
      avisar(true, r.texto);
      if (variaciones || r.trabajos?.length) setVisor(null);
      else setEnCamino({ desde: a.id, texto: que === "edicion" ? "Corrigiendo: la nueva se abre aquí cuando salga (la de ahora no se toca)." : "Creando la otra versión: se abre aquí cuando salga." });
      cargar();
    } catch (e) {
      // Si falla, el visor sigue abierto con la pieza: el aviso está arriba y en el visor.
      setEnCamino(null);
      avisar(false, e.message);
    } finally {
      setVersionando(false);
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  /**
   * La pieza nueva (una corrección, otra versión) llegó: si el visor sigue en la pieza de la que salió (o en una de sus
   * versiones), se abre ahí con las demás como versiones; si se cerró, el aviso ofrece abrirla. No queda escondida en la pila.
   */
  const abrirLaNueva = (a, nuevas) => {
    if (!montado.current || !nuevas?.length) return;
    setEnCamino(null);
    cargar();
    const v = visorRef.current;
    const pila = v ? [v.id, ...(v.anteriores ?? []).map((x) => x.id)] : [];
    if (v && pila.includes(a.id)) {
      import("../lib/visorEstudio").then((m) => { if (montado.current) setVisor((actual) => (actual?.id === v.id ? m.conLaNueva(actual, nuevas) : actual)); });
      avisar(true, nuevas.length === 1 ? "Lista: la tienes abierta. La de antes sigue entre sus versiones." : `Listas ${nuevas.length}: la primera está abierta y las demás, entre sus versiones.`);
    } else {
      setAviso({ ok: true, texto: "Lista la pieza nueva.", abrir: nuevas[0] });
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
  // `exito` puede ser una función de lo que devolvió `hacer`: para decir una cifra que sólo sabe el servidor.
  const accion = async (hacer, exito) => {
    try {
      const r = await hacer();
      if (exito) avisar(true, typeof exito === "function" ? exito(r) : exito);
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    }
  };
  const alternarFavorito = (a) => accion(async () => {
    const { archivo } = await api.cambiarArchivo(client.id, a.id, { favorito: !a.favorito });
    setVisor((v) => api.conVersiones(v, archivo));
  });
  /** «Estampar el logo»: el original del kit encima, en su esquina; sale una pieza nueva y ésta se queda. */
  const estampar = (a) => accion(async () => {
    setVisor(await estamparEnGaleria({ clienteId: client.id, archivo: a, kit }));
  }, "Listo: sale como una pieza nueva con el logo encima; la original se queda.");
  // Una versión de una pieza: el visor sigue con las que quedan (la principal, si no era ésa).
  const aPapelera = (a) => accion(async () => { await api.mandarAPapelera(client.id, a.id); setVisor((v) => (v?.id === a.id ? api.trasQuitarVersion(v) : v)); }, "Movida a la papelera. Puedes recuperarla 30 días.");
  // Varias de una vez (lo de la marca se salta y se dice: lib/estudio.js); se relee la galería una sola vez al terminar.
  // Seleccionar, agrupar, mover y la papelera viven en la galería (EstudioGaleria.jsx, en su chunk).
  const variasAPapelera = async (todas) => {
    try {
      avisar(true, await api.variasALaPapelera(client.id, todas, archivos));
    } catch (e) {
      avisar(false, e.message);
    } finally {
      await cargar();
    }
  };
  const moverA = (a, carpetaId) => accion(async () => {
    const { archivo } = await api.cambiarArchivo(client.id, a.id, { carpetaId: carpetaId || null });
    setVisor((v) => api.conVersiones(v, archivo));
  });
  // En el ordenador, el enlace de siempre; en el teléfono, la hoja de compartir (Guardar imagen / video): con la app
  // instalada, iOS no tiene a dónde descargar (lib/descargar.js, en diferido). Devuelve lo que haya que decir.
  const descargar = async (a, { callado = false } = {}) => {
    try {
      const { descargarPiezas } = await import("../lib/descargar");
      const r = await descargarPiezas([{ src: a.src, nombre: nombreDeDescarga(a) }]);
      if (r.texto && !callado) avisar(true, r.texto);
      return r.texto;
    } catch (e) {
      if (!callado) avisar(false, e.message);
      return e.message;
    }
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
      avisar(true, id ? `Fijado para ${client.name}: se usa en todo lo que se crea.` : "Ya no hay modelo fijado para este cliente.");
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

  // ---------- Derivados (los de la galería —vistas, filtros, semanas, selección— van en EstudioGaleria.jsx) ----------
  const archivos = useMemo(() => datos?.archivos ?? [], [datos]);
  const carpetas = useMemo(() => datos?.carpetas ?? [], [datos]);
  const carpetasPropias = useMemo(() => carpetas.filter((c) => !esGrupo(c)), [carpetas]);
  const abrirPieza = (a) => setVisor(a);
  const enCurso = useMemo(() => trabajosVisibles(datos?.trabajos ?? [], { descartados }), [datos, descartados]);
  const soloPrueba = motores && !Object.entries(motores).some(([id, m]) => id !== "prueba" && m.activo);
  const llavesQueFaltan = Object.values(motores ?? {}).map((m) => m.llave).filter(Boolean);
  const enMedios = (a) => form && Object.values(form.medios).some((l) => l.some((x) => x.id === a.id));
  // El formato de «Qué», sacado de lo que hay: el flujo guiado, el tipo y la proporción (9:16 es una historia).
  const formato = guiado === "carrusel" ? "carrusel" : guiado === "reel" || form?.tipo === "video" ? "video" : ajustes.aspectRatio === "9:16" ? "historia" : "post";
  const queCrear = form ? (
    <QueCrear formato={formato} tipoVideo={guiado === "reel" ? tipoVideo : "clip"} conGuiados={!dialogo}
      onFormato={(f) => cambiarFormato(f)} onTipoVideo={(t) => cambiarFormato("video", t)} />
  ) : null;
  // Lo puesto en el pedido, para la tira de abajo mientras se mira la galería.
  const puestas = form ? [...form.medios.start, ...form.medios.end, ...form.medios.reference, ...(form.medios.video ?? [])] : [];
  const verTira = !dialogo && !lectura && puestas.length > 0 && !compositorALaVista;

  if (cargando || (!form && !error)) return <p role="status" className="est-nota">Cargando el Estudio…</p>;
  if (error && !datos) return <div className="est-error" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={cargar}>Reintentar</button></div>;

  const TituloH = dialogo ? "h3" : "h2";

  return (
    <section className={`estudio${dialogo ? " estudio-dialogo" : ""}`} aria-labelledby={`${ids}-h`}>
      <header className="est-cabecera">
        <div>
          <TituloH id={`${ids}-h`} className="est-titulo">{dialogo ? "Crear en el Estudio" : aMano ? "Crear a mano" : "Estudio"}</TituloH>
          <p className="est-sub">
            {dialogo
              ? "Crea una imagen o un video para esta publicación, o escoge uno que ya hayas hecho."
              : aMano ? `Escoge el formato, escribe la idea y crea. Lo que salga queda en la galería de ${client.name}, debajo.`
                : `Lo creado para ${client.name}, con su pedido y lo que costó. Para crear tú, «A mano».`}
          </p>
        </div>
        {dialogo && onCerrar && <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>}
      </header>

      <div className="est-aviso-region" role="status" aria-live="polite">
        {aviso && (
          <p className={aviso.ok ? "est-aviso" : "est-aviso est-aviso-mal"}>
            {aviso.texto}
            {aviso.abrir && <>{" "}<button type="button" className="btn btn-secondary btn-sm" onClick={() => { setVisor(aviso.abrir); setAviso(null); }}><Icon name="eye" size={14} /> Abrirla</button></>}
            <button type="button" className="btn-icon est-cerrar" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}><Icon name="close" size={16} /></button>
          </p>
        )}
      </div>

      {soloPrueba && (
        <p className="est-aviso est-aviso-info">
          Ahora mismo sólo está activo el motor de <strong>prueba</strong> (gratis): saca una tarjeta con tu texto, no una imagen ni un video reales.
          Para eso de verdad, el administrador tiene que poner la llave de un proveedor en los ajustes del servidor:{" "}
          {llavesQueFaltan.map((l, i) => <span key={l}>{i > 0 ? (i === llavesQueFaltan.length - 1 ? " o " : ", ") : ""}<code>{l}</code></span>)}.
        </p>
      )}

      {/* ---------- Crear a mano: en Crear → «A mano» (arriba) y siempre en el diálogo de una publicación ---------- */}
      {conCompositor && !lectura && form && modelo && (
        <div className="est-av" ref={zonaCompositor}>
          <Suspense fallback={<p role="status" className="hint">Abriendo el compositor…</p>}>
            {guiado ? (() => {
              const Flujo = guiado === "reel" ? FlujoReel : FlujoCarrusel;
              return (
                <Flujo
                  key={`${guiado}-${guiado === "reel" ? tipoVideo : ""}-${vueltaGuiado}`} client={client}
                  estudio={{ kit, productos: datos?.productos ?? [], archivos: datos?.archivos ?? [], activos }}
                  inicial={{ preset: presetVigente, ...(guiado === "reel" ? { forma: tipoVideo } : {}) }}
                  sinFormas
                  cabecera={queCrear}
                  onCreando={(si) => { if (!si) cargar(); }}
                  // «Listo»: todo quedó en la galería; el flujo vuelve a empezar, limpio, para el siguiente.
                  onListo={() => { setVueltaGuiado((n) => n + 1); cargar(); avisar(true, guiado === "reel" ? "Reel listo: está en la galería, en su carpeta." : "Carrusel listo: está en la galería, en su carpeta."); }}
                />
              );
            })() : (
              <Compositor
                ids={ids} form={{ ...form, ajustes }} setForm={setForm} modelo={modelo} motores={motores} costo={costo}
                confirmando={confirmando} enviando={enviando} subiendo={subiendo} promptRef={promptRef}
                onEnviar={enviar} onConfirmar={() => enviar(true)} onNo={() => setConfirmando(null)}
                onModelo={cambiarModelo} onQuitarMedio={quitarMedio} onMarcarReferencia={marcarReferencia} nombrado={nombrado} onSubirArchivos={subirArchivos}
                onDrive={client.driveFolder ? (rol) => setDriveRol(rol) : null}
                onGaleria={escogerDeLaGaleria}
                queCrear={queCrear}
                mejorando={mejorando} onMejorar={mejorarConIA} onVolverIdea={ideaAnterior != null ? volverAMiIdea : null}
                estilo={{
                  preset: presetVigente, onPreset: setPreset, kitListo, kit: limpiarKit(kit), marca: client.name, textoPreset: textoDelPreset, refsTipo, sinIdea: !form.prompt.trim(),
                  nombrePieza: presetVigente ? nombreDePreset(presetVigente, kit) : "",
                  bloqueMarca,
                  estilo: estiloVigente, estiloResuelto: estiloDeEsta, nombreEstilo: nombreDeEstilo(kit, estiloDeEsta), lineaEstilo: lineaDelEstilo, onEstilo: setEstilo,
                  fijadoTipo: limpiarKit(kit).estiloPorTipo[presetVigente.split("-")[0]] ?? "", onFijarEstilo: lectura ? null : fijarEstilo,
                  conLogo, onConLogo: setConLogo, puedeLogo, estampa,
                  angulos: datos?.angulos ?? [],
                  onAngulo: (a) => { setConfirmando(null); setForm((f) => ({ ...f, prompt: ideaDesdeAngulo(a) })); },
                  productos: modelo.referencias > 0 ? (datos?.productos ?? []).filter((p) => p.fotos?.length) : [],
                  gustos: hayGustos && modelo.referencias > 0 ? { activo: conGustos, onCambiar: setConGustos, van: gustos.length } : null,
                  personajes: modelo.referencias > 0 && limpiarKit(kit).personajes.length
                    ? { lista: limpiarKit(kit).personajes, escogidos: personajesSel, onCambiar: setPersonajesSel, van: deLosPersonajes.length }
                    : null,
                  onProducto: ponerFotosDeProducto, onQuitarProducto: quitarFotosDeProducto,
                  plantillas: form.tipo === "imagen" && modelo.referencias > 0 && limpiarKit(kit).plantillas.length
                    ? { lista: limpiarKit(kit).plantillas, escogida: plantillaSel, onCambiar: setPlantillaSel }
                    : null,
                }}
                fijado={fijados[form.tipo] ?? ""} onFijar={(id) => fijar(form.tipo, id)}
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
                ultimas={ultimas} onAbrir={(a) => setVisor(a)}
              />
            )}
          </Suspense>

          {/* ---------- Muchas de una vez (anuncios en matriz, por tipo o el mes) y recrear un anuncio de otra cuenta ---------- */}
          {!dialogo && motores && (
            <Suspense fallback={null}><EstudioMuchas onLote={() => setLoteAbierto(true)} onRecrear={() => setRecrear({ archivo: null })} /></Suspense>
          )}
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

      {/* ---------- Galería (en su chunk: vistas, filtros, semanas, «Cargar más», seleccionar y la papelera) ---------- */}
      <Suspense fallback={<p className="est-vacio" role="status">Abriendo la galería…</p>}>
        <EstudioGaleria
          client={client} lectura={lectura} dialogo={dialogo} pulso={pulso} datos={datos} setDatos={setDatos} cargar={cargar} accion={accion} avisar={avisar}
          hastaRef={hastaRef} filtro={filtro} setFiltro={setFiltro} enPapelera={enPapelera} setEnPapelera={setEnPapelera} enDrive={enDrive} setEnDrive={setEnDrive}
          perdidos={perdidos} setPerdidos={setPerdidos} cabeceraRef={galeriaRef}
          onAbrir={abrirPieza} onAbrirGrupo={setGrupoAbierto} variasAPapelera={variasAPapelera} onDrive={traerDeDriveAlPedido}
          tarjeta={{
            enMedios, costoDeOtra, versionando, onFavorito: alternarFavorito, onPapelera: aPapelera, onDescargar: descargar, onAnimar: animar,
            onOtra: (a) => delVisor("versiones", a, { n: 1 }),
            onReferencia: form ? (a) => (enMedios(a) ? quitarMedio(Object.keys(form.medios).find((rol) => form.medios[rol].some((x) => x.id === a.id)), a) : usarComoMedio(a)) : null,
            onUsar: onUsar ? usarEnLaPublicacion : null, etiquetaUsar: inicial?.etiquetaUsar,
          }}
        />
      </Suspense>

      {verTira && (
        <div className="est-tira-pedido" role="group" aria-label="Lo que va en el pedido">
          {puestas.slice(0, 4).map((a) => (a.tipo === "video" ? <Icon key={a.id} name="video" size={18} /> : <img key={a.id} src={a.src} alt="" />))}
          <span className="hint">
            En el pedido: {form.medios.reference.length > 0 && modelo?.referencias ? `${form.medios.reference.length} de ${modelo.referencias} referencias` : `${puestas.length} ${puestas.length === 1 ? "imagen" : "imágenes"}`}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => enfocarPrompt()}><Icon name="pencil" size={14} /> Ir al pedido</button>
        </div>
      )}

      <p className="est-precios">Los precios son aproximados y de {new Date(PRECIOS_AL).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" })}. Lo que se gasta aquí suma al presupuesto de IA del mes.</p>

      {eligiendoDeGaleria && form && modelo && (
        <Suspense fallback={null}>
          <EstudioElegir
            archivos={datos?.archivos ?? []} rol={eligiendoDeGaleria}
            caben={Math.max(1, ({ reference: modelo.referencias, start: 1, end: 1 }[eligiendoDeGaleria] || 1) - (eligiendoDeGaleria === "reference" ? form.medios.reference.length : 0))}
            yaPuestas={puestas.map((a) => a.id)}
            onPoner={(lista) => ponerDeLaGaleria(eligiendoDeGaleria, lista)} onCerrar={() => setEligiendoDeGaleria(null)}
          />
        </Suspense>
      )}
      {eligiendoRanura && (
        <Suspense fallback={null}>
          <EleccionRanura
            archivo={eligiendoRanura.archivo} opciones={eligiendoRanura.opciones} modelo={modelo}
            onElegir={(rol) => usarComoMedio(eligiendoRanura.archivo, rol)} onCerrar={() => setEligiendoRanura(null)}
          />
        </Suspense>
      )}
      {/* El kit de marca (paleta, logo, plantillas, voz) vive en Marca → Kit y voz. */}
      {onIrAlKit && <button type="button" className="btn btn-ghost btn-sm" onClick={onIrAlKit}><Icon name="palette" size={16} /> El kit de marca, en Marca</button>}

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
            cliente={lectura || onUsarVarias ? null : client}
          />
        </Suspense>
      )}
      {visor && (
        <Visor
          archivo={visor} carpetas={carpetasPropias} lectura={lectura} cliente={client}
          onCerrar={() => setVisor(null)}
          onDescargar={() => descargar(visor, { callado: true })}
          onFavorito={() => alternarFavorito(visor)}
          onPapelera={() => aPapelera(visor)}
          onMover={(c) => moverA(visor, c)}
          onRecrear={dialogo && !inicial?.abrir ? null : () => { const a = visor; setVisor(null); setRecrear({ archivo: a }); }}
          costoOtra={costoDeOtra(visor)}
          onOtraIgual={(otro) => delVisor("igual", visor, { otro })}
          onOtrasVersiones={(n, otro, para) => delVisor("versiones", visor, { n, otro, para })}
          versionando={versionando}
          onReferencia={() => { const a = visor; setVisor(null); usarComoMedio(a); }}
          onAnimar={() => animar(visor)}
          onEditar={(instruccion, ejemplos, otro) => delVisor("edicion", visor, { instruccion, ejemplos, otro })}
          activos={activos}
          desdePost={inicial?.abrir?.id === visor.id ? inicial : null}
          galeria={datos?.archivos ?? []}
          clienteId={client.id}
          onEstampar={limpiarKit(kit).logo && visor.tipo !== "video" ? () => estampar(visor) : null}
          original={originalDe(visor, datos?.trabajos ?? [], datos?.archivos ?? [])} anteriores={visor.anteriores}
          onVerOriginal={(o) => setVisor((v) => api.verVersion(v, o))}
          onPrincipal={lectura ? null : () => accion(async () => { await api.cambiarArchivo(client.id, visor.id, { principal: true }); setVisor((v) => ({ ...v, vistaId: v.id })); }, "Hecha la principal: es la que se ve en la galería.")}
          onQuitarOtras={lectura ? null : async () => { const ids = visor.anteriores.map((x) => x.id); setVisor((v) => ({ ...v, anteriores: undefined, vistaId: undefined })); await variasAPapelera(ids); }}
          onPlantilla={(r) => setDatos((d) => (d ? { ...d, kit: r.kit } : d))}
          onUsar={onUsar ? () => usarEnLaPublicacion(visor) : null} etiquetaUsar={inicial?.etiquetaUsar}
          esLogo={Boolean(kit?.logo) && kit.logo === visor.clave}
          onLogo={/^image\/(png|jpeg|webp)$/.test(visor.mime ?? "") ? () => usarComoLogo(visor) : null}
          revision={revisiones[visor.id] ?? null}
          onRevisar={kitVacio(kit) || !/^image\/(png|jpeg|webp|gif)$/.test(visor.mime ?? "") ? null : () => revisar(visor)}
          // Lo que se está haciendo a partir de esta pieza (la corrección, otra versión): se abre aquí al llegar.
          enCamino={enCamino && [visor.id, ...(visor.anteriores ?? []).map((x) => x.id)].includes(enCamino.desde) ? enCamino.texto : ""}
          onAbrirNueva={(nueva) => abrirLaNueva(visor, [nueva])}
        />
      )}
    </section>
  );
}
