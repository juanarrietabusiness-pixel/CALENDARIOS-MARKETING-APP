import { useId, useState } from "react";
import Icon from "./Icon";
import { leerConflicto, resolverConflictos, volverATraer } from "../lib/cerebro";
import { nombreDeArchivo } from "../lib/cerebroVista";
import { describirSincronia, loQueNoEntro, diferenciaPorLineas } from "../lib/cerebroGitHub";

// ============================================================
// El cerebro y GitHub, en la pestaña Cerebro
//
// GitHub manda en el canon de la marca; el cerebro, en lo demás. Esto enseña
// lo que la pantalla tenía en el aire y ahora está GUARDADO:
//
//   · Cómo va: cuándo se miró GitHub, cuándo se trajo algo y lo que de la
//     carpeta no entra (PDF, Word, archivos enormes o demasiado hondos…).
//   · Lo que choca: una nota corregida aquí cuya sección cambió en GitHub,
//     con la diferencia «La tuya / La de GitHub», y lo que allí ya no está.
//     Se decide NOTA POR NOTA (o archivo por archivo, si se fue entero).
//   · Lo que no se trae: las secciones que se borraron aquí, con «Volver a
//     traer».
// ============================================================

const TIPO_CONFLICTO = {
  archivo: (fuente) => `«${nombreDeArchivo(fuente)}» ya no está en GitHub (se borró, se renombró o se movió)`,
  seccion: (fuente) => `Estas secciones ya no están en «${nombreDeArchivo(fuente)}» de GitHub`,
};

