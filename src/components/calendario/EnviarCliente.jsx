// ============================================================
// «Enviar a cliente»: el enlace de aprobación y lo que el cliente ve
//
// Salió de dialogos.jsx a su propio archivo y se carga EN DIFERIDO (CalendarView lo pide al abrirlo): la carga inicial
// está en su tope y este diálogo sólo hace falta al mandar el mes.
//
// Además de copiar el enlace o el mensaje: «Abrir en WhatsApp» (wa.me con el número de la ficha del cliente y el
// mensaje ya escrito), «Compartir…» donde el navegador lo deja (la hoja de compartir del teléfono), cuándo ABRIÓ el
// cliente su enlace (lo apunta el enlace público, worker/lib/publico.js) y si el cliente APRUEBA antes de publicar
// (`clients.aprueba_antes`): con «no», lo listo se programa sin esperar su respuesta. Copiar, abrir WhatsApp o
// compartir ES mandarlo (`onEnviado`): las publicaciones que va a ver pasan solas a la etapa «Cliente».
// ============================================================

import { useId, useState } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";
import FilaInterruptor from "../Interruptor";
import { enlaceWhatsApp, numeroWhatsApp, cuandoLoAbrio } from "../../lib/enviarCliente";

export default function EnviarCliente({
  approvalUrl, whatsappMessage, onClose, onGenerate, onRevoke, onReopen,
  hasLink, shareEnabled, working, allowEditing, onToggleEditing,
  opciones = {}, onCambiarOpciones, revisionEnviada = null, revisionRevisor = "", resumen = null,
  sinLoNecesario = 0, onRevisar = null, envio = null, onDisenar = null, onEnviado = null,
  whatsapp = "", abiertoAt = null, apruebaAntes = true, onCambiarApruebaAntes = null, onVerMes = null,
}) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [copied, setCopied] = useState("");
  const [mensaje, setMensaje] = useState(opciones.mensajeCliente ?? "");

  const numero = numeroWhatsApp(whatsapp);
  const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const compartir = async () => {
    try {
      await navigator.share({ title: "Calendario para revisar", text: whatsappMessage });
      onEnviado?.();
    } catch { /* cerró la hoja de compartir: no se mandó nada */ }
  };
  const abierto = cuandoLoAbrio(abiertoAt);

  // Copiar el enlace o el mensaje ES mandarlo: las publicaciones que va a ver pasan solas a la etapa «Cliente».
  const copy = (value, which) => {
    onEnviado?.();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  return (
    <div className="overlay">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="dialog">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Enviar a cliente</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {copied === "link" ? "Enlace copiado" : copied === "msg" ? "Mensaje copiado" : ""}
        </div>

        {hasLink ? (
          <>
            {!shareEnabled && (
              <p className="notice notice-warn" style={{ display: "block" }}>
                El enlace está <strong>revocado</strong>: quien lo abra no verá nada. Puedes
                reactivarlo sin reenviarlo, porque conserva la misma dirección.
              </p>
            )}

            <div className="field">
              <label className="label" htmlFor={`${ids}-url`}>Enlace de aprobación</label>
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <input id={`${ids}-url`} className="input" readOnly value={approvalUrl} onClick={(e) => e.target.select()} />
                <button className="btn btn-primary btn-sm" onClick={() => copy(approvalUrl, "link")}>
                  {copied === "link" ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="hint">
                Sólo permite ver y responder este calendario. No da acceso a ningún otro dato.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${ids}-msg`}>Mensaje para WhatsApp</label>
              <textarea
                id={`${ids}-msg`}
                className="textarea"
                readOnly
                style={{ minHeight: 100 }}
                value={whatsappMessage}
                onClick={(e) => { e.target.select(); copy(whatsappMessage, "msg"); }}
              />
              <p className="hint">Toca el mensaje para seleccionarlo y copiarlo.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                <a
                  className="btn btn-primary btn-sm"
                  href={enlaceWhatsApp(numero, whatsappMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onEnviado?.()}
                >
                  <Icon name="messageCircle" size={16} /> Abrir en WhatsApp
                </a>
                {puedeCompartir && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={compartir}>
                    <Icon name="upload" size={16} /> Compartir…
                  </button>
                )}
              </div>
              <p className="hint">
                {numero ? `Se abre el chat del WhatsApp de la ficha del cliente (+${numero}) con el mensaje ya escrito.` : "La ficha del cliente no tiene WhatsApp: se abre WhatsApp para que escojas el chat."}
              </p>
            </div>

            {/* Si lo abrió y cuándo: el enlace lo apunta (como mucho una vez por hora; lo que abre el equipo no cuenta). */}
            <p className={`notice ${abierto ? "notice-ok" : ""}`} style={{ display: "block", marginBottom: "var(--sp-3)" }}>
              <Icon name={abierto ? "eye" : "clock"} size={14} />{" "}
              {abierto ? `El cliente abrió su enlace ${abierto}.` : "El cliente todavía no ha abierto su enlace."}
            </p>

            <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
              Las respuestas de tu cliente aparecen aquí al instante, sin recargar.
            </p>

            {/* El calendario va al cliente COMPLETO: cada publicación con su pieza, así lo que apruebe queda listo
                para programar. Lo que falta se dice aquí, con su atajo. */}
            {envio && envio.total + envio.porCorregir + envio.corregidas > 0 && (
              <div className={`notice ${envio.sinPieza || envio.porCorregir ? "notice-warn" : "notice-ok"} envio-completo`} style={{ display: "block", marginBottom: "var(--sp-3)" }}>
                {envio.total > 0 && (envio.sinPieza ? (
                  <p style={{ margin: 0 }}>
                    <strong>{envio.conPieza} de {envio.total}</strong> llevan su pieza. {envio.sinPieza === 1 ? "1 todavía no" : `${envio.sinPieza} todavía no`}: el
                    cliente {envio.sinPieza === 1 ? "la verá" : "las verá"} como idea y, aprobada{envio.sinPieza === 1 ? "" : "s"}, aún habrá que {envio.sinPieza === 1 ? "producirla" : "producirlas"}.
                  </p>
                ) : (
                  <p style={{ margin: 0 }}><Icon name="check" size={14} /> Las {envio.total} llevan su pieza: lo que apruebe queda listo para programar.</p>
                ))}
                {envio.sinPieza > 0 && onDisenar && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onDisenar}><Icon name="imageAi" size={14} /> Diseñar las que faltan</button>
                )}
                {envio.sinHora > 0 && (
                  <p className="hint" style={{ margin: 0 }}>{envio.sinHora === 1 ? "1 no tiene" : `${envio.sinHora} no tienen`} hora: ponla para que al aprobarse se pueda programar sin tocar nada.</p>
                )}
                {envio.porCorregir > 0 && (
                  <p className="hint" style={{ margin: 0 }}>{envio.porCorregir === 1 ? "1 tiene" : `${envio.porCorregir} tienen`} cambios pedidos sin hacer: ábrela{envio.porCorregir === 1 ? "" : "s"} y usa «Rehacer la imagen con lo que pidió» (pestaña Pieza).</p>
                )}
                {envio.corregidas > 0 && (
                  <p className="hint" style={{ margin: 0 }}>{envio.corregidas === 1 ? "1 ya está corregida" : `${envio.corregidas} ya están corregidas`}: en su enlace salen «Actualizada · revísala» y el mensaje de abajo se lo dice.</p>
                )}
              </div>
            )}

            {/* La regla de la agencia: lo que va sin contenido (un reel que se graba, algo que no se pudo
                hacer) lleva la idea en el texto, su guion y una referencia que el cliente pueda abrir. */}
            {(sinLoNecesario > 0 || onRevisar) && (
              <div className={`notice ${sinLoNecesario ? "notice-warn" : ""}`} style={{ display: "block", marginBottom: "var(--sp-3)" }}>
                {sinLoNecesario > 0 && (
                  <p style={{ margin: 0 }}>
                    {sinLoNecesario === 1 ? "1 publicación va" : `${sinLoNecesario} publicaciones van`} sin contenido y sin lo que el cliente
                    necesita para {sinLoNecesario === 1 ? "entenderla" : "entenderlas"} (texto, guion o una referencia).
                  </p>
                )}
                {onRevisar && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: sinLoNecesario ? "var(--sp-1)" : 0 }} onClick={onRevisar}>
                    <Icon name="checkSquare" size={14} /> Revisar el mes antes de enviarlo
                  </button>
                )}
              </div>
            )}

            {resumen && resumen.idea + resumen.pieza > 0 && (
              <div className="notice envio-resumen" style={{ display: "block", marginBottom: "var(--sp-3)" }}>
                <p style={{ margin: 0 }}>
                  Se le pide aprobar{" "}
                  {[
                    resumen.idea && `${resumen.idea} ${resumen.idea === 1 ? "idea" : "ideas"}`,
                    resumen.pieza && `${resumen.pieza} ${resumen.pieza === 1 ? "pieza final" : "piezas finales"}`,
                  ].filter(Boolean).join(" y ")}.
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  Cada publicación lo dice en su pestaña Idea («¿Qué aprueba el cliente?»). Una idea aprobada queda por
                  producir; una pieza aprobada, por programar.
                </p>
              </div>
            )}

            <FilaInterruptor
              etiqueta="Permitir edición"
              descripcion="El cliente puede sugerir cambios a la descripción y guion."
              encendido={allowEditing}
              onCambiar={() => onToggleEditing()}
            />

            {/* Lo que ve el cliente en la portada de su página: la fecha
                para revisar y un mensaje de la agencia. */}
            <div className="field">
              <span className="label" id={`${ids}-limite`}>Revisar antes del</span>
              <SelectorFecha
                value={opciones.fechaLimite || null}
                onChange={(f) => onCambiarOpciones?.({ fechaLimite: f || "" })}
                etiqueta="Fecha límite para que el cliente revise"
                vacio="Sin fecha límite"
                prefijo="Antes del"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-mensaje`}>Mensaje para el cliente</label>
              <textarea
                id={`${ids}-mensaje`}
                className="textarea"
                style={{ minHeight: 72 }}
                value={mensaje}
                maxLength={2000}
                onChange={(e) => setMensaje(e.target.value)}
                onBlur={() => mensaje !== (opciones.mensajeCliente ?? "") && onCambiarOpciones?.({ mensajeCliente: mensaje })}
                placeholder="Ej.: ¡Hola! Aquí está el contenido de octubre. Cualquier cambio, pídelo en cada publicación."
              />
              <p className="hint">Sale en la portada de su página.</p>
            </div>

            {onCambiarApruebaAntes && (
              <FilaInterruptor
                etiqueta="Este cliente aprueba antes de publicar"
                descripcion="Vale para todos sus meses. Apagado: no hace falta esperar su respuesta. Lo que tiene su pieza, su hora y su texto se programa desde «Ver el mes» → «Programar todo lo listo», y «Programar lo aprobado» lo toma aunque el cliente no lo haya aprobado."
                encendido={apruebaAntes}
                onCambiar={(si) => onCambiarApruebaAntes(si)}
              />
            )}
            {!apruebaAntes && (
              <div className="notice" style={{ display: "block", marginBottom: "var(--sp-3)" }}>
                <p style={{ margin: 0 }}>Este cliente no aprueba antes de publicar: el enlace le sirve para ver el mes, no para dar el visto bueno.</p>
                {onVerMes && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onVerMes}>
                    <Icon name="grid" size={14} /> Ver el mes y programar lo listo
                  </button>
                )}
              </div>
            )}

            <FilaInterruptor
              etiqueta="Programar al aprobar"
              descripcion={<>
                Vale para este cliente, en todos sus meses. Apagado: lo aprobado espera en Producción → «Por producir» a que alguien dé el paso final. Encendido: la PIEZA FINAL aprobada se programa sola; una idea
                aprobada, nunca. Si algo lo impide, te llega a la campana con el motivo.
              </>}
              encendido={!!opciones.programarAlAprobar}
              onCambiar={(si) => onCambiarOpciones?.({ programarAlAprobar: si })}
            />

            {revisionEnviada && (
              <p className="notice notice-ok" style={{ display: "block" }}>
                {revisionRevisor || "El cliente"} envió su revisión el{" "}
                {new Date(revisionEnviada).toLocaleString("es-PA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.
              </p>
            )}

            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
              {shareEnabled ? (
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={onRevoke} disabled={working}>
                  {working ? "Revocando…" : "Revocar enlace"}
                </button>
              ) : (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={onReopen} disabled={working}>
                  {working ? "Reactivando…" : "Reactivar enlace"}
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "var(--sp-5) 0", color: "var(--text-dim)" }}>
            <Icon name="link" size={30} style={{ margin: "0 auto var(--sp-2)", color: "var(--text-muted)" }} />
            <p style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-4)" }}>
              Se generará un enlace único para que tu cliente revise y apruebe el calendario.
            </p>
            <button className="btn btn-primary" onClick={onGenerate} disabled={working}>
              {working ? "Generando…" : "Generar enlace de aprobación"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

}
