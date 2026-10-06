import { useId, useState } from "react";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { MONTHS } from "../../constants";
import { callAI, buildClientContext } from "../../api";
import {
  catalogoDelMes, preferenciasFechas, pedidoDeFechas, leerFechasDeIA, fundirEleccion, TIPOS_FECHA,
} from "../../lib/fechasEspeciales";

// ============================================================
// Las fechas especiales de un cliente
//
// El catálogo (feriados de Panamá, comerciales, días internacionales) sale
// solo en todos los calendarios. Aquí se decide, por cliente, cuáles le
// importan (se destacan y van a la IA al planificar), cuáles no quiere ver
// y cuáles son suyas (su aniversario, los días de su rubro). Es del
// cliente, no del mes: se escoge una vez y vale todos los años.
//
// «Elegir con IA» no busca en internet (la búsqueda de Anthropic está
// apagada en la cuenta): escoge del catálogo mirando la ficha y propone
// días de su rubro, que quedan marcados «verifícala» hasta que alguien
// los confirme. Nada se guarda sin pulsar Guardar.
// ============================================================

const corta = (f) => `${+f.slice(-2)} ${MONTHS[+f.slice(-5, -3) - 1].slice(0, 3).toLowerCase()}`;

export function FechasEspecialesDialog({ client, year, month, onGuardar, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [pref, setPref] = useState(() => preferenciasFechas(client?.fechasEspeciales));
  const [estado, setEstado] = useState("");
  const [pensando, setPensando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState({ fecha: null, nombre: "", cadaAnio: true });

  const delMes = catalogoDelMes(year, month);
  const elegidas = new Set(pref.elegidas);
  const ocultas = new Set(pref.ocultas);

  // «Importante» y «Ocultar» se excluyen: marcar una quita la otra.
  const alternar = (lista, id) => setPref((p) => {
    const otra = lista === "elegidas" ? "ocultas" : "elegidas";
    const tiene = p[lista].includes(id);
    return {
      ...p,
      [lista]: tiene ? p[lista].filter((x) => x !== id) : [...p[lista], id],
      [otra]: tiene ? p[otra] : p[otra].filter((x) => x !== id),
    };
  });

  const elegirConIA = async () => {
    setPensando(true);
    setEstado("La IA está mirando la ficha del cliente…");
    try {
      const txt = await callAI(pedidoDeFechas(buildClientContext(client), year), { funcion: "calendario", clienteId: client?.id });
      const deIA = leerFechasDeIA(txt);
      if (!deIA) throw new Error("La IA no devolvió una lista que se pueda leer. Inténtalo otra vez.");
      setPref((p) => fundirEleccion(p, deIA));
      setEstado(`La IA marcó ${deIA.elegidas.length} ${deIA.elegidas.length === 1 ? "fecha" : "fechas"} del año y propuso ${deIA.propias.length} de su rubro. Revisa y pulsa Guardar.`);
    } catch (e) {
      setEstado(e?.message || "No se pudo consultar a la IA.");
    }
    setPensando(false);
  };

  const anadir = () => {
    const nombre = nueva.nombre.trim();
    if (!nueva.fecha || !nombre) return;
    const propia = nueva.cadaAnio
      ? { id: `p-${Date.now()}`, dia: nueva.fecha.slice(5), nombre }
      : { id: `p-${Date.now()}`, fecha: nueva.fecha, nombre };
    setPref((p) => ({ ...p, propias: [...p.propias, propia] }));
    setNueva({ fecha: null, nombre: "", cadaAnio: true });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(preferenciasFechas(pref));
      onClose();
    } catch (e) {
      setEstado(e?.message || "No se pudo guardar.");
      setGuardando(false);
    }
  };

  const propiasOrdenadas = [...pref.propias].sort((a, b) => (a.dia ?? a.fecha.slice(5)).localeCompare(b.dia ?? b.fecha.slice(5)));

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 620 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Fechas especiales{client?.name ? ` de ${client.name}` : ""}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div className="sheet-body">
          <div className="fechas-ia">
            <p className="hint" style={{ margin: 0, flex: 1 }}>
              Los feriados de Panamá y las fechas comerciales salen solas. Marca las que le importan a este cliente
              (se destacan y la IA las usa al planificar), oculta las que no y añade las suyas.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={elegirConIA} disabled={pensando}>
              <Icon name="sparkles" size={14} /> {pensando ? "Pensando…" : "Elegir con IA"}
            </button>
          </div>
          {estado && <p role="status" className="hint" style={{ color: "var(--accent)" }}>{estado}</p>}

          <h3 className="fechas-titulo">{MONTHS[month]} {year}</h3>
          {delMes.length === 0 && <p className="hint">El catálogo no tiene fechas en este mes.</p>}
          <ul className="fechas-lista">
            {delMes.map((f) => (
              <li key={f.id} className="fechas-fila" data-oculta={ocultas.has(f.id) || undefined}>
                <span className="fechas-fila-dia">{corta(f.fecha)}</span>
                <span className="fechas-fila-texto">
                  <span>{f.nombre}</span>
                  <span className="fechas-fila-tipo">{TIPOS_FECHA[f.tipo]}{f.delicada ? " · delicada: sin promociones" : ""}</span>
                </span>
                <button type="button" className="filter-chip" aria-pressed={elegidas.has(f.id)} onClick={() => alternar("elegidas", f.id)}>
                  <Icon name="star" size={12} /> Importante
                </button>
                <button type="button" className="filter-chip" aria-pressed={ocultas.has(f.id)} onClick={() => alternar("ocultas", f.id)}>
                  <Icon name="eyeOff" size={12} /> Ocultar
                </button>
              </li>
            ))}
          </ul>

          <h3 className="fechas-titulo">Del cliente (todo el año)</h3>
          {propiasOrdenadas.length === 0 && <p className="hint">Ninguna todavía: su aniversario, el día de su rubro, una feria…</p>}
          <ul className="fechas-lista">
            {propiasOrdenadas.map((p) => (
              <li key={p.id} className="fechas-fila">
                <span className="fechas-fila-dia">{corta(p.dia ?? p.fecha)}</span>
                <span className="fechas-fila-texto">
                  <span>{p.nombre}</span>
                  <span className="fechas-fila-tipo">
                    {p.dia ? "Cada año" : `Sólo ${p.fecha.slice(0, 4)}`}
                    {p.verificar ? " · propuesta por la IA: verifícala" : ""}
                    {p.porque ? ` · ${p.porque}` : ""}
                  </span>
                </span>
                {p.verificar && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPref((x) => ({ ...x, propias: x.propias.map((y) => (y.id === p.id ? { ...y, verificar: false } : y)) }))}>
                    <Icon name="check" size={14} /> Confirmar
                  </button>
                )}
                <button type="button" className="btn-icon" aria-label={`Quitar ${p.nombre}`} onClick={() => setPref((x) => ({ ...x, propias: x.propias.filter((y) => y.id !== p.id) }))}>
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="fechas-nueva">
            <SelectorFecha value={nueva.fecha} onChange={(f) => setNueva((n) => ({ ...n, fecha: f }))} etiqueta="Fecha de la nueva fecha especial" vacio="Escoger día" prefijo="El" />
            <label htmlFor={`${ids}-nombre`} className="sr-only">Nombre</label>
            <input id={`${ids}-nombre`} className="input" value={nueva.nombre} onChange={(e) => setNueva((n) => ({ ...n, nombre: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); anadir(); } }} placeholder="Ej: Aniversario de la marca" style={{ flex: "1 1 180px" }} />
            <label className="fechas-cada-anio">
              <input type="checkbox" checked={nueva.cadaAnio} onChange={(e) => setNueva((n) => ({ ...n, cadaAnio: e.target.checked }))} /> Cada año
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={anadir} disabled={!nueva.fecha || !nueva.nombre.trim()}>
              <Icon name="plus" size={14} /> Añadir
            </button>
          </div>
        </div>

        <div className="sheet-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-4)" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
