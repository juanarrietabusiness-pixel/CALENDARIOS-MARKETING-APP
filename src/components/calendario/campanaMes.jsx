import Icon from "../Icon";
import { MONTHS } from "../../constants";
import { semanasDelMes } from "../../lib/campanas";
import { rangoSemana } from "../../lib/semanas";
import { TIPOS_FECHA } from "../../lib/fechasEspeciales";

// ============================================================
// La campaña del mes, a la vista
//
// Antes la campaña era una línea gris sobre la rejilla y el nombre de
// cada semana un «S1:» diminuto dentro de su primer día. Ahora es una
// tarjeta: el nombre del mes en grande, las ofertas y el código, una
// fila con la campaña de cada semana (la de hoy resaltada) y las fechas
// especiales del mes. Sin nombre, la tarjeta invita a ponerlo o a que la
// IA lo proponga.
// ============================================================

const corta = (f) => `${+f.slice(8, 10)} ${MONTHS[+f.slice(5, 7) - 1].slice(0, 3).toLowerCase()}`;

export function CampanaMes({ cal, conceptos, fechas, hoy, soloLectura = false, sugiriendo = false, error = "", onEditar, onSugerir, onFechas }) {
  const semanas = semanasDelMes(cal.year, cal.month);
  const nombre = (cal.campaign || "").trim();
  const faltan = !nombre || conceptos.some((c) => !c);
  const destacadas = fechas.filter((f) => f.destacada || f.tipo !== "internacional");

  return (
    <section className="campana-mes" data-vacia={!nombre || undefined} aria-label={`Campaña de ${MONTHS[cal.month].toLowerCase()}`}>
      <div className="campana-mes-cabecera">
        <span className="campana-mes-icono" aria-hidden="true"><Icon name="megaphone" size={22} /></span>
        <div className="campana-mes-texto">
          <p className="campana-mes-ante">Campaña de {MONTHS[cal.month].toLowerCase()}</p>
          <h2 className="campana-mes-nombre">{nombre || "Sin nombre todavía"}</h2>
          {(cal.offers || cal.promoCode) && (
            <p className="campana-mes-ofertas">
              {cal.offers && <span><Icon name="star" size={12} /> {cal.offers}</span>}
              {cal.promoCode && <span className="campana-mes-codigo">Código <strong>{cal.promoCode}</strong></span>}
            </p>
          )}
        </div>
        {!soloLectura && (
          <div className="campana-mes-acciones">
            {faltan && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onSugerir} disabled={sugiriendo}>
                <Icon name="sparkles" size={14} /> {sugiriendo ? "Pensando…" : nombre ? "Nombrar semanas con IA" : "Sugerir con IA"}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditar("general")}>
              <Icon name="pencil" size={14} /> {nombre ? "Editar" : "Ponerle nombre"}
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="notice notice-error" style={{ marginTop: "var(--sp-2)" }}>{error}</p>}

      <ol className="campana-semanas" aria-label="Campaña de cada semana">
        {semanas.map((s, i) => {
          const actual = s.desde <= hoy && hoy <= s.hasta;
          const contenido = (
            <>
              <span className="campana-semana-cuando">S{s.numero} · {rangoSemana(s.desde, s.hasta)}</span>
              <span className="campana-semana-nombre" data-vacio={!conceptos[i] || undefined}>{conceptos[i] || "Sin nombre"}</span>
            </>
          );
          return (
            <li key={s.numero} className="campana-semana" data-actual={actual || undefined}>
              {soloLectura
                ? <span className="campana-semana-boton">{contenido}</span>
                : (
                  <button type="button" className="campana-semana-boton" onClick={() => onEditar("weeks")} aria-label={`Semana ${s.numero}${actual ? " (esta semana)" : ""}: ${conceptos[i] || "sin nombre"}. Editar`}>
                    {contenido}
                  </button>
                )}
            </li>
          );
        })}
      </ol>

      <div className="campana-fechas">
        <span className="campana-fechas-titulo"><Icon name="calendar" size={14} /> Fechas especiales</span>
        {destacadas.length === 0 && <span className="campana-fechas-vacio">Ninguna este mes</span>}
        {destacadas.map((f) => (
          <span
            key={`${f.id}-${f.fecha}`}
            className="campana-fecha"
            data-tipo={f.tipo}
            data-destacada={f.destacada || undefined}
            data-delicada={f.delicada || undefined}
            title={`${TIPOS_FECHA[f.tipo]}${f.destacada ? " · importante para este cliente" : ""}${f.verificar ? " · propuesta por la IA: verifícala" : ""}${f.porque ? ` · ${f.porque}` : ""}`}
          >
            {f.destacada && <Icon name="star" size={11} />} {corta(f.fecha)} · {f.nombre}{f.verificar ? " (?)" : ""}
          </span>
        ))}
        {!soloLectura && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onFechas}>
            <Icon name="settings" size={14} /> Elegir fechas
          </button>
        )}
      </div>
    </section>
  );
}
