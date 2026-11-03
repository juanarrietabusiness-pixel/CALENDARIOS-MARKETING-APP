import { useState, useId, useMemo, useRef, useEffect } from "react";
import Icon from "./Icon";
import { claveTarea, hecha } from "../hooks/useTareas";
import { fechaEnZona, sumarDias, textoAtraso, diasEntre } from "../lib/agenda";
import { DIAS_SEMANA, TIPO_ARRASTRE, lunesDe, textoSemana, semanaDeTareas, limpiarDias } from "../lib/semanaTareas";
import "./SemanaTareas.css";

// ============================================================
// Mi día por semanas: lunes a sábado, cada día con sus empresas
//
// Lo puro (qué va en cada día) está en lib/semanaTareas.js. Aquí, la
// pantalla: seis columnas —la de hoy sombreada—, una tarjeta por empresa con
// lo de ese día arriba y «Sin día» plegado, y debajo «Por agendar» (lo que no tiene día).
// Una tarea se ARRASTRA a la tarjeta de una empresa en un día (también desde
// el panel lateral de tareas) o se «Agenda» con dos selectores: el arrastre
// de HTML no funciona con el dedo ni con el teclado.
//
// Los días fijos de cada empresa son del equipo: «Fijar» y «Quitar» los
// cambian para todos y para todas las semanas.
// ============================================================

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (f) => `${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]}`;

