// ============================================================
// «Aprobadas, por programar»: el paso final, fuera del calendario
//
// Lo que el cliente aprobó como PIEZA FINAL no sale solo (salvo que el
// calendario tenga encendido «Programar al aprobar»): espera aquí a que
// alguien de la agencia lo revise y pulse Programar. Es la decisión final
// —por si hay que ajustar algo aunque esté aprobado—, de todos los
// clientes a la vez, suelta o marcando varias.
//
// Debajo, plegadas, las IDEAS aprobadas: están por producir y no se
// programan desde aquí.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { revisarAprobadas, fechaHora } from "../lib/cola";
import { programarAprobadasDe } from "../lib/programarAprobadas";
import { REDES } from "../lib/publicacion";
import { FORMAT_ICONS } from "../constants";

/** La publicación de verdad (la del estado, con lo que se esté editando). */
function buscar(clients, item) {
  const cliente = clients.find((c) => c.id === item.clientId || c.dbId === item.clientId);
  const cal = cliente?.calendars?.find((k) => k.id === item.calendarId || k.dbId === item.calendarId);
  for (const d of cal?.days ?? []) {
    const post = (d.posts ?? []).find((p) => p.id === item.postId);
    if (post) return { cliente, cal, post, fecha: d.date };
  }
  return null;
}

