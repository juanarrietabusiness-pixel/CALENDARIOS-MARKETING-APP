import "./QueEs.css";

/** El semáforo (Sana · A vigilar · Mala · Esperando): el color con su texto, nunca sólo el color. */
export default function Semaforo({ s, prefijo = "" }) {
  if (!s) return null;
  return <span className="semaforo" data-tono={s.tono}>{prefijo}{s.texto}</span>;
}
