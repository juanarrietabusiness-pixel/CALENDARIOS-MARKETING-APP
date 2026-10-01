import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import Compositor from "./EstudioCompositor";
import Visor, { Pieza } from "./EstudioVisor";
import { OverflowMenu } from "./calendario/primitivas";
import { soloLectura } from "../lib/sesionActual";
import * as api from "../lib/estudio";
import {
  modeloPorId, modeloPorDefecto, estimar, textoCosto, pideConfirmar, ajustesDe, estaVivo, maxPorPedido, PRECIOS_AL, MAX_PROMPT,
} from "../lib/estudioCatalogo";
import {
  filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, textoPapelera, nombreDeDescarga,
  proporcionDeMedidas, promptDeEdicion, modeloParaEditar, originalDe,
} from "../lib/estudio";
import "./Estudio.css";

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
const MEDIOS_VACIOS = () => ({ reference: [], start: [], end: [] });
const FILTROS_FIJOS = ["todas", "favoritas", "subidas", "sin-carpeta"];

const reemplazar = (lista = [], t) => (lista.some((x) => x.id === t.id) ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]);
const nombreDeModelo = (id) => modeloPorId(id)?.nombre ?? (id ? id : "Aplicación");
const clavesDe = (medios) => Object.fromEntries(Object.entries(medios).map(([rol, lista]) => [rol, lista.map((a) => a.clave)]));

/** El formulario con que arranca el compositor. */
function formularioInicial(motores, inicial) {
  const activos = Object.fromEntries(Object.entries(motores).map(([k, v]) => [k, v.activo]));
  const tipo = inicial?.tipo ?? "imagen";
  const m = modeloPorDefecto(activos, tipo);
  const medios = MEDIOS_VACIOS();
  if (inicial?.inicio) medios.start = [inicial.inicio];
  return {
    tipo, modelo: m.id, prompt: inicial?.prompt ?? "", n: 1, medios,
    ajustes: ajustesDe(m, inicial?.proporcion ? { aspectRatio: inicial.proporcion } : {}, clavesDe(medios)),
  };
}