export default function PorProgramar({ clients = [], pulso = 0, onAbrir, onCalendarioGuardado, soltarPendiente, onProgramado }) {
  const [datos, setDatos] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [trabajando, setTrabajando] = useState("");
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(() => db.listarAprobadas().then(setDatos).catch((e) => setMensaje({ tipo: "error", texto: e.message })), []);
  useEffect(() => { void cargar(); }, [cargar, pulso]);
  useEffect(() => { db.estadoRedes().then((r) => setCuentas(r?.cuentas ?? [])).catch(() => setCuentas([])); }, []);

  // Cada una con su revisión: las MISMAS reglas que el panel.
  const filas = useMemo(() => (datos?.porProgramar ?? []).map((item) => {
    const hallada = buscar(clients, item);
    if (!hallada) return { item, lista: false, errores: ["No se encuentra en el calendario: recarga la página."] };
    const redesDelCliente = [...new Set(cuentas.filter((c) => c.clientId === (hallada.cliente.dbId || hallada.cliente.id)).map((c) => c.red))];
    const [r] = revisarAprobadas([{ post: hallada.post, fecha: hallada.fecha }], redesDelCliente);
    return { item, ...hallada, ...r };
  }), [datos, clients, cuentas]);

  const listas = filas.filter((f) => f.lista);
  const elegidas = listas.filter((f) => marcadas.has(f.item.postId));
  const alternar = (id) => setMarcadas((m) => {
    const n = new Set(m);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const programar = async (seleccion) => {
    setMensaje(null);
    let hechas = 0;
    const fallidas = [];
    // Un calendario de cada vez: se guarda una vez y se programa en lote.
    const porCal = new Map();
    for (const f of seleccion) {
      if (!porCal.has(f.cal.id)) porCal.set(f.cal.id, []);
      porCal.get(f.cal.id).push(f);
    }
    try {
      for (const grupo of porCal.values()) {
        const { cal, cliente } = grupo[0];
        soltarPendiente?.(cal.id);
        const r = await programarAprobadasDe({
          cal, clienteDb: cliente.dbId || cliente.id, colorMarca: cliente.primaryColor,
          lista: grupo.map((f) => ({ post: f.post, redes: f.redes })), avisar: setTrabajando,
        });
        onCalendarioGuardado?.(cliente.id, { ...cal, days: r.nuevo.days });
        hechas += r.programadas;
        fallidas.push(...r.fallidas);
      }
      setMensaje(fallidas.length
        ? { tipo: "error", texto: `Programadas ${hechas}. No se pudieron: ${fallidas.map((f) => `${f.titulo} (${f.motivo})`).join("; ")}` }
        : { tipo: "ok", texto: hechas === 1 ? "Programada. Ya está en la cola." : `Programadas ${hechas}. Ya están en la cola.` });
      setMarcadas(new Set());
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
    setTrabajando("");
    await cargar();
    onProgramado?.();
  };

  if (!datos) return null;
  const producir = datos.porProducir ?? [];
  if (!filas.length && !producir.length) return null;
  const abrir = (item) => onAbrir?.({ clientId: item.clientId, calendarId: item.calendarId, postId: item.postId });

  return (
    <section className="prog-bloque prog-por-programar" aria-labelledby="por-programar-t">
      {filas.length > 0 && (
        <>
          <div className="por-programar-cabecera">
            <h2 id="por-programar-t" className="prog-titulo">
              <Icon name="checkSquare" size={18} /> Aprobadas, por programar <span className="prog-cuenta">({filas.length})</span>
            </h2>
            <button type="button" className="btn btn-primary btn-sm" disabled={!elegidas.length || !!trabajando} onClick={() => programar(elegidas)}>
              <Icon name="clock" size={16} /> {trabajando || (elegidas.length ? `Programar las marcadas (${elegidas.length})` : "Marca las que salen")}
            </button>
          </div>
          <p className="prog-subtitulo">
            El cliente las aprobó como pieza final. No salen hasta que las programes: revísalas y ajusta lo que haga falta antes.
          </p>
          <ul className="prog-lista">
            {filas.map((f) => (
              <li key={`${f.item.calendarId}:${f.item.postId}`} className="prog-fila" data-estado={f.lista ? undefined : "error"}>
                <input
                  type="checkbox"
                  className="por-programar-marca"
                  checked={marcadas.has(f.item.postId)}
                  disabled={!f.lista || !!trabajando}
                  onChange={() => alternar(f.item.postId)}
                  aria-label={`Marcar ${f.item.titulo} de ${f.item.cliente}`}
                />
                <span className="prog-miniatura" data-formato={f.item.formato}>
                  <Icon name={FORMAT_ICONS[f.item.formato] || "formatPost"} size={18} />
                </span>
                <span className="prog-cuerpo">
                  <span className="prog-pieza">
                    <span className="prog-cliente">{f.item.cliente}</span>
                    {(f.redes ?? f.item.redes).map((r) => (
                      <span key={r} className="prog-red"><Icon name={REDES[r]?.icono ?? "globe"} size={13} /> {REDES[r]?.nombre ?? r}</span>
                    ))}
                    {f.item.subidaRapida && <span className="badge">subida directa</span>}
                  </span>
                  <p className="prog-texto">{f.item.titulo}</p>
                  <p className="prog-cuando">{f.item.cuando ? fechaHora(f.item.cuando) : f.item.fecha}</p>
                  {f.item.cambios?.length > 0 && (
                    <p className="prog-motivo por-programar-cambio">
                      <Icon name="alert" size={13} /> Cambiaste {f.item.cambios.join(" y ")} después de que el cliente la aprobara.
                    </p>
                  )}
                  {!f.lista && f.errores?.map((e) => <p key={e} className="prog-motivo">{e}</p>)}
                </span>
                <span className="prog-acciones">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir(f.item)}>
                    <Icon name="pencil" size={14} /> Revisar
                  </button>
                  {f.lista && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={!!trabajando} onClick={() => programar([f])}
                      aria-label={`Programar ${f.item.titulo} de ${f.item.cliente}`}>
                      <Icon name="clock" size={14} /> Programar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {producir.length > 0 && (
        <details className="por-producir">
          <summary>
            <Icon name="bulb" size={16} /> Ideas aprobadas, por producir <span className="prog-cuenta">({producir.length})</span>
          </summary>
          <p className="prog-subtitulo">El cliente aprobó el concepto. Falta la pieza: súbela y pídele que la apruebe, o prográmala tú.</p>
          <ul className="prog-lista">
            {producir.map((item) => (
              <li key={`${item.calendarId}:${item.postId}`} className="prog-fila">
                <span className="prog-miniatura" data-formato={item.formato}><Icon name={FORMAT_ICONS[item.formato] || "formatPost"} size={18} /></span>
                <span className="prog-cuerpo">
                  <span className="prog-pieza"><span className="prog-cliente">{item.cliente}</span>{item.tieneArchivo && <span className="badge">con archivo</span>}</span>
                  <p className="prog-texto">{item.titulo}</p>
                  <p className="prog-cuando">{item.cuando ? fechaHora(item.cuando) : item.fecha}</p>
                </span>
                <span className="prog-acciones">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir(item)}>
                    <Icon name="pencil" size={14} /> Abrir
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div role="status" aria-live="polite" className={mensaje?.tipo === "ok" ? undefined : "sr-only"}>
        {mensaje?.tipo === "ok" && <p className="notice notice-ok">{mensaje.texto}</p>}
      </div>
      {mensaje?.tipo === "error" && <p role="alert" className="notice notice-error">{mensaje.texto}</p>}
    </section>
  );
}
