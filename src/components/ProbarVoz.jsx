// ============================================================
// «Probar una voz» (lazy, desde «Animado con código»): escoger una voz, escribir lo que dirá, ver el COSTO y sólo
// con «Generar» pagarla, y oírla. La voz SIEMPRE se confirma (decisión de la agencia): el primer toque sólo pregunta el
// precio al servidor (409 `confirmar`), no crea nada. Una muestra ya hecha con ese texto suena gratis.
//
// Las voces NATIVAS en español van primero y todo lo que dice ElevenLabs de cada voz llega traducido (src/lib/voces.js).
// «Escuchar gratis» es la muestra que publica ElevenLabs de la voz (no gasta); «Fijar como voz de la marca» la guarda en
// el kit del cliente; con la llave oficial, «Buscar voces en español» abre la biblioteca de ElevenLabs.
//
// Al terminar enseña la NOTA del trabajo, que dice si el motor devolvió el tiempo de cada palabra: es la pregunta que
// decide si los subtítulos salen del motor o de la verificación posterior.
// ============================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { listarVoces, pedirMuestraVoz, urlMuestraVoz, avanzarTrabajoVoz, fijarVozDeMarca, urlPreviaVoz } from "../lib/videosApi";
import { MAX_TEXTO_MUESTRA, MODELOS_VOZ } from "../lib/voces";
// Sus estilos (va-voz-*) son los del video animado: también se abre desde Marca → Kit y voz, sin él cargado.
import "./VideoAnimado.css";
import BibliotecaVoces from "./BibliotecaVoces";

const VIVOS = ["en_cola", "en_marcha"];
const dolares = (n) => `≈ ${Number(n).toFixed(3).replace(".", ",")} $`;
const GRUPOS = [
  { id: "femenina", nombre: "Femeninas" },
  { id: "masculina", nombre: "Masculinas" },
  { id: "neutra", nombre: "Neutras" },
];

