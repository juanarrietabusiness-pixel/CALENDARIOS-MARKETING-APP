// ============================================================
// La rejilla del mes
//
// Cada publicación es un chip arrastrable. El chip es un BOTÓN y sale
// de la escala táctil (`--tap-sm`): medía 24px, por debajo del mínimo,
// y metía cinco cosas en una línea con `nowrap` —así que la etiqueta
// acababa siempre en puntos suspensivos—. Ver `.cal-post` en index.css.
// ============================================================

import { Fragment, useState } from "react";
import { FORMATS, FORMAT_ICONS, STATUSES } from "../../constants";
import { fmtDate } from "../../utils";
import { completitud, resumenCompletitud } from "../../lib/completitud";
import Icon from "../Icon";
import { fmt12h } from "./formato";
import { resumenCola } from "../../lib/cola";
import { estadoDelChip, miniaturaDe, ESTADOS_CHIP } from "../../lib/estadoChip";

/**
 * `vecinos`: los días de los meses de al lado que asoman en la rejilla
 * (fecha → { dia, cal }). Con el calendario siempre activo, la semana del
 * 29 de septiembre al 5 de octubre se ve ENTERA: lo de septiembre sale en
 * sus días, un toque lo abre en su mes, y soltar ahí una publicación de
 * este mes la lleva a ese día (a otro mes: lo hace el servidor).
 */
