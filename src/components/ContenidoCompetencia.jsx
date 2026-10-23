import { lazy, Suspense, useId, useState } from "react";
import Icon from "./Icon";
import { contenidoDeCompetencia, traerDeCompetencia, agregarReferencia } from "../lib/mercado";
import { haceCuanto } from "../lib/competencia";
import { usuarioInstagram } from "../lib/auditoria";

// «Extraer guion y adaptar» de un reel de la competencia: sólo se descarga al abrirlo.
const ExtraerUgc = lazy(() => import("./calendario/ExtraerUgc"));

// ============================================================
// «Su contenido en Instagram»: lo que publica la competencia, lo que mejor
// le funcionó primero (lib/competencia.js, `GET /api/mercado/<c>/competencia`)
//
// Se lee por `business_discovery` desde un Instagram conectado: sólo cuentas
// de empresa o de creador. Cada publicación se puede ANALIZAR como referencia
// (baja a la carpeta «Competencia» de la galería y la IA la mira; desde la
// referencia salen «Adaptar», «Recrear con mi marca» y «Seguir este video»)
// o, si es un reel, EXTRAER SU GUION y adaptarlo como UGC para grabar.
// ============================================================

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("es-PA"));
const FORMATO = { reel: "Reel", carrusel: "Carrusel", imagen: "Imagen" };

export default function ContenidoCompetencia({ client, lectura = false, onReferencia, onCambioCerebro }) {
  const ids = useId();
  const sugeridos = (Array.isArray(client.competidores) ? client.competidores : []).map((u) => usuarioInstagram(u)).filter(Boolean).slice(0, 8);
  const [usuario, setUsuario] = useState(sugeridos[0] ?? "");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(""); // id de la publicación
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [extraer, setExtraer] = useState(null); // { id, src }

  const ver = async (u = usuario) => {
    const limpio = usuarioInstagram(u);
    if (!limpio) { setError("Escribe el @ de la cuenta (empresa o creador)."); return; }
    setUsuario(limpio);
    setCargando(true);
    setError("");
    setAviso("");
    try {
      setDatos(await contenidoDeCompetencia(client.id, limpio));
    } catch (e) {
      setDatos(null);
      setError(e.message);
    }
    setCargando(false);
  };

  const traer = async (p) => (await traerDeCompetencia(client.id, datos.perfil.usuario, p.id)).archivo;

  const analizar = async (p) => {
    setTrabajando(p.id);
    setError("");
    setAviso("");
    try {
      const archivo = await traer(p);
      const r = await agregarReferencia(client.id, {
        archivoId: archivo.id, competidor: `@${datos.perfil.usuario}`, enlace: p.enlace, origen: "organico",
        nota: `${fmt(p.meGusta)} me gusta y ${fmt(p.comentarios)} comentarios`,
      }, archivo.tipo === "video" ? archivo.src : "");
      onReferencia?.(r.referencia);
      onCambioCerebro?.();
      setAviso(r.aviso ? `Guardada, pero sin analizar: ${r.aviso}` : "Analizada y guardada en las referencias (abajo): desde ahí, «Adaptar», «Recrear con mi marca» o «Seguir este video».");
    } catch (e) {
      setError(e.message);
    }
    setTrabajando("");
  };

  const guion = async (p) => {
    setTrabajando(p.id);
    setError("");
    try {
      const archivo = await traer(p);
      setExtraer({ id: archivo.id, src: archivo.src, nombre: `Reel de @${datos.perfil.usuario}`, cuenta: `@${datos.perfil.usuario}`, enlace: p.enlace });
    } catch (e) {
      setError(e.message);
    }
    setTrabajando("");
  };

  return (
    <section className="competencia-ig card" aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="search" size={16} /> Su contenido en Instagram</h3>
      <p className="hint" style={{ margin: 0 }}>
        Las últimas publicaciones de una cuenta de empresa o de creador, las que mejor le funcionaron primero. Las personales
        no se pueden leer.
      </p>
      <form className="competencia-ig-buscar" onSubmit={(e) => { e.preventDefault(); void ver(); }}>
        <label className="sr-only" htmlFor={`${ids}-u`}>Cuenta de Instagram</label>
        <input id={`${ids}-u`} className="input" placeholder="@cuenta" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" />
        <button type="submit" className="btn btn-primary" disabled={cargando}>{cargando ? "Buscando…" : "Ver sus publicaciones"}</button>
      </form>
      {sugeridos.length > 1 && (
        <div className="competencia-ig-chips" role="group" aria-label="Competidores de la ficha">
          {sugeridos.map((u) => (
            <button key={u} type="button" className="filter-chip" aria-pressed={datos?.perfil?.usuario === u} onClick={() => ver(u)}>@{u}</button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="cerebro-error">{error}</p>}
      <div role="status" aria-live="polite" className={aviso ? "hint" : "sr-only"}>{aviso}</div>

      {datos && (
        <>
          <p className="competencia-ig-perfil">
            {datos.perfil.foto && <img src={datos.perfil.foto} alt="" />}
            <strong>@{datos.perfil.usuario}</strong>
            {datos.perfil.nombre && <span>{datos.perfil.nombre}</span>}
            <span className="hint">{fmt(datos.perfil.seguidores)} seguidores · {fmt(datos.perfil.publicaciones)} publicaciones</span>
          </p>
          {!datos.publicaciones.length && <p className="hint">No tiene publicaciones que se puedan ver.</p>}
          <ul className="competencia-ig-lista">
            {datos.publicaciones.map((p, i) => (
              <li key={p.id} className="competencia-ig-item">
                <div className="competencia-ig-vista">
                  {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" /> : <span className="hint">Sin vista</span>}
                  <span className="competencia-ig-formato">{p.video && <Icon name="play" size={11} />} {FORMATO[p.formato]}</span>
                  {i < 3 && <span className="competencia-ig-top">Top {i + 1}</span>}
                </div>
                <p className="competencia-ig-cifras">
                  <span><Icon name="heart" size={12} /> {fmt(p.meGusta)}</span>
                  <span><Icon name="message" size={12} /> {fmt(p.comentarios)}</span>
                  {p.tasa != null && <span title="Interacciones por cada 100 seguidores">{String(p.tasa).replace(".", ",")} %</span>}
                  <span className="hint">{haceCuanto(p.fecha)}</span>
                </p>
                {p.texto && <p className="competencia-ig-texto">{p.texto}</p>}
                <div className="competencia-ig-acciones">
                  {!lectura && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => analizar(p)} disabled={Boolean(trabajando)} aria-busy={trabajando === p.id || undefined}>
                      <Icon name="sparkles" size={13} /> {trabajando === p.id ? "Trabajando…" : "Analizar como referencia"}
                    </button>
                  )}
                  {!lectura && p.video && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => guion(p)} disabled={Boolean(trabajando)}>
                      <Icon name="user" size={13} /> Extraer guion UGC
                    </button>
                  )}
                  {p.enlace && (
                    <a className="btn btn-ghost btn-sm" href={p.enlace} target="_blank" rel="noreferrer">
                      <Icon name="external" size={13} /> Ver en Instagram
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {extraer && (
        <Suspense fallback={null}>
          <ExtraerUgc client={client} inicial={extraer} onCerrar={() => setExtraer(null)} />
        </Suspense>
      )}
    </section>
  );
}