export default function ProbarVoz({ client }) {
  const ids = useId();
  const [datos, setDatos] = useState(null);
  const [voz, setVoz] = useState("");
  const [modelo, setModelo] = useState("v4");
  const [texto, setTexto] = useState("");
  const [precio, setPrecio] = useState(null); // lo que dijo el servidor: { costo, creditos, caracteres }
  const [estado, setEstado] = useState(""); // "" | "precio" | "generando" | "fijando"
  const [nota, setNota] = useState("");
  const [oir, setOir] = useState("");
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const cargar = useCallback((escoger = "") => listarVoces(client.id).then((d) => {
    setDatos(d);
    setVoz(escoger || d.voz || d.voces.find((v) => v.espanol)?.id || d.voces.find((v) => v.genero === "femenina")?.id || d.voces[0]?.id || "");
    setModelo(d.modelo || d.modelos[0]?.clave || "v3");
  }).catch((e) => setError(e.message)), [client.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // Lo que cambie invalida el precio que se enseñó: hay que volver a preguntarlo.
  useEffect(() => { setPrecio(null); setOir(""); setNota(""); }, [voz, modelo, texto]);

  const pedirPrecio = async () => {
    setError(""); setEstado("precio");
    try {
      const r = await pedirMuestraVoz(client.id, { modelo, voz, texto });
      if (r.confirmar) setPrecio(r.confirmar);
      else if (r.lista) { setOir(urlMuestraVoz(client.id, { modelo: r.modelo ?? modelo, voz, huella: r.huella })); setNota("Ya estaba hecha: no costó nada."); }
    } catch (e) { setError(e.message); } finally { setEstado(""); }
  };

  const generar = async () => {
    setError(""); setEstado("generando"); setNota("Pedida. Tarda menos de un minuto…");
    try {
      const r = await pedirMuestraVoz(client.id, { modelo, voz, texto, confirmado: true });
      setPrecio(null);
      const url = () => urlMuestraVoz(client.id, { modelo: r.modelo ?? modelo, voz, huella: r.huella });
      if (r.lista) { setOir(url()); return; }
      for (let i = 0; i < 60 && vivo.current; i++) {
        await new Promise((ok) => setTimeout(ok, 3000));
        const t = await avanzarTrabajoVoz(client.id, r.trabajoId).catch(() => null);
        if (!t || VIVOS.includes(t.estado)) continue;
        if (t.estado === "hecho") { setNota(t.nota); setOir(url()); }
        else { setNota(""); setError(t.error || "La voz no se pudo generar."); }
        return;
      }
      if (vivo.current) setNota("Sigue en marcha: aparecerá aquí al volver a pedirla (ya pagada, saldrá gratis).");
    } catch (e) { setNota(""); setError(e.message); } finally { if (vivo.current) setEstado(""); }
  };

  const fijar = async () => {
    setError(""); setEstado("fijando");
    try {
      const r = await fijarVozDeMarca(client.id, { voz, modelo });
      setDatos((d) => ({ ...d, voz: r.voz?.id ?? "", modelo: r.modelo, voces: d.voces.map((v) => ({ ...v, escogida: v.id === r.voz?.id })) }));
      setNota(`Fijada: los videos de ${client.name} saldrán con ${r.voz?.nombre ?? "esa voz"} (${MODELOS_VOZ[r.modelo]?.nombre ?? r.modelo}).`);
    } catch (e) { setError(e.message); } finally { setEstado(""); }
  };

  if (!datos) return <p className="hint" role={error ? "alert" : undefined}>{error || "Cargando las voces…"}</p>;
  const escogida = datos.voces.find((v) => v.id === voz);
  const nativas = datos.voces.filter((v) => v.espanol);
  const otras = datos.voces.filter((v) => !v.espanol);
  const opcion = (v) => (
    <option key={v.id} value={v.id}>
      {v.nombre}{v.nota ? ` — ${v.nota}` : ""}{v.propia ? " (propia)" : ""}{v.escogida ? " · la de la marca" : ""}
    </option>
  );
  const esLaDeLaMarca = voz && voz === datos.voz && modelo === datos.modelo;

  return (
    <div className="va-voz">
      <div className="va-voz-fila">
        <label htmlFor={`${ids}-voz`}>Voz</label>
        <select id={`${ids}-voz`} className="input" value={voz} onChange={(e) => setVoz(e.target.value)}>
          {nativas.length > 0 && <optgroup label="En español (nativas)">{nativas.map(opcion)}</optgroup>}
          {GRUPOS.map((g) => {
            const del = otras.filter((v) => v.genero === g.id);
            return del.length ? (
              <optgroup key={g.id} label={`${g.nombre}${nativas.length ? " · hablan español con acento de otro idioma" : ""}`}>{del.map(opcion)}</optgroup>
            ) : null;
          })}
        </select>
        <label htmlFor={`${ids}-modelo`}>Modelo</label>
        <select id={`${ids}-modelo`} className="input" value={modelo} onChange={(e) => setModelo(e.target.value)}>
          {datos.modelos.map((m) => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
        </select>
      </div>
      {!nativas.length && (
        <p className="hint">
          Ninguna voz de la cuenta es nativa en español: estas hablan español con el acento de su idioma (casi todas en inglés).
          {datos.biblioteca ? " Busca voces en español en la biblioteca de ElevenLabs (abajo): escucharlas y añadirlas es gratis." : ""}
        </p>
      )}
      <div className="va-acciones">
        {escogida?.previa && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOir(urlPreviaVoz(client.id, escogida.previa)); setNota(escogida.espanol ? "Muestra de ElevenLabs: gratis." : "Muestra de ElevenLabs (gratis): puede estar en inglés; para oírla en español, «Ver el costo de la muestra»."); }}>
            Escuchar gratis
          </button>
        )}
        {esLaDeLaMarca
          ? <span className="hint">Es la voz de la marca.</span>
          : <button type="button" className="btn btn-secondary btn-sm" disabled={!voz || Boolean(estado)} onClick={fijar}>{estado === "fijando" ? "Guardando…" : "Fijar como voz de la marca"}</button>}
      </div>

      <label htmlFor={`${ids}-texto`}>Lo que dirá (vacío: la frase fija de muestra)</label>
      <textarea id={`${ids}-texto`} className="input" rows={3} maxLength={MAX_TEXTO_MUESTRA} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="[preocupada] ¿Las toallitas le dejan la piel roja a tu bebé?" />
      <p className="hint">{texto.length} de {MAX_TEXTO_MUESTRA}. En v4 y v3 van las emociones entre corchetes ([cálida], [susurra], [ríe]); en v2 se quitan. {datos.via === "elevenlabs"
        ? "La voz sale por ElevenLabs con la llave oficial: están las voces de la cuenta."
        : "La voz sale por Kie.ai: sólo están las voces de su lista (y v4 no está)."}</p>

      {precio ? (
        <div className="va-voz-precio" role="status">
          <p>La muestra de <strong>{escogida?.nombre}</strong> ({precio.caracteres} caracteres) cuesta <strong>{dolares(precio.costo)}</strong> ({String(precio.creditos).replace(".", ",")} {precio.unidad ?? "créditos de Kie.ai"}){precio.unidad === "créditos de ElevenLabs" ? ", precio aproximado: depende del plan" : ""}.</p>
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
      {oir && <audio className="va-voz-audio" controls autoPlay src={oir} />}

      {datos.biblioteca && (
        <div className="va-voz-biblioteca">
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={buscar} aria-controls={`${ids}-bib`} onClick={() => setBuscar((x) => !x)}>
            {buscar ? "Cerrar la búsqueda" : "Buscar voces en español"}
          </button>
          {buscar && (
            <div id={`${ids}-bib`}>
              <BibliotecaVoces client={client} yaEstan={new Set(datos.voces.map((v) => v.id))}
                onOir={(url, texto) => { setOir(url); setNota(texto); }}
                onAnadida={(id) => { setNota("Añadida a la cuenta: ya está en la lista de voces."); cargar(id); }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
