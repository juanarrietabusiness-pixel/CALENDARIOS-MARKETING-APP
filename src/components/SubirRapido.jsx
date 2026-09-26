import "./calendario/publicar.css";
import "./SubirRapido.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import HoraSugerida from "./calendario/horaSugerida";
import { EditorMedios } from "./calendario/editorPublicacion";
import DestinoRedes from "./calendario/destinoRedes";
import VistaRed from "./calendario/vistaRed";
import { TimePicker } from "./calendario/primitivas";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useAnchoAmplio } from "../hooks/useAnchoAmplio";
import { estadoRedes as leerEstadoRedes, saveCalendar, publicar, subirImagenPublicacion } from "../lib/db";
import { escribirDesdeContenido } from "../api";
import { prepararParaRedes } from "../lib/medios";
import { REDES, conMedios, revisarPublicacion, momentoPublicacion, mediosDe } from "../lib/publicacion";
import { formatoDeMedios, redesPorDefecto, rellenarDesdeContenido, ponerEnDia, resumenDestino } from "../lib/subir";
import { fechaEnZona } from "../lib/agenda";
import { fechaHora } from "../lib/cola";
import { MONTHS } from "../constants";
import { uid } from "../utils";

// ============================================================
// «Subir»: el archivo primero, todo lo demás después
//
// Subir o programar era el ÚLTIMO de cinco pasos —crear el calendario,
// ir al día, crear la idea, abrir la publicación y entrar a la pestaña—.
// Aquí es al revés:
//
//   1. El cliente (viene el que está abierto o en foco).
//   2. El archivo: arrastrar, elegir o pegar con Ctrl+V.
//   3. El formato, deducido del archivo (se cambia con un toque).
//   4. La IA mira el archivo y escribe el texto; se retoca.
//   5. ¿Cuándo sale? Ahora, programada, o a mano desde el teléfono.
//
// En pantalla ancha es una ventana grande: a la izquierda se configura y
// a la derecha se ve cómo queda en cada red, con su texto. Qué sale y
// dónde lo dice la misma pieza que el panel (`DestinoRedes`): cada red
// marcada o no, y la frase de dónde sale y dónde NO.
//
// Por detrás se crea la publicación en su día —y el calendario de ese mes
// si no existe—. Lo que se sube así sale DIRECTO: queda aprobada, sin pasar
// por la aprobación del cliente (decisión de la agencia).
// ============================================================

const MODOS = [["ahora", "Ahora", "send"], ["programar", "Programar", "clock"], ["mano", "La publico yo", "photo"]];

/** La hora de Panamá de ahora, «HH:MM». */
const horaAhora = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
/** La siguiente hora en punto con al menos 30 min de margen: una hora por defecto que no ha pasado. */
function proximaHora() {
  const [h, m] = horaAhora().split(":").map(Number);
  const siguiente = Math.min(23, h + (m >= 30 ? 2 : 1));
  return `${String(siguiente).padStart(2, "0")}:00`;
}

