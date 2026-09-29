import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { soloLectura } from "../lib/sesionActual";
import {
  listarCerebro, leerNota, guardarNota, borrarNota, buscarEnCerebro, importarAlCerebro, prepararFicha,
} from "../lib/cerebro";
import {
  TIPOS_VISTA, FILTROS_TIPO, nombreDeTipo, ordenarNotas, filtrarNotas, contarPorTipo,
  formatoCaracteres, describirImportacion, describirFicha, avisoSinFicha, leerDocumento,
} from "../lib/cerebroVista";
import "./Cerebro.css";

// ============================================================
// La pestaña Cerebro de un cliente
//
// Lo que la IA sabe de este cliente, en notas: se leen, se corrigen, se
// esconden de los textos que se publican o se borran, una a una. Se llena
// una vez desde el repositorio, y de ahí en adelante se le añade lo que
// haga falta: una nota, un documento de texto.
//
// «Interna» quiere decir: la ve el equipo, pero no entra nunca en lo que
// se escribe para publicar. Es el candado de los costos y los márgenes.
// ============================================================

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function Cerebro({ client }) {
  const ids = useId();
  const lectura = soloLectura();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null);           // { ok, texto, detalles }
  const [trabajando, setTrabajando] = useState("");   // "importar" | "actualizar" | "ficha"
  const [filtro, setFiltro] = useState({ tipo: "todas", soloInternas: false, texto: "" });
  const [busqueda, setBusqueda] = useState(null);     // { q, resultados } | null
  const [buscando, setBuscando] = useState(false);
  const [editor, setEditor] = useState(null);         // la nota que se edita (con su texto) o una nueva
  const [borrando, setBorrando] = useState(null);
  const entrada = useRef(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await listarCerebro(client.id));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [client.id]);

  useEffect(() => {
    setCargando(true);
    setDatos(null);
    setBusqueda(null);
    setAviso(null);
    cargar();
  }, [cargar]);

  const notas = useMemo(() => ordenarNotas(datos?.notas ?? []), [datos]);
  const visibles = useMemo(() => filtrarNotas(notas, filtro), [notas, filtro]);
  const cuentas = useMemo(() => contarPorTipo(notas), [notas]);
  const estado = datos?.estado;

  const avisar = (ok, texto, detalles = []) => setAviso({ ok, texto, detalles });

  // ---------- Las dos acciones grandes ----------
  const importar = async (actualizar) => {
    setTrabajando(actualizar ? "actualizar" : "importar");
    setAviso(null);
    try {
      const r = await importarAlCerebro(client.id, { actualizar });
      const d = describirImportacion(r);
      avisar(true, d.texto, d.detalles);
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setTrabajando("");
    }
  };

  const preparar = async (forzar) => {
    setTrabajando("ficha");
    setAviso(null);
    try {
      avisar(true, describirFicha(await prepararFicha(client.id, { forzar })));
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setTrabajando("");
    }
  };

  // ---------- Notas ----------
  const abrir = async (nota) => {
    try {
      setEditor(await leerNota(client.id, nota.id));
    } catch (e) {
      avisar(false, e.message);
    }
  };

  const guardar = async (nota) => {
    await guardarNota(client.id, nota);
    setEditor(null);
    avisar(true, nota.id ? "Nota guardada." : "Nota añadida.");
    await cargar();
  };

  const alternarInterna = async (nota) => {
    try {
      const entera = await leerNota(client.id, nota.id);
      await guardarNota(client.id, { ...entera, interna: !nota.interna });
      avisar(true, nota.interna ? `«${nota.titulo}» vuelve a poder salir en los textos.` : `«${nota.titulo}» ya no sale en los textos que se publican.`);
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    }
  };

  const borrar = async () => {
    const nota = borrando;
    setBorrando(null);
    try {
      await borrarNota(client.id, nota.id);
      avisar(true, `«${nota.titulo}» borrada.`);
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    }
  };

  const subir = async (e) => {
    // Se copia la lista ANTES de vaciar el campo: vaciarlo la deja vacía y la subida no salía nunca.
    const archivos = [...e.target.files].slice(0, 10);
    e.target.value = "";
    if (!archivos.length) return;
    const problemas = [];
    let subidas = 0;
    for (const f of archivos) {
      const r = await leerDocumento(f);
      if (r.error) { problemas.push(r.error); continue; }
      try {
        await guardarNota(client.id, r.nota);
        subidas++;
      } catch (err) {
        problemas.push(`«${f.name}»: ${err.message}`);
      }
    }
    avisar(!problemas.length, subidas ? `${subidas === 1 ? "1 documento añadido" : `${subidas} documentos añadidos`}.` : "No se añadió ningún documento.", problemas.length ? [{ titulo: "Sin subir", lista: problemas }] : []);
    await cargar();
  };

  // ---------- Buscar ----------
  const buscar = async (ev) => {
    ev.preventDefault();
    const q = filtro.texto.trim();
    if (!q) { setBusqueda(null); return; }
    setBuscando(true);
    try {
      const r = await buscarEnCerebro(client.id, q);
      setBusqueda({ q, resultados: r.resultados ?? [] });
    } catch (err) {
      avisar(false, err.message);
    } finally {
      setBuscando(false);
    }
  };

  if (cargando) return <p role="status" className="cerebro-vacio">Cargando el cerebro…</p>;
  if (error && !datos) return <p role="alert" className="cerebro-error">{error}</p>;

  const vacio = !notas.length;
  const trabajo = Boolean(trabajando);

  return (
    <section className="cerebro" aria-labelledby={`${ids}-t`}>
      <header className="cerebro-cabecera">
        <div>
          <h2 id={`${ids}-t`} className="cerebro-titulo-seccion">Cerebro de {client.name}</h2>
          <p className="hint">
            Lo que la IA sabe de este cliente. Se lee lo que hace falta para cada tarea, no todo cada vez.
          </p>
        </div>
      </header>

      {!vacio && (
        <dl className="cerebro-estado" aria-label="Estado del cerebro">
          <div><dt>Notas</dt><dd>{estado.notas}</dd></div>
          <div><dt>Texto</dt><dd>{formatoCaracteres(estado.caracteres)} car.</dd></div>
          <div><dt>Ficha técnica</dt><dd className={estado.conFicha ? "cerebro-si" : "cerebro-no"}>{estado.conFicha ? "Sí" : "Falta"}</dd></div>
          <div><dt>Cifras</dt><dd className={estado.conCifras ? "cerebro-si" : "cerebro-no"}>{estado.conCifras ? "Sí" : "Faltan"}</dd></div>
          <div><dt>Internas</dt><dd>{estado.internas}</dd></div>
          {estado.viejas > 0 && <div><dt>Por revisar</dt><dd>{estado.viejas}</dd></div>}
        </dl>
      )}

      {avisoSinFicha(estado, client) && <p className="cerebro-aviso" role="note">{avisoSinFicha(estado, client)}</p>}

      {!lectura && (
        <div className="cerebro-acciones" role="group" aria-label="Acciones del cerebro">
          <button type="button" className="btn btn-primary" disabled={trabajo || !estado?.repositorio} onClick={() => importar(false)}
            title={estado?.repositorio ? "Lee el repositorio de GitHub del cliente y lo parte en notas" : "Este cliente no tiene un repositorio en su ficha"}>
            <Icon name="download" size={18} /> {trabajando === "importar" ? "Llenando…" : "Llenar desde el repositorio"}
          </button>
          {!vacio && estado?.repositorio && (
            <button type="button" className="btn btn-secondary" disabled={trabajo} onClick={() => importar(true)}
              title="Trae de nuevo los archivos que cambiaron; lo que corrigiste a mano se conserva">
              <Icon name="refresh" size={18} /> {trabajando === "actualizar" ? "Actualizando…" : "Actualizar lo que cambió"}
            </button>
          )}
          {!vacio && (
            <button type="button" className="btn btn-accent" disabled={trabajo} onClick={() => preparar(false)}
              title="Una llamada a la IA lee las notas de marca y escribe la ficha técnica y las cifras">
              <Icon name="sparkles" size={18} /> {trabajando === "ficha" ? "Escribiendo la ficha…" : estado?.conFicha ? "Renovar ficha con IA" : "Preparar ficha con IA"}
            </button>
          )}
          <button type="button" className="btn btn-secondary" disabled={trabajo} onClick={() => setEditor({ titulo: "", texto: "", tipo: "nota", interna: false })}>
            <Icon name="plus" size={18} /> Añadir nota
          </button>
          <button type="button" className="btn btn-secondary" disabled={trabajo} onClick={() => entrada.current?.click()}>
            <Icon name="upload" size={18} /> Subir documento
          </button>
          <input ref={entrada} type="file" multiple accept=".md,.markdown,.txt,.csv,.json" onChange={subir} className="cerebro-archivo" aria-label="Elegir documentos de texto para el cerebro" tabIndex={-1} />
        </div>
      )}

      <div aria-live="polite">
        {trabajo && <p role="status" className="cerebro-trabajando">{trabajando === "ficha" ? "La IA está leyendo las notas de marca. Tarda de medio minuto a un par de minutos." : "Leyendo el repositorio…"}</p>}
        {aviso && (
          <div role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "cerebro-aviso" : "cerebro-error"}>
            <p>{aviso.texto}</p>
            {aviso.detalles.map((d) => (
              <details key={d.titulo}>
                <summary>{d.titulo} ({d.lista.length})</summary>
                <ul>{d.lista.map((t) => <li key={t}>{t}</li>)}</ul>
              </details>
            ))}
          </div>
        )}
      </div>

      {vacio ? (
        <div className="cerebro-vacio card">
          <h3>Este cerebro está vacío</h3>
          <p>
            {estado?.repositorio
              ? "Pulsa «Llenar desde el repositorio»: se lee su carpeta de GitHub una vez y se parte en notas cortas. De ahí en adelante añades lo que haga falta."
              : "Este cliente no tiene un repositorio de GitHub en su ficha. Puedes empezar añadiendo una nota o subiendo un documento de texto."}
          </p>
        </div>
      ) : (
        <>
          <form className="cerebro-buscar" role="search" onSubmit={buscar}>
            <label className="label" htmlFor={`${ids}-q`}>Buscar en el cerebro</label>
            <div className="cerebro-buscar-fila">
              <input id={`${ids}-q`} className="input" type="search" placeholder="Ej.: garantía, precio del envío, tono de voz"
                value={filtro.texto} onChange={(e) => { setFiltro((f) => ({ ...f, texto: e.target.value })); if (!e.target.value) setBusqueda(null); }} />
              <button type="submit" className="btn btn-secondary" disabled={buscando || !filtro.texto.trim()}>
                <Icon name="search" size={18} /> {buscando ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </form>

          <div className="cerebro-filtros" role="group" aria-label="Filtrar las notas">
            {FILTROS_TIPO.filter((t) => t === "todas" || cuentas[t]).map((t) => (
              <button key={t} type="button" className="filter-chip" aria-pressed={filtro.tipo === t} onClick={() => setFiltro((f) => ({ ...f, tipo: t }))}>
                {t === "todas" ? "Todas" : nombreDeTipo(t)} <span className="cerebro-cuenta">{cuentas[t] ?? 0}</span>
              </button>
            ))}
            {estado.internas > 0 && (
              <button type="button" className="filter-chip" aria-pressed={filtro.soloInternas} onClick={() => setFiltro((f) => ({ ...f, soloInternas: !f.soloInternas }))}>
                <Icon name="lock" size={14} /> Internas <span className="cerebro-cuenta">{estado.internas}</span>
              </button>
            )}
          </div>

          {busqueda ? (
            <Resultados busqueda={busqueda} onCerrar={() => setBusqueda(null)} onAbrir={(r) => { const n = notas.find((x) => x.ruta === r.ruta); if (n) abrir(n); }} />
          ) : (
            <ul className="cerebro-lista" aria-label={`${visibles.length} notas`}>
              {visibles.map((n) => (
                <NotaFila key={n.id} nota={n} lectura={lectura} onAbrir={() => abrir(n)} onInterna={() => alternarInterna(n)} onBorrar={() => setBorrando(n)} />
              ))}
              {!visibles.length && <li className="cerebro-vacio">Ninguna nota coincide con ese filtro.</li>}
            </ul>
          )}
        </>
      )}

      {editor && <EditorNota nota={editor} lectura={lectura} onCerrar={() => setEditor(null)} onGuardar={guardar} />}
      {borrando && <ConfirmarBorrado nota={borrando} onCancelar={() => setBorrando(null)} onBorrar={borrar} />}
    </section>
  );
}

