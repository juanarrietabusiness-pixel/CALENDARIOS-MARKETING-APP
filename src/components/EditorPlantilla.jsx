import { useId } from "react";
import Icon from "./Icon";
import { FORMATS, FORMAT_ICONS, DAYS } from "../constants";
import { PILARES } from "../lib/pilares";
import { OBJETIVOS_PLAN, NEGOCIOS_PLAN, FORMATOS_PLAN, MAX_POR_DIA, resumenPlantilla } from "../lib/plantillasPlan";
import "./EditorPlantilla.css";

// ============================================================
// Editar una plantilla de plan
//
// Nombre, objetivo y tipo de negocio, y por cada día de la semana sus
// publicaciones: formato y tipo de contenido. «Del ritmo» quiere decir el
// tipo que toque ese día en el ritmo del cliente (lunes Anuncio…), que es
// lo que hace que la temporada y el ritmo sigan mandando. Lo usan Ajustes
// (las de la agencia) y la ficha del cliente (su copia personalizada).
// ============================================================

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

export default function EditorPlantilla({ valor, onCambio, lectura = false, conNombre = true }) {
  const ids = useId();
  const dias = valor.dias ?? {};
  const cambiarDia = (dow, lista) => onCambio({ ...valor, dias: { ...dias, [dow]: lista } });

  return (
    <div className="editor-plantilla">
      {conNombre && (
        <div className="editor-plantilla-fila">
          <div className="field" style={{ flex: "2 1 220px" }}>
            <label className="label" htmlFor={`${ids}-n`}>Nombre</label>
            <input id={`${ids}-n`} className="input" value={valor.nombre} maxLength={60} readOnly={lectura} onChange={(e) => onCambio({ ...valor, nombre: e.target.value })} />
          </div>
          <div className="field" style={{ flex: "1 1 170px" }}>
            <label className="label" htmlFor={`${ids}-o`}>Objetivo</label>
            <select id={`${ids}-o`} className="input" value={valor.objetivo} disabled={lectura} onChange={(e) => onCambio({ ...valor, objetivo: e.target.value })}>
              {OBJETIVOS_PLAN.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 150px" }}>
            <label className="label" htmlFor={`${ids}-g`}>Negocio</label>
            <select id={`${ids}-g`} className="input" value={valor.negocio} disabled={lectura} onChange={(e) => onCambio({ ...valor, negocio: e.target.value })}>
              {NEGOCIOS_PLAN.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
            </select>
          </div>
        </div>
      )}
      <p className="hint editor-plantilla-resumen" role="status">{resumenPlantilla(valor)}</p>

      <ul className="editor-plantilla-dias">
        {ORDEN_DIAS.map((dow) => {
          const lista = dias[dow] ?? [];
          return (
            <li key={dow} className="editor-plantilla-dia">
              <div className="editor-plantilla-dia-cabeza">
                <span className="editor-plantilla-dia-nombre">{DAYS[dow]}</span>
                {!lista.length && <span className="hint">Sin publicaciones</span>}
              </div>
              {lista.map((h, i) => (
                <div key={i} className="editor-plantilla-hueco" role="group" aria-label={`${DAYS[dow]}, publicación ${i + 1}`}>
                  <Icon name={FORMAT_ICONS[h.format] || "formatPost"} size={16} style={{ color: FORMATS[h.format]?.color, flexShrink: 0 }} />
                  <select className="input" aria-label={`Formato, ${DAYS[dow]} ${i + 1}`} value={h.format} disabled={lectura}
                    onChange={(e) => cambiarDia(dow, lista.map((x, j) => (j === i ? { ...x, format: e.target.value } : x)))}>
                    {FORMATOS_PLAN.map((f) => <option key={f} value={f}>{FORMATS[f]?.label ?? f}</option>)}
                  </select>
                  <select className="input" aria-label={`Tipo de contenido, ${DAYS[dow]} ${i + 1}`} value={h.pilar || ""} disabled={lectura}
                    onChange={(e) => cambiarDia(dow, lista.map((x, j) => (j === i ? { ...x, pilar: e.target.value } : x)))}>
                    <option value="">Del ritmo del cliente</option>
                    {PILARES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  {!lectura && (
                    <button type="button" className="btn-icon" aria-label={`Quitar la publicación ${i + 1} del ${DAYS[dow]}`}
                      onClick={() => cambiarDia(dow, lista.filter((_, j) => j !== i))}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!lectura && lista.length < MAX_POR_DIA && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiarDia(dow, [...lista, { format: "reel", pilar: "" }])}>
                  <Icon name="plus" size={14} /> Añadir el {DAYS[dow].toLowerCase()}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
