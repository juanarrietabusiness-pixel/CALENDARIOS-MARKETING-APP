import "./AuditoriaVista.css";
import { useState } from "react";
import Icon from "./Icon";
import { ESTADOS, LIMITES_PERFIL } from "../lib/auditoria";
import { numeroCorto } from "../lib/resultados";

// ============================================================
// La auditoría de un perfil, como documento
//
// La misma pieza para la agencia (con «Crear portada» en los destacados)
// y para el enlace que se le manda al cliente o al prospecto. Clara y
// sobre blanco, como el informe: se imprime o se guarda como PDF tal cual.
// Lo que se propone para copiar —nombre y biografías— lleva su botón,
// porque es justo lo que alguien va a pegar en Instagram.
// ============================================================

function Copiar({ texto, que }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      className="aud-copiar no-imprimir"
      onClick={() => navigator.clipboard?.writeText(texto).then(() => { setHecho(true); setTimeout(() => setHecho(false), 1500); })}
      aria-label={`Copiar ${que}`}
    >
      <Icon name={hecho ? "check" : "copy"} size={14} /> {hecho ? "Copiado" : "Copiar"}
    </button>
  );
}

function Estado({ estado }) {
  const e = ESTADOS[estado] ?? ESTADOS.mejorable;
  return <span className="aud-estado" data-tono={e.tono}>{e.texto}</span>;
}