export default function Estudio({ client, pulso = 0, modo = "pestana", inicial = null, uso = null, onUsar = null, onCerrar = null }) {
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
  // «Escribir el prompt»: cuánto pesan la memoria de la marca y las referencias, y si es un carrusel.
  const [escritura, setEscritura] = useState({ memoria: 60, apego: 50, diapositivas: 1 });
  const [escribiendo, setEscribiendo] = useState(false);
  const [serie, setSerie] = useState(null); // { estilo, prompts: [] }: un carrusel ya escrito

  const [filtro, setFiltro] = useState("todas");
  const [texto, setTexto] = useState("");
  const [enPapelera, setEnPapelera] = useState(false);
  const [visor, setVisor] = useState(null);
  const [descartados, setDescartados] = useState(() => new Set());
  const [carpetaNueva, setCarpetaNueva] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [borrando, setBorrando] = useState(null);

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

  // El formulario de partida, una vez que se sabe qué motores tienen llave.
  useEffect(() => {
    if (motores && !form) setForm(formularioInicial(motores, inicial));
  }, [motores, form, inicial]);

  const modelo = form ? modeloPorId(form.modelo) : null;
  const motorActivo = (m) => Boolean(motores?.[m.motor]?.activo);
  const ajustes = form && modelo ? ajustesDe(modelo, form.ajustes, clavesDe(form.medios)) : {};
  // Un carrusel escrito son N pedidos de una imagen: el costo es el de las N.
  const costo = form && modelo ? estimar(modelo, serie ? serie.prompts.length : form.n, ajustes) : 0;

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
  const enfocarPrompt = () => {
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const cambiarTipo = (tipo) => {
    if (!motores || tipo === form.tipo) return;
    const activos = Object.fromEntries(Object.entries(motores).map(([k, v]) => [k, v.activo]));
    const m = modeloPorDefecto(activos, tipo);
    setConfirmando(null);
    setForm((f) => {
      const medios = { reference: f.medios.reference.slice(0, m.referencias || 0), start: f.medios.start.slice(0, m.inicial || 0), end: f.medios.end.slice(0, m.final || 0) };
      return { ...f, tipo, modelo: m.id, n: 1, medios, ajustes: ajustesDe(m, { aspectRatio: f.ajustes.aspectRatio }, clavesDe(medios)) };
    });
  };

  const cambiarModelo = (id) => {
    const m = modeloPorId(id);
    setConfirmando(null);
    setForm((f) => {
      const medios = { reference: f.medios.reference.slice(0, m.referencias || 0), start: f.medios.start.slice(0, m.inicial || 0), end: f.medios.end.slice(0, m.final || 0) };
      return { ...f, modelo: id, n: Math.min(f.n, maxPorPedido(m)), medios, ajustes: ajustesDe(m, f.ajustes, clavesDe(medios)) };
    });
  };

  /** La IA lee la idea, mira las referencias y escribe el prompt (o uno por diapositiva). No gasta en el motor. */
  const escribirConIA = async () => {
    if (!form || escribiendo) return;
    if (!form.prompt.trim()) { avisar(false, "Escribe primero la idea, con tus palabras."); promptRef.current?.focus(); return; }
    setEscribiendo(true);
    setAviso(null);
    try {
      const r = await api.escribirPrompt(client.id, {
        idea: form.prompt, tipo: form.tipo, diapositivas: form.tipo === "imagen" ? escritura.diapositivas : 1,
        apego: escritura.apego, memoria: escritura.memoria,
        referencias: [...form.medios.reference, ...form.medios.start].map((a) => a.src),
      });
      const prompts = r.prompts.map((p) => p.slice(0, MAX_PROMPT));
      setConfirmando(null);
      // Una imagen: el prompt escrito ocupa el campo. Un carrusel: la idea se queda y las diapositivas salen debajo.
      if (prompts.length === 1) setForm((f) => ({ ...f, prompt: prompts[0] }));
      setSerie(prompts.length > 1 ? { estilo: r.estilo, prompts } : null);
      avisar(true, [
        prompts.length > 1 ? `Listo: ${prompts.length} diapositivas de la misma serie. Revísalas antes de crear.` : "Listo: revisa el prompt antes de crear.",
        r.conMemoria ? "" : escritura.memoria > 0 ? "El cerebro del cliente aún no tiene su identidad visual: se escribió sin ella." : "",
        r.aviso ?? "",
      ].filter(Boolean).join(" "));
      enfocarPrompt();
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setEscribiendo(false);
    }
  };

  /** Un carrusel: una carpeta para la serie y un pedido por diapositiva, con el mismo modelo y los mismos ajustes. */
  const enviarSerie = async () => {
    setEnviando(true);
    setAviso(null);
    setEnPapelera(false);
    try {
      const fecha = new Date().toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const { carpeta } = await api.crearCarpeta(client.id, `Carrusel · ${fecha}`).catch(() => ({ carpeta: null }));
      for (const [i, prompt] of serie.prompts.entries()) {
        const { trabajo } = await api.pedirImagenes(client.id, {
          modelo: form.modelo, prompt, n: 1, ajustes, medios: clavesDe(form.medios), confirmado: true,
          ...(carpeta?.id ? { carpetaId: carpeta.id } : {}),
          ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}),
        });
        setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
        seguir(trabajo.id);
        if (i === 0) avisar(true, `Creando ${serie.prompts.length} diapositivas${carpeta ? ` en la carpeta «${carpeta.nombre}»` : ""}…`);
      }
      setSerie(null);
      if (carpeta?.id) cargar();
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setEnviando(false);
    }
  };

  /** «Editar»: la imagen va de referencia a un modelo que edita, con la indicación y la orden de no tocar lo demás. */
  const editar = async (a, instruccion) => {
    const prompt = promptDeEdicion(instruccion);
    if (!prompt || !motores) return;
    const activos = Object.fromEntries(Object.entries(motores).map(([k, v]) => [k, v.activo]));
    const m = modeloParaEditar(activos);
    const proporcion = a.ajustes?.aspectRatio ?? proporcionDeMedidas(a.ancho, a.alto);
    try {
      const { trabajo } = await api.pedirImagenes(client.id, {
        modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: proporcion }, { reference: [a.clave] }),
        medios: { reference: [a.clave] }, confirmado: true,
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
    if (serie) {
      if (!confirmado && pideConfirmar(costo)) { setConfirmando(costo); return; }
      setConfirmando(null);
      await enviarSerie();
      return;
    }
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
      const { trabajo } = await api.pedirImagenes(client.id, {
        modelo: form.modelo, prompt: form.prompt, n: form.n, ajustes,
        medios: clavesDe(form.medios), confirmado: true,
        ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}),
      });
      setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
      seguir(trabajo.id);
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

  /** Dónde cabe una imagen en el modelo elegido: inicial, final o referencia. `null` si no cabe en ninguna. */
  const ranuraPara = (f, m, a) => {
    const puesta = (lista) => lista.some((x) => x.id === a.id);
    if (m.inicial && !f.medios.start.length) return "start";
    if (m.final && f.medios.start.length && !f.medios.end.length && !puesta(f.medios.start)) return "end";
    if (m.referencias && f.medios.reference.length < m.referencias) return "reference";
    return null;
  };
  const NOMBRE_RANURA = { start: "imagen inicial", end: "imagen final", reference: "referencia" };

  const usarComoMedio = (a) => {
    if (!form || !modelo) return;
    if (Object.values(form.medios).some((l) => l.some((x) => x.id === a.id))) { avisar(true, "Ya está puesta."); return; }
    const rol = ranuraPara(form, modelo, a);
    if (!rol) {
      avisar(false, modelo.inicial || modelo.referencias
        ? `${modelo.nombre} no admite más imágenes de apoyo. Quita alguna o escoge otro modelo.`
        : `${modelo.nombre} no admite imágenes de referencia. Escoge otro modelo.`);
      return;
    }
    setConfirmando(null);
    setForm((f) => ({ ...f, medios: { ...f.medios, [rol]: [...f.medios[rol], a] } }));
    avisar(true, `Puesta como ${NOMBRE_RANURA[rol]}. Escribe qué quieres hacer con ella.`);
    enfocarPrompt();
  };

  /** «Animar»: la imagen pasa a ser el primer fotograma de un video. */
  const animar = (a) => {
    if (!motores) return;
    const activos = Object.fromEntries(Object.entries(motores).map(([k, v]) => [k, v.activo]));
    const m = modeloPorId(form.modelo)?.tipo === "video" ? modeloPorId(form.modelo) : modeloPorDefecto(activos, "video");
    const proporcion = proporcionDeMedidas(a.ancho, a.alto);
    const medios = { reference: [], start: [a], end: [] };
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

  const repetir = (a, conReferencia = false) => {
    const m = modeloPorId(a.modelo);
    const usable = m && motorActivo(m);
    const destino = usable ? m : modeloPorId(form.modelo);
    const medios = MEDIOS_VACIOS();
    if (conReferencia && destino.referencias) medios.reference = [a];
    setConfirmando(null);
    setForm({ tipo: destino.tipo, modelo: destino.id, prompt: a.prompt, n: 1, medios, ajustes: ajustesDe(destino, a.ajustes, clavesDe(medios)) });
    setVisor(null);
    setEnPapelera(false);
    setAviso(usable || !m ? null : { ok: false, texto: `${m.nombre} no está disponible en este servidor: se usó ${destino.nombre}.` });
    enfocarPrompt();
  };

  const subirArchivos = async (archivos, rol) => {
    if (!form || !modelo) return;
    setSubiendo(true);
    setAviso(null);
    try {
      let ultima = null;
      const enCarpeta = !FILTROS_FIJOS.includes(filtro) ? filtro : null;
      for (const f of archivos.slice(0, 6)) {
        ultima = (await api.subirImagen(client.id, f, { carpetaId: enCarpeta })).archivo;
        const limite = rol === "reference" ? modelo.referencias : rol === "start" ? modelo.inicial : modelo.final;
        setForm((fm) => (fm.medios[rol].length < (limite || 0) ? { ...fm, medios: { ...fm.medios, [rol]: [...fm.medios[rol], ultima] } } : fm));
      }
      avisar(true, archivos.length === 1 ? "Imagen subida a la galería." : `${Math.min(archivos.length, 6)} imágenes subidas.`);
      await cargar();
    } catch (err) {
      avisar(false, err.message);
    } finally {
      setSubiendo(false);
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
  const aPapelera = (a) => accion(async () => { await api.mandarAPapelera(client.id, a.id); setVisor(null); }, "Movida a la papelera. Puedes recuperarla 30 días.");
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
  const vaciar = () => accion(async () => {
    const r = await api.vaciarPapelera(client.id);
    avisar(true, r.borrados ? `${r.borrados} borrada${r.borrados === 1 ? "" : "s"} del todo.` : "No había nada que borrar (lo que usa una publicación se queda).");
  });
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
  const visibles = useMemo(() => filtrarArchivos(archivos, { filtro, texto }), [archivos, filtro, texto]);
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

      {/* ---------- Pedir ---------- */}
      {!lectura && form && modelo && (
        <Compositor
          ids={ids} form={{ ...form, ajustes }} setForm={setForm} modelo={modelo} motores={motores} costo={costo}
          confirmando={confirmando} enviando={enviando} subiendo={subiendo} promptRef={promptRef}
          onEnviar={enviar} onConfirmar={() => enviar(true)} onNo={() => setConfirmando(null)}
          onModelo={cambiarModelo} onTipo={cambiarTipo} onQuitarMedio={quitarMedio} onSubirArchivos={subirArchivos}
          escritura={escritura} setEscritura={setEscritura} escribiendo={escribiendo} onEscribir={escribirConIA}
          serie={serie} setSerie={setSerie}
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
                  {nombreDeModelo(t.modelo)} · {fraseDeTrabajo(t)}
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
      <div className="est-galeria-cabecera">
        <h3 className="est-subtitulo">{enPapelera ? "Papelera" : "Galería"}</h3>
        <div className="est-filtros" role="group" aria-label="Filtrar la galería">
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === "todas"} onClick={() => { setEnPapelera(false); setFiltro("todas"); }}>Todas ({cuentas.todas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === "favoritas"} onClick={() => { setEnPapelera(false); setFiltro("favoritas"); }}>Favoritas ({cuentas.favoritas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === "subidas"} onClick={() => { setEnPapelera(false); setFiltro("subidas"); }}>Subidas ({cuentas.subidas})</button>
          {carpetas.map((c) => (
            <button key={c.id} type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === c.id} onClick={() => { setEnPapelera(false); setFiltro(c.id); }}>
              <Icon name="folder" size={13} /> {c.nombre} ({cuentas[c.id] ?? 0})
            </button>
          ))}
          {!lectura && carpetaNueva === null && (
            <button type="button" className="filter-chip est-chip-nueva" onClick={() => setCarpetaNueva("")}><Icon name="plus" size={13} /> Carpeta</button>
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
        {!enPapelera && carpetaActiva && !lectura && (
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
        {!enPapelera && archivos.length > 6 && (
          <div className="est-buscar">
            <label className="est-solo-lector" htmlFor={`${ids}-b`}>Buscar en la galería</label>
            <input id={`${ids}-b`} type="search" className="input" placeholder="Buscar por lo que pediste…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}
      </div>

      {enPapelera ? (
        <>
          {papelera.length > 0 && !lectura && (
            <p className="est-papelera-nota">
              Lo que llevas 30 días aquí se borra solo (menos lo que usa una publicación).{" "}
              <button type="button" className="btn btn-secondary btn-sm" onClick={vaciar}>Vaciar la papelera</button>
            </p>
          )}
          {papelera.length === 0 ? (
            <p className="est-vacio">La papelera está vacía.</p>
          ) : (
            <ul className="est-rejilla">
              {papelera.map((a) => (
                <li key={a.id} className="est-tarjeta est-tarjeta-papelera">
                  <div className="est-img"><Pieza archivo={a} /></div>
                  <div className="est-pie">
                    <p className="est-prompt">{a.prompt}</p>
                    <p className="est-meta">{textoPapelera(a.borradoAt)}{a.usadoEn.length ? ` · en ${a.usadoEn.length} publicación${a.usadoEn.length === 1 ? "" : "es"}` : ""}</p>
                    {!lectura && (
                      borrando?.id === a.id ? (
                        <div className="est-confirmar-borrar" role="alert">
                          <p>{borrando.usos ? `Está en ${borrando.usos} publicación${borrando.usos === 1 ? "" : "es"}: desaparecerá de ${borrando.usos === 1 ? "ella" : "ellas"}.` : "¿Borrarla del todo?"}</p>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => borrarDeVerdad(a, true)}>Sí, borrar</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrando(null)}>No</button>
                        </div>
                      ) : (
                        <div className="est-acciones">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => recuperar(a)}><Icon name="undo" size={14} /> Recuperar</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => borrarDeVerdad(a)}>Borrar del todo</button>
                        </div>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : archivos.length === 0 ? (
        <div className="card est-vacio-grande">
          <h3>Todavía no hay nada de {client.name}</h3>
          <p>Escribe qué quieres arriba y pulsa «Crear». Cada pieza que salga queda aquí, y puedes usarla de referencia para la siguiente o animarla para sacar un video.</p>
        </div>
      ) : visibles.length === 0 ? (
        <p className="est-vacio">No hay nada con ese filtro.</p>
      ) : (
        <ul className="est-rejilla">
          {visibles.map((a) => (
            <li key={a.id} className="est-tarjeta">
              <button type="button" className="est-img" aria-label={`Abrir: ${a.prompt}`} onClick={() => setVisor(a)}>
                <Pieza archivo={a} />
                {a.tipo === "video" && <span className="est-marca-video"><Icon name="video" size={12} /> Video</span>}
                {enMedios(a) && <span className="est-marca-ref">En el pedido</span>}
              </button>
              <div className="est-pie">
                <p className="est-prompt">{a.prompt}</p>
                <p className="est-meta">{a.subido ? "Subida" : nombreDeModelo(a.modelo)}{a.costo > 0 ? ` · ${textoCosto(a.costo)}` : ""} · {hace(a.creado)}</p>
                {onUsar && (
                  <button type="button" className="btn btn-primary btn-sm est-usar" onClick={() => usarEnLaPublicacion(a)}>
                    <Icon name="check" size={14} /> Usar en la publicación
                  </button>
                )}
                <div className="est-acciones">
                  {!lectura && (
                    <>
                      <button type="button" className="btn-icon" aria-pressed={a.favorito} aria-label={a.favorito ? "Quitar de favoritas" : "Marcar como favorita"} onClick={() => alternarFavorito(a)}>
                        <Icon name="star" size={18} />
                      </button>
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
                    ...(!lectura ? [{ icon: "trash", label: "A la papelera", danger: true, onClick: () => aPapelera(a) }] : []),
                  ]} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="est-precios">Los precios son aproximados y de {new Date(PRECIOS_AL).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" })}. Lo que se gasta aquí suma al presupuesto de IA del mes.</p>

      {visor && (
        <Visor
          archivo={visor} carpetas={carpetas} lectura={lectura}
          onCerrar={() => setVisor(null)}
          onFavorito={() => alternarFavorito(visor)}
          onPapelera={() => aPapelera(visor)}
          onMover={(c) => moverA(visor, c)}
          onRepetir={() => repetir(visor)}
          onVariar={() => repetir(visor, true)}
          onReferencia={() => { const a = visor; setVisor(null); usarComoMedio(a); }}
          onAnimar={() => animar(visor)}
          onEditar={(instruccion) => editar(visor, instruccion)}
          original={originalDe(visor, datos?.trabajos ?? [], datos?.archivos ?? [])}
          onVerOriginal={(o) => setVisor(o)}
          onUsar={onUsar ? () => usarEnLaPublicacion(visor) : null}
        />
      )}
    </section>
  );
}
