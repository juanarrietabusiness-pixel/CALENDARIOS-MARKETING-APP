import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import {
  ventasDelCliente, guardarSemanaAgencia, borrarSemanaAgencia, enlaceDeVentasDelCliente,
} from "../../lib/ventasApi";
import {
  resumenVentas, textoSinMedir, mensajeDeLosLunes, enlaceDeVentas, limpiarVentas, leerMonto, pct, dinero,
  TASA_POR_DEFECTO, SEMANAS_AGENCIA, SEMANAS_TASA,
} from "../../lib/ventasSemana";
import "./VentasSemana.css";

// ============================================================
// «Ventas de la semana» en Marca → Números del negocio (curso de campañas, E.1)
//
// Lo que el cliente apunta cada semana por su enlace (`/ventas?t=…`) y lo que escribe la agencia si se lo dicen por
// llamada: las ocho últimas semanas con la pauta y las conversaciones de Meta de cada una, la tasa de cierre MEDIDA
// (o «sin medir: se usa el 5 %») y el ROAS real de WhatsApp. «Copiar el enlace» y «Copiar el mensaje de los lunes»,
// listos para WhatsApp.
//
// Autocontenido: lo monta la pantalla de Números del negocio, que recibe la tasa medida por `onTasaMedida(tasa,
// medida)` (`tasa` es null mientras no hay datos suficientes: entonces se usa la de por defecto). Se relee solo con
// el evento `ventas` de `window` (App.jsx lo pasa desde el socket).
// ============================================================

const vacio = (v) => (v == null ? "" : String(v));