function Bloque({ titulo, icono, b, children }) {
  if (!b) return null;
  return (
    <section className="aud-bloque">
      <header className="aud-bloque-cabecera">
        <h3><Icon name={icono} size={18} /> {titulo}</h3>
        <Estado estado={b.estado} />
      </header>
      {b.comentario && <p>{b.comentario}</p>}
      {b.recomendacion && <p className="aud-reco"><strong>Qué hacer:</strong> {b.recomendacion}</p>}
      {b.recomendaciones?.length > 0 && (
        <ul className="aud-lista">{b.recomendaciones.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      {children}
    </section>
  );
}

const Cifra = ({ nombre, valor }) => (valor === null || valor === undefined ? null : (
  <div className="aud-cifra"><span>{nombre}</span><strong>{valor}</strong></div>
));

/**
 * «Aplicar en el perfil»: lo que hay que cambiar a mano en Instagram (la API no deja cambiar la foto, la
 * biografía, los destacados ni los fijados), con lo que ya está listo para copiar o diseñar. Lo marcado se
 * recuerda en este navegador; «Crear tarea» lo deja como tarea del cliente, una línea por cambio.
 */
function AplicarEnPerfil({ id, a, perfil, onPiezas, onCrearTarea }) {
  const clave = `aplicar-perfil:${id}`;
  const [hechos, setHechos] = useState(() => { try { return JSON.parse(localStorage.getItem(clave) ?? "[]"); } catch { return []; } });
  const [tarea, setTarea] = useState("");
  const alternar = (k) => setHechos((h) => {
    const n = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
    try { localStorage.setItem(clave, JSON.stringify(n)); } catch { /* sin almacenamiento: se olvida al recargar */ }
    return n;
  });
  const items = [
    a.foto?.estado !== "bien" && { k: "foto", texto: "Cambiar la foto de perfil", accion: onPiezas && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPiezas("foto")}><Icon name="palette" size={14} /> Diseñar</button> },
    a.nombre?.propuesta && a.nombre.propuesta !== perfil?.nombre && { k: "nombre", texto: `Nombre: «${a.nombre.propuesta}»`, accion: <Copiar texto={a.nombre.propuesta} que="el nombre" /> },
    a.bio?.opciones?.length > 0 && { k: "bio", texto: "Biografía: pegar una de las opciones de arriba" },
    a.enlace?.recomendacion && a.enlace.estado !== "bien" && { k: "enlace", texto: `Enlace: ${a.enlace.recomendacion}` },
    a.destacados?.propuesta?.length > 0 && { k: "destacados", texto: `Destacados: ${a.destacados.propuesta.map((d) => d.titulo).join(", ")}`, accion: onPiezas && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPiezas("destacados")}><Icon name="palette" size={14} /> Diseñar portadas</button> },
    ...(a.fijados?.propuesta ?? []).map((f, i) => ({ k: `fijado-${i}`, texto: `Fijar: ${f.titulo || f.idea}` })),
  ].filter(Boolean);
  if (!items.length) return null;
  const crear = async () => {
    setTarea("Creando…");
    try {
      await onCrearTarea(items.map((x) => `- ${x.texto}`).join("\n"));
      setTarea("Tarea creada: está en Mi día y en las tareas del cliente.");
    } catch (e) {
      setTarea(e.message);
    }
  };
  return (
    <section className="aud-bloque aud-aplicar no-imprimir" aria-labelledby={`aplicar-${id}`}>
      <header className="aud-bloque-cabecera">
        <h3 id={`aplicar-${id}`}><Icon name="clipboardCheck" size={18} /> Aplicar en el perfil</h3>
        <span className="hint">{hechos.filter((h) => items.some((x) => x.k === h)).length} de {items.length}</span>
      </header>
      <p className="hint">Instagram no deja cambiar esto por la API: se sube a mano. Lo de cada línea ya está listo.</p>
      <ul className="aud-aplicar-lista">
        {items.map((x) => (
          <li key={x.k}>
            <label>
              <input type="checkbox" checked={hechos.includes(x.k)} onChange={() => alternar(x.k)} />
              <span data-hecho={hechos.includes(x.k) || undefined}>{x.texto}</span>
            </label>
            {x.accion}
          </li>
        ))}
      </ul>
      {onCrearTarea && (
        <div className="aud-aplicar-pie">
          <button type="button" className="btn btn-secondary btn-sm" onClick={crear} disabled={tarea === "Creando…"}><Icon name="checkSquare" size={14} /> Crear tarea con esta lista</button>
          {tarea && <span role="status" className="hint">{tarea}</span>}
        </div>
      )}
    </section>
  );
}

export default function AuditoriaVista({ auditoria, cliente = null, onPortada = null, portadas = {}, onPiezas = null, onCrearTarea = null }) {
  const { perfil = {}, cifras = {}, analisis: a = {} } = auditoria ?? {};
  const usuario = perfil?.usuario || auditoria?.usuario || "";
  const fecha = auditoria?.auditadoEl || auditoria?.actualizada;
  const [creando, setCreando] = useState("");
  const crear = async (d) => {
    setCreando(d.titulo);
    try { await onPortada(d); } finally { setCreando(""); }
  };

  return (
    <article className="auditoria-vista" style={cliente?.primaryColor ? { "--aud-marca": cliente.primaryColor } : undefined}>
      <header className="aud-portada">
        <span className="aud-foto">{perfil?.foto ? <img src={perfil.foto} alt={`Foto de perfil de @${usuario}`} /> : <Icon name="user" size={32} />}</span>
        <div className="aud-portada-texto">
          <p className="aud-antetitulo">Auditoría de perfil{fecha ? ` · ${new Date(fecha).toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" })}` : ""}</p>
          <h2>@{usuario}</h2>
          {perfil?.nombre && <p className="aud-nombre">{perfil.nombre}</p>}
        </div>
        {a.puntuacion !== null && a.puntuacion !== undefined && (
          <div className="aud-puntuacion" data-tono={a.puntuacion >= 75 ? "bien" : a.puntuacion >= 50 ? "medio" : "mal"} aria-label={`Puntuación: ${a.puntuacion} de 100`}>
            <strong>{a.puntuacion}</strong><span>/100</span>
          </div>
        )}
      </header>

      {a.resumen && <p className="aud-resumen">{a.resumen}</p>}
      {perfil?.aviso && <p className="aud-aviso">{perfil.aviso}</p>}

      <div className="aud-cifras">
        <Cifra nombre="Seguidores" valor={cifras.seguidores !== null && cifras.seguidores !== undefined ? numeroCorto(cifras.seguidores) : null} />
        <Cifra nombre="Publicaciones" valor={cifras.publicaciones} />
        <Cifra nombre="Interacción media" valor={cifras.interaccionMedia} />
        <Cifra nombre="Interacción / seguidores" valor={cifras.tasaInteraccion !== null && cifras.tasaInteraccion !== undefined ? `${cifras.tasaInteraccion.toLocaleString("es")} %` : null} />
        <Cifra nombre="Publica a la semana" valor={cifras.porSemana !== null && cifras.porSemana !== undefined ? cifras.porSemana.toLocaleString("es") : null} />
        <Cifra nombre="Días sin publicar" valor={cifras.diasSinPublicar} />
      </div>

      {a.prioridades?.length > 0 && (
        <section className="aud-bloque aud-prioridades">
          <h3><Icon name="bolt" size={18} /> Lo primero que haría</h3>
          <ol>{a.prioridades.map((p) => <li key={p}>{p}</li>)}</ol>
        </section>
      )}

      {a.fortalezas?.length > 0 && (
        <section className="aud-bloque">
          <h3><Icon name="thumbsUp" size={18} /> Lo que ya funciona</h3>
          <ul className="aud-lista">{a.fortalezas.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      )}

      <Bloque titulo="Foto de perfil" icono="user" b={a.foto} />

      <Bloque titulo="Nombre" icono="search" b={a.nombre}>
        {perfil?.nombre && <p className="aud-actual">Ahora: «{perfil.nombre}»</p>}
        {a.nombre?.propuesta && (
          <div className="aud-propuesta">
            <span>{a.nombre.propuesta}</span>
            <Copiar texto={a.nombre.propuesta} que="el nombre propuesto" />
          </div>
        )}
      </Bloque>

      <Bloque titulo="Biografía" icono="file" b={a.bio}>
        {perfil?.bio && <blockquote className="aud-actual">{perfil.bio}</blockquote>}
        {a.bio?.opciones?.length > 0 && (
          <ol className="aud-opciones">
            {a.bio.opciones.map((o, i) => (
              <li key={o} className="aud-propuesta">
                <span className="aud-bio">{o}</span>
                <span className="aud-cuenta">{[...o].length}/{LIMITES_PERFIL.bio}</span>
                <Copiar texto={o} que={`la biografía ${i + 1}`} />
              </li>
            ))}
          </ol>
        )}
      </Bloque>

      <Bloque titulo="Enlace" icono="link" b={a.enlace}>
        {perfil?.enlace && <p className="aud-actual">Ahora: {perfil.enlace}</p>}
      </Bloque>

      <Bloque titulo="Destacados" icono="grid" b={a.destacados}>
        {a.destacados?.propuesta?.length > 0 && (
          <ul className="aud-destacados">
            {a.destacados.propuesta.map((d) => (
              <li key={d.titulo}>
                <span className="aud-destacado-circulo">
                  {portadas[d.titulo] ? <img src={portadas[d.titulo]} alt={`Portada de «${d.titulo}»`} /> : <Icon name={d.icono || "image"} size={18} />}
                </span>
                <strong>{d.titulo}</strong>
                <span>{d.contenido}</span>
                {onPortada && (
                  <button type="button" className="btn btn-secondary btn-sm no-imprimir" disabled={!!creando} onClick={() => crear(d)}>
                    <Icon name="sparkles" size={14} /> {creando === d.titulo ? "Creando…" : portadas[d.titulo] ? "Otra portada" : "Crear portada"}
                  </button>
                )}
                {portadas[d.titulo] && onPortada && (
                  <a className="aud-descargar no-imprimir" href={portadas[d.titulo]} download={`destacado-${d.titulo}.png`}>Descargar</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      {onPiezas && a.destacados?.propuesta?.length > 0 && (
        <p className="no-imprimir">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPiezas("destacados")}>
            <Icon name="palette" size={14} /> Diseñar portadas con la marca (plantilla, sin IA)
          </button>
        </p>
      )}

      {a.fijados?.propuesta?.length > 0 && (
        <section className="aud-bloque">
          <h3><Icon name="star" size={18} /> Publicaciones fijadas</h3>
          {a.fijados.comentario && <p>{a.fijados.comentario}</p>}
          <ol className="aud-lista">
            {a.fijados.propuesta.map((f) => <li key={f.titulo + f.idea}><strong>{f.titulo}</strong>{f.idea ? `: ${f.idea}` : ""}</li>)}
          </ol>
        </section>
      )}

      {(auditoria?.referentes?.length > 0 || a.referentes?.aprender?.length > 0) && (
        <section className="aud-bloque">
          <h3><Icon name="users" size={18} /> Comparado con los referentes</h3>
          {auditoria?.referentes?.length > 0 && (
            <ul className="aud-referentes">
              {auditoria.referentes.map((r) => (
                <li key={r.usuario}>
                  <strong>@{r.usuario}</strong>
                  <span>{r.cifras?.seguidores != null ? `${numeroCorto(r.cifras.seguidores)} seguidores` : ""}{r.cifras?.tasaInteraccion != null ? ` · ${r.cifras.tasaInteraccion.toLocaleString("es")} % de interacción` : ""}{r.cifras?.porSemana != null ? ` · ${r.cifras.porSemana.toLocaleString("es")} a la semana` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {a.referentes?.comentario && <p>{a.referentes.comentario}</p>}
          {a.referentes?.aprender?.length > 0 && <ul className="aud-lista">{a.referentes.aprender.map((x) => <li key={x}>{x}</li>)}</ul>}
          {auditoria?.avisosReferentes?.length > 0 && <p className="hint no-imprimir">No se pudieron leer: {auditoria.avisosReferentes.join(" · ")}</p>}
        </section>
      )}

      <Bloque titulo="La rejilla" icono="grid" b={a.rejilla} />
      <Bloque titulo="El contenido" icono="chart" b={a.contenido} />

      {onCrearTarea !== null && <AplicarEnPerfil id={auditoria?.id ?? usuario} a={a} perfil={perfil} onPiezas={onPiezas} onCrearTarea={onCrearTarea} />}

      <footer className="aud-pie">
        Auditoría preparada por Juancito Ads{cliente?.name ? ` para ${cliente.name}` : ""}. Las cifras son las que da Instagram el día de la auditoría.
      </footer>
    </article>
  );
}