export default function SemanaTareas({ tareas, clients = [], acciones, onDiasEmpresa, onSelectClient, soloLectura = false }) {
  const hoy = fechaEnZona();
  const [lunes, setLunes] = useState(() => lunesDe(hoy));
  const [aviso, setAviso] = useState("");
  const semana = useMemo(() => semanaDeTareas(tareas, clients, lunes, hoy), [tareas, clients, lunes, hoy]);
  const porClave = useMemo(() => new Map(tareas.map((t) => [claveTarea(t), t])), [tareas]);
  const esEstaSemana = lunes === lunesDe(hoy);
  const diasRef = useRef(null);

  // En el teléfono las columnas se desplazan de lado: se abre en la de hoy. Sólo ahí (a lo ancho caben las seis y
  // saltar escondería el lunes), y moviendo SÓLO la fila de días: `scrollIntoView` movería también la página.
  // Se alinea cuando la fila ya tiene su ancho final (al montar todavía no: quedaba a medio lunes), una sola vez.
  useEffect(() => {
    const caja = diasRef.current;
    if (!esEstaSemana || !caja || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(() => {
      const dia = caja.querySelector("[data-hoy='true']");
      if (!dia || caja.scrollWidth <= caja.clientWidth || caja.clientWidth === 0) return;
      caja.scrollLeft += dia.getBoundingClientRect().left - caja.getBoundingClientRect().left;
      obs.disconnect();
    });
    obs.observe(caja);
    return () => obs.disconnect();
  }, [esEstaSemana]);

  // Mientras se arrastra una tarea (de aquí o del panel lateral), cada día enseña dónde soltarla sin empresa.
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => {
    // Después del `dragstart`, no dentro: cambiar la página en el mismo instante puede cancelar el arrastre en Chrome.
    const empieza = (e) => { if (Array.from(e.dataTransfer?.types ?? []).includes(TIPO_ARRASTRE)) setTimeout(() => setArrastrando(true), 0); };
    const acaba = () => setArrastrando(false);
    document.addEventListener("dragstart", empieza);
    document.addEventListener("dragend", acaba);
    document.addEventListener("drop", acaba);
    return () => {
      document.removeEventListener("dragstart", empieza);
      document.removeEventListener("dragend", acaba);
      document.removeEventListener("drop", acaba);
    };
  }, []);

  const soltarClave = async (clave, destino) => {
    const t = porClave.get(clave);
    if (!t) { setAviso("No encontré esa tarea: vuelve a cargar Mi día."); return; }
    const motivo = await acciones.soltar(t, destino);
    setAviso(motivo || "");
  };

  const fijar = async (clienteId, n, si) => {
    const c = clients.find((x) => (x.dbId || x.id) === clienteId);
    const actuales = limpiarDias(c?.diasTrabajo);
    const dias = si ? [...actuales, n] : actuales.filter((d) => d !== n);
    try {
      await onDiasEmpresa?.(clienteId, limpiarDias(dias));
      setAviso("");
    } catch (e) {
      setAviso(e?.message || "No se pudo guardar el día de la empresa.");
    }
  };

  const comun = { hoy, porClave, soloLectura, acciones, onSoltar: soltarClave, onSelectClient };

  return (
    <section className="semana" aria-label="La semana">
      <div className="semana-barra">
        <button type="button" className="btn-icon" onClick={() => setLunes((l) => sumarDias(l, -7))} aria-label="Semana anterior">
          <Icon name="chevronLeft" size={20} />
        </button>
        <h2 className="semana-titulo">{esEstaSemana ? "Esta semana" : "Semana"} · {textoSemana(lunes)}</h2>
        <button type="button" className="btn-icon" onClick={() => setLunes((l) => sumarDias(l, 7))} aria-label="Semana siguiente">
          <Icon name="chevronRight" size={20} />
        </button>
        {!esEstaSemana && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLunes(lunesDe(hoy))}>Volver a esta semana</button>
        )}
      </div>

      {aviso && <p role="alert" className="notice notice-error">{aviso}</p>}

      {semana.deAntes.length > 0 && (
        <div className="notice notice-warn semana-antes">
          <p style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <Icon name="alert" size={16} /> {semana.deAntes.length === 1 ? "1 tarea atrasada de semanas anteriores" : `${semana.deAntes.length} tareas atrasadas de semanas anteriores`}
          </p>
          <ul>
            {semana.deAntes.map((x) => (
              <li key={claveTarea(x.tarea)}>
                <span>
                  <strong>{x.tarea._rapida ? "Sin empresa" : (clients.find((c) => (c.dbId || c.id) === x.tarea.client_id)?.name ?? "Empresa")}:</strong>{" "}
                  {x.tarea.title} <span className="semana-atraso">· {fechaCorta(x.fecha)}, {textoAtraso(diasEntre(x.fecha, hoy)).toLowerCase()}</span>
                </span>
                {!soloLectura && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => acciones.moverA(x.tarea, hoy)}>Pasar a hoy</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="semana-cuerpo">
        <div className="semana-dias" ref={diasRef}>
          {semana.dias.map((d) => (
            <Dia key={d.fecha} dia={d} clients={clients} onFijar={fijar} arrastrando={arrastrando} {...comun} />
          ))}
        </div>
        <PorAgendar items={semana.porAgendar} clients={clients} dias={semana.dias} {...comun} />
      </div>
    </section>
  );
}

/** Lo que hace falta para que una zona acepte una tarea arrastrada. */
function useZona(onSoltar, destino, activa) {
  const [encima, setEncima] = useState(false);
  if (!activa) return { props: {}, encima: false };
  const acepta = (e) => Array.from(e.dataTransfer?.types ?? []).includes(TIPO_ARRASTRE);
  return {
    encima,
    props: {
      onDragOver: (e) => { if (!acepta(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!encima) setEncima(true); },
      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEncima(false); },
      onDrop: (e) => {
        if (!acepta(e)) return;
        e.preventDefault();
        setEncima(false);
        const clave = e.dataTransfer.getData(TIPO_ARRASTRE);
        if (clave) void onSoltar(clave, destino);
      },
    },
  };
}

function Dia({ dia, clients, hoy, porClave, soloLectura, acciones, onSoltar, onSelectClient, onFijar, arrastrando }) {
  const info = DIAS_SEMANA[dia.n - 1];
  const fijarId = useId();
  const fijas = new Set(dia.empresas.filter((e) => e.fija).map((e) => e.clienteId));
  const libres = clients.filter((c) => !fijas.has(c.dbId || c.id));
  const sueltas = useZona(onSoltar, { empresa: "", dia: dia.fecha }, !soloLectura);
  const pendientes = dia.empresas.reduce((n, e) => n + e.items.filter((x) => !hecha(x.tarea)).length, 0) + dia.sueltas.filter((x) => !hecha(x.tarea)).length;

  return (
    <section className="semana-dia" data-hoy={dia.esHoy} data-pasado={dia.pasado} aria-label={`${info.largo} ${fechaCorta(dia.fecha)}${dia.esHoy ? " (hoy)" : ""}`}>
      <header className="semana-dia-cabecera">
        <span className="semana-dia-nombre">{info.largo}</span>
        <span className="semana-dia-fecha">{fechaCorta(dia.fecha)}</span>
        {dia.esHoy && <span className="semana-hoy">Hoy</span>}
        {pendientes > 0 && <span className="badge semana-numero">{pendientes}</span>}
      </header>

      {dia.empresas.map((e) => (
        <TarjetaEmpresa
          key={e.clienteId}
          empresa={e}
          dia={dia}
          hoy={hoy}
          porClave={porClave}
          soloLectura={soloLectura}
          acciones={acciones}
          onSoltar={onSoltar}
          onSelectClient={onSelectClient}
          onFijar={(si) => onFijar(e.clienteId, dia.n, si)}
        />
      ))}

      {(dia.sueltas.length > 0 || sueltas.encima) && (
        <div className="semana-tarjeta semana-sueltas" data-encima={sueltas.encima} {...sueltas.props}>
          <p className="semana-tarjeta-nombre"><Icon name="bolt" size={12} /> Sin empresa</p>
          <ul className="semana-lista">
            {dia.sueltas.map((x) => <FilaSemana key={claveTarea(x.tarea)} item={x} hoy={hoy} soloLectura={soloLectura} acciones={acciones} />)}
          </ul>
        </div>
      )}

      {dia.empresas.length === 0 && dia.sueltas.length === 0 && (
        <p className="semana-vacio">Sin empresas fijas este día.</p>
      )}

      {!soloLectura && libres.length > 0 && (
        <div className="semana-fijar">
          <label htmlFor={fijarId} className="sr-only">Fijar una empresa {info.plural}</label>
          <select
            id={fijarId}
            className="input"
            value=""
            onChange={(ev) => { if (ev.target.value) void onFijar(ev.target.value, dia.n, true); }}
          >
            <option value="">+ Fijar empresa</option>
            {libres.map((c) => <option key={c.id} value={c.dbId || c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {/* Para soltar lo que no es de ninguna empresa en este día, aunque aún no tenga tarjeta de sueltas. */}
      {!soloLectura && arrastrando && dia.sueltas.length === 0 && !sueltas.encima && (
        <div className="semana-soltar-suelta" {...sueltas.props} aria-hidden="true">Soltar aquí: sin empresa</div>
      )}
    </section>
  );
}

function TarjetaEmpresa({ empresa: e, dia, hoy, soloLectura, acciones, onSoltar, onSelectClient, onFijar }) {
  const info = DIAS_SEMANA[dia.n - 1];
  const [verSinDia, setVerSinDia] = useState(false);
  const [nueva, setNueva] = useState("");
  const sinDiaId = useId();
  const nuevaId = useId();
  const zona = useZona(onSoltar, { empresa: e.clienteId, dia: dia.fecha }, !soloLectura);

  const crear = async (ev) => {
    ev.preventDefault();
    const titulo = nueva.trim();
    if (!titulo) return;
    await acciones.crear({ titulo, empresa: e.clienteId, today_date: dia.fecha });
    setNueva("");
  };

  return (
    <div className="semana-tarjeta" data-fija={e.fija} data-encima={zona.encima} {...zona.props}>
      <div className="semana-tarjeta-cabecera">
        <button type="button" className="semana-tarjeta-nombre" onClick={() => onSelectClient?.(e.clienteId)} title={`Abrir ${e.nombre}`}>
          <Icon name="building" size={12} /> {e.nombre}
        </button>
        {!soloLectura && (
          <button
            type="button"
            className="btn-icon semana-fijo"
            aria-pressed={e.fija}
            onClick={() => onFijar(!e.fija)}
            aria-label={e.fija ? `Que ${e.nombre} deje de salir ${info.plural}` : `Fijar ${e.nombre} ${info.plural}`}
            title={e.fija ? `Fija ${info.plural} · pulsa para quitarla` : `Fijarla ${info.plural}`}
          >
            <Icon name="bookmark" size={14} />
          </button>
        )}
      </div>

      {e.items.length > 0 ? (
        <ul className="semana-lista" aria-label={`${e.nombre}, ${info.largo.toLowerCase()}`}>
          {e.items.map((x) => <FilaSemana key={claveTarea(x.tarea)} item={x} hoy={hoy} soloLectura={soloLectura} acciones={acciones} />)}
        </ul>
      ) : (
        <p className="semana-vacio">{dia.esHoy ? "Nada planeado para hoy." : "Nada planeado."}</p>
      )}

      {!soloLectura && (
        <form className="semana-nueva" onSubmit={crear}>
          <label htmlFor={nuevaId} className="sr-only">Nueva tarea de {e.nombre} para el {info.largo.toLowerCase()}</label>
          <input id={nuevaId} className="input" value={nueva} onChange={(ev) => setNueva(ev.target.value)} placeholder="+ Tarea" />
        </form>
      )}

      {e.sinDia.length > 0 && (
        <>
          <button type="button" className="semana-plegable" aria-expanded={verSinDia} aria-controls={sinDiaId} onClick={() => setVerSinDia((v) => !v)}>
            <Icon name={verSinDia ? "chevronDown" : "chevronRight"} size={12} /> Sin día ({e.sinDia.length})
          </button>
          {verSinDia && (
            <ul id={sinDiaId} className="semana-lista">
              {e.sinDia.map((x) => (
                <FilaSemana
                  key={claveTarea(x.tarea)}
                  item={x}
                  hoy={hoy}
                  soloLectura={soloLectura}
                  acciones={acciones}
                  extra={!soloLectura && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => acciones.moverA(x.tarea, dia.fecha)}>
                      {dia.esHoy ? "Hoy" : info.corto}
                    </button>
                  )}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilaSemana({ item, hoy, soloLectura, acciones, extra = null, como: Etiqueta = "li" }) {
  const t = item.tarea;
  const esHecha = hecha(t);
  const arrastre = soloLectura || esHecha ? {} : {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(TIPO_ARRASTRE, claveTarea(t));
      e.dataTransfer.setData("text/plain", t.title);
    },
  };
  return (
    <Etiqueta className="semana-fila" data-hecha={esHecha} data-atrasada={item.atrasada && !esHecha} {...arrastre}>
      <button
        type="button"
        className="semana-check"
        aria-pressed={esHecha}
        disabled={soloLectura}
        onClick={() => acciones.alternarHecha(t)}
        aria-label={esHecha ? `Reabrir: ${t.title}` : `Completar: ${t.title}`}
      >
        <Icon name={esHecha ? "checkSquare" : "square"} size={16} />
      </button>
      <span className="semana-fila-texto">
        <span className="semana-fila-titulo">{t.title}</span>
        {item.atrasada && !esHecha && <span className="semana-atraso">{textoAtraso(diasEntre(item.fecha, hoy))}</span>}
        {t.assigned_to && <span className="semana-quien">{t.assigned_to}</span>}
      </span>
      {item.atrasada && !esHecha && !soloLectura && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => acciones.moverA(t, hoy)} title="La pasa a hoy: sale de atrasadas">A hoy</button>
      )}
      {extra}
    </Etiqueta>
  );
}

/** Debajo de la semana: lo que no tiene día. Se arrastra a una tarjeta o se agenda con los dos selectores. */
function PorAgendar({ items, clients, dias, hoy, soloLectura, acciones, onSoltar }) {
  const [abierta, setAbierta] = useState(null);
  return (
    <aside className="semana-bandeja" aria-label="Por agendar">
      <h3 className="semana-bandeja-titulo">
        <Icon name="list" size={14} /> Por agendar <span className="badge semana-numero">{items.length}</span>
      </h3>
      <p className="semana-ayuda">
        {soloLectura ? "Las tareas sin día." : "Arrástralas a una empresa en su día, o pulsa «Agendar». Desde el panel de tareas también se arrastran."}
      </p>
      {items.length === 0 && <p className="semana-vacio">Todo tiene su día.</p>}
      <ul className="semana-lista">
        {items.map((x) => (
          <li key={claveTarea(x.tarea)} className="semana-bandeja-item">
            <FilaSemana
              como="div"
              item={x}
              hoy={hoy}
              soloLectura={soloLectura}
              acciones={acciones}
              extra={!soloLectura && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-expanded={abierta === claveTarea(x.tarea)}
                  onClick={() => setAbierta((a) => (a === claveTarea(x.tarea) ? null : claveTarea(x.tarea)))}
                >
                  Agendar
                </button>
              )}
            />
            {abierta === claveTarea(x.tarea) && (
              <Agendar
                tarea={x.tarea}
                clients={clients}
                dias={dias}
                hoy={hoy}
                onListo={async (destino) => { await onSoltar(claveTarea(x.tarea), destino); setAbierta(null); }}
                onCancelar={() => setAbierta(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Agendar({ tarea, clients, dias, hoy, onListo, onCancelar }) {
  const empresaId = useId();
  const diaId = useId();
  const [empresa, setEmpresa] = useState(tarea._rapida ? "" : tarea.client_id);
  const hoyEnSemana = dias.find((d) => d.esHoy)?.fecha;
  const [dia, setDia] = useState(hoyEnSemana ?? dias[0].fecha);
  return (
    <div className="semana-agendar" role="group" aria-label={`Agendar «${tarea.title}»`}>
      <label htmlFor={empresaId} className="sr-only">Empresa</label>
      <select id={empresaId} className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
        {tarea._rapida && <option value="">Sin empresa</option>}
        {clients.map((c) => <option key={c.id} value={c.dbId || c.id}>{c.name}</option>)}
      </select>
      <label htmlFor={diaId} className="sr-only">Día</label>
      <select id={diaId} className="input" value={dia} onChange={(e) => setDia(e.target.value)}>
        {dias.map((d) => (
          <option key={d.fecha} value={d.fecha}>{DIAS_SEMANA[d.n - 1].largo} {fechaCorta(d.fecha)}{d.fecha === hoy ? " (hoy)" : ""}</option>
        ))}
      </select>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onListo({ empresa, dia })}>Listo</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
    </div>
  );
}
