// ============================================================
// «Probar una voz» (lazy, desde «Animado con código»): escoger una voz, escribir lo que dirá, ver el COSTO y sólo
// con «Generar» pagarla, y oírla. La voz SIEMPRE se confirma (decisión de la agencia): el primer toque sólo pregunta el
// precio al servidor (409 `confirmar`), no crea nada. Una muestra ya hecha con ese texto suena gratis.
//
// Al terminar enseña la NOTA del trabajo, que dice si Kie devolvió el tiempo de cada palabra: es la pregunta que
// decide si los subtítulos salen del motor o de la verificación posterior.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import { listarVoces, pedirMuestraVoz, urlMuestraVoz, avanzarTrabajoVoz } from "../lib/videosApi";
import { MAX_TEXTO_MUESTRA } from "../lib/voces";

const VIVOS = ["en_cola", "en_marcha"];
const dolares = (n) => `≈ ${Number(n).toFixed(3).replace(".", ",")} $`;

export default function ProbarVoz({ client }) {
  const ids = useId();
  const [datos, setDatos] = useState(null);
  const [voz, setVoz] = useState("");
  const [modelo, setModelo] = useState("v3");
  const [texto, setTexto] = useState("");
  const [precio, setPrecio] = useState(null); // lo que dijo el servidor: { costo, creditos, caracteres }
  const [estado, setEstado] = useState(""); // "" | "precio" | "generando"
  const [nota, setNota] = useState("");
  const [oir, setOir] = useState("");
  const [error, setError] = useState("");
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  useEffect(() => {
    listarVoces(client.id).then((d) => {
      setDatos(d);
      setVoz(d.voz || d.voces.find((v) => v.genero === "femenina")?.id || d.voces[0]?.id || "");
      setModelo(d.modelo || "v3");
    }).catch((e) => setError(e.message));
  }, [client.id]);

  // Lo que cambie invalida el precio que se enseñó: hay que volver a preguntarlo.
  useEffect(() => { setPrecio(null); setOir(""); setNota(""); }, [voz, modelo, texto]);

  const pedirPrecio = async () => {
    setError(""); setEstado("precio");
    try {
      const r = await pedirMuestraVoz(client.id, { modelo, voz, texto });
      if (r.confirmar) setPrecio(r.confirmar);
      else if (r.lista) { setOir(urlMuestraVoz(client.id, { modelo, voz, huella: r.huella })); setNota("Ya estaba hecha: no costó nada."); }
    } catch (e) { setError(e.message); } finally { setEstado(""); }
  };

  const generar = async () => {
    setError(""); setEstado("generando"); setNota("Pedida. Tarda menos de un minuto…");
    try {
      const r = await pedirMuestraVoz(client.id, { modelo, voz, texto, confirmado: true });
      setPrecio(null);
      if (r.lista) { setOir(urlMuestraVoz(client.id, { modelo, voz, huella: r.huella })); return; }
      for (let i = 0; i < 60 && vivo.current; i++) {
        await new Promise((ok) => setTimeout(ok, 3000));
        const t = await avanzarTrabajoVoz(client.id, r.trabajoId).catch(() => null);
        if (!t || VIVOS.includes(t.estado)) continue;
        if (t.estado === "hecho") { setNota(t.nota); setOir(urlMuestraVoz(client.id, { modelo, voz, huella: r.huella })); }
        else { setNota(""); setError(t.error || "La voz no se pudo generar."); }
        return;
      }
      if (vivo.current) setNota("Sigue en marcha: aparecerá aquí al volver a pedirla (ya pagada, saldrá gratis).");
    } catch (e) { setNota(""); setError(e.message); } finally { if (vivo.current) setEstado(""); }
  };

  if (!datos) return <p className="hint" role={error ? "alert" : undefined}>{error || "Cargando las voces…"}</p>;
  const escogida = datos.voces.find((v) => v.id === voz);

  return (
    <div className="va-voz">
      <div className="va-voz-fila">
        <label htmlFor={`${ids}-voz`}>Voz</label>
        <select id={`${ids}-voz`} className="input" value={voz} onChange={(e) => setVoz(e.target.value)}>
          {["femenina", "masculina", "neutra"].map((g) => {
            const del = datos.voces.filter((v) => v.genero === g);
            return del.length ? (
              <optgroup key={g} label={g === "femenina" ? "Femeninas" : g === "masculina" ? "Masculinas" : "Otras"}>
                {del.map((v) => <option key={v.id} value={v.id}>{v.nombre} — {v.nota || "sin nota"}{v.propia ? " (propia)" : ""}{v.escogida ? " · la de la marca" : ""}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <label htmlFor={`${ids}-modelo`}>Modelo</label>
        <select id={`${ids}-modelo`} className="input" value={modelo} onChange={(e) => setModelo(e.target.value)}>
          {datos.modelos.map((m) => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
        </select>
      </div>
      <label htmlFor={`${ids}-texto`}>Lo que dirá (vacío: la frase fija de muestra)</label>
      <textarea id={`${ids}-texto`} className="input" rows={3} maxLength={MAX_TEXTO_MUESTRA} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="[preocupada] ¿Las toallitas le dejan la piel roja a tu bebé?" />
      <p className="hint">{texto.length} de {MAX_TEXTO_MUESTRA}. En v3 van las emociones entre corchetes; en v2 se quitan. Sólo salen las voces que acepta Kie; una voz propia del kit tiene que estar también en su lista.</p>

      {precio ? (
        <div className="va-voz-precio" role="status">
          <p>La muestra de <strong>{escogida?.nombre}</strong> ({precio.caracteres} caracteres) cuesta <strong>{dolares(precio.costo)}</strong> ({String(precio.creditos).replace(".", ",")} créditos de Kie.ai).</p>
          <div className="va-acciones">
            <button type="button" className="btn btn-primary" disabled={estado === "generando"} onClick={generar}>Generar por {dolares(precio.costo)}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrecio(null)}>No, gracias</button>
          </div>
        </div>
      ) : (
        <div className="va-acciones">
          <button type="button" className="btn" disabled={!voz || Boolean(estado)} onClick={pedirPrecio}>
            {estado === "precio" ? "Preguntando el precio…" : estado === "generando" ? "Generando…" : "Ver el costo de la muestra"}
          </button>
        </div>
      )}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
      {nota && <p className="va-msg" role="status">{nota}</p>}
      {oir && <audio className="va-voz-audio" controls src={oir} />}
    </div>
  );
}
