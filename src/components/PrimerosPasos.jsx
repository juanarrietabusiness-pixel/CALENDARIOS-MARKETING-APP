import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { pedir } from "../lib/db";
import { analizarRuta, construirRuta, navegar } from "../lib/rutas";
import { soloLectura } from "../lib/sesionActual";
import { pasosDelCliente, resumenDePasos } from "../lib/primerosPasos";
import "./PrimerosPasos.css";

// ============================================================
// «Primeros pasos» de un cliente, arriba de su página
//
// Una lista corta de lo que conviene dejar listo al empezar (src/lib/primerosPasos.js), con el botón de cada paso a
// donde se arregla. Plegable, y DESAPARECE al completarse: entonces este navegador lo recuerda y no vuelve a preguntar
// al servidor por ese cliente. «No mostrar más» hace lo mismo a mano (un cliente que no publica en redes, por ejemplo).
// Va en su chunk: lo carga ResumenCliente, con `key` por cliente (cambiar de cliente la empieza de cero). A quien es de
// sólo lectura no se le enseña (no puede arreglar nada).
// ============================================================

const CLAVE = (id) => `primeros-pasos:${id}`;
const CLAVE_ABIERTO = (id) => `primeros-pasos-abierto:${id}`;
const leer = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* sin almacenamiento: vuelve a salir */ } };

/** Lo leído de cada cliente con el `pulso` con que se leyó: volver a la página no pregunta otra vez. */
const LEIDO = new Map();

export default function PrimerosPasos({ client, pulso = 0, onIr, onPrepararMes = null }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const [cerrado, setCerrado] = useState(() => Boolean(leer(CLAVE(clienteId))));
  const [estado, setEstado] = useState(() => LEIDO.get(clienteId)?.estado ?? null);
  const [abierto, setAbierto] = useState(() => leer(CLAVE_ABIERTO(clienteId)));

  useEffect(() => {
    if (!clienteId || cerrado || soloLectura()) return undefined;
    const guardado = LEIDO.get(clienteId);
    if (guardado && guardado.pulso === pulso) return undefined;
    let vivo = true;
    pedir(`/primeros-pasos/${encodeURIComponent(clienteId)}`)
      .then((r) => {
        if (!vivo || !r?.estado) return;
        LEIDO.set(clienteId, { pulso, estado: r.estado });
        setEstado(r.estado);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [clienteId, pulso, cerrado]);

  const pasos = pasosDelCliente(estado);
  const r = resumenDePasos(pasos);
  // Completa: se recuerda y no vuelve a salir (ni a preguntarse) para este cliente en este navegador.
  useEffect(() => { if (r.completo && clienteId) escribir(CLAVE(clienteId), "listo"); }, [r.completo, clienteId]);

  if (cerrado || !estado || r.completo || soloLectura()) return null;
  // Sin preferencia guardada, abierta mientras falte más de la mitad (un cliente nuevo); si no, plegada.
  const desplegada = abierto === null ? r.hechos < r.total / 2 : abierto === "1";
  const alternar = () => { const v = desplegada ? "0" : "1"; setAbierto(v); escribir(CLAVE_ABIERTO(clienteId), v); };

  const arreglar = (a) => {
    if (a.accion === "mes") return onPrepararMes?.();
    if (a.ruta) return navegar(a.ruta);
    // El estudio de mercado del cerebro, abierto en su pestaña: Marca lo lee de la dirección (`?mercado=`).
    if (a.mercado) {
      const ruta = analizarRuta();
      if (ruta.cliente) return navegar(`${construirRuta({ cliente: ruta.cliente, pestana: a.ir[0], seccion: a.ir[1] })}?mercado=${a.mercado}`);
    }
    return onIr?.(a.ir[0], a.ir[1]);
  };

  return (
    <section className="primeros-pasos" aria-labelledby={`${ids}-t`}>
      <button type="button" className="primeros-pasos-cabecera" aria-expanded={desplegada} aria-controls={`${ids}-l`} onClick={alternar}>
        <Icon name="rocket" size={16} />
        <span id={`${ids}-t`} className="primeros-pasos-titulo">Primeros pasos</span>
        <span className="primeros-pasos-cuenta">{r.hechos} de {r.total} listos</span>
        <progress className="primeros-pasos-barra" max={r.total} value={r.hechos} aria-label={`${r.hechos} de ${r.total} pasos listos`} />
        <Icon name={desplegada ? "chevronUp" : "chevronDown"} size={16} />
      </button>
      <div id={`${ids}-l`} hidden={!desplegada}>
        <ol className="primeros-pasos-lista">
          {pasos.map((p) => (
            <li key={p.id} className="primeros-pasos-paso" data-hecho={p.hecho || undefined}>
              <span className="primeros-pasos-icono" aria-hidden="true"><Icon name={p.hecho ? "checkCircle" : "circle"} size={18} /></span>
              <div className="primeros-pasos-texto">
                <strong>{p.nombre}</strong>
                <span className="sr-only">{p.hecho ? ": listo." : ": falta."}</span>
                <span className="hint">{p.texto}</span>
              </div>
              {!p.hecho && p.arreglo && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => arreglar(p.arreglo)}>{p.arreglo.etiqueta}</button>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { escribir(CLAVE(clienteId), "oculto"); setCerrado(true); }}>
          No mostrar más para {client?.name ?? "este cliente"}
        </button>
      </div>
    </section>
  );
}
