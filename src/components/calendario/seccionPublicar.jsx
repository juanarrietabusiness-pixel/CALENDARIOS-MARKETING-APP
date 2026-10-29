// ============================================================
// La pestaña «Subir» del panel de una publicación
//
// Pensada como el «Crear publicación» de Metricool, que es lo que la
// agencia usa de referencia:
//
//   · A la IZQUIERDA se configura, y es lo único que desplaza. Arriba,
//     qué sale y dónde; debajo, el compositor: los archivos (con borrar a
//     la vista y la portada del video) y el texto, con la IA al lado.
//     Lo de cada red va PLEGADO —«Configuración de Instagram», «de
//     Facebook», «Historia»—, con un resumen de lo puesto en el título:
//     antes todo iba abierto y había que bajar mucho para llegar al final.
//     La revisión son dos filas, «N errores» y «N avisos», que se abren.
//   · La barra con el día, la hora y el botón va pegada ABAJO DE LA
//     IZQUIERDA, no de la ventana entera: tapaba media vista previa. Y
//     lleva dentro las acciones del pie del panel (borrar, al banco,
//     cerrar), que a lo ancho no tiene pie propio: eran dos barras
//     apiladas y a 800 px de alto dejaban una rendija para configurar.
//   · A la DERECHA, la vista previa a toda la altura, con su propio
//     desplazamiento. Siempre entera, siempre a la vista.
//
// En el teléfono todo va en una columna, y la barra al final.
//
// Las reglas son las de `lib/publicacion.js`, las mismas que aplica el
// servidor al publicar: el aviso llega al escribir, no a la hora de salir.
// ============================================================

