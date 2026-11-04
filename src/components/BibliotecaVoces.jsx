// ============================================================
// «Buscar voces en español»: la biblioteca de ElevenLabs filtrada a español (va con «Probar una voz», en su chunk).
//
// Todo aquí es GRATIS: buscar, escuchar la muestra que publica ElevenLabs y «Añadir a mis voces» (ocupa un hueco de
// voces de la cuenta de la agencia, por eso sólo lo hace quien la administra: el servidor contesta 403 a los demás).
// Las voces que cobran una tarifa propia no salen (worker/lib/estudio/elevenlabs.js): el precio de la confirmación
// no las contaría.
// ============================================================

import { useEffect, useId, useState } from "react";
import { buscarVocesEnEspanol, anadirVozDeBiblioteca, urlPreviaVoz } from "../lib/videosApi";

const GENEROS = [["", "Todas"], ["female", "Femeninas"], ["male", "Masculinas"], ["neutral", "Neutras"]];
const GENERO = { femenina: "femenina", masculina: "masculina", neutra: "neutra" };

export default function BibliotecaVoces({ client, yaEstan, onOir, onAnadida }) {
  const ids = useId();
  const [q, setQ] = useState("");
  const [genero, setGenero] = useState("");
  const [acento, setAcento] = useState("latin american");
  const [acentos, setAcentos] = useState({});
  const [pagina, setPagina] = useState(0);
  const [res, setRes] = useState(null); // { voces, mas }
  const [cargando, setCargando] = useState(false);
  const [anadiendo, setAnadiendo] = useState("");
  const [error, setError] = useState("");

  const buscar = async (p = 0) => {
    setError(""); setCargando(true);
    try {
      const r = await buscarVocesEnEspanol(client.id, { q, genero, acento, pagina: p });
      setAcentos(r.acentos ?? {});
      setPagina(p);
      setRes((antes) => (p > 0 && antes ? { voces: [...antes.voces, ...r.voces], mas: r.mas } : { voces: r.voces, mas: r.mas }));
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  };
  // La primera búsqueda sale sola: voces latinoamericanas.
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    buscarVocesEnEspanol(client.id, { acento: "latin american" })
      .then((r) => { if (vigente) { setAcentos(r.acentos ?? {}); setRes({ voces: r.voces, mas: r.mas }); } })
      .catch((e) => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [client.id]);

  const anadir = async (v) => {
    setError(""); setAnadiendo(v.id);
    try {
      const r = await anadirVozDeBiblioteca(client.id, { publico: v.publico, voz: v.id, nombre: v.nombre });
      onAnadida?.(r.voz ?? v.id);
    } catch (e) { setError(e.message); } finally { setAnadiendo(""); }
  };

  return (
    <div className="va-bib">
      <form className="va-bib-filtros" onSubmit={(e) => { e.preventDefault(); buscar(0); }}>
        <label htmlFor={`${ids}-q`}>Buscar</label>
        <input id={`${ids}-q`} className="input" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder="cálida, narradora, joven…" />
        <label htmlFor={`${ids}-g`}>Género</label>
        <select id={`${ids}-g`} className="input" value={genero} onChange={(e) => setGenero(e.target.value)}>
          {GENEROS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
        <label htmlFor={`${ids}-a`}>Acento</label>
        <select id={`${ids}-a`} className="input" value={acento} onChange={(e) => setAcento(e.target.value)}>
          <option value="">Cualquiera</option>
          {Object.entries(acentos).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          {!Object.keys(acentos).length && <option value="latin american">Latinoamericano</option>}
        </select>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={cargando}>{cargando ? "Buscando…" : "Buscar"}</button>
      </form>
      <p className="hint">Voces en español de la biblioteca de ElevenLabs. Escucharlas y añadirlas a la cuenta es gratis; se pagan al generar, como las demás.</p>
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
      {res && !res.voces.length && !cargando && <p className="hint">No salió ninguna con esa búsqueda: prueba con otro acento o sin palabras.</p>}
      {res?.voces.length > 0 && (
        <ul className="va-bib-lista">
          {res.voces.map((v) => (
            <li key={v.id} className="va-bib-voz">
              <div>
                <strong>{v.nombre}</strong> <span className="hint">· {GENERO[v.genero] ?? "neutra"}{v.usos ? ` · la usan ${v.usos.toLocaleString("es")}` : ""}</span>
                {v.nota && <p className="hint">{v.nota}</p>}
              </div>
              <div className="va-acciones">
                {v.previa && (
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Escuchar ${v.nombre}`}
                    onClick={() => onOir?.(urlPreviaVoz(client.id, v.previa), `Muestra de ${v.nombre} (gratis).`)}>
                    Escuchar
                  </button>
                )}
                {yaEstan.has(v.id)
                  ? <span className="hint">Ya está en la cuenta</span>
                  : (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(anadiendo)} onClick={() => anadir(v)}>
                      {anadiendo === v.id ? "Añadiendo…" : "Añadir a mis voces"}
                    </button>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {res?.mas && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={cargando} onClick={() => buscar(pagina + 1)}>{cargando ? "Cargando…" : "Ver más"}</button>
      )}
    </div>
  );
}
