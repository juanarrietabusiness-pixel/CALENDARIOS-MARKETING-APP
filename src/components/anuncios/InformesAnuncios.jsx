import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import InformeAnunciosVista from "./InformeAnunciosVista";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import * as api from "../../lib/anunciosApi";
import { sinCosto, nombreDelMes } from "../../lib/informeAnuncios";
import { fechaEnZona, sumarDias } from "../../lib/agenda";

// ============================================================
// Anuncios → Informes: el informe de publicidad de un cliente
//
// Aparte del informe de redes. Se genera cuando la agencia lo pide (o
// solo el día 1, como BORRADOR, si el cliente lo tiene encendido), se
// revisa aquí tal como lo verá el cliente y se comparte con un enlace que
// abre sin cuenta y guarda en PDF. «Enseñar el costo por resultado» se
// decide por cliente (el valor de partida) y por informe (el que vale):
// apagado, el enlace no lo lleva.
// ============================================================

const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

/** El mes en curso y los doce anteriores, del más reciente al más viejo. */
function meses() {
  const salida = [fechaEnZona().slice(0, 7)];
  let dia = `${salida[0]}-01`;
  for (let i = 0; i < 12; i++) {
    dia = sumarDias(dia, -1);
    salida.push(dia.slice(0, 7));
    dia = `${dia.slice(0, 7)}-01`;
  }
  return salida;
}

