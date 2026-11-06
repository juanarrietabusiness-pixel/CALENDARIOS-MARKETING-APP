// ============================================================
// Las pestañas «Pieza» y «Publicar» del panel de una publicación
//
// Eran una sola pestaña, «Subir», con unos 25 controles de IA en una columna
// (fase 4 de docs/propuesta-lo-mejor-y-creacion.md). Ahora:
//
//   · PIEZA: el archivo. Tres botones grandes —«Diseñar con el director»
//     (la imagen, la serie de un carrusel o el reel por planos, según el
//     formato), «Subir archivo» y «De la galería»— y «¿Qué quieres?». Lo
//     demás (Drive, video del producto, video animado, el Estudio avanzado,
//     las recetas, el modelo, tipo/estilo/plantilla, los atajos de foto y de
//     temporada) va plegado en «Más formas». Las acciones sobre cada imagen ya
//     puesta (Otra versión, Corregir, Recrear con mi marca, Ver en el Estudio)
//     siguen junto a la imagen.
//   · PUBLICAR, pensada como el «Crear publicación» de Metricool:
//     A la IZQUIERDA se configura, y es lo único que desplaza: qué sale y
//     dónde, el texto con la IA al lado y lo de cada red PLEGADO, con un
//     resumen de lo puesto en el título. La revisión son dos filas, «N
//     errores» y «N avisos», que se abren. La barra con el día, la hora y el
//     botón va pegada ABAJO DE LA IZQUIERDA (no de la ventana entera: tapaba
//     media vista previa) y lleva dentro las acciones del pie del panel.
//     A la DERECHA, la vista previa a toda la altura, siempre a la vista.
//
// Es UN componente con las dos secciones (`seccion`): lo que está en marcha no
// se pierde al pasar de una a otra. En el teléfono todo va en una columna.
//
// Las reglas son las de `lib/publicacion.js`, las mismas que aplica el
// servidor al publicar: el aviso llega al escribir, no a la hora de salir.
// ============================================================

import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import {
  revisarPublicacion, aplicarArreglo, REDES, mediosDe, objetivoDe, necesitaAjuste, conMedios, destinoInstagram,
  historiasDe, contarHashtags, colaboradoresDe, LIMITES, redesDe, esReelConVideo, conPortada as ponerDePortada,
} from "../../lib/publicacion";
import { EditorMedios, CamposRedes, Plegable } from "./editorPublicacion";
import AjusteImagen from "./ajusteImagen";
import HistoriasDelPost from "./historiasPost";
import VistaRed from "./vistaRed";
import CuandoSale from "./cuandoSale";
import { EstadoAprobacion } from "./aprobacionCliente";
import CambiosDelCliente from "./cambiosCliente";
import DestinoRedes from "./destinoRedes";
import { escribirDesdeContenido } from "../../api";
import { rellenarDesdeContenido, tieneContenido, formatoDeMedios } from "../../lib/subir";
import { medioDeArchivo, apuntarUso, AJUSTES_DE_TEXTO, archivoEnGaleria } from "../../lib/estudio";
import { nombreDelModelo } from "../../lib/estudioCatalogo";
import { SelectorModeloDelEspacio } from "../SelectorModelo";
import { useCrearConIA } from "../../hooks/useCrearConIA";
import { conPromptListo } from "../../lib/promptImagen";
import { presetDePilar } from "../../lib/pilares";
import { fechasQueVienen, fraseDeFalta } from "../../lib/temporada";
import { MODOS_FOTO, instruccionDeTemporada } from "../../lib/modosFoto";
import { fechaEnZona } from "../../lib/agenda";
import { navegar } from "../../lib/rutas";
import BotonGuardarDrive from "./botonGuardarDrive";

// «Crear carrusel con IA»: sólo se descarga al abrirlo.
const CarruselIA = lazy(() => import("./CarruselIA"));
// «Crear reel con IA»: igual, sólo al abrirlo.
const ReelIA = lazy(() => import("./ReelIA"));
// «De la galería»: lo ya hecho en el Estudio (imágenes sueltas o un carrusel entero).
const GaleriaSelector = lazy(() => import("../GaleriaSelector"));
// El tipo, el estilo y la plantilla de «Crear la imagen aquí»: lee el kit, va aparte.
const OpcionesCrearAqui = lazy(() => import("./OpcionesCrearAqui"));
const VideoListo = lazy(() => import("../VideoListo"));
const Recetas = lazy(() => import("../Recetas"));
// El aviso del kit (fase 7): sin logo, o un producto que nombra sin fotos. Lee la galería del cliente: aparte.
const AvisoKitPieza = lazy(() => import("./AvisoKitPieza"));
// «Publicar con música»: la foto → un reel con música; el carrusel → a mano con la música de Instagram (aparte).
const ConMusica = lazy(() => import("./ConMusica"));

/**
 * ¿Toca ofrecer «con música»? Un post de UNA imagen, un carrusel con sus imágenes, o lo que ya es (o se está haciendo)
 * un reel con música. Lo fino lo decide lib/conMusica.js dentro de su chunk: aquí sólo se evita descargarlo de más.
 */
const ofreceMusica = (post) => {
  if (post?.status === "published") return false;
  if (post?.conMusica || post?.conMusicaPendiente) return true;
  const m = mediosDe(post);
  return post?.format === "carrusel" ? m.length > 0 : (!post?.format || post.format === "post") && m.length === 1 && m[0].tipo === "imagen";
};

/**
 * @param seccion      «pieza» (el archivo y todas las formas de hacerlo) o «publicar» (dónde, el texto, cómo se va a
 *                     ver, la revisión y «¿Cuándo sale?»). Es UN componente con las dos: lo que está en marcha (una
 *                     versión, el diálogo del Estudio) no se pierde al pasar de una a otra.
 * @param onIrA        cambiar de pestaña del panel («pieza» | «salida»).
 * @param formatoAuto  true cuando la publicación se creó con «Subir
 *                     contenido»: el formato sigue al archivo (una imagen,
 *                     post; varias, carrusel; un video, reel) hasta que se
 *                     escoja uno a mano.
 * @param ancho        pantalla ancha: la vista previa va en su columna.
 */