import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import {
  revisarPublicacion, aplicarArreglo, REDES, mediosDe, objetivoDe, necesitaAjuste, conMedios, destinoInstagram,
  historiasDe, contarHashtags, colaboradoresDe, LIMITES, redesDe,
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
import BotonGuardarDrive from "./botonGuardarDrive";

// «Crear carrusel con IA»: sólo se descarga al abrirlo.
const CarruselIA = lazy(() => import("./CarruselIA"));
// «Crear reel con IA»: igual, sólo al abrirlo.
const ReelIA = lazy(() => import("./ReelIA"));
// «De la galería»: lo ya hecho en el Estudio (imágenes sueltas o un carrusel entero).
const GaleriaSelector = lazy(() => import("../GaleriaSelector"));
// El tipo, el estilo y la plantilla de «Crear la imagen aquí»: lee el kit, va aparte.
const OpcionesCrearAqui = lazy(() => import("./OpcionesCrearAqui"));

/**
 * @param formatoAuto  true cuando la publicación se creó con «Subir
 *                     contenido»: el formato sigue al archivo (una imagen,
 *                     post; varias, carrusel; un video, reel) hasta que se
 *                     escoja uno a mano.
 * @param ancho        pantalla ancha: la vista previa va en su columna.
 */
export default function PestanaPublicar({ post, sf, setForm, client, clientId, day, cal = null, onError, publicacion = null, children, acciones = null, enlaceAMano = null, formatoAuto = false, ancho = false }) {
  const ids = useId();
  const entrada = useRef(null);
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
  const ponerReel = ([video]) => {
    if (!video) return;
    setForm((p) => ({ ...conMedios(p, [medioDeArchivo(video)]), mediosCambiadosAt: new Date().toISOString() }));
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
  const campoIndicacion = useRef(null);
  // Lo escogido para «Crear la imagen aquí» (vacío: lo de la publicación y del cliente), recordado por cliente.
  const claveOpciones = `crear-aqui:${clientId ?? ""}`;
  const [opcionesCrear, setOpcionesCrearEstado] = useState(() => {
    try { return JSON.parse(localStorage.getItem(claveOpciones) || "{}") ?? {}; } catch { return {}; }
  });
  const setOpcionesCrear = (v) => {
    setOpcionesCrearEstado(v);
    try { localStorage.setItem(claveOpciones, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  };
  const [verOpciones, setVerOpciones] = useState(false);
  // El modelo se escoge aparte («Con qué modelo»): lo de antes guardado aquí ya no cuenta.
  const opcionesPuestas = ["preset", "estilo", "plantilla"].filter((k) => opcionesCrear[k]).length;
  // «Con qué modelo» para lo que se hace AQUÍ (crear, otra versión, corregir, recrear): sólo esta vez, no fija nada.
  const [modeloAccion, setModeloAccion] = useState("");
  // Dónde se hacen «Otra versión», «Corregir esta» y «Recrear con mi marca»: en el Estudio (con propuestas, comentario y
  // ejemplos de la galería; lo escogido vuelve a su sitio) o aquí, rápido. Se recuerda por navegador.
  const claveDonde = "post-acciones-donde";
  const [donde, setDondeEstado] = useState(() => { try { return localStorage.getItem(claveDonde) === "aqui" ? "aqui" : "estudio"; } catch { return "estudio"; } });
  const setDonde = (v) => { setDondeEstado(v); try { localStorage.setItem(claveDonde, v); } catch { /* sin almacenamiento */ } };
  const conModelo = (a) => (a?.modelo ? ` con ${nombreDelModelo(a.modelo)}` : "");
  const uso = cal && post.id ? cal.dbId || cal.id : null;
  const costoDe = (costo) => costo.toFixed(2).replace(".", ",");
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
        confirmar: (costo) => window.confirm(`${recrear ? "Recrearla" : "Esta versión"} cuesta unos ${costoDe(costo)} $. ¿Sigo?`),
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
        confirmar: (costo) => window.confirm(`Esta imagen cuesta unos ${costoDe(costo)} $. ¿Sigo?`),
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
      onError?.("Escribe en «¿Qué quieres?» qué hay que cambiar de la imagen y pulsa «Corregir esta» otra vez.");
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
   * «Otra versión», «Corregir esta» y «Recrear con mi marca» EN EL ESTUDIO: la imagen se abre en el visor de la galería
   * (sus versiones, «Editar» con comentario y ejemplos, el modelo para esa vez) o en el recreador, que propone antes de
   * crear; lo que se escoja allí vuelve al sitio de esta imagen (en un carrusel, a su lámina). Si la imagen no estaba
   * en la galería (subida al post, de Drive), se sube; una que no salió del Estudio no tiene pedido que repetir, y su
   * «Otra versión» abre el compositor con ella de referencia.
   */
  const abrirEnEstudio = async (medio, accion) => {
    if (versionando || !clientId) return;
    setVersionando(medio.src);
    setDeshacer(null);
    setEscrito("");
    onError?.(""); // el aviso de un intento anterior ya no aplica
    setProgresoVersion("Abriendo el Estudio con esta imagen…");
    try {
      const archivo = await archivoEnGaleria(clientId, medio.src);
      if (accion === "version" && (archivo.subido || !archivo.modelo)) abrirCreacion({ tipo: "imagen", version: medio, reemplaza: medio });
      else abrirCreacion({ abrir: archivo, accion, reemplaza: medio, indicacion });
    } catch (e) {
      onError?.(`No se pudo abrir en el Estudio: ${e.message}`);
    }
    setVersionando(null);
    setProgresoVersion("");
  };
  const enEstudio = donde === "estudio";

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

  return (
    <div className="pestana-publicar" data-ancho={ancho || undefined}>
      <div className="pp-izquierda">
      <div className="pp-config">
      {/* Lo que pidió cambiar el cliente, con «Rehacer la imagen» (la misma imagen, sólo ese cambio). */}
      <CambiosDelCliente post={post} setForm={setForm} clientId={clientId} uso={cal && post.id ? { calendarId: cal.dbId || cal.id, postId: post.id } : null} />
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

      {/* El compositor: archivos y texto en una misma tarjeta. */}
      <section className="compositor" aria-label="Contenido de la publicación">
        <EditorMedios
          post={post}
          clientId={clientId}
          driveFolder={client?.driveFolder}
          onChange={alCambiarMedios}
          onError={onError}
          entradaRef={entrada}
          onPortada={conPortada ? (c) => setForm((p) => ({ ...p, ...c })) : null}
          onCrearConIA={abrirCreacion}
          onOtraVersion={client ? (m) => (enEstudio ? abrirEnEstudio(m, "version") : otraVersion(m)) : null}
          onRecrear={client ? (m) => (enEstudio ? abrirEnEstudio(m, "recrear") : otraVersion(m, { recrear: true })) : null}
          onCrearAqui={puedeCrearAqui ? crearAqui : null}
          onCorregir={clientId ? (m) => (enEstudio ? abrirEnEstudio(m, "editar") : corregir(m)) : null}
          versionando={versionando}
          onCrearCarrusel={post.format === "carrusel" && clientId ? () => setCarrusel(true) : null}
          onCrearReel={post.format === "reel" && clientId ? () => setReel(true) : null}
          onDeLaGaleria={clientId ? () => setGaleria(true) : null}
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
                ? "Manda sobre todo lo demás: el director de arte rediseña la pieza con ello."
                : enEstudio
                  ? "«Corregir esta» lo lleva escrito al Estudio, donde puedes sumar ejemplos de la galería antes de editar."
                  : "Manda sobre todo lo demás en «Otra versión» y «Recrear con mi marca». «Corregir esta» cambia sólo esto en la misma imagen."}
            </p>
            {conImagen && (
              <div className="donde-se-hace" role="group" aria-labelledby={`${ids}-donde`}>
                <span className="label" id={`${ids}-donde`}>«Otra versión», «Corregir esta» y «Recrear»:</span>
                <button type="button" className="filter-chip" aria-pressed={enEstudio} onClick={() => setDonde("estudio")}>
                  <Icon name="imageAi" size={13} /> En el Estudio
                </button>
                <button type="button" className="filter-chip" aria-pressed={!enEstudio} onClick={() => setDonde("aqui")}>
                  <Icon name="sparkles" size={13} /> Aquí, rápido
                </button>
                <p className="hint" style={{ margin: 0, flexBasis: "100%" }}>
                  {enEstudio
                    ? "Se abre la imagen en el Estudio: propuestas, comentario, ejemplos de la galería y el modelo. Lo que escojas vuelve a su sitio (en un carrusel, a su lámina)."
                    : "Se hace aquí mismo, sin revisar antes, y ocupa su sitio (con «Deshacer»)."}
                </p>
              </div>
            )}
            {(puedeCrearAqui || (conImagen && !enEstudio)) && (
              <SelectorModeloDelEspacio
                valor={modeloAccion} onCambiar={setModeloAccion} conReferencias
                proporcion={post.format === "historia" || post.format === "reel" ? "9:16" : "4:5"}
                etiqueta="Con qué modelo (sólo esta vez)" vacio="El del cliente"
              />
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
        {galeria && (
          <Suspense fallback={null}>
            <GaleriaSelector clienteId={clientId} maximo={LIMITES.instagram.carruselMax} yaTiene={mediosDe(post).length} onElegir={ponerDeGaleria} onCerrar={() => setGaleria(false)} />
          </Suspense>
        )}
        {/* «Guardar en Drive»: en la carpeta del cliente, por mes y semana (sólo si tiene carpeta). */}
        {client?.driveFolder && clientId && day?.date && (
          <BotonGuardarDrive clientId={clientId} post={post} fecha={day.date} onGuardado={(g) => sf("guardadoDrive", g)} />
        )}
        {carrusel && (
          <Suspense fallback={null}>
            <CarruselIA client={client} post={post} cal={cal} onPoner={ponerCarrusel} onCerrar={() => setCarrusel(false)} />
          </Suspense>
        )}
        {reel && (
          <Suspense fallback={null}>
            <ReelIA client={client} post={post} cal={cal} onPoner={ponerReel} onCerrar={() => setReel(false)} />
          </Suspense>
        )}

        {esHistoria ? (
          <p className="notice notice-warn pestana-publicar-nota">
            Una historia no lleva texto, hashtags ni comentario: lo que diga va dentro de la imagen o el video.
            {mediosDe(post).length > 1 && ` Salen ${mediosDe(post).length} historias seguidas, en este orden.`}
            {" "}El sticker de enlace, la música y las encuestas sólo se ponen desde la app de Instagram.
          </p>
        ) : (
          <div className="field compositor-texto">
            <div className="compositor-texto-cabecera">
              <label className="label" htmlFor={`${ids}-desc`}>Texto de la publicación</label>
              <button type="button" className="btn-ai" disabled={!tieneContenido(post) || !!escribiendo} onClick={escribir}
                title={tieneContenido(post) ? "La IA mira la imagen o el video y escribe el texto, los hashtags, el primer comentario y el texto alternativo que falten." : "Sube una imagen o un video primero"}>
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
            <div role="status" aria-live="polite" className={escrito ? undefined : "sr-only"}>{escrito && <p className="notice notice-ok">{escrito}</p>}</div>
          </div>
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
              <HistoriasDelPost post={post} sf={sf} clientId={clientId} cliente={client} calendarId={uso} colorMarca={client?.primaryColor} onError={onError} />
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

      {dialogoCreacion}
    </div>
  );
}