/** El formulario de la agencia para una semana (escribir o corregir). */
function EditorSemana({ semana, moneda, hoy, lectura, onGuardar, onBorrar, onCerrar }) {
  const [ventas, setVentas] = useState(vacio(semana.ventas));
  const [monto, setMonto] = useState(vacio(semana.monto));
  const [deAnuncios, setDeAnuncios] = useState(vacio(semana.deAnuncios));
  const [otros, setOtros] = useState(vacio(semana.otrosCanales));
  const [nota, setNota] = useState(semana.nota ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState("");
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const base = useId();
  const primero = useRef(null);
  // Va debajo de la tabla: en el teléfono, ocho tarjetas más abajo. Enfocarlo lo trae a la vista.
  useEffect(() => { primero.current?.focus(); }, []);

  const leido = leerMonto(monto);
  const vistaMonto = leido != null && !Number.isNaN(leido) && String(leido) !== monto.trim() ? `Se guarda como ${dinero(leido, moneda)}.` : "";

  async function enviar(e) {
    e.preventDefault();
    setFallo("");
    const datos = { semana: semana.semana, ventas, monto, deAnuncios, otrosCanales: otros, nota };
    const { error } = limpiarVentas(datos, { hoy, ventana: SEMANAS_AGENCIA });
    if (error) { setFallo(error); return; }
    setOcupado(true);
    try {
      await onGuardar(datos);
    } catch (err) {
      setFallo(err.message || "No se pudo guardar.");
      setOcupado(false);
    }
  }

  async function borrar() {
    if (!confirmarBorrar) { setConfirmarBorrar(true); return; }
    setOcupado(true);
    try {
      await onBorrar();
    } catch (err) {
      setFallo(err.message || "No se pudo borrar.");
      setOcupado(false);
    }
  }

  return (
    <form className="vs-editor" onSubmit={enviar} noValidate aria-labelledby={`${base}-t`}>
      <h4 id={`${base}-t`}>{semana.nombre} <span>{semana.etiqueta}</span></h4>
      <div className="vs-editor-campos">
        <div>
          <label className="label" htmlFor={`${base}-v`}>Ventas por WhatsApp</label>
          <input ref={primero} id={`${base}-v`} className="input" inputMode="numeric" autoComplete="off" value={ventas} onChange={(e) => setVentas(e.target.value)} disabled={lectura} />
        </div>
        <div>
          <label className="label" htmlFor={`${base}-m`}>Monto total</label>
          <input id={`${base}-m`} className="input" inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={lectura} aria-describedby={vistaMonto ? `${base}-mv` : undefined} />
          {vistaMonto && <p id={`${base}-mv`} className="hint">{vistaMonto}</p>}
        </div>
        <div>
          <label className="label" htmlFor={`${base}-a`}>De los anuncios (opcional)</label>
          <input id={`${base}-a`} className="input" inputMode="numeric" autoComplete="off" value={deAnuncios} onChange={(e) => setDeAnuncios(e.target.value)} disabled={lectura} />
        </div>
        <div>
          <label className="label" htmlFor={`${base}-o`}>Otros canales (opcional)</label>
          <input id={`${base}-o`} className="input" inputMode="decimal" autoComplete="off" value={otros} onChange={(e) => setOtros(e.target.value)} disabled={lectura} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${base}-n`}>Nota</label>
        <input id={`${base}-n`} className="input" maxLength={280} value={nota} onChange={(e) => setNota(e.target.value)} disabled={lectura} placeholder="Me lo dijo por llamada…" />
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      <div className="vs-editor-acciones">
        {!lectura && <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button>}
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>{lectura ? "Cerrar" : "Cancelar"}</button>
        {!lectura && semana.apuntada && (
          <button type="button" className="btn btn-danger" onClick={borrar} disabled={ocupado}>
            <Icon name="trash" size={16} /> {confirmarBorrar ? "Sí, quitar lo apuntado" : "Quitar lo apuntado"}
          </button>
        )}
      </div>
    </form>
  );
}

/** Quién apuntó una semana, en pocas palabras. */
function quien(s) {
  if (!s.apuntada) return "—";
  if (s.origen === "cliente") return "El cliente";
  return s.porNombre ? s.porNombre : "La agencia";
}

/**
 * @param tasaDefecto     la tasa del cliente mientras no se mide (sus números del negocio o la del Manual), en fracción:
 *                        antes era el 5 % fijo aunque el cliente tuviera la suya
 * @param roasEquilibrio  el de su número mágico: el ROAS real se compara con él (decisión 13)
 */
export default function VentasSemana({ clientId, cliente = null, lectura = false, onTasaMedida = null, tasaDefecto = TASA_POR_DEFECTO, roasEquilibrio = null }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState(null);
  const [testigo, setTestigo] = useState(null);
  const [textoCopiar, setTextoCopiar] = useState("");
  const idTitulo = useId();

  const cargar = useCallback(async () => {
    if (!clientId) return;
    setFallo("");
    try {
      const d = await ventasDelCliente(clientId);
      setDatos(d);
      setTestigo(d.testigo ?? null);
    } catch (e) {
      setFallo(e.message || "No se pudieron leer las ventas.");
    } finally {
      setCargando(false);
    }
  }, [clientId]);

  useEffect(() => { setCargando(true); setEditando(null); void cargar(); }, [cargar]);

  // El cliente apuntó por su enlace (o alguien del equipo): se relee, salvo que se esté escribiendo una semana.
  const editandoRef = useRef(editando);
  editandoRef.current = editando;
  useEffect(() => {
    const alCambiar = (ev) => {
      if (ev.detail?.clientId && ev.detail.clientId !== clientId) return;
      if (editandoRef.current) return;
      void cargar();
    };
    window.addEventListener("ventas", alCambiar);
    return () => window.removeEventListener("ventas", alCambiar);
  }, [clientId, cargar]);

  // El resumen se recalcula aquí con lo que hay en pantalla: así cambia al guardar sin volver a leer Meta.
  const resumen = useMemo(() => {
    if (!datos) return null;
    const apuntadas = datos.semanas.filter((s) => s.apuntada);
    return resumenVentas(apuntadas, datos.metaPorSemana ?? null, { hoy: datos.hoy, porDefecto: tasaDefecto > 0 ? tasaDefecto : TASA_POR_DEFECTO, roasEquilibrio });
  }, [datos, tasaDefecto, roasEquilibrio]);

  // La tasa medida, para la pantalla de Números del negocio (null = todavía no: se usa la de por defecto).
  // Sólo cuando cambia: releer las ventas por el socket no vuelve a avisar con la misma tasa.
  const avisarTasa = useRef(onTasaMedida);
  avisarTasa.current = onTasaMedida;
  const ultimaTasa = useRef(null);
  useEffect(() => {
    if (!resumen) return;
    const clave = `${resumen.tasa.suficiente}|${resumen.tasa.tasa}|${resumen.tasa.conversaciones}`;
    if (ultimaTasa.current === clave) return;
    ultimaTasa.current = clave;
    avisarTasa.current?.(resumen.tasa.suficiente ? resumen.tasa.tasa : null, resumen.tasa);
  }, [resumen]);

  const moneda = datos?.meta?.moneda || "USD";
  const nombre = cliente?.name ?? datos?.nombre ?? "";
  const url = testigo ? enlaceDeVentas(window.location.origin, testigo) : "";

  async function asegurarEnlace() {
    if (testigo) return enlaceDeVentas(window.location.origin, testigo);
    const r = await enlaceDeVentasDelCliente(clientId);
    setTestigo(r.testigo);
    return enlaceDeVentas(window.location.origin, r.testigo);
  }

  async function copiar(que) {
    setAviso("");
    setTextoCopiar("");
    let texto = "";
    try {
      const enlace = await asegurarEnlace();
      texto = que === "mensaje" ? mensajeDeLosLunes({ nombre, enlace, hoy: datos?.hoy }) : enlace;
      await navigator.clipboard.writeText(texto);
      setAviso(que === "mensaje" ? "Mensaje copiado: pégalo en el WhatsApp del cliente." : "Enlace copiado.");
    } catch (e) {
      // Sin permiso para el portapapeles (o en un navegador viejo): se enseña para copiarlo a mano.
      if (texto) { setTextoCopiar(texto); setAviso("No se pudo copiar solo: cópialo de aquí abajo."); }
      else setAviso(e.message || "No se pudo crear el enlace.");
    }
  }

  async function guardar(semana, entrada) {
    const r = await guardarSemanaAgencia(clientId, semana.semana, entrada);
    setDatos((d) => ({
      ...d,
      semanas: d.semanas.map((s) => (s.semana === semana.semana ? { ...s, ...r.semana, apuntada: true } : s)),
    }));
    setEditando(null);
    setAviso(`Guardada la semana ${semana.etiqueta}.`);
  }

  async function borrar(semana) {
    await borrarSemanaAgencia(clientId, semana.semana);
    setDatos((d) => ({
      ...d,
      semanas: d.semanas.map((s) => (s.semana === semana.semana
        ? { ...s, apuntada: false, ventas: null, monto: null, deAnuncios: null, otrosCanales: null, nota: "", origen: null, por: "", porNombre: "", actualizado: null }
        : s)),
    }));
    setEditando(null);
    setAviso(`Quitado lo apuntado de la semana ${semana.etiqueta}.`);
  }

  if (cargando && !datos) return <p role="status" className="hint">Cargando las ventas…</p>;
  if (fallo && !datos) {
    return (
      <div className="notice notice-error notice-action" role="alert">
        <span>{fallo}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setCargando(true); void cargar(); }}>Reintentar</button>
      </div>
    );
  }
  if (!datos || !resumen) return null;

  const t = resumen.tasa;
  const sinMedir = textoSinMedir(resumen.sinMedir);
  const metaOk = datos.meta?.estado === "ok";
  const semanaEditada = datos.semanas.find((s) => s.semana === editando) ?? null;

  return (
    <section className="vs" aria-labelledby={idTitulo}>
      <header className="vs-cabecera">
        <div>
          <h3 id={idTitulo}>Ventas de la semana</h3>
          <p className="hint">
            Meta no ve lo que se cierra por WhatsApp. El cliente lo apunta cada semana por su enlace (30 segundos desde
            el teléfono) o lo escribes aquí si te lo dice por llamada. Con eso sale la tasa de cierre real y el ROAS de
            WhatsApp.
          </p>
        </div>
        <div className="vs-copiar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar("enlace")} disabled={lectura && !testigo}>
            <Icon name="link" size={16} /> Copiar el enlace
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar("mensaje")} disabled={lectura && !testigo}>
            <Icon name="copy" size={16} /> Copiar el mensaje de los lunes
          </button>
          {url && (
            <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={16} /> Abrir el enlace
            </a>
          )}
        </div>
      </header>

      <p role="status" className="vs-aviso">{aviso}</p>
      {textoCopiar && (
        <textarea className="textarea vs-copia" readOnly rows={textoCopiar.includes("\n") ? 4 : 1} value={textoCopiar} aria-label="Texto para copiar" onFocus={(e) => e.target.select()} />
      )}

      <div className="vs-cifras">
        <div className="vs-cifra" data-medida={t.suficiente ? "" : undefined}>
          <span className="vs-cifra-nombre">Tasa de cierre</span>
          <strong>{t.suficiente ? pct(t.tasa) : `Sin medir: ${pct(resumen.porDefecto)}`}</strong>
          <span className="vs-cifra-nota">
            {t.suficiente
              ? `${t.ventas} ${t.ventas === 1 ? "venta" : "ventas"} de ${t.conversaciones} conversaciones, últimas ${t.semanas.length} semanas`
              : t.tasa != null ? `Medida hasta ahora: ${pct(t.tasa)}. ${t.motivo}` : t.motivo || `Se usa el ${pct(resumen.porDefecto)} hasta medir la del cliente (sólo cuentan las semanas ya cerradas).`}
          </span>
        </div>
        <div className="vs-cifra">
          <span className="vs-cifra-nombre">ROAS de WhatsApp</span>
          <strong>{resumen.roas != null ? `${resumen.roas.toFixed(1).replace(".", ",")}×` : "—"}</strong>
          <span className="vs-cifra-nota">
            {resumen.roas != null ? `${dinero(resumen.monto, moneda)} vendidos con ${dinero(resumen.gasto, moneda)} de pauta` : "Monto vendido ÷ pauta, cuando haya ventas y pauta."}
          </span>
        </div>
        <div className="vs-cifra">
          <span className="vs-cifra-nombre">Costo real por venta</span>
          <strong>{resumen.costoPorVenta != null ? dinero(resumen.costoPorVenta, moneda) : "—"}</strong>
          <span className="vs-cifra-nota">Pauta ÷ ventas{t.semanas.length ? `, últimas ${t.semanas.length} semanas` : ""}.</span>
        </div>
      </div>

      {resumen.frenteAlEquilibrio && <p className={`notice ${resumen.frenteAlEquilibrio.gana ? "notice-ok" : "notice-error"}`}>{resumen.frenteAlEquilibrio.texto}</p>}
      {t.aviso && <p className="notice notice-warn">{t.aviso}</p>}
      {sinMedir && <p className="notice notice-warn">{sinMedir} Mándale el mensaje de los lunes.</p>}
      {!metaOk && <p className="notice notice-warn">Sin las cifras de Meta: {datos.meta?.mensaje || "no se pudieron leer."} Las ventas se guardan igual.</p>}
      <p className="hint">
        Cada semana de ventas se cruza con las conversaciones de la semana anterior: quien escribe un jueves suele
        comprar la semana siguiente. La tasa se mide sobre las últimas {SEMANAS_TASA} semanas apuntadas.
      </p>

      <div className="vs-tabla-caja">
        <table className="vs-tabla">
          <caption className="sr-only">Las últimas {SEMANAS_AGENCIA} semanas</caption>
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col" className="vs-num">Ventas</th>
              <th scope="col" className="vs-num">De anuncios</th>
              <th scope="col" className="vs-num">Monto</th>
              <th scope="col" className="vs-num">Otros canales</th>
              <th scope="col" className="vs-num">Conversaciones</th>
              <th scope="col" className="vs-num">Pauta</th>
              <th scope="col">Apuntó</th>
              <th scope="col"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {datos.semanas.map((s) => (
              <tr key={s.semana} data-apuntada={s.apuntada ? "" : undefined} data-toca={s.semana === datos.toca ? "" : undefined}>
                <th scope="row" className="vs-semana">
                  {s.nombre}
                  <span>{s.etiqueta}</span>
                </th>
                <td className="vs-num" data-etiqueta="Ventas">{s.apuntada ? s.ventas : "—"}</td>
                <td className="vs-num" data-etiqueta="De anuncios">{s.deAnuncios ?? "—"}</td>
                <td className="vs-num" data-etiqueta="Monto">{s.apuntada ? dinero(s.monto, moneda) : "—"}</td>
                <td className="vs-num" data-etiqueta="Otros canales">{s.otrosCanales != null ? dinero(s.otrosCanales, moneda) : "—"}</td>
                <td className="vs-num" data-etiqueta="Conversaciones">{s.conversaciones ?? "—"}</td>
                <td className="vs-num" data-etiqueta="Pauta">{s.gasto != null ? dinero(s.gasto, moneda) : "—"}</td>
                <td data-etiqueta="Apuntó">
                  <span className="vs-quien">
                    {quien(s)}
                    {s.nota && <span className="vs-nota" title={s.nota}>{s.nota}</span>}
                  </span>
                </td>
                <td className="vs-acciones">
                  {!lectura && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-expanded={editando === s.semana}
                      aria-label={`${s.apuntada ? "Corregir" : "Escribir"} la semana ${s.etiqueta}`}
                      onClick={() => setEditando(editando === s.semana ? null : s.semana)}
                    >
                      <Icon name="pencil" size={16} /> {s.apuntada ? "Corregir" : "Escribir"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {semanaEditada && (
        <EditorSemana
          key={semanaEditada.semana}
          semana={semanaEditada}
          moneda={moneda}
          hoy={datos.hoy}
          lectura={lectura}
          onGuardar={(entrada) => guardar(semanaEditada, entrada)}
          onBorrar={() => borrar(semanaEditada)}
          onCerrar={() => setEditando(null)}
        />
      )}
    </section>
  );
}
