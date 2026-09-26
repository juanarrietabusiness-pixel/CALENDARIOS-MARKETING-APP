// ============================================================
// La rejilla del mes
//
// Cada publicación es un chip arrastrable. El chip es un BOTÓN y sale
// de la escala táctil (`--tap-sm`): medía 24px, por debajo del mínimo,
// y metía cinco cosas en una línea con `nowrap` —así que la etiqueta
// acababa siempre en puntos suspensivos—. Ver `.cal-post` en index.css.
// ============================================================

import { porProducir } from "../../lib/aprobacion";
import { useState } from "react";
import { FORMATS, FORMAT_ICONS, STATUSES } from "../../constants";
import { fmtDate } from "../../utils";
import { completitud, resumenCompletitud } from "../../lib/completitud";
import Icon from "../Icon";
import { categoryHue, fmt12h } from "./formato";
import { resumenCola } from "../../lib/cola";

export function MonthGrid({ cal, cola = [], miembros = [], onPostClick, onMove, onAddPost, onDropFromBank, ideasBank, dayLabels, onUpdateDayLabel }) {
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
  let lastWeek = null;

  const FULL_DOW = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  return (
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
      {allCells.map((date) => {
        const d = new Date(date + "T12:00:00");
        const dd = cal.days?.find((dd) => dd.date === date);
        const cur = d.getMonth() === cal.month;
        const isToday = date === today;
        const isDrop = dropTarget === date;

        const weekNum = dd?.weekNumber;
        const concept = dd?.concept;
        let showWeekSep = false;
        if (weekNum && weekNum !== lastWeek && cur) {
          showWeekSep = true;
          lastWeek = weekNum;
        }

        return (
          <div
            key={date}
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
            {showWeekSep && concept && (
              <div className="cal-week-tag">S{weekNum}: {concept}</div>
            )}
            {(dd?.posts || []).map((post) => {
              const f = FORMATS[post.format] || FORMATS.post;
              const st = STATUSES[post.status || "pending"];
              const isPublished = post.status === "published";
              const cat = post.category || dd?.category || "";
              const hue = cat ? categoryHue(cat) : 0;
              const briefIdea = (post.title || post.idea || "").split(/[.\n]/)[0].slice(0, 24);
              const chipLabel = post.title || cat || f.label;
              // Cuánto le falta a esta publicación. Va en la barra de abajo
              // y, en palabras, en el nombre accesible y en el `title`: un
              // color no se lee con lector de pantalla.
              const avance = completitud(post, dd);
              const resumen = resumenCompletitud(post, dd);
              const enCola = resumenCola(cola, post.id);
              const lleva = post.responsableId ? miembros.find((m) => m.userId === post.responsableId) : null;
              return (
                <button
                  key={post.id}
                  type="button"
                  draggable
                  title={resumen}
                  className={`cal-post${isPublished ? " is-published" : ""}${cat ? " has-cat" : ""}`}
                  aria-label={`${f.label}${cat ? ` — ${cat}` : ""}${briefIdea ? `: ${briefIdea}` : ""} — ${porProducir(post) ? "Idea aprobada, por producir" : st.label}${post.publishTime ? `, ${fmt12h(post.publishTime)}` : ""}${enCola ? `. ${enCola.texto}` : ""}${lleva ? `. Lo lleva ${lleva.nombre}` : ""}. ${resumen}`}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", JSON.stringify({ postId: post.id, sourceDate: date })); setDrag({ postId: post.id, sourceDate: date }); }}
                  onDragEnd={() => { setDrag(null); setDropTarget(null); }}
                  onClick={() => onPostClick(post, dd)}
                  style={cat ? {
                    background: isPublished ? st.bg : `hsl(${hue} 60% 25% / .35)`,
                    borderColor: isPublished ? st.border : `hsl(${hue} 55% 50% / .5)`,
                    borderWidth: isPublished ? 2 : 1,
                    color: isPublished ? st.text : `hsl(${hue} 70% 75%)`,
                  } : {
                    background: isPublished ? st.bg : f.color + "22",
                    borderColor: isPublished ? st.border : st.border + "88",
                    borderWidth: isPublished ? 2 : 1,
                    color: isPublished ? st.text : f.color,
                  }}
                >
                  {/* Idea aprobada: un punto hueco, porque falta la pieza. */}
                  {/* Quién la lleva: una franja con su color (el nombre va en la etiqueta accesible). */}
                  {lleva && <span className="cal-post-quien" style={{ background: lleva.color }} aria-hidden="true" />}
                  <span className={`cal-post-dot${porProducir(post) ? " es-idea" : ""}`} style={{ background: porProducir(post) ? "transparent" : st.text, borderColor: st.text }} aria-hidden="true" />
                  <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={13} />
                  {enCola && (
                    <span className="cal-post-cola" data-estado={enCola.estado} aria-hidden="true">
                      <Icon name={enCola.icono} size={11} />
                    </span>
                  )}
                  <span className="cal-post-label" aria-hidden="true">{chipLabel}</span>
                  {post.publishTime && <span className="cal-post-time" aria-hidden="true">{fmt12h(post.publishTime)}</span>}
                  {/* La pista se dibuja siempre, aunque esté a cero: si sólo
                      apareciera al haber algo escrito, un chip sin barra se
                      leería como «este formato no la lleva». */}
                  <span className="cal-post-avance" aria-hidden="true">
                    <span
                      className={`cal-post-avance-fill${avance.porcentaje === 100 ? " is-full" : ""}`}
                      style={{ width: `${avance.porcentaje}%` }}
                    />
                  </span>
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
        );
      })}
    </div>
  );
}