// ------------------------------------------------------------

function NotaFila({ nota, lectura, onAbrir, onInterna, onBorrar }) {
  const tipo = TIPOS_VISTA[nota.tipo];
  return (
    <li className="cerebro-nota card">
      <div className="cerebro-nota-cuerpo">
        <h3 className="cerebro-nota-titulo">
          <button type="button" className="cerebro-abrir" onClick={onAbrir}>{nota.titulo}</button>
        </h3>
        <p className="cerebro-resumen">{nota.resumen}</p>
        <p className="cerebro-meta">
          <span className={`badge cerebro-tipo cerebro-tipo-${nota.tipo}`} title={tipo?.ayuda}>{nombreDeTipo(nota.tipo)}</span>
          {nota.interna && <span className="badge cerebro-interna" title="La ve el equipo, pero no sale en los textos que se publican"><Icon name="lock" size={12} /> Interna</span>}
          <span>{formatoCaracteres(nota.caracteres)} car.</span>
          <span>{nota.origen === "repositorio" ? "Del repositorio" : nota.origen === "ia" ? "Escrita por la IA" : nota.origen === "documento" ? "Documento" : "A mano"}</span>
          <span>{fecha(nota.actualizada)}</span>
        </p>
      </div>
      {!lectura && (
        <div className="cerebro-nota-acciones">
          <button type="button" className="btn-icon" onClick={onInterna} aria-pressed={nota.interna}
            aria-label={nota.interna ? `Permitir «${nota.titulo}» en los textos` : `Marcar «${nota.titulo}» como interna`}
            title={nota.interna ? "Es interna: pulsa para que pueda salir en los textos" : "Marcar como interna: no saldrá en los textos que se publican"}>
            <Icon name="lock" />
          </button>
          <button type="button" className="btn-icon" onClick={onBorrar} aria-label={`Borrar «${nota.titulo}»`}><Icon name="trash" /></button>
        </div>
      )}
    </li>
  );
}

