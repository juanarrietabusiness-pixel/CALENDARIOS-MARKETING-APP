// ============================================================
// Gráficas en SVG, sin librería
//
// Una librería de gráficas son 40-70 kB comprimidos para dos formas: una
// línea (seguidores) y unas barras (alcance por día). Esto son 100
// líneas. Cada gráfica lleva `role="img"` con un resumen en palabras: una
// línea que sube no se lee con lector de pantalla.
// ============================================================

import { numeroCorto } from "../lib/resultados";

const ANCHO = 600;
const ALTO = 160;
const MARGEN = { arriba: 12, abajo: 22, izq: 44, der: 8 };

const fechaCorta = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });

function escala(valores) {
  const hay = valores.filter((v) => v != null);
  let min = Math.min(...hay);
  let max = Math.max(...hay);
  if (!hay.length) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  return { min, max, y: (v) => MARGEN.arriba + alto - ((v - min) / (max - min)) * alto };
}

function Ejes({ min, max, y, puntos }) {
  const x0 = MARGEN.izq;
  return (
    <g className="grafica-ejes" aria-hidden="true">
      {[max, (min + max) / 2, min].map((v) => (
        <g key={v}>
          <line x1={x0} x2={ANCHO - MARGEN.der} y1={y(v)} y2={y(v)} />
          <text x={x0 - 6} y={y(v) + 4} textAnchor="end">{numeroCorto(Math.round(v))}</text>
        </g>
      ))}
      {puntos.length > 1 && (
        <>
          <text x={puntos[0].x} y={ALTO - 4} textAnchor="start">{fechaCorta(puntos[0].fecha)}</text>
          <text x={puntos.at(-1).x} y={ALTO - 4} textAnchor="end">{fechaCorta(puntos.at(-1).fecha)}</text>
        </>
      )}
    </g>
  );
}

/** Una línea: [{ fecha, valor }]. Los días sin dato no cortan la línea. */
export function GraficaLinea({ datos, titulo }) {
  const conDato = datos.filter((d) => d.valor != null);
  if (conDato.length < 2) return <p className="hint">Hacen falta al menos dos días de datos para dibujar la evolución.</p>;
  const { min, max, y } = escala(conDato.map((d) => d.valor));
  const paso = (ANCHO - MARGEN.izq - MARGEN.der) / (datos.length - 1 || 1);
  const puntos = datos.map((d, i) => ({ ...d, x: MARGEN.izq + i * paso })).filter((d) => d.valor != null);
  const camino = puntos.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const primero = conDato[0].valor;
  const ultimo = conDato.at(-1).valor;
  return (
    <svg className="grafica" viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img"
      aria-label={`${titulo}: de ${numeroCorto(primero)} a ${numeroCorto(ultimo)} entre el ${fechaCorta(conDato[0].fecha)} y el ${fechaCorta(conDato.at(-1).fecha)}.`}>
      <Ejes min={min} max={max} y={y} puntos={puntos} />
      <path d={`${camino} L${puntos.at(-1).x},${ALTO - MARGEN.abajo} L${puntos[0].x},${ALTO - MARGEN.abajo} Z`} className="grafica-area" />
      <path d={camino} className="grafica-linea" />
      <circle cx={puntos.at(-1).x} cy={y(ultimo)} r="3.5" className="grafica-punto" />
    </svg>
  );
}

/** Barras por día: [{ fecha, valor }]. */
export function GraficaBarras({ datos, titulo }) {
  if (!datos.some((d) => d.valor)) return <p className="hint">Sin datos de {titulo.toLowerCase()} en este periodo.</p>;
  const { y } = escala([0, ...datos.map((d) => d.valor ?? 0)]);
  const paso = (ANCHO - MARGEN.izq - MARGEN.der) / datos.length;
  const ancho = Math.max(1, paso * 0.7);
  const puntos = datos.map((d, i) => ({ ...d, x: MARGEN.izq + i * paso + paso / 2 }));
  const total = datos.reduce((a, d) => a + (d.valor ?? 0), 0);
  const max = Math.max(...datos.map((d) => d.valor ?? 0));
  return (
    <svg className="grafica" viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img"
      aria-label={`${titulo}: ${numeroCorto(total)} en total; el mejor día, ${numeroCorto(max)}.`}>
      <Ejes min={0} max={max || 1} y={y} puntos={puntos} />
      {puntos.map((p) => (
        <rect key={p.fecha} x={p.x - ancho / 2} width={ancho} y={y(p.valor ?? 0)} height={Math.max(0, y(0) - y(p.valor ?? 0))} className="grafica-barra">
          <title>{`${fechaCorta(p.fecha)}: ${numeroCorto(p.valor ?? 0)}`}</title>
        </rect>
      ))}
    </svg>
  );
}