export function MonthGrid({ cal, cola = [], miembros = [], onPostClick, onMove, onAddPost, onDropFromBank, ideasBank, dayLabels, onUpdateDayLabel, vecinos = null, onVecina, fechas = null, conceptos = [], onEditarSemana }) {
  const [drag, setDrag] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [editingHeader, setEditingHeader] = useState(null);
  const today = fmtDate(new Date());

  const cells = () => {
    const first = new Date(cal.year, cal.month, 1);
    const last = new Date(cal.year, cal.month + 1, 0);
    const s = new Date(first);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(last);
    const edow = e.getDay();
    if (edow !== 0) e.setDate(e.getDate() + (7 - edow));
    const arr = [];
    const d = new Date(s);
    while (d <= e) { arr.push(fmtDate(d)); d.setDate(d.getDate() + 1); }
    return arr;
  };

  const allCells = cells();

  const FULL_DOW = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  return (
    <>
    <div className="cal-grid">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((n, i) => {
        const label = (dayLabels || {})[i] || "";
        const isEditing = editingHeader === i;
        return (
          <div key={n} className="cal-header-cell">
            <abbr title={FULL_DOW[i]} style={{ textDecoration: "none" }}>{n}</abbr>
            {isEditing ? (
              <input
                className="cal-header-input"
                defaultValue={label}
                autoFocus
                placeholder="Etiqueta…"
                onBlur={(e) => { onUpdateDayLabel?.(i, e.target.value); setEditingHeader(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onUpdateDayLabel?.(i, e.target.value); setEditingHeader(null); }
                  if (e.key === "Escape") setEditingHeader(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="cal-header-label"
                onClick={() => setEditingHeader(i)}
                aria-label={`Editar etiqueta de ${FULL_DOW[i]}`}
              >
                {label || <span style={{ color: "var(--text-faint)" }}>+</span>}
              </button>
            )}
          </div>
        );
      })}
      {allCells.map((date, indice) => {
        const d = new Date(date + "T12:00:00");
        const cur = d.getMonth() === cal.month;
        const vecina = cur ? null : vecinos?.get(date) ?? null;
        const dd = cur ? cal.days?.find((dd) => dd.date === date) : vecina?.dia;
        const isToday = date === today;
        const isDrop = dropTarget === date;

        // Cada fila es una semana del mes (la fila 1, la semana 1, como la
        // lista por semanas): si tiene nombre de campaña, va en una franja
        // encima, a lo ancho de la fila. Antes era «S1: …» dentro del primer día.
        const fila = indice / 7;
        const concepto = indice % 7 === 0 ? conceptos[fila] : "";
        const especiales = cur ? fechas?.get(date) ?? [] : [];

        return (
          <Fragment key={date}>
          {concepto && (
            onEditarSemana
              ? (
                <button type="button" className="cal-semana-franja" onClick={() => onEditarSemana(fila + 1)} aria-label={`Semana ${fila + 1}: ${concepto}. Editar`}>
                  <span className="cal-semana-franja-num">S{fila + 1}</span> {concepto}
                </button>
              )
              : <p className="cal-semana-franja"><span className="cal-semana-franja-num">S{fila + 1}</span> {concepto}</p>
          )}
          <div
            className={`cal-cell ${!cur ? "outside" : ""} ${isToday ? "today" : ""} ${isDrop ? "drop-target" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(date); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              let handled = false;
              try {
                const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
                if (data.bankPostId && onDropFromBank && ideasBank) {
                  const bankPost = ideasBank.find((p) => p.id === data.bankPostId);
                  if (bankPost) { onDropFromBank(bankPost, date); handled = true; }
                }
              } catch { /* not bank data */ }
              if (!handled && drag && drag.sourceDate !== date) onMove(drag.postId, drag.sourceDate, date);
              setDrag(null);
              setDropTarget(null);
            }}
          >
            <div className={`cal-daynum${isToday ? " is-today" : ""}`}>
              {isToday && <span className="sr-only">Hoy, </span>}
              {d.getDate()}
            </div>
            {especiales.length > 0 && (
              <span
                className="cal-fecha"
                data-destacada={especiales[0].destacada || undefined}
                data-delicada={especiales[0].delicada || undefined}
                title={especiales.map((f) => f.nombre).join(" · ")}
              >
                {especiales[0].destacada && <Icon name="star" size={10} />}
                <span className="cal-fecha-texto">{especiales[0].nombre}</span>
                {especiales.length > 1 && <span className="cal-fecha-mas">+{especiales.length - 1}</span>}
              </span>
            )}
            {(dd?.posts || []).map((post) => {
              const f = FORMATS[post.format] || FORMATS.post;
              const st = STATUSES[post.status || "pending"];
              // Sin categorías: el chip se colorea por formato, y el estado lo
              // dice su icono. El campo sigue en los datos viejos, sin enseñarse.
              const briefIdea = (post.title || post.idea || "").split(/[.\n]/)[0].slice(0, 24);
              const chipLabel = post.title || briefIdea || f.label;
              const enCola = resumenCola(cola, post.id);
              const estado = estadoDelChip(post, enCola);
              const { etiqueta: textoEstado, icono: iconoEstado } = ESTADOS_CHIP[estado];
              // Con contenido subido, su miniatura; sin él es una idea: borde
              // punteado y la barrita de lo que le falta, que ahí sí dice algo.
              const mini = miniaturaDe(post);
              const avance = mini ? null : completitud(post, dd);
              const resumen = resumenCompletitud(post, dd);
              const lleva = post.responsableId ? miembros.find((m) => m.userId === post.responsableId) : null;
              return (
                <button
                  key={post.id}
                  type="button"
                  draggable={!vecina}
                  data-vecina={vecina ? true : undefined}
                  data-estado={estado}
                  data-idea={mini ? undefined : true}
                  title={`${textoEstado}. ${resumen}`}
                  className={`cal-post${mini ? " con-mini" : ""}`}
                  aria-label={`${vecina ? "Del mes de al lado. " : ""}${f.label}${briefIdea ? `: ${briefIdea}` : ""} — ${estado === "programada" && enCola ? enCola.texto : textoEstado}${mini ? ", con contenido" : ", sin contenido todavía"}${post.publishTime ? `, ${fmt12h(post.publishTime)}` : ""}${lleva ? `. Lo lleva ${lleva.nombre}` : ""}. ${resumen}`}
                  onDragStart={(e) => { if (vecina) return; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", JSON.stringify({ postId: post.id, sourceDate: date })); setDrag({ postId: post.id, sourceDate: date }); }}
                  onDragEnd={() => { setDrag(null); setDropTarget(null); }}
                  onClick={() => (vecina ? onVecina?.(vecina.cal, post) : onPostClick(post, dd))}
                  style={{ background: f.color + "22", borderColor: st.border, color: f.color }}
                >
                  {/* Quién la lleva: una franja con su color (el nombre va en la etiqueta accesible). */}
                  {lleva && <span className="cal-post-quien" style={{ background: lleva.color }} aria-hidden="true" />}
                  {mini && (
                    <span className="cal-post-mini" aria-hidden="true">
                      {mini.src ? <img src={mini.src} alt="" loading="lazy" decoding="async" /> : <Icon name="play" size={14} />}
                    </span>
                  )}
                  <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={13} />
                  {iconoEstado && (
                    <span className="cal-post-estado" data-estado={estado} aria-hidden="true">
                      <Icon name={iconoEstado} size={12} />
                    </span>
                  )}
                  <span className="cal-post-label" aria-hidden="true">{chipLabel}</span>
                  {post.publishTime && <span className="cal-post-time" aria-hidden="true">{fmt12h(post.publishTime)}</span>}
                  {avance && (
                    <span className="cal-post-avance" aria-hidden="true">
                      <span className={`cal-post-avance-fill${avance.porcentaje === 100 ? " is-full" : ""}`} style={{ width: `${avance.porcentaje}%` }} />
                    </span>
                  )}
                </button>
              );
            })}
            {cur && (
              <button
                type="button"
                className="cal-add"
                aria-label={`Agregar publicación el ${date}`}
                onClick={(e) => { e.stopPropagation(); onAddPost(date); }}
              >
                +
              </button>
            )}
          </div>
          </Fragment>
        );
      })}
    </div>
    <LeyendaMes />
    </>
  );
}

/** Qué significa cada marca del chip. Plegada: se aprende una vez. */
function LeyendaMes() {
  return (
    <details className="cal-leyenda">
      <summary>¿Qué significa cada marca?</summary>
      <ul>
        <li><span className="cal-leyenda-mini" aria-hidden="true" /> Con miniatura: tiene su imagen o video subido</li>
        <li><span className="cal-leyenda-idea" aria-hidden="true" /> Borde punteado: es una idea, aún sin contenido (la barra dice cuánto le falta)</li>
        {Object.entries(ESTADOS_CHIP).filter(([, e]) => e.icono).map(([k, e]) => (
          <li key={k}><span className="cal-post-estado" data-estado={k} aria-hidden="true"><Icon name={e.icono} size={12} /></span> {e.etiqueta}</li>
        ))}
        <li><span className="cal-leyenda-vacio" aria-hidden="true" /> Sin icono: pendiente de aprobar</li>
      </ul>
    </details>
  );
}