function Resultados({ busqueda, onCerrar, onAbrir }) {
  return (
    <div className="cerebro-resultados">
      <div className="cerebro-resultados-cabecera">
        <p role="status">{busqueda.resultados.length ? `${busqueda.resultados.length} notas responden a «${busqueda.q}»` : `Nada responde a «${busqueda.q}».`}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Ver todas las notas</button>
      </div>
      <ul className="cerebro-lista">
        {busqueda.resultados.map((r) => (
          <li key={r.ruta} className="cerebro-nota card">
            <div className="cerebro-nota-cuerpo">
              <h3 className="cerebro-nota-titulo"><button type="button" className="cerebro-abrir" onClick={() => onAbrir(r)}>{r.titulo}</button></h3>
              {r.pasajes.map((p, i) => <p key={i} className="cerebro-pasaje">{p.length > 320 ? `${p.slice(0, 320)}…` : p}</p>)}
              <p className="cerebro-meta"><span className={`badge cerebro-tipo cerebro-tipo-${r.tipo}`}>{nombreDeTipo(r.tipo)}</span>{r.interna && <span className="badge cerebro-interna"><Icon name="lock" size={12} /> Interna</span>}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditorNota({ nota, lectura, onCerrar, onGuardar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const [f, setF] = useState({ titulo: nota.titulo, texto: nota.texto, tipo: nota.tipo, interna: Boolean(nota.interna) });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const nueva = !nota.id;

  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ ...f, id: nota.id });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form ref={ref} className="dialog cerebro-editor" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} onSubmit={enviar}>
        <h3 id={`${ids}-t`}>{nueva ? "Añadir una nota" : lectura ? nota.titulo : "Editar la nota"}</h3>
        {!nueva && nota.fuente && <p className="hint">De <code>{nota.fuente}</code>. Si la corriges, una nueva importación no la pisa.</p>}

        <div className="field">
          <label className="label" htmlFor={`${ids}-ti`}>Título</label>
          <input id={`${ids}-ti`} className="input" value={f.titulo} maxLength={140} readOnly={lectura} onChange={(e) => setF({ ...f, titulo: e.target.value })} required />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-tx`}>Texto</label>
          <textarea id={`${ids}-tx`} className="input cerebro-texto" rows={14} value={f.texto} readOnly={lectura} onChange={(e) => setF({ ...f, texto: e.target.value })} required />
          <p className="hint">{formatoCaracteres(f.texto.length)} de 200 mil caracteres. Con «## Títulos» la búsqueda encuentra mejor lo que necesita.</p>
        </div>
        <div className="cerebro-editor-fila">
          <div className="field">
            <label className="label" htmlFor={`${ids}-tp`}>Tipo</label>
            <select id={`${ids}-tp`} className="input" value={f.tipo} disabled={lectura} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {Object.entries(TIPOS_VISTA).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            </select>
            <p className="hint">{TIPOS_VISTA[f.tipo]?.ayuda}</p>
          </div>
          <div className="field">
            <label className="cerebro-casilla" htmlFor={`${ids}-in`}>
              <input id={`${ids}-in`} type="checkbox" checked={f.interna} disabled={lectura} onChange={(e) => setF({ ...f, interna: e.target.checked })} />
              <span>Interna: no sale en los textos que se publican</span>
            </label>
            <p className="hint">Para costos, márgenes, proveedores: lo que el equipo sabe y el cliente no debe leer nunca en un caption.</p>
          </div>
        </div>

        {error && <p role="alert" className="cerebro-error">{error}</p>}
        <div className="cerebro-editor-pie">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>{lectura ? "Cerrar" : "Cancelar"}</button>
          {!lectura && <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>}
        </div>
      </form>
    </div>
  );
}

function ConfirmarBorrado({ nota, onCancelar, onBorrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCancelar);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div ref={ref} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${ids}-t`} aria-describedby={`${ids}-d`}>
        <h3 id={`${ids}-t`}>¿Borrar «{nota.titulo}»?</h3>
        <p id={`${ids}-d`} className="hint">La IA dejará de leerla. Si viene del repositorio, sigue allí como copia y podrías volver a traerla.</p>
        <div className="cerebro-editor-pie">
          <button type="button" className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn btn-danger" onClick={onBorrar}>Borrar</button>
        </div>
      </div>
    </div>
  );
}