export default function SubirRapido({ clients = [], clienteInicial = null, onCalendarioGuardado, soltarPendiente, onAbrir, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const ancho = useAnchoAmplio(1024);
  const entrada = useRef(null);
  const [clienteId, setClienteId] = useState(clienteInicial ?? clients[0]?.id ?? "");
  const [post, setPost] = useState({ medios: [], format: null, descripcion: "", hashtagsFinales: "" });
  const [formatoElegido, setFormatoElegido] = useState(null);
  const [redes, setRedes] = useState(null);
  const [estado, setEstado] = useState(null);
  const [modo, setModo] = useState("programar");
  const [fecha, setFecha] = useState(fechaEnZona());
  const [hora, setHora] = useState(proximaHora());
  const [nota, setNota] = useState("");
  const [escribiendo, setEscribiendo] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [fallo, setFallo] = useState("");
  const [hecho, setHecho] = useState(null);
  const yaEscribio = useRef(false);

  const cliente = clients.find((c) => c.id === clienteId) ?? null;
  const clienteDb = cliente?.dbId || cliente?.id;
  useEffect(() => { leerEstadoRedes().then(setEstado).catch(() => setEstado({ meta: {}, cuentas: [] })); }, []);
  const redesDelCliente = useMemo(
    () => [...new Set((estado?.cuentas ?? []).filter((c) => c.clientId === clienteDb).map((c) => c.red))],
    [estado, clienteDb],
  );
  const destino = redes ?? redesPorDefecto(redesDelCliente);
  const formato = formatoElegido ?? formatoDeMedios(mediosDe(post)) ?? "post";
  const completo = { ...post, format: formato, redes: destino, publishTime: modo === "ahora" ? horaAhora() : hora };
  const { errores } = revisarPublicacion(completo, destino, { navegador: true });
  const cuando = modo === "ahora" ? null : momentoPublicacion(fecha, hora);
  const yaPaso = modo === "programar" && cuando && Date.parse(cuando) < Date.now() - 60_000;
  const sinCuenta = destino.filter((r) => !redesDelCliente.includes(r));
  const hayMedios = mediosDe(post).length > 0;

  // Cambiar de cliente vacía lo subido: los archivos viven en SU carpeta.
  const cambiarCliente = (id) => {
    setClienteId(id);
    setPost({ medios: [], format: null, descripcion: "", hashtagsFinales: "" });
    setRedes(null);
    setFormatoElegido(null);
    yaEscribio.current = false;
  };

  const escribir = async (p = completo) => {
    setFallo("");
    setEscribiendo("Preparando…");
    try {
      const propuesta = await escribirDesdeContenido(cliente, p, { fecha, alProgresar: setEscribiendo });
      setPost((actual) => rellenarDesdeContenido({ ...actual, format: formato }, propuesta).post);
    } catch (e) {
      setFallo(`La IA no pudo escribir: ${e.message}`);
    }
    setEscribiendo("");
  };

  // En cuanto hay archivo y no hay texto, la IA escribe sola: es el caso normal.
  const alCambiarMedios = (medios) => {
    const siguiente = conMedios(post, medios);
    setPost(siguiente);
    if (medios.length && !yaEscribio.current && !String(post.descripcion ?? "").trim()) {
      yaEscribio.current = true;
      void escribir({ ...siguiente, format: formatoElegido ?? formatoDeMedios(medios) ?? "post" });
    }
  };

  const confirmar = async () => {
    setFallo("");
    const hoy = fechaEnZona();
    const dia = modo === "ahora" ? hoy : fecha;
    try {
      setTrabajando("Preparando…");
      let nuevo = {
        ...completo,
        id: uid(),
        status: "approved",
        title: completo.title || completo.idea?.slice(0, 60) || "",
        asistida: modo === "mano",
        notaAsistida: modo === "mano" ? nota : "",
        subidaRapida: true,
      };
      if (modo !== "mano") {
        setTrabajando("Preparando las imágenes…");
        nuevo = (await prepararParaRedes(nuevo, destino, { subir: (f) => subirImagenPublicacion(clienteDb, f), colorMarca: cliente?.primaryColor })).post;
      }
      // El calendario de ese mes; si no existe, se crea.
      const [a, m] = dia.split("-").map(Number);
      let cal = (cliente.calendars ?? []).find((k) => k.year === a && k.month === m - 1);
      if (!cal) {
        setTrabajando("Creando el calendario del mes…");
        cal = await saveCalendar({ name: `${MONTHS[m - 1]} ${a}`, month: m - 1, year: a, campaign: "", weekConcepts: [], days: [] }, clienteDb);
        onCalendarioGuardado(cliente.id, cal);
      }
      // Lo que se estuviera guardando de ese calendario va DENTRO de éste:
      // si saliera después, se llevaría la publicación nueva por delante.
      soltarPendiente?.(cal.id);
      setTrabajando("Guardando…");
      const guardado = await saveCalendar(ponerEnDia(cal, dia, nuevo), clienteDb);
      onCalendarioGuardado(cliente.id, guardado);
      if (modo !== "mano") {
        setTrabajando(modo === "ahora" ? "Publicando…" : "Programando…");
        await publicar({ calendarId: guardado.dbId || guardado.id, postId: nuevo.id, redes: destino, ahora: modo === "ahora" });
      }
      setHecho({
        texto: modo === "ahora" ? "Publicando: en unos segundos sale." : modo === "mano"
          ? `Guardada para publicarla a mano el ${fechaHora(momentoPublicacion(dia, hora))}: te sale en Mi día.`
          : `Programada para ${fechaHora(cuando)}.`,
        clientId: cliente.id, calendarId: guardado.id, postId: nuevo.id,
      });
    } catch (e) {
      setFallo(e.message);
    }
    setTrabajando("");
  };

  const vista = cliente && hayMedios ? <VistaRed post={completo} redes={destino} client={cliente} /> : null;

  const etiqueta = modo === "ahora" ? "Publicar ahora" : modo === "mano" ? "Guardar para publicar a mano" : cuando ? `Programar para ${fechaHora(cuando)}` : "Programar";
  const bloqueado = !!trabajando || !!escribiendo || !cliente || !hayMedios
    || (modo !== "mano" && (errores.length > 0 || sinCuenta.length > 0 || !estado?.meta?.conectado && destino.some((r) => r !== "tiktok")))
    || (modo === "programar" && (!cuando || yaPaso));

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !trabajando) onClose(); }}>
      <div ref={ref} className={`dialog subir-rapido${ancho ? " subir-ancho" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="subir-cabecera">
          <h2 id={`${ids}-t`}><Icon name="upload" size={20} /> Subir contenido</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar" disabled={!!trabajando}><Icon name="close" /></button>
        </div>

        {hecho ? (
          <div className="subir-hecho">
            <p className="notice notice-ok"><Icon name="check" size={16} /> {hecho.texto}</p>
            <div className="subir-botones">
              <button type="button" className="btn btn-secondary" onClick={() => { onAbrir?.(hecho); onClose(); }}>Ver en el calendario</button>
              <button type="button" className="btn btn-primary" onClick={() => { setHecho(null); cambiarCliente(clienteId); }}>
                <Icon name="upload" size={16} /> Subir otra
              </button>
            </div>
          </div>
        ) : (
          <div className="subir-columnas">
          <div className="subir-config">
            <div className="field">
              <label className="label" htmlFor={`${ids}-c`}>Cliente</label>
              <select id={`${ids}-c`} className="input" value={clienteId} onChange={(e) => cambiarCliente(e.target.value)} disabled={!!trabajando}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {cliente && (
              <EditorMedios post={post} clientId={clienteDb} driveFolder={cliente.driveFolder} onChange={alCambiarMedios} onError={setFallo} entradaRef={entrada} />
            )}

            {hayMedios && (
              <>
                <DestinoRedes
                  post={completo}
                  redes={destino}
                  onRedes={setRedes}
                  cuentas={estado ? redesDelCliente : null}
                  formato={formato}
                  onFormato={setFormatoElegido}
                />

                {formato !== "historia" && (
                  <div className="field">
                    <div className="subir-texto-cabecera">
                      <label className="label" htmlFor={`${ids}-d`}>Texto</label>
                      <button type="button" className="btn-ai" disabled={!!escribiendo} onClick={() => escribir()}>
                        <Icon name="sparkles" size={14} /> {escribiendo ? escribiendo : "Escribir con IA"}
                      </button>
                    </div>
                    <textarea id={`${ids}-d`} className="textarea" style={{ minHeight: 110 }} value={post.descripcion || ""}
                      onChange={(e) => setPost((p) => ({ ...p, descripcion: e.target.value }))}
                      placeholder={escribiendo ? "La IA está mirando el archivo…" : "El caption de la publicación"} />
                    <label className="sr-only" htmlFor={`${ids}-h`}>Hashtags</label>
                    <input id={`${ids}-h`} className="input" value={post.hashtagsFinales || ""} onChange={(e) => setPost((p) => ({ ...p, hashtagsFinales: e.target.value }))} placeholder="#hashtags" />
                  </div>
                )}
                {formato === "historia" && escribiendo && <p className="hint" role="status">{escribiendo}</p>}
                {!ancho && vista}
              </>
            )}

            {hayMedios && (
              <fieldset className="cuando-elegir">
                <legend className="label">¿Cuándo sale?</legend>
                <div className="segmented" role="radiogroup" aria-label="Cuándo sale">
                  {MODOS.map(([k, nombre, icono]) => (
                    <button key={k} type="button" role="radio" aria-checked={modo === k} className={`segmented-btn ${modo === k ? "active" : ""}`} onClick={() => setModo(k)}>
                      <Icon name={icono} size={14} /> {nombre}
                    </button>
                  ))}
                </div>
                {modo !== "ahora" && (
                  <div className="cuando-fecha">
                    <SelectorFecha value={fecha} onChange={(f) => f && setFecha(f)} etiqueta="Día de publicación" vacio="Sin día" prefijo="El" />
                    <label className="sr-only" htmlFor={`${ids}-hora`}>Hora</label>
                    <TimePicker id={`${ids}-hora`} value={hora} onChange={setHora} />
                    <HoraSugerida clientId={clienteDb} fecha={fecha} hora={hora} onUsar={setHora} />
                  </div>
                )}
                {modo === "mano" && (
                  <>
                    <label className="sr-only" htmlFor={`${ids}-n`}>Qué hay que poner a mano</label>
                    <input id={`${ids}-n`} className="input" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: canción «…» desde el minuto 0:15; sticker de encuesta" />
                  </>
                )}
                {yaPaso && <p className="hint">Esa hora ya pasó: cámbiala o elige «Ahora».</p>}
                {modo !== "mano" && sinCuenta.length > 0 && (
                  <p className="hint">{cliente?.name} no tiene cuenta de {sinCuenta.map((r) => REDES[r].nombre).join(" ni de ")} conectada: quítala o conéctala en Ajustes → Integraciones.</p>
                )}
                {modo !== "mano" && errores.length > 0 && (
                  <ul className="revision-lista" data-tipo="error">{errores.map((e) => <li key={e}><Icon name="alert" size={14} /> {e}</li>)}</ul>
                )}
                <p className="hint">Sale directo: queda aprobada, sin pasar por el cliente.</p>
              </fieldset>
            )}

            {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
            <div role="status" aria-live="polite" className={trabajando ? "hint" : "sr-only"}>{trabajando}</div>

            {hayMedios && <p className="cuando-destino"><Icon name="send" size={13} /> {resumenDestino(completo, destino)}</p>}
            <div className="subir-botones">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={!!trabajando}>Cancelar</button>
              <button type="button" className="btn btn-primary cuando-principal" disabled={bloqueado} onClick={confirmar}>
                <Icon name={MODOS.find(([k]) => k === modo)[2]} size={16} /> {trabajando ? "Un momento…" : hayMedios ? etiqueta : "Sube un archivo para seguir"}
              </button>
            </div>
          </div>
          {ancho && (
            <aside className="subir-vista" aria-label="Cómo se va a ver">
              <h3 className="label">Así se va a ver</h3>
              {hayMedios ? vista : <p className="hint">Sube una imagen o un video y aquí verás cómo queda en cada red, con su texto.</p>}
            </aside>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
