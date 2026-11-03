import { bloques, trozos } from "../lib/markdownSimple";

// ============================================================
// Una nota del cerebro, para LEER
//
// Las notas vienen en Markdown del repositorio; en el cuadro de texto eran
// asteriscos, almohadillas y tablas con barras. Aquí se pintan formateadas,
// con elementos de React (nada de HTML inyectado), y un `[[enlace]]` a otra
// nota se puede pulsar para abrirla.
// ============================================================

function Linea({ texto, onNota }) {
  return trozos(texto).map((t, i) => {
    if (t.t === "negrita") return <strong key={i}>{t.v}</strong>;
    if (t.t === "cursiva") return <em key={i}>{t.v}</em>;
    if (t.t === "codigo") return <code key={i}>{t.v}</code>;
    if (t.t === "enlace") return <a key={i} href={t.url} target="_blank" rel="noopener noreferrer">{t.v}</a>;
    if (t.t === "nota") {
      return onNota
        ? <button key={i} type="button" className="nota-legible-enlace" onClick={() => onNota(t.v)} title="Abrir la nota citada">{t.v}</button>
        : <span key={i} className="nota-legible-enlace">{t.v}</span>;
    }
    return <span key={i}>{t.v}</span>;
  });
}

export default function NotaLegible({ texto, onNota }) {
  return (
    <div className="nota-legible">
      {bloques(texto).map((b, i) => {
        if (b.tipo === "titulo") {
          const H = b.nivel <= 2 ? "h4" : "h5";
          return <H key={i}><Linea texto={b.texto} onNota={onNota} /></H>;
        }
        if (b.tipo === "lista") {
          const L = b.ordenada ? "ol" : "ul";
          return <L key={i}>{b.items.map((it, j) => <li key={j}><Linea texto={it} onNota={onNota} /></li>)}</L>;
        }
        if (b.tipo === "tabla") {
          return (
            <div key={i} className="nota-legible-tabla">
              <table>
                <thead><tr>{b.cabecera.map((c, j) => <th key={j} scope="col"><Linea texto={c} onNota={onNota} /></th>)}</tr></thead>
                <tbody>{b.filas.map((f, j) => <tr key={j}>{f.map((c, k) => <td key={k}><Linea texto={c} onNota={onNota} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (b.tipo === "cita") return <blockquote key={i}><Linea texto={b.texto} onNota={onNota} /></blockquote>;
        if (b.tipo === "linea") return <hr key={i} />;
        return <p key={i}><Linea texto={b.texto} onNota={onNota} /></p>;
      })}
    </div>
  );
}