export default function InformesAnuncios({ clientId, cliente, soloLectura = false, onCerrar }) {
  const ids = useId();
  const opciones = meses();
  const [datos, setDatos] = useState(null); // { ajustes, tieneCuenta, informes }
  const [mes, setMes] = useState(opciones[1]);
  const [conCosto, setConCosto] = useState(true);
  const [abierto, setAbierto] = useState(null); // el informe entero
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const ref = useDialogA11y(() => { if (!trabajando) onCerrar(); });
  const vistaRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api.informesAnuncios(clientId);
      setDatos(d);
      return d;
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    void cargar().then((d) => { if (d) setConCosto(d.ajustes.mostrarCosto); });
  }, [cargar]);

  const hacer = async (clave, accion, ok = "") => {
    setTrabajando(clave);
    setAviso(null);
    try {
      const r = await accion();
      if (ok) setAviso({ ok: true, texto: ok });
      return r;
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
      return null;
    } finally {
      setTrabajando("");
      // Lo pulsado se desactivó mientras trabajaba (o desapareció) y el foco se fue al fondo: sin devolverlo al
      // diálogo, Escape ya no lo cierra.
      requestAnimationFrame(() => {
        if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
      });
    }
  };

  const copiar = async (testigo) => {
    const enlace = api.enlaceInformeAnuncios(testigo);
    try {
      await navigator.clipboard.writeText(enlace);
      setAviso({ ok: true, texto: "Enlace copiado: pégalo en el correo o el WhatsApp del cliente." });
    } catch {
      setAviso({ ok: true, texto: enlace });
    }
  };

  const ajustar = (cambio) => hacer("ajustes", async () => {
    const ajustes = await api.ajustesInformeAnuncios(clientId, cambio);
    setDatos((d) => ({ ...d, ajustes }));
    if ("mostrarCosto" in cambio) setConCosto(ajustes.mostrarCosto);
  });

  const existente = datos?.informes?.find((i) => i.mes === mes);
  const generar = async () => {
    if (existente && !window.confirm(`Ya hay un informe de ${nombreDelMes(mes)}. ¿Volver a escribirlo? El enlace del cliente se mantiene.`)) return;
    const r = await hacer("generar", () => api.generarInformeAnuncios(clientId, mes, conCosto), "Informe listo. Revísalo antes de compartirlo.");
    window.dispatchEvent(new Event("ia:gasto"));
    await cargar();
    if (r) {
      setAbierto(r);
      requestAnimationFrame(() => vistaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const ver = async (m) => {
    const r = await hacer(`v-${m}`, () => api.leerInformeAnuncios(clientId, m));
    if (r) {
      setAbierto(r);
      requestAnimationFrame(() => vistaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // Compartir, dejar de compartir o cambiar el costo de UN informe; lo abierto se pone al día con lo que devuelve.
  const cambiar = async (m, cambios, ok) => {
    const r = await hacer(`c-${m}`, () => api.compartirInformeAnuncios(clientId, m, cambios), ok);
    if (!r) return null;
    setAbierto((a) => (a?.mes === m ? { ...a, ...r } : a));
    await cargar();
    return r;
  };

  const borrar = async (m) => {
    if (!window.confirm(`¿Borrar el informe de ${nombreDelMes(m)}? Su enlace dejará de funcionar.`)) return;
    await hacer(`b-${m}`, () => api.borrarInformeAnuncios(clientId, m), "Informe borrado.");
    if (abierto?.mes === m) setAbierto(null);
    await cargar();
    ref.current?.focus({ preventScroll: true });
  };

  const a = abierto;
  // La vista previa es lo que ve el cliente: sin el costo, si así se compartirá.
  const paraCliente = a ? { ...a.contenido, cifras: a.mostrarCosto ? a.contenido?.cifras : sinCosto(a.contenido?.cifras) } : null;

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet anu-informes" tabIndex={-1}>
        <div className="sheet-header no-imprimir">
          <div>
            <h2 id={`${ids}-t`} className="anu-asistente-titulo"><Icon name="file" size={18} /> Informe de anuncios{cliente?.name ? ` · ${cliente.name}` : ""}</h2>
            <p className="hint" style={{ margin: 0 }}>Lo que logró la publicidad del mes, fácil de leer: para mandárselo al cliente con un enlace o en PDF.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={Boolean(trabajando)} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          {datos && !datos.tieneCuenta && (
            <p className="notice notice-warn no-imprimir">Este cliente no tiene cuenta publicitaria asignada: escógela en Anuncios antes de generar el informe.</p>
          )}

          {datos && (
            <fieldset className="anu-inf-ajustes no-imprimir" disabled={soloLectura || Boolean(trabajando)}>
              <legend className="label">Para este cliente</legend>
              <label className="anu-check">
                <input type="checkbox" checked={datos.ajustes.automatico} onChange={(e) => ajustar({ automatico: e.target.checked })} />
                <span>Prepararlo solo el día 1 (el del mes anterior, como borrador: tú decides cuándo compartirlo)</span>
              </label>
              <label className="anu-check">
                <input type="checkbox" checked={datos.ajustes.mostrarCosto} onChange={(e) => ajustar({ mostrarCosto: e.target.checked })} />
                <span>Enseñarle el costo por resultado (lo de partida de cada informe nuevo)</span>
              </label>
            </fieldset>
          )}

          {!soloLectura && (
            <div className="anu-inf-generar no-imprimir">
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor={`${ids}-m`}>Mes</label>
                <select id={`${ids}-m`} className="input" value={mes} onChange={(e) => setMes(e.target.value)} disabled={Boolean(trabajando)}>
                  {opciones.map((m, i) => <option key={m} value={m}>{mayuscula(nombreDelMes(m))}{i === 0 ? " (en curso)" : ""}</option>)}
                </select>
              </div>
              <label className="anu-check">
                <input type="checkbox" checked={conCosto} onChange={(e) => setConCosto(e.target.checked)} disabled={Boolean(trabajando)} />
                <span>Con el costo por resultado</span>
              </label>
              <button type="button" className="btn btn-primary" onClick={generar} disabled={Boolean(trabajando) || !datos?.tieneCuenta}>
                <Icon name="sparkles" size={16} /> {trabajando === "generar" ? "Leyendo Meta y escribiendo…" : existente ? "Regenerar" : "Generar informe"}
              </button>
            </div>
          )}

          <div role="status" aria-live="polite" className="no-imprimir">
            {trabajando === "generar" && <p className="hint">Se leen las campañas del mes (también las creadas fuera de la aplicación) y la IA escribe lo logrado. Tarda uno o dos minutos.</p>}
            {aviso?.ok && <p className="notice notice-ok">{aviso.texto}</p>}
          </div>
          {aviso && !aviso.ok && <p role="alert" className="notice notice-error no-imprimir">{aviso.texto}</p>}

          {datos?.informes?.length > 0 && (
            <ul className="informes-lista anu-inf-lista no-imprimir" aria-label="Informes de anuncios de este cliente">
              {datos.informes.map((inf) => (
                <li key={inf.id} aria-current={abierto?.mes === inf.mes ? "true" : undefined}>
                  <span className="informes-mes">{mayuscula(nombreDelMes(inf.mes))}</span>
                  <span className="informes-estado" data-estado={inf.estado}>
                    {inf.estado === "listo" ? (inf.compartido ? "Compartido" : inf.automatico ? "Borrador automático" : "Listo") : inf.estado === "generando" ? "Escribiéndose…" : "Falló"}
                  </span>
                  {inf.estado === "error" && <span className="informes-error">{inf.error}</span>}
                  <span className="informes-acciones">
                    {inf.estado === "listo" && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(trabajando)} onClick={() => ver(inf.mes)}>
                        <Icon name="eye" size={14} /> Ver
                      </button>
                    )}
                    {inf.estado === "listo" && inf.compartido && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(inf.testigo)}>
                        <Icon name="copy" size={14} /> Copiar enlace
                      </button>
                    )}
                    {!soloLectura && (
                      <button type="button" className="btn-icon" aria-label={`Borrar el informe de ${nombreDelMes(inf.mes)}`} disabled={Boolean(trabajando)} onClick={() => borrar(inf.mes)}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {a && (
            <section ref={vistaRef} className="anu-inf-abierto" aria-label={`Informe de ${nombreDelMes(a.mes)}`}>
              <div className="anu-inf-barra no-imprimir">
                <label className="anu-check">
                  <input type="checkbox" checked={a.mostrarCosto} disabled={soloLectura || Boolean(trabajando)}
                    onChange={(e) => cambiar(a.mes, { mostrarCosto: e.target.checked }, e.target.checked ? "El cliente verá el costo por resultado." : "El costo por resultado ya no sale en el enlace del cliente.")} />
                  <span>Enseñar el costo por resultado</span>
                </label>
                {!soloLectura && (a.compartido ? (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(a.testigo)}><Icon name="copy" size={14} /> Copiar enlace</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)}
                      onClick={async () => { await cambiar(a.mes, { compartido: false }, "El enlace dejó de funcionar."); ref.current?.focus({ preventScroll: true }); }}>
                      Dejar de compartir
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(trabajando)}
                    onClick={async () => { const r = await cambiar(a.mes, { compartido: true }); if (r?.testigo) await copiar(r.testigo); }}>
                    <Icon name="link" size={14} /> Compartir con el cliente
                  </button>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}><Icon name="download" size={14} /> Imprimir o guardar PDF</button>
              </div>
              {a.contenido?.avisos?.map((t) => <p key={t} className="notice notice-warn no-imprimir">{t}</p>)}
              {a.contenido?.costoEnAnalisis && !a.mostrarCosto && (
                <p className="notice notice-warn no-imprimir">El texto de la IA se escribió con el costo a la vista y puede nombrarlo: regenera el informe para que no lo haga.</p>
              )}
              <p className="hint no-imprimir">Así lo verá el cliente:</p>
              <InformeAnunciosVista informe={paraCliente} cliente={cliente} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