/** `alCambiar(r)`: tras resolver algo o volver a traer (la pantalla relee; `r.trajo` → renovar la ficha). */
export default function CerebroGitHub({ client, estado, conflictos = [], noTraer = [], lectura, ocupado, revisando, alCambiar, avisar }) {
  const ids = useId();
  const [haciendo, setHaciendo] = useState("");
  const sync = estado?.sync ?? {};
  const linea = describirSincronia(sync);
  const fuera = loQueNoEntro(sync.fuera);
  const cambios = conflictos.filter((c) => c.tipo === "cambio");
  const idas = Object.values(conflictos.filter((c) => c.tipo !== "cambio").reduce((g, c) => {
    const k = `${c.tipo}|${c.fuente}`;
    (g[k] ||= { clave: k, tipo: c.tipo, fuente: c.fuente, notas: [] }).notas.push(c);
    return g;
  }, {}));

  const resolver = async (lista, usar, clave) => {
    setHaciendo(clave);
    try {
      const r = await resolverConflictos(client.id, lista.map((c) => c.id), usar);
      avisar(true, usar === "github"
        ? (r.quitadas ? `${r.quitadas === 1 ? "Quitada la nota" : `Quitadas ${r.quitadas} notas`} que ya no están en GitHub.` : "Ahora dice lo de GitHub.")
        : "Se queda la tuya. Para que GitHub diga lo mismo, cámbialo allí.");
      await alCambiar({ trajo: Boolean(r.cambiadas || r.quitadas) });
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setHaciendo("");
    }
  };

  const traer = async (m) => {
    setHaciendo(`nt:${m.id}`);
    try {
      const r = await volverATraer(client.id, m.id);
      avisar(true, r?.notas?.creadas ? `«${m.titulo}» volvió desde GitHub.` : `«${m.titulo}» se volverá a traer cuando su sección esté en GitHub.`);
      await alCambiar({ trajo: Boolean(r?.trajo) });
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setHaciendo("");
    }
  };

  const bloqueado = ocupado || Boolean(haciendo);

  return (
    <>
      {estado?.repositorio && (linea || revisando || sync.error || fuera.length > 0) && (
        <div className="cerebro-sync">
          <p>
            <Icon name="refresh" size={14} />{" "}
            <span role="status">{revisando ? "Revisando GitHub…" : linea || "Todavía no se ha revisado GitHub."}</span>
            {estado.repoWeb && <> {" "}<a href={estado.repoWeb} target="_blank" rel="noopener noreferrer">Abrir el repositorio<span className="sr-only"> (se abre en otra pestaña)</span></a></>}
          </p>
          {sync.error && <p className="cerebro-sync-error"><Icon name="alert" size={14} /> {sync.error}</p>}
          {fuera.length > 0 && (
            <details>
              <summary>Lo que hay en GitHub y no entra en el cerebro</summary>
              <ul>
                {fuera.map((f) => (
                  <li key={f.texto}>
                    {f.texto}
                    {f.lista.length > 0 && <span className="hint"> {f.lista.slice(0, 8).join(", ")}{f.lista.length > 8 ? "…" : ""}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {conflictos.length > 0 && (
        <section className="cerebro-alerta" aria-labelledby={`${ids}-c`}>
          <h3 id={`${ids}-c`} className="cerebro-alerta-titulo">
            <Icon name="alert" size={16} /> {conflictos.length === 1 ? "Una nota choca con GitHub" : `${conflictos.length} notas chocan con GitHub`}
          </h3>
          <p className="hint">
            GitHub manda en el canon de la marca. Lo que corregiste aquí no se pisó: decide nota por nota. Si tu corrección es la buena,
            cámbiala también en GitHub y luego usa la de GitHub.
          </p>
          <ul className="cerebro-conflictos">
            {cambios.map((c) => (
              <Conflicto key={c.id} client={client} conflicto={c} lectura={lectura} ocupado={bloqueado}
                onResolver={(usar) => resolver([c], usar, c.id)} avisar={avisar} />
            ))}
            {idas.map((g) => (
              <li key={g.clave} className="cerebro-conflicto">
                <p><strong>{TIPO_CONFLICTO[g.tipo]?.(g.fuente) ?? nombreDeArchivo(g.fuente)}</strong>. Tienen correcciones tuyas:</p>
                <ul>{g.notas.map((c) => <li key={c.id}>{c.titulo}</li>)}</ul>
                {!lectura && (
                  <div className="cerebro-alerta-botones">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={bloqueado} onClick={() => resolver(g.notas, "github", g.clave)}>
                      {g.notas.length === 1 ? "Quitar la nota" : `Quitar sus ${g.notas.length} notas`}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={bloqueado} onClick={() => resolver(g.notas, "mia", g.clave)}>
                      {g.notas.length === 1 ? "Quedármela como nota propia" : "Quedármelas como notas propias"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {noTraer.length > 0 && (
        <details className="cerebro-grupo cerebro-no-traer">
          <summary><span>No se traen de GitHub</span> <span className="cerebro-cuenta">{noTraer.length}</span></summary>
          <p className="hint">Las borraste aquí: al actualizar no vuelven. Para quitarlas de verdad, bórralas en GitHub.</p>
          <ul className="cerebro-lista">
            {noTraer.map((m) => (
              <li key={m.id} className="cerebro-no-traer-fila">
                <span>{m.titulo} <span className="hint">· {nombreDeArchivo(m.fuente)}</span></span>
                {!lectura && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={bloqueado} onClick={() => traer(m)}>
                    <Icon name="undo" size={14} /> {haciendo === `nt:${m.id}` ? "Trayendo…" : "Volver a traer"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Conflicto({ client, conflicto, lectura, ocupado, onResolver, avisar }) {
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const [dos, setDos] = useState(null); // { mia, github, enlace } cuando se ha leído
  const [enteras, setEnteras] = useState(false);

  const alternar = async () => {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true);
    if (dos) return;
    try {
      setDos(await leerConflicto(client.id, conflicto.id));
    } catch (e) {
      avisar(false, e.message);
      setAbierto(false);
    }
  };
  const dif = dos ? diferenciaPorLineas(dos.mia, dos.github) : null;

  return (
    <li className="cerebro-conflicto">
      <p><strong>{conflicto.titulo}</strong> <span className="hint">· {nombreDeArchivo(conflicto.fuente)}: lo corregiste aquí y también cambió en GitHub.</span></p>
      <div className="cerebro-alerta-botones">
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierto} aria-controls={`${ids}-d`} onClick={alternar}>
          {abierto ? "Ocultar la diferencia" : "Ver la diferencia"}
        </button>
        {!lectura && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => onResolver("mia")}>Quedarme con la mía</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => onResolver("github")}>Usar la de GitHub</button>
          </>
        )}
      </div>
      {abierto && (
        <div id={`${ids}-d`} className="cerebro-dif">
          {!dos ? <p role="status" className="hint">Cargando las dos versiones…</p> : (
            <>
              <p className="hint">
                <span className="cerebro-dif-leyenda cerebro-dif-mia">− La tuya</span>{" "}
                <span className="cerebro-dif-leyenda cerebro-dif-github">+ La de GitHub</span>
                {dos.enlace && <> {" "}<a href={dos.enlace} target="_blank" rel="noopener noreferrer"><Icon name="external" size={12} /> Editar en GitHub<span className="sr-only"> (se abre en otra pestaña)</span></a></>}
              </p>
              {dif && !enteras ? (
                <ol className="cerebro-dif-lineas" aria-label="Lo que cambia, línea a línea">
                  {dif.map((l, i) => (
                    <li key={i} className={`cerebro-dif-${l.tipo}`}>
                      {l.tipo === "plegado" ? `… ${l.n === 1 ? "1 línea igual" : `${l.n} líneas iguales`} …` : (
                        <>
                          <span aria-hidden="true">{l.tipo === "mia" ? "− " : l.tipo === "github" ? "+ " : "  "}</span>
                          {l.tipo === "mia" && <span className="sr-only">Sólo en la tuya: </span>}
                          {l.tipo === "github" && <span className="sr-only">Sólo en GitHub: </span>}
                          {l.texto || " "}
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="cerebro-dif-dos">
                  <div><h4>La tuya</h4><pre>{dos.mia}</pre></div>
                  <div><h4>La de GitHub</h4><pre>{dos.github}</pre></div>
                </div>
              )}
              {dif && (
                <button type="button" className="btn btn-ghost btn-sm" aria-pressed={enteras} onClick={() => setEnteras((v) => !v)}>
                  {enteras ? "Ver sólo lo que cambia" : "Ver las dos enteras"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