export default function PestanaPublicar({ post, sf, setForm, client, clientId, day, cal = null, onError, publicacion = null, children, acciones = null, enlaceAMano = null, formatoAuto = false, ancho = false, seccion = "publicar", onIrA = null }) {
  const ids = useId();
  const entrada = useRef(null);
  // «De Drive» / «Del banco» desde «Más formas» (lo abre EditorMedios, que tiene el selector).
  const abrirBanco = useRef(null);
  const auto = useRef(formatoAuto);
  const [escribiendo, setEscribiendo] = useState("");
  const [escrito, setEscrito] = useState("");

  // «Escribir a partir del contenido»: la IA mira lo subido y rellena lo
  // que esté vacío. Lo escrito a mano no se toca.
  const escribir = async () => {
    setEscrito("");
    setEscribiendo("Preparando…");
    try {
      const propuesta = await escribirDesdeContenido(client, post, { calendar: cal, fecha: day.date, alProgresar: setEscribiendo });
      // El aviso se calcula con lo de ahora; el cambio se aplica sobre lo que
      // haya cuando llegue (se pudo seguir escribiendo mientras la IA miraba).
      const { rellenados } = rellenarDesdeContenido(post, propuesta);
      setForm((p) => rellenarDesdeContenido(p, propuesta).post);
      setEscrito(rellenados.length ? "Listo: la IA escribió lo que faltaba. Revísalo y retócalo." : "Ya estaba todo escrito: no cambié nada. Vacía un campo si quieres que lo reescriba.");
    } catch (e) {
      onError?.(`No se pudo escribir a partir del contenido: ${e.message}`);
    }
    setEscribiendo("");
  };
  const cuentas = useMemo(() => (publicacion?.estadoRedes
    ? [...new Set((publicacion.estadoRedes.cuentas ?? []).filter((c) => c.clientId === clientId).map((c) => c.red))]
    : null), [publicacion?.estadoRedes, clientId]);
  // Sin redes elegidas, todas las que el cliente tiene conectadas (y pueden llevarla).
  const redes = redesDe(post, cuentas ?? []);
  const { errores, avisos, arreglos } = revisarPublicacion(post, redes, { navegador: true });
  const objetivo = redes.includes("instagram") ? objetivoDe(post, "instagram") : null;
  const fuera = objetivo ? mediosDe(post).find((m) => necesitaAjuste(m, objetivo)) : null;
  const elegirFormato = (k) => { auto.current = false; sf("format", k); };
  // `mediosCambiadosAt` deja saber si los archivos cambiaron DESPUÉS de
  // que el cliente aprobara la pieza (lib/aprobacion.js). Convertir a JPEG
  // al programar no pasa por aquí, así que no cuenta como cambio.
  const alCambiarMedios = (medios) => setForm((p) => {
    const siguiente = { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
    return auto.current && medios.length ? { ...siguiente, format: formatoDeMedios(medios) ?? p.format } : siguiente;
  });

  // «Crear con IA»: el Estudio del cliente en un diálogo. Lo creado se AÑADE a los medios (nunca reemplaza),
  // y con un cambio funcional: el diálogo puede tardar y `post` se habría quedado atrás.
  const { abrir: abrirCreacion, dialogo: dialogoCreacion } = useCrearConIA({
    client, clientId, post, onError,
    // La idea que dejó «Mejorar idea» al abrir: la publicación la guarda y la próxima vez sale lista.
    onMejorada: (idea) => setForm((p) => conPromptListo(p, idea)),
    uso: cal && post.id ? { calendarId: cal.dbId || cal.id, postId: post.id } : null,
    onUsarVarias: (archivos) => ponerDeGaleria(archivos, { reemplazar: false }),
    // Lo escogido en el Estudio abierto desde «Otra versión», «Corregir esta» o «Recrear con mi marca»: a SU sitio.
    onReemplazar: (medio, archivo) => {
      ponerEnSuSitio(medio, archivo);
      setEscrito(`Puesta en su sitio${archivo.modelo ? ` (hecha con ${nombreDelModelo(archivo.modelo)})` : ""}. La de antes sigue en la galería.`);
    },
    onUsar: (archivo) => {
      setForm((p) => {
        const actuales = mediosDe(p);
        if (actuales.length >= LIMITES.instagram.carruselMax) return p;
        const siguiente = { ...conMedios(p, [...actuales, medioDeArchivo(archivo)]), mediosCambiadosAt: new Date().toISOString() };
        return auto.current ? { ...siguiente, format: formatoDeMedios(mediosDe(siguiente)) ?? p.format } : siguiente;
      });
      setEscrito("Añadido a la publicación. Puedes escribir el texto con IA cuando quieras.");
    },
  });
  // El carrusel por láminas: lo creado se pone EN ORDEN, al final o en lugar de lo que había.
  const [carrusel, setCarrusel] = useState(false);
  const [reel, setReel] = useState(false);
  const ponerCarrusel = (archivos, { reemplazar }) => {
    setForm((p) => {
      const nuevos = archivos.map(medioDeArchivo);
      const medios = (reemplazar ? nuevos : [...mediosDe(p), ...nuevos]).slice(0, LIMITES.instagram.carruselMax);
      return { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
    });
    if (cal && post.id) for (const a of archivos) apuntarUso(clientId, a.id, { calendarId: cal.dbId || cal.id, postId: post.id }).catch(() => {});
    setEscrito(`Puestas ${archivos.length} láminas en la publicación, en orden.`);
  };
  /**
   * «De la galería» (y «Usar el carrusel» del Estudio): lo escogido va EN ORDEN, al final o en lugar de lo que había.
   * Con el formato automático, dos imágenes o más lo vuelven carrusel; si no, se avisa de que el formato no cambió.
   */
  const [galeria, setGaleria] = useState(false);
  const ponerDeGaleria = (archivos, { reemplazar }) => {
    setGaleria(false);
    if (!archivos.length) return;
    // Un reel con su video no lleva imágenes (la regla de `postConPiezas`): una es su PORTADA; varias, no se ponen.
    // «Reemplazar lo que ya tiene» es la decisión de quitar el video: entonces sí van como archivos.
    if (!reemplazar && esReelConVideo(post) && archivos.every((a) => medioDeArchivo(a).tipo === "imagen")) {
      if (archivos.length > 1) {
        onError?.("Un reel es UN video: no lleva imágenes. Escoge una sola si es su portada, o cambia el formato a carrusel.");
        return;
      }
      setForm((p) => ponerDePortada(p, archivos[0].src));
      if (cal && post.id) apuntarUso(clientId, archivos[0].id, { calendarId: cal.dbId || cal.id, postId: post.id }).catch(() => {});
      setEscrito("Puesta como portada del reel (un reel es un video: la imagen va de portada, no como un archivo más).");
      return;
    }
    setForm((p) => {
      const nuevos = archivos.map(medioDeArchivo);
      const medios = (reemplazar ? nuevos : [...mediosDe(p), ...nuevos]).slice(0, LIMITES.instagram.carruselMax);
      const siguiente = { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
      return auto.current ? { ...siguiente, format: formatoDeMedios(medios) ?? p.format } : siguiente;
    });
    if (cal && post.id) for (const a of archivos) apuntarUso(clientId, a.id, { calendarId: cal.dbId || cal.id, postId: post.id }).catch(() => {});
    const varias = archivos.length > 1;
    const aviso = varias && !auto.current && post.format !== "carrusel" && post.format !== "historia"
      ? " Es un «" + (post.format || "post") + "»: cámbialo a carrusel arriba si quieres que salgan como láminas."
      : "";
    setEscrito(`${varias ? `Puestas ${archivos.length} piezas` : "Puesta 1 pieza"} de la galería en la publicación${varias ? ", en orden" : ""}.${aviso}`);
  };
  /** El video del reel con IA: va SOLO en la publicación (sustituye lo que hubiera) y se apunta su uso. */
  const ponerReel = ([video], opciones = {}) => {
    if (!video) return;
    // El caption que escribió la receta «Video del producto» sólo RELLENA: lo escrito a mano gana.
    const caption = String(opciones.descripcion ?? "").trim();
    // El guion por tramos del reel, también sólo si estaba vacío (lo pone igual el servidor al terminar el encargo).
    const guionReel = String(opciones.guion ?? "").trim();
    const portadaReel = String(opciones.portada ?? "").trim();
    // Los hashtags que trajo el guion (aparte del caption, lib/reglasFormato.js), sólo si no había.
    const hashtagsReel = String(opciones.hashtags ?? "").trim();
    setForm((p) => ({
      ...conMedios(p, [medioDeArchivo(video)]), mediosCambiadosAt: new Date().toISOString(),
      ...(caption && !String(p.descripcion || p.script || "").trim() ? { descripcion: caption } : {}),
      ...(guionReel && !String(p.guion ?? "").trim() ? { guion: guionReel } : {}),
      ...(portadaReel && !p.portada ? { portada: portadaReel, portadaMs: null } : {}),
      ...(hashtagsReel && !String(p.hashtagsFinales ?? "").trim() ? { hashtagsFinales: hashtagsReel } : {}),
    }));
    if (cal && post.id) apuntarUso(clientId, video.id, { calendarId: cal.dbId || cal.id, postId: post.id }).catch(() => {});
    setEscrito("Puesto el reel en la publicación.");
  };
  /**
   * «Otra versión»: la imagen nueva se HACE aquí (lib/otraVersion.js) y ocupa el sitio de la que se tocó; la de antes
   * se puede recuperar con «Deshacer» (y si era del Estudio, sigue en la galería). Para reutilizar un post en otro día
   * con otro diseño y la misma información.
   */
  const [versionando, setVersionando] = useState(null);
  const [progresoVersion, setProgresoVersion] = useState("");
  const [deshacer, setDeshacer] = useState(null);
  // «¿Qué quieres?»: lo que la persona pide para la imagen. Lo leen «Crear la imagen aquí», «Otra versión», «Recrear
  // con mi marca» y «Corregir esta» (ésta lo necesita). Se vacía cuando sale bien: no se cuela en la siguiente.
  const [indicacion, setIndicacion] = useState("");
  // Las RECETAS de la agencia para esta publicación: «Crear con Claude» (con el pedido) o «Crear aquí» (la pestaña Diseño).
  const [recetas, setRecetas] = useState(false);
  // «De temporada»: las fechas especiales del cliente que vienen (sin las delicadas), para reutilizar la pieza en ellas.
  const temporada = useMemo(() => fechasQueVienen(client?.fechasEspeciales, fechaEnZona()), [client?.fechasEspeciales]);
  const campoIndicacion = useRef(null);
  // Lo escogido para «Crear la imagen aquí» (vacío: lo de la publicación y del cliente), SÓLO para esta publicación:
  // recordado por navegador, la siguiente salía con la plantilla o el estilo de otra sin que nadie lo viera.
  const [opcionesCrear, setOpcionesCrear] = useState({});
  const [verOpciones, setVerOpciones] = useState(false);
  // El modelo se escoge aparte («Con qué modelo»): lo de antes guardado aquí ya no cuenta.
  const opcionesPuestas = ["preset", "estilo", "plantilla"].filter((k) => opcionesCrear[k]).length;
  // «Con qué modelo» para lo que se hace AQUÍ (crear, otra versión, corregir, recrear): sólo esta vez, no fija nada.
  const [modeloAccion, setModeloAccion] = useState("");
  const conModelo = (a) => (a?.modelo ? ` con ${nombreDelModelo(a.modelo)}` : "");
  const uso = cal && post.id ? cal.dbId || cal.id : null;
  const costoDe = (costo) => costo.toFixed(2).replace(".", ",");
  // Sólo sale si el espacio no tiene fijado «crear imágenes sin preguntar» (o el pedido pasa de su tope): dice dónde se fija.
  const SIN_PREGUNTAR = "\n\n(Para que no pregunte: «Crear imágenes sin preguntar» en Ajustes → IA, lo fija el administrador.)";
  /** La pieza nueva ocupa el sitio de `medio` (o se añade, si no había), con «Deshacer». */
  const ponerEnSuSitio = (medio, nueva) => {
    const puesto = medioDeArchivo(nueva);
    setForm((p) => {
      const lista = mediosDe(p);
      const medios = medio ? lista.map((m) => (m.src === medio.src ? puesto : m)) : [...lista, puesto];
      const siguiente = { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
      return !medio && auto.current ? { ...siguiente, format: formatoDeMedios(medios) ?? p.format } : siguiente;
    });
    setDeshacer({ antes: medio, ahora: puesto.src });
    setIndicacion("");
  };
  // «Recrear con mi marca» (una referencia subida al post) va por el mismo sitio: la pieza nueva ocupa el de la referencia.
  const otraVersion = async (medio, { recrear = false } = {}) => {
    if (versionando || !client) return;
    setVersionando(medio.src);
    setDeshacer(null);
    setEscrito("");
    onError?.(""); // el aviso de un intento anterior ya no aplica
    try {
      const { otraVersionDelPost, recrearConLaMarca } = await import("../../lib/otraVersion");
      const hacer = recrear ? recrearConLaMarca : otraVersionDelPost;
      const nueva = await hacer({
        client, post, medio, indicacion, modelo: modeloAccion, calendarId: uso, alProgresar: setProgresoVersion,
        confirmar: (costo) => window.confirm(`${recrear ? "Recrearla" : "Esta versión"} cuesta unos ${costoDe(costo)} $. ¿Sigo?${SIN_PREGUNTAR}`),
      });
      if (nueva) {
        ponerEnSuSitio(medio, nueva);
        setEscrito(recrear ? `Lista: recreada con la marca${conModelo(nueva)}, en el sitio de la referencia.` : `Lista la versión nueva${conModelo(nueva)}, en el sitio de la anterior.`);
      }
    } catch (e) {
      onError?.(`No se pudo ${recrear ? "recrear con la marca" : "hacer otra versión"}: ${e.message}`);
    }
    setVersionando(null);
    setProgresoVersion("");
  };
  /**
   * «Crear la imagen aquí»: la del post, sin abrir el Estudio (lib/otraVersion.js). Con su pedido listo sale directa;
   * si no lo tenía, la idea mejorada se queda en la publicación para la próxima.
   */
  const crearAqui = async () => {
    if (versionando || !client) return;
    setVersionando("nueva");
    setDeshacer(null);
    setEscrito("");
    onError?.(""); // el aviso de un intento anterior ya no aplica
    try {
      const { crearImagenDelPost } = await import("../../lib/otraVersion");
      const nueva = await crearImagenDelPost({
        client, post, indicacion, opciones: { ...opcionesCrear, modelo: modeloAccion }, calendarId: uso, alProgresar: setProgresoVersion,
        alMejorar: (idea) => setForm((p) => conPromptListo(p, idea)),
        confirmar: (costo) => window.confirm(`Esta imagen cuesta unos ${costoDe(costo)} $. ¿Sigo?${SIN_PREGUNTAR}`),
      });
      if (nueva) {
        ponerEnSuSitio(null, nueva);
        setEscrito(`Lista la imagen${conModelo(nueva)}, en la publicación (también queda en la galería del Estudio).`);
      }
    } catch (e) {
      onError?.(`No se pudo crear la imagen: ${e.message}`);
    }
    setVersionando(null);
    setProgresoVersion("");
  };
  /** «Corregir esta»: EDITA la misma imagen con lo que dice «¿Qué quieres?» (sólo ese cambio) y ocupa su sitio. */
  const corregir = async (medio) => {
    if (versionando || !clientId) return;
    if (!indicacion.trim()) {
      onError?.("Escribe en «¿Qué quieres?» qué hay que cambiar de la imagen y pulsa «Corregir» otra vez.");
      campoIndicacion.current?.focus();
      return;
    }
    setVersionando(medio.src);
    setDeshacer(null);
    setEscrito("");
    onError?.(""); // el aviso de un intento anterior ya no aplica
    setProgresoVersion("Corrigiendo la imagen (sólo lo que pediste)…");
    try {
      const { rehacerConComentario } = await import("../../lib/controlEstudio");
      const nueva = await rehacerConComentario({ clienteId: clientId, src: medio.src, indicacion, medida: medio, modelo: modeloAccion, texto: post.format === "carrusel" ? "" : post.textoPieza || "" });
      if (uso && post.id) apuntarUso(clientId, nueva.id, { calendarId: uso, postId: post.id }).catch(() => {});
      window.dispatchEvent(new Event("ia:gasto"));
      ponerEnSuSitio(medio, nueva);
      setEscrito(`Lista la imagen corregida${conModelo(nueva)}, en el sitio de la anterior (la de antes sigue en la galería).`);
    } catch (e) {
      onError?.(`No se pudo corregir la imagen: ${e.message}`);
    }
    setVersionando(null);
    setProgresoVersion("");
  };
  /**
   * «Ver en el Estudio»: la imagen se abre en el visor de la galería (sus versiones, «Editar» con comentario y ejemplos,
   * el modelo para esa vez); lo que se escoja allí vuelve al sitio de esta imagen (en un carrusel, a su lámina). Si no
   * estaba en la galería (subida al post, de Drive), se sube. «Otra versión», «Corregir esta» y «Recrear con mi marca» ya
   * no van allí: se hacen AQUÍ, por el director y el servidor (decisión de la agencia: fuera el «En el Estudio / Aquí»).
   */
  const verEnEstudio = async (medio) => {
    if (versionando || !clientId) return;
    setVersionando(medio.src);
    setDeshacer(null);
    setEscrito("");
    onError?.(""); // el aviso de un intento anterior ya no aplica
    setProgresoVersion("Abriendo el Estudio con esta imagen…");
    try {
      const archivo = await archivoEnGaleria(clientId, medio.src);
      abrirCreacion({ abrir: archivo, accion: "ver", reemplaza: medio });
    } catch (e) {
      onError?.(`No se pudo abrir en el Estudio: ${e.message}`);
    }
    setVersionando(null);
    setProgresoVersion("");
  };

  const volverALaAnterior = () => {
    if (!deshacer) return;
    setForm((p) => {
      const lista = mediosDe(p);
      const medios = deshacer.antes ? lista.map((m) => (m.src === deshacer.ahora ? deshacer.antes : m)) : lista.filter((m) => m.src !== deshacer.ahora);
      return { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
    });
    setDeshacer(null);
    setEscrito(deshacer.antes ? "Vuelve a estar la imagen anterior." : "Quitada la imagen nueva (sigue en la galería).");
  };
  // «Crear la imagen aquí» sólo en lo que es UNA imagen: un carrusel y un reel tienen su propio flujo.
  const deUnaImagen = !post.format || post.format === "post" || post.format === "historia";
  const puedeCrearAqui = Boolean(client && clientId && deUnaImagen && !mediosDe(post).length);

  const esHistoria = post.format === "historia";
  const destino = destinoInstagram(post);
  const conImagen = mediosDe(post).some((m) => m.tipo === "imagen");
  const visibles = avisos.filter((a) => !(fuera && a.startsWith("Una imagen mide")));

  const arreglar = (texto) => {
    const a = arreglos[texto];
    if (!a) return;
    if (a.codigo === "medios") { entrada.current?.click(); return; }
    setForm((p) => aplicarArreglo(p, a.codigo));
  };

  const problema = (texto, tipo) => (
    <li key={texto} data-tipo={tipo}>
      <span>{tipo === "error" && <Icon name="alert" size={14} />} {texto}</span>
      {arreglos[texto] && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => arreglar(texto)}>
          <Icon name="wand" size={14} /> {arreglos[texto].etiqueta}
        </button>
      )}
    </li>
  );

  const vista = <VistaRed post={{ ...post, redes }} redes={redes} client={client} />;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const revision = (
    <div className="revision" aria-label="Revisión antes de publicar">
      {errores.length > 0 && (
        <Plegable titulo={plural(errores.length, "error", "errores")} icono="alert" tono="error" abierta={!ancho}>
          <ul className="revision-lista" data-tipo="error" aria-label="Lo que impide publicar">
            {errores.map((e) => problema(e, "error"))}
          </ul>
        </Plegable>
      )}
      {visibles.length > 0 && (
        <Plegable titulo={plural(visibles.length, "aviso", "avisos")} icono="info" tono="aviso">
          <ul className="revision-lista" data-tipo="aviso" aria-label="Avisos">
            {visibles.map((a) => problema(a, "aviso"))}
          </ul>
        </Plegable>
      )}
      {!errores.length && <p className="revision-ok"><Icon name="check" size={14} /> Lista para publicar en {redes.map((r) => REDES[r].nombre).join(" y ")}.</p>}
    </div>
  );

  // Lo puesto en cada sección, para no tener que abrirla para saberlo.
  const hashtags = contarHashtags(post.hashtagsFinales);
  const resumenIG = [
    hashtags && plural(hashtags, "hashtag", "hashtags"),
    String(post.primerComentario ?? "").trim() && "1.er comentario",
    colaboradoresDe(post).length && plural(colaboradoresDe(post).length, "colaborador", "colaboradores"),
    String(post.altTexto ?? "").trim() && "texto alternativo",
  ].filter(Boolean).join(" · ") || null;
  const historias = historiasDe(post);
  const resumenHistoria = post.historiaTambien && historias.length ? plural(historias.length, "historia", "historias") : null;
  const conPortada = mediosDe(post).some((m) => m.tipo === "video");
  // El video que revisa «¿Está listo este video?»: el primero que ya está en el almacenamiento.
  const videoSubido = mediosDe(post).find((m) => m.tipo === "video" && String(m.src ?? "").startsWith("/api/media/"))?.src ?? "";

  // El aviso de lo último que pasó (lo puesto, lo escrito): sale en la pestaña que se esté viendo.
  const estadoEscrito = (
    <div role="status" aria-live="polite" className={escrito ? undefined : "sr-only"}>{escrito && <p className="notice notice-ok">{escrito}</p>}</div>
  );
  const dialogos = (
    <>
      {galeria && (
        <Suspense fallback={null}>
          <GaleriaSelector clienteId={clientId} maximo={LIMITES.instagram.carruselMax} yaTiene={mediosDe(post).length} onElegir={ponerDeGaleria} onCerrar={() => setGaleria(false)} />
        </Suspense>
      )}
      {carrusel && (
        <Suspense fallback={null}>
          <CarruselIA client={client} post={post} cal={cal} onPoner={ponerCarrusel} onCerrar={() => setCarrusel(false)} indicacion={indicacion} />
        </Suspense>
      )}
      {reel && (
        <Suspense fallback={null}>
          <ReelIA client={client} post={post} cal={cal} forma={reel} onPoner={ponerReel} onCerrar={() => setReel(false)} />
        </Suspense>
      )}
      {recetas && (
        <Suspense fallback={null}>
          <Recetas
            clienteId={clientId}
            publicacion={cal && post.id ? { calendarId: cal.dbId || cal.id, postId: post.id, etiqueta: post.title || post.idea?.slice(0, 50) || "esta publicación" } : null}
            indicacion={indicacion}
            onCrearAqui={window.location.pathname.startsWith("/cliente/") && post.id ? (r) => {
              const base = window.location.pathname.split("/").slice(0, 3).join("/");
              const q = new URLSearchParams({ receta: r.id, post: post.id, ...(indicacion.trim() ? { pide: indicacion.trim() } : {}) });
              setRecetas(false);
              navegar(`${base}/crear/director?${q}`);
            } : null}
            onCerrar={() => setRecetas(false)}
          />
        </Suspense>
      )}
      {dialogoCreacion}
    </>
  );

  // ---- La pestaña PIEZA: el archivo de la publicación y todas las formas de hacerlo ----
  if (seccion === "pieza") {
    const vertical = post.format === "reel" || post.format === "historia";
    // «Diseñar con el director», según lo que sea: una imagen, la serie de un carrusel o el reel por planos.
    const disenar = !clientId ? null
      : puedeCrearAqui ? { accion: crearAqui, detalle: "Con su idea, su texto, el kit y el modelo del cliente.", ocupado: versionando === "nueva" }
        : post.format === "carrusel" ? { accion: () => setCarrusel(true), detalle: "El director diseña la serie, lámina a lámina." }
          : post.format === "reel" ? { accion: () => setReel("guion"), detalle: "Guion por planos, fotogramas y el video, en el servidor." }
            : null;
    const lleno = mediosDe(post).length >= LIMITES.instagram.carruselMax;
    const principales = (
      <div className="pieza-principales" role="group" aria-label="Cómo poner la pieza">
        {disenar && (
          <button type="button" className="btn btn-primary pieza-boton" onClick={disenar.accion} disabled={Boolean(versionando)} aria-busy={disenar.ocupado || undefined}>
            <Icon name="sparkles" size={20} />
            <span><strong>{disenar.ocupado ? "Diseñando…" : "Diseñar con el director"}</strong><small>{disenar.detalle}</small></span>
          </button>
        )}
        <button type="button" className="btn btn-secondary pieza-boton" onClick={() => entrada.current?.click()} disabled={lleno}>
          <Icon name="upload" size={20} />
          <span><strong>Subir archivo</strong><small>Del equipo o del teléfono; también se arrastra o se pega.</small></span>
        </button>
        {clientId && (
          <button type="button" className="btn btn-secondary pieza-boton" onClick={() => setGaleria(true)} disabled={lleno}>
            <Icon name="image" size={20} />
            <span><strong>De la galería</strong><small>Lo ya hecho en el Estudio: sueltas o un carrusel entero.</small></span>
          </button>
        )}
      </div>
    );
    // Lo demás, plegado: cada forma sigue a un toque, pero no se come la pantalla.
    const masFormas = (
      <Plegable titulo="Más formas" icono="more" resumen={opcionesPuestas || modeloAccion ? "con opciones escogidas" : null}>
        <div className="pieza-mas" role="group" aria-label="Más formas de hacer la pieza">
          {clientId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirBanco.current?.()} disabled={lleno}>
              <Icon name="folder" size={16} /> {client?.driveFolder ? "De Drive" : "Del banco"}
            </button>
          )}
          {vertical && clientId && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReel("producto")} title="10–15 s que terminan en la foto real del producto y el logo">
                <Icon name="video" size={16} /> Video del producto
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReel("animado")} title="Escenas dibujadas con código, una locución y subtítulos: la IA escribe el guion de esta publicación">
                <Icon name="sparkles" size={16} /> Video animado
              </button>
            </>
          )}
          {post.format === "historia" && clientId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReel("guion")} title="Guion por planos, fotogramas y el video, en el servidor">
              <Icon name="formatReel" size={16} /> Video con IA por planos
            </button>
          )}
          {clientId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirCreacion({ tipo: post.format === "reel" ? "video" : "imagen", indicacion })} disabled={lleno}
              title="El Estudio en un diálogo: escoger tipo, modelo y referencias, y revisar antes de crear">
              <Icon name="imageAi" size={16} /> Crear en el Estudio (avanzado)
            </button>
          )}
          {client && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecetas(true)} title="Las recetas de la agencia: aquí con el director o en claude.ai, con lo que escribiste en «¿Qué quieres?»">
              <Icon name="list" size={16} /> Con una receta…
            </button>
          )}
        </div>
        {client && (puedeCrearAqui || conImagen) && (
          <>
            {/* Atajos de Higgsfield adaptados (lib/modosFoto.js): rellenan «¿Qué quieres?». */}
            <div className="que-quieres-atajos" role="group" aria-label="Modo de foto del producto">
              <span className="hint">Modo de foto:</span>
              {MODOS_FOTO.map((x) => (
                <button key={x.id} type="button" className="filter-chip" aria-pressed={indicacion === x.instruccion} onClick={() => setIndicacion(x.instruccion)}>{x.etiqueta}</button>
              ))}
            </div>
            {temporada.length > 0 && (
              <div className="que-quieres-atajos" role="group" aria-label="Versión de temporada">
                <span className="hint">De temporada:</span>
                {temporada.map((f) => {
                  const texto = instruccionDeTemporada(f);
                  return (
                    <button key={`${f.id}-${f.fecha}`} type="button" className="filter-chip" aria-pressed={indicacion === texto} onClick={() => setIndicacion(texto)}
                      title={`${f.nombre}: ${fraseDeFalta(f.faltan)}`}>
                      {f.nombre} <span className="hint">· {fraseDeFalta(f.faltan)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <SelectorModeloDelEspacio
              valor={modeloAccion} onCambiar={setModeloAccion} conReferencias
              proporcion={vertical ? "9:16" : "4:5"}
              etiqueta="Con qué modelo (sólo esta vez)" vacio="El del cliente"
            />
          </>
        )}
        {puedeCrearAqui && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={verOpciones} aria-controls={`${ids}-opciones`} onClick={() => setVerOpciones((v) => !v)}>
              <Icon name="palette" size={14} /> {verOpciones ? "Cerrar las opciones" : `Tipo, estilo y plantilla${opcionesPuestas ? ` (${opcionesPuestas} escogid${opcionesPuestas === 1 ? "a" : "as"})` : ""}`}
            </button>
            {verOpciones && (
              <div id={`${ids}-opciones`}>
                <Suspense fallback={<p className="hint" role="status">Cargando las opciones…</p>}>
                  <OpcionesCrearAqui clientId={clientId} valor={opcionesCrear} onCambiar={setOpcionesCrear} presetDelPost={presetDePilar(post.pilar, post.pilarSub)} />
                </Suspense>
              </div>
            )}
          </>
        )}
      </Plegable>
    );
    return (
      <div className="pestana-pieza">
        {/* Lo que pidió cambiar el cliente, con «Rehacer la imagen» (la misma imagen, sólo ese cambio). */}
        <CambiosDelCliente post={post} setForm={setForm} clientId={clientId} uso={cal && post.id ? { calendarId: cal.dbId || cal.id, postId: post.id } : null} />
        {clientId && (
          <Suspense fallback={null}>
            <AvisoKitPieza clientId={clientId} post={post} />
          </Suspense>
        )}
        <section className="compositor" aria-label="La pieza de la publicación">
          <EditorMedios
            post={post}
            clientId={clientId}
            client={client}
            driveFolder={client?.driveFolder}
            onChange={alCambiarMedios}
            onError={onError}
            entradaRef={entrada}
            abrirBancoRef={abrirBanco}
            onPortada={conPortada ? (c, { archivo } = {}) => {
              setForm((p) => ({ ...p, ...c }));
              // La portada que viene de la galería del Estudio: que su papelera sepa que la usa esta publicación.
              if (archivo?.id && cal && post.id) apuntarUso(clientId, archivo.id, { calendarId: cal.dbId || cal.id, postId: post.id }).catch(() => {});
            } : null}
            onCrearConIA={(o) => abrirCreacion({ ...o, indicacion })}
            onOtraVersion={client ? (m) => otraVersion(m) : null}
            onRecrear={client ? (m) => otraVersion(m, { recrear: true }) : null}
            onCorregir={clientId ? (m) => corregir(m) : null}
            onVerEnEstudio={clientId ? verEnEstudio : null}
            versionando={versionando}
            botones={principales}
          />
          {client && (puedeCrearAqui || conImagen) && (
            <div className="field que-quieres">
              <label className="label" htmlFor={`${ids}-quiero`}>¿Qué quieres? <span className="hint">(opcional)</span></label>
              <textarea
                id={`${ids}-quiero`} ref={campoIndicacion} className="input" rows={2} maxLength={300} value={indicacion}
                onChange={(e) => setIndicacion(e.target.value)} aria-describedby={`${ids}-quiero-ayuda`}
                placeholder={conImagen ? "Ej.: el fondo más claro, el producto más grande, quita la planta" : "Ej.: una mamá con su bebé en la sala, luz de mañana"}
              />
              {conImagen && (
                <div className="est-editar-atajos" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)" }} role="group" aria-label="Ajustes del texto de la imagen, de un toque">
                  {AJUSTES_DE_TEXTO.map((x) => (
                    <button key={x.id} type="button" className="filter-chip" aria-pressed={indicacion === x.instruccion} onClick={() => setIndicacion(x.instruccion)}>{x.etiqueta}</button>
                  ))}
                </div>
              )}
              <p id={`${ids}-quiero-ayuda`} className="hint" style={{ margin: 0 }}>
                {!conImagen
                  ? "Manda sobre todo lo demás: el director diseña la pieza con ello."
                  : "Manda en «Otra versión» (la misma información, otra composición) y en «Recrear con mi marca». «Corregir» cambia sólo esto en la misma imagen. Todo sale revisado y ocupa su sitio, con «Deshacer»."}
              </p>
            </div>
          )}
          {(progresoVersion || deshacer) && (
            <div role="status" aria-live="polite" className="otra-version-estado">
              {progresoVersion && <p className="hint" style={{ margin: 0 }}><Icon name="sparkles" size={13} /> {progresoVersion}</p>}
              {deshacer && !progresoVersion && (
                <p className="hint" style={{ margin: 0 }}>
                  {deshacer.antes ? "Imagen nueva puesta." : "Imagen creada y puesta."}{" "}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={volverALaAnterior}>Deshacer</button>
                </p>
              )}
            </div>
          )}
          {estadoEscrito}
          {masFormas}
        </section>

        {clientId && ofreceMusica(post) && (
          <Suspense fallback={null}>
            <ConMusica post={post} setForm={setForm} client={client} clientId={clientId} cal={cal} onError={onError} enlaceAMano={enlaceAMano} onIrA={onIrA} />
          </Suspense>
        )}

        {videoSubido && clientId && (
          <Suspense fallback={null}>
            <VideoListo key={videoSubido} clienteId={clientId} clave={videoSubido} src={videoSubido} productoId={post.productoId ?? ""}
              idea={String(post.idea || post.title || post.descripcion || "")} formato={esHistoria ? "historia" : "reel"} />
          </Suspense>
        )}

        {onIrA && (
          <button type="button" className="btn btn-secondary pieza-siguiente" onClick={() => onIrA("salida")}>
            Siguiente: dónde y cuándo sale <Icon name="chevronRight" size={16} />
          </button>
        )}
        {dialogos}
      </div>
    );
  }

  // ---- La pestaña PUBLICAR: qué sale y dónde, el texto, cómo se va a ver, la revisión y «¿Cuándo sale?» ----
  const medios = mediosDe(post);
  return (
    <div className="pestana-publicar" data-ancho={ancho || undefined}>
      <div className="pp-izquierda">
      <div className="pp-config">
      <section className="pp-bloque" aria-labelledby={`${ids}-que`}>
        <h3 id={`${ids}-que`} className="label">¿Qué sale y dónde?</h3>
        <DestinoRedes
          post={post}
          redes={redes}
          onRedes={(lista) => sf("redes", lista)}
          cuentas={cuentas}
          formato={post.format}
          onFormato={elegirFormato}
        />
      </section>

      {/* El reel con música que se está haciendo: lo sigue también desde aquí (si no, al cerrar se pisaría). */}
      {clientId && post.conMusicaPendiente && (
        <Suspense fallback={null}>
          <ConMusica post={post} setForm={setForm} client={client} clientId={clientId} compacto />
        </Suspense>
      )}

      {/* La pieza se hace en su pestaña; aquí, un vistazo y el camino. */}
      <div className="field">
        <span className="label">La pieza</span>
        <div className="medios-resumen">
          {medios.slice(0, 6).map((m, i) => (
            <span key={`${m.src}-${i}`} className="medios-resumen-item">
              {m.tipo === "video" ? <Icon name="play" size={16} /> : <img src={m.src} alt="" />}
            </span>
          ))}
          {onIrA && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onIrA("pieza")}>
              <Icon name={medios.length ? "pencil" : "plus"} size={14} /> {medios.length ? `${medios.length} · cambiar en Pieza` : "Hacerla en Pieza"}
            </button>
          )}
        </div>
      </div>

      <section className="compositor" aria-label="El texto de la publicación">
        {esHistoria ? (
          <p className="notice notice-warn pestana-publicar-nota">
            Una historia no lleva texto, hashtags ni comentario: lo que diga va dentro de la imagen o el video.
            {medios.length > 1 && ` Salen ${medios.length} historias seguidas, en este orden.`}
            {" "}El sticker de enlace, la música y las encuestas sólo se ponen desde la app de Instagram.
          </p>
        ) : (
          <div className="field compositor-texto">
            <div className="compositor-texto-cabecera">
              <label className="label" htmlFor={`${ids}-desc`}>Texto de la publicación</label>
              <button type="button" className="btn-ai" disabled={!tieneContenido(post) || !!escribiendo} onClick={escribir}
                title={tieneContenido(post) ? "La IA mira la imagen o el video y escribe el texto, los hashtags, el primer comentario y el texto alternativo que falten." : "Pon primero la pieza (pestaña Pieza)"}>
                <Icon name="sparkles" size={14} /> {escribiendo || "Escribir con IA"}
              </button>
            </div>
            <textarea
              id={`${ids}-desc`}
              className="textarea"
              style={{ minHeight: 120 }}
              value={post.descripcion || post.script || ""}
              onChange={(e) => sf("descripcion", e.target.value)}
              placeholder="Caption / descripción del contenido…"
            />
          </div>
        )}
        {estadoEscrito}
        {/* «Guardar en Drive»: en la carpeta del cliente, por mes y semana (sólo si tiene carpeta). */}
        {client?.driveFolder && clientId && day?.date && (
          <BotonGuardarDrive clientId={clientId} post={post} fecha={day.date} onGuardado={(g) => sf("guardadoDrive", g)} />
        )}
      </section>

      {fuera && <AjusteImagen post={post} alCambiar={setForm} clientId={clientId} objetivo={objetivo} color={client?.primaryColor} onError={onError} />}

      {!ancho && vista}

      {!esHistoria && (
        <div className="plegables">
          {redes.includes("instagram") && (
            <Plegable titulo="Configuración de Instagram" icono="photo" resumen={resumenIG}>
              <CamposRedes post={post} sf={sf} partes={["instagram"]} />
              {destino === "reel" && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-audio`}>Nombre del audio original (opcional)</label>
                  <input id={`${ids}-audio`} className="input" maxLength={100} value={post.audioNombre || ""} onChange={(e) => sf("audioNombre", e.target.value)} placeholder="Ej.: Sonido original de Café Luna" />
                  <p className="hint">Cómo se llamará el audio del reel en Instagram. La música de la biblioteca sólo se pone desde la app.</p>
                </div>
              )}
              {conImagen && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-alt`}>Texto alternativo (opcional)</label>
                  <input id={`${ids}-alt`} className="input" maxLength={1000} value={post.altTexto || ""} onChange={(e) => sf("altTexto", e.target.value)} placeholder="Describe la imagen para quien no la ve" />
                </div>
              )}
            </Plegable>
          )}
          {redes.includes("facebook") && (
            <Plegable titulo="Configuración de Facebook" icono="globe" resumen={post.textoFacebook ? "texto propio" : "mismo texto"}>
              <CamposRedes post={post} sf={sf} partes={["facebook"]} />
            </Plegable>
          )}
          {post.format !== "live" && (
            <Plegable titulo="También en historias" icono="formatHistoria" resumen={resumenHistoria}>
              <HistoriasDelPost post={post} sf={sf} clientId={clientId} cliente={client} calendarId={uso} colorMarca={client?.primaryColor} onError={onError} indicacion={indicacion} />
            </Plegable>
          )}
        </div>
      )}

      {!ancho && revision}
      </div>

      <div className="barra-fija-publicar">
        {ancho && revision}
        <EstadoAprobacion post={post} setForm={setForm} />
        <CuandoSale
          post={post}
          sf={sf}
          day={day}
          clientId={clientId}
          filas={publicacion?.filas ?? []}
          estadoRedes={publicacion?.estadoRedes ?? null}
          errores={errores}
          enlaceAMano={enlaceAMano}
          onPublicar={(op) => publicacion.onPublicar(post, setForm, op)}
          onCancelar={publicacion?.onCancelar}
          onReintentar={publicacion?.onReintentar}
          inicio={ancho ? <>{acciones}{children}</> : null}
          conDrive={Boolean(client?.driveFolder)}
        />
        {!ancho && children}
      </div>
      </div>

      {ancho && (
        <aside className="pp-vista" aria-label="Cómo se va a ver">
          <h3 className="label">Así se va a ver</h3>
          {vista}
        </aside>
      )}

      {dialogos}
    </div>
  );
}
