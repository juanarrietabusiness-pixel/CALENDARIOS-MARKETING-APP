import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { soloLectura } from "../lib/sesionActual";
import {
  listarCerebro, leerNota, guardarNota, borrarNota, buscarEnCerebro, importarAlCerebro, prepararFicha, proponerRubro, proponerVozUgc,
  leerDatosQueNoCuadran,
} from "../lib/cerebro";
import { describirLenguaje } from "../lib/lenguajeCliente";
import {
  TIPOS_VISTA, FILTROS_TIPO, nombreDeTipo, ordenarNotas, filtrarNotas, contarPorTipo, agruparNotas,
  formatoCaracteres, describirImportacion, describirFicha, avisoSinFicha, leerDocumento,
} from "../lib/cerebroVista";
import { deleteClientMemory } from "../lib/db";
import CerebroAprendizaje from "./CerebroAprendizaje";
import NotaLegible from "./NotaLegible";
import "./Cerebro.css";

// El mapa 3D se descarga sólo si se abre: la lista es lo que se ve al entrar.
const CerebroGrafo = lazy(() => import("./CerebroGrafo"));
// El estudio de mercado va aparte: su diálogo pesa y no todos los que miran el cerebro lo abren.
const EstudioMercado = lazy(() => import("./EstudioMercado"));
// «Lenguaje del cliente»: el diálogo para pegar reseñas y proponer la nota (sólo se descarga al abrirlo).
const LenguajeCliente = lazy(() => import("./LenguajeCliente"));

const CLAVE_VISTA = "cerebro.vista";
const leerVista = () => { try { return localStorage.getItem(CLAVE_VISTA) === "mapa" ? "mapa" : "lista"; } catch { return "lista"; } };
const guardarVista = (v) => { try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* sin almacenamiento: se olvida al recargar, nada más */ } };

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

/** `abrirMercado` ({ tab, n }): abre el estudio de mercado en esa pestaña (el semáforo del kit: el catálogo). */
export default function Cerebro({ client, abrirMercado = null }) {
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
  const [vista, setVista] = useState(leerVista);      // "lista" | "mapa"
  const [datosMal, setDatosMal] = useState([]);       // «Datos que no cuadran»
  const [sinActualizar, setSinActualizar] = useState([]); // notas corregidas aquí que GitHub traía cambiadas
  const [fichaTuya, setFichaTuya] = useState(false);  // la última renovación conservó la ficha editada a mano
  const [mas, setMas] = useState(false);              // el menú «Más»
  const [lenguaje, setLenguaje] = useState(false);    // el diálogo «Lenguaje del cliente»
  const entrada = useRef(null);
  const cambiarVista = (v) => { setVista(v); guardarVista(v); };

  const cargar = useCallback(async () => {
    try {
      setDatos(await listarCerebro(client.id));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
    // «Datos que no cuadran» no puede tumbar la pantalla: si falla, no se enseña y ya.
    leerDatosQueNoCuadran(client.id).then((r) => setDatosMal(r?.datos ?? [])).catch(() => setDatosMal([]));
  }, [client.id]);

  useEffect(() => {
    setCargando(true);
    setDatos(null);
    setBusqueda(null);
    setAviso(null);
    setSinActualizar([]);
    setFichaTuya(false);
    cargar();
  }, [cargar]);

  const notas = useMemo(() => ordenarNotas(datos?.notas ?? []), [datos]);
  const visibles = useMemo(() => filtrarNotas(notas, filtro), [notas, filtro]);
  const agrupadas = useMemo(() => agruparNotas(notas), [notas]);
  const sinFiltro = filtro.tipo === "todas" && !filtro.soloInternas && !filtro.texto.trim();
  const cuentas = useMemo(() => contarPorTipo(notas), [notas]);
  const estado = datos?.estado;

  const avisar = (ok, texto, detalles = []) => setAviso({ ok, texto, detalles });

  // ---------- Las dos acciones grandes ----------
  // Lo que cambie en las notas tiene que llegar a la ficha y las cifras, que es lo que la IA lee SIEMPRE: si no, sigue
  // escribiendo con lo de antes (el WhatsApp viejo de ROFER). Por eso, si la importación trajo algo y ya había ficha,
  // se renueva sola (sin pisar la que alguien editó a mano: eso lo decide la persona con «Renovar de todas formas»).
  const importar = async (actualizar, pisar = []) => {
    setTrabajando(actualizar ? "actualizar" : "importar");
    setAviso(null);
    try {
      const r = await importarAlCerebro(client.id, { actualizar, pisar });
      const d = describirImportacion(r);
      setSinActualizar(r.sinActualizar ?? []);
      let texto = d.texto;
      const trajo = (r.notas?.creadas ?? 0) + (r.notas?.reemplazadas ?? 0) > 0;
      if (trajo && estado?.conFicha) {
        setTrabajando("ficha");
        try {
          const f = await prepararFicha(client.id, { forzar: false });
          setFichaTuya(f.ficha === "conservada" || f.cifras === "conservada");
          texto += ` ${describirFicha(f)}`;
        } catch (e) {
          texto += ` La ficha técnica no se pudo renovar (${e.message}): pulsa «Renovar ficha».`;
        }
      }
      avisar(true, texto, d.detalles);
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
      const f = await prepararFicha(client.id, { forzar });
      setFichaTuya(f.ficha === "conservada" || f.cifras === "conservada");
      avisar(true, describirFicha(f));
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setTrabajando("");
    }
  };

  const borrarMemorias = async (ids) => {
    try {
      for (const id of ids) await deleteClientMemory(id);
      avisar(true, ids.length === 1 ? "Memoria borrada: el asistente ya no la lee." : `${ids.length} memorias borradas.`);
      await cargar();
    } catch (e) {
      avisar(false, e.message);
    }
  };

  // «Saber del rubro»: la IA la PROPONE y se abre en el editor de siempre; nada se guarda hasta «Guardar». Es lo que lee
  // el contenido educativo (lib/materialTipo.js). Si ya había una, la propuesta la mejora y la guarda encima.
  const rubro = async () => {
    setTrabajando("rubro");
    setAviso(null);
    try {
      const r = await proponerRubro(client.id);
      setEditor({ ...(r.existente ? { id: r.existente.id } : {}), titulo: r.titulo, texto: r.texto, tipo: "nota", interna: false, editar: true });
      avisar(true, [
        r.conWeb ? "La IA buscó en internet: revisa los datos y sus fuentes antes de guardar." : "Sin búsqueda en internet: sólo conocimiento general del rubro. Revísala antes de guardar.",
        "Guárdala con ese título: es la que lee el contenido educativo.",
        r.aviso ?? "",
      ].filter(Boolean).join(" "));
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setTrabajando("");
    }
  };

  // «Voz UGC»: cómo habla ESTA marca en sus videos, sacada de sus guiones UGC (los aprobados mandan). Como «Saber del
  // rubro»: la IA la propone, se abre en el editor y nada se guarda hasta «Guardar». La lee el guion UGC del panel y el lote.
  const vozUgc = async () => {
    setTrabajando("voz");
    setAviso(null);
    try {
      const r = await proponerVozUgc(client.id);
      setEditor({ ...(r.existente ? { id: r.existente.id } : {}), titulo: r.titulo, texto: r.texto, tipo: "nota", interna: false, editar: true });
      avisar(true, [
        r.guiones ? `La IA leyó ${r.guiones} ${r.guiones === 1 ? "guion UGC" : "guiones UGC"} de ${client.name}.` : `${client.name} todavía no tiene guiones UGC: la propuesta sale de lo que se sabe de la marca.`,
        "Corrígela y guárdala con ese título: es la que sigue todo guion UGC de este cliente.",
        r.aviso ?? "",
      ].filter(Boolean).join(" "));
    } catch (e) {
      avisar(false, e.message);
    } finally {
      setTrabajando("");
    }
  };

  // «Lenguaje del cliente»: la IA agrupa las frases EXACTAS de sus clientes y el servidor comprueba cada una; la
  // propuesta se abre en el editor de siempre y nada se guarda hasta «Guardar». La lee el motor de ideas.
  const lenguajePropuesto = (r) => {
    setLenguaje(false);
    setEditor({ ...(r.existente ? { id: r.existente.id } : {}), titulo: r.titulo, texto: r.texto, tipo: "nota", interna: false, editar: true });
    avisar(true, [describirLenguaje(r), r.aviso ?? ""].filter(Boolean).join(" "));
  };

  // ---------- Notas ----------
  const abrir = async (nota) => {
    try {
      setEditor(await leerNota(client.id, nota.id));
    } catch (e) {
      avisar(false, e.message);
    }
  };

  // Un dato que cambió (teléfono, precio, horario) se guarda como nota y la ficha y las cifras se renuevan en el acto:
  // es lo que la IA lee siempre, y es lo que se quiere cambiar.
  const guardar = async (nota) => {
    const { renovar, ...limpia } = nota;
    await guardarNota(client.id, limpia);
    setEditor(null);
    if (renovar && estado?.conFicha) {
      await preparar(false);
      return;
    }
    avisar(true, nota.id ? "Nota guardada." : "Nota añadida.");
    await cargar();
  };

  const abrirPorRuta = (ruta) => {
    const n = notas.find((x) => x.ruta === ruta);
    if (n) abrir(n);
    else avisar(false, `No hay ninguna nota con la ruta «${ruta}».`);
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
          {vacio ? (
            <button type="button" className="btn btn-primary" disabled={trabajo || !estado?.repositorio} onClick={() => importar(false)}
              title={estado?.repositorio ? "Lee el repositorio de GitHub del cliente y lo parte en notas" : "Este cliente no tiene un repositorio en su ficha"}>
              <Icon name="download" size={18} /> {trabajando === "importar" ? "Llenando…" : "Llenar desde el repositorio"}
            </button>
          ) : null}
          {vacio ? (
            <button type="button" className="btn btn-secondary" disabled={trabajo} onClick={() => setEditor({ titulo: "", texto: "", tipo: "nota", interna: false, editar: true })}>
              <Icon name="plus" size={18} /> Añadir nota
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled={trabajo} onClick={() => setEditor({ titulo: "", texto: "", tipo: "nota", interna: false, editar: true })}>
                <Icon name="plus" size={18} /> Añadir
              </button>
              {estado?.repositorio && (
                <button type="button" className="btn btn-secondary" disabled={trabajo} onClick={() => importar(true)}
                  title="Trae lo nuevo y lo que cambió en GitHub, y renueva la ficha técnica. Lo que corregiste aquí se conserva">
                  <Icon name="refresh" size={18} /> {trabajando === "actualizar" ? "Actualizando…" : "Actualizar desde GitHub"}
                </button>
              )}
              <button type="button" className="btn btn-accent" disabled={trabajo} onClick={() => preparar(false)}
                title="Una llamada a la IA lee las notas de marca y escribe la ficha técnica y las cifras">
                <Icon name="sparkles" size={18} /> {trabajando === "ficha" ? "Escribiendo la ficha…" : estado?.conFicha ? "Renovar ficha" : "Preparar ficha con IA"}
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost" aria-expanded={mas} aria-controls={`${ids}-mas`} onClick={() => setMas((v) => !v)}>
            <Icon name="more" size={18} /> Más
          </button>
          {mas && (
            <div id={`${ids}-mas`} className="cerebro-mas" role="group" aria-label="Más acciones">
              <button type="button" className="btn btn-secondary btn-sm" disabled={trabajo} onClick={() => entrada.current?.click()}>
                <Icon name="upload" size={16} /> Subir documento
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={trabajo} onClick={rubro}
                title="La IA propone lo que un experto del rubro sabe (consejos, errores, mitos, preguntas): de ahí sale el contenido educativo">
                <Icon name="bulb" size={16} /> {trabajando === "rubro" ? "Escribiendo…" : "Saber del rubro"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={trabajo} onClick={() => setLenguaje(true)}
                title="Las frases exactas con las que hablan sus clientes (reseñas, comentarios y la encuesta), comprobadas una a una: para escribir ganchos y textos con sus palabras">
                <Icon name="messageCircle" size={16} /> Lenguaje del cliente
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={trabajo} onClick={vozUgc}
                title="La IA propone cómo habla esta marca en sus videos UGC (quién habla, tono, cómo empieza y cierra), leyendo sus guiones">
                <Icon name="user" size={16} /> {trabajando === "voz" ? "Escribiendo…" : "Voz UGC"}
              </button>
              {estado?.conFicha && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={trabajo} onClick={() => preparar(true)}
                  title="Reescribe la ficha y las cifras aunque alguien las haya editado a mano">
                  <Icon name="sparkles" size={16} /> Renovar ficha de todas formas
                </button>
              )}
            </div>
          )}
          <input ref={entrada} type="file" multiple accept=".md,.markdown,.txt,.csv,.json" onChange={subir} className="cerebro-archivo" aria-label="Elegir documentos de texto para el cerebro" tabIndex={-1} />
        </div>
      )}

      {estado?.fichaVieja && !trabajo && (
        <div className="cerebro-alerta" role="note">
          <p>
            <strong>La ficha técnica está desactualizada.</strong> Es lo que la IA lee en TODO lo que escribe, y es de antes de que
            {estado.fichaVieja.total === 1 ? " cambiara una nota" : ` cambiaran ${estado.fichaVieja.total} notas`}
            {` (${estado.fichaVieja.cambiadas.slice(0, 4).join(", ")}${estado.fichaVieja.total > 4 ? "…" : ""})`}. Hasta que la renueves, la IA sigue usando lo de antes.
          </p>
          {!lectura && (
            <div className="cerebro-alerta-botones">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => preparar(false)}><Icon name="sparkles" size={14} /> Renovar ahora</button>
              {fichaTuya && <button type="button" className="btn btn-secondary btn-sm" onClick={() => preparar(true)}>La editaste a mano: renovar de todas formas</button>}
            </div>
          )}
        </div>
      )}

      {datosMal.length > 0 && (
        <section className="cerebro-alerta" aria-labelledby={`${ids}-dm`}>
          <h3 id={`${ids}-dm`} className="cerebro-alerta-titulo"><Icon name="alert" size={16} /> Datos que no cuadran</h3>
          <p className="hint">Están en lo que la IA lee siempre, pero ninguna nota los dice. Lo más probable es que sean viejos.</p>
          <ul className="cerebro-datos">
            {datosMal.map((d) => (
              <li key={`${d.tipo}|${d.valor}`}>
                <p>
                  {d.tipo === "telefono" ? "El teléfono" : "El correo"} <strong>{d.valor}</strong> está en {d.en.join(", ")}; las notas dicen{" "}
                  <strong>{d.vigentes.join(" o ")}</strong>{d.vigentesEn.length ? ` (${d.vigentesEn.slice(0, 3).join(", ")})` : ""}.
                </p>
                {!lectura && (
                  <div className="cerebro-alerta-botones">
                    {(d.fuentes.includes("ficha") || d.fuentes.includes("cifras")) && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={trabajo} onClick={() => preparar(true)}>Renovar la ficha y las cifras</button>
                    )}
                    {d.memorias.length > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => borrarMemorias(d.memorias)}>
                        Borrar {d.memorias.length === 1 ? "esa memoria" : "esas memorias"} del asistente
                      </button>
                    )}
                    {d.fuentes.includes("cliente") && <span className="hint">Corrígelo en Marca → Ficha del cliente (teléfono o WhatsApp).</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sinActualizar.length > 0 && !lectura && (
        <div className="cerebro-alerta" role="note">
          <p>
            <strong>{sinActualizar.length === 1 ? "Una nota no se actualizó" : `${sinActualizar.length} notas no se actualizaron`}</strong>: cambiaron en GitHub,
            pero aquí alguien les había corregido el texto, y lo corregido aquí manda.
          </p>
          <ul>{sinActualizar.slice(0, 8).map((n) => <li key={n.id}>{n.titulo}</li>)}</ul>
          <div className="cerebro-alerta-botones">
            <button type="button" className="btn btn-primary btn-sm" disabled={trabajo} onClick={() => importar(true, sinActualizar.map((n) => n.id))}>
              Usar la versión de GitHub en {sinActualizar.length === 1 ? "esa" : "todas"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSinActualizar([])}>Quedarme con lo de aquí</button>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {trabajo && <p role="status" className="cerebro-trabajando">{trabajando === "ficha" ? "La IA está leyendo las notas de marca. Tarda de medio minuto a un par de minutos." : trabajando === "rubro" ? "La IA está escribiendo lo que sabe un experto del rubro. Tarda un minuto o dos." : trabajando === "voz" ? "La IA está leyendo los guiones UGC de este cliente. Tarda menos de un minuto." : "Leyendo el repositorio…"}</p>}
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

      <Suspense fallback={null}>
        <EstudioMercado client={client} onCambio={cargar} abrir={abrirMercado} />
      </Suspense>
      {lenguaje && (
        <Suspense fallback={null}>
          <LenguajeCliente client={client} onPropuesta={lenguajePropuesto} onCerrar={() => setLenguaje(false)} />
        </Suspense>
      )}

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
          <CerebroAprendizaje client={client} lectura={lectura} version={`${estado.notas}|${estado.ultima}`} onCambio={cargar} />

          <div className="cerebro-vistas" role="group" aria-label="Cómo ver las notas">
            <button type="button" className="filter-chip" aria-pressed={vista === "lista"} onClick={() => cambiarVista("lista")}>
              <Icon name="list" size={16} /> Lista
            </button>
            <button type="button" className="filter-chip" aria-pressed={vista === "mapa"} onClick={() => cambiarVista("mapa")}>
              <Icon name="brain" size={16} /> Mapa 3D
            </button>
          </div>

          {vista === "mapa" ? (
            <Suspense fallback={<p role="status" className="cerebro-vacio">Preparando el mapa…</p>}>
              <CerebroGrafo client={client} version={`${estado.notas}|${estado.ultima}`} onAbrir={abrir} />
            </Suspense>
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
              ) : sinFiltro ? (
                <div className="cerebro-grupos">
                  {agrupadas.siempre.length > 0 && (
                    <section className="cerebro-grupo cerebro-grupo-siempre" aria-labelledby={`${ids}-siempre`}>
                      <h3 id={`${ids}-siempre`} className="cerebro-grupo-titulo">Lo que la IA lee siempre</h3>
                      <p className="hint">La ficha técnica, las cifras y las pautas van en todo lo que escribe. Si un dato está mal aquí, está mal en todo.</p>
                      <ul className="cerebro-lista">
                        {agrupadas.siempre.map((n) => (
                          <NotaFila key={n.id} nota={n} lectura={lectura} vieja={Boolean(estado.fichaVieja) && (n.tipo === "ficha" || n.tipo === "cifras")}
                            onAbrir={() => abrir(n)} onInterna={() => alternarInterna(n)} onBorrar={() => setBorrando(n)} />
                        ))}
                      </ul>
                    </section>
                  )}
                  <h3 className="cerebro-grupo-titulo">Lo que busca cuando lo necesita</h3>
                  <p className="hint">Cada archivo de GitHub se parte en notas, una por sección: la IA lee sólo las que tienen que ver con lo que escribe.</p>
                  {agrupadas.grupos.map((g) => (
                    <details key={g.clave} className="cerebro-grupo" open={g.clave === "origen:manual"}>
                      <summary title={g.ayuda || undefined}>
                        <span>{g.titulo}</span> <span className="cerebro-cuenta">{g.notas.length}</span>
                      </summary>
                      <ul className="cerebro-lista">
                        {g.notas.map((n) => (
                          <NotaFila key={n.id} nota={n} lectura={lectura} onAbrir={() => abrir(n)} onInterna={() => alternarInterna(n)} onBorrar={() => setBorrando(n)} />
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
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
        </>
      )}

      {editor && <EditorNota key={editor.id ?? "nueva"} nota={editor} lectura={lectura} onCerrar={() => setEditor(null)} onGuardar={guardar} onNota={abrirPorRuta} />}
      {borrando && <ConfirmarBorrado nota={borrando} onCancelar={() => setBorrando(null)} onBorrar={borrar} />}
    </section>
  );
}

// ------------------------------------------------------------

function NotaFila({ nota, lectura, vieja = false, onAbrir, onInterna, onBorrar }) {
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
          {vieja && <span className="badge cerebro-vieja" title="Es de antes del último cambio en las notas: renuévala">Desactualizada</span>}
          {nota.corregida && nota.origen === "repositorio" && <span className="badge" title="Le cambiaron el texto aquí: al actualizar desde GitHub no se pisa">Corregida aquí</span>}
          <span>{formatoCaracteres(nota.caracteres)} car.</span>
          <span>{nota.origen === "repositorio" ? "Del repositorio" : nota.origen === "ia" ? "Escrita por la IA" : nota.origen === "mercado" ? "Del estudio de mercado" : nota.origen === "documento" ? "Documento" : "A mano"}</span>
          <span>{fecha(nota.actualizada)}</span>
        </p>
      </div>
      {!lectura && (
        <div className="cerebro-nota-acciones">
          {nota.tipo !== "pautas" && (
            <button type="button" className="btn-icon" onClick={onInterna} aria-pressed={nota.interna}
              aria-label={nota.interna ? `Permitir «${nota.titulo}» en los textos` : `Marcar «${nota.titulo}» como interna`}
              title={nota.interna ? "Es interna: pulsa para que pueda salir en los textos" : "Marcar como interna: no saldrá en los textos que se publican"}>
              <Icon name="lock" />
            </button>
          )}
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

/** Lo que se quiere añadir, en palabras de la agencia: cada opción es un tipo de nota y una pista de qué escribir. */
const QUE_ANADIR = [
  { id: "dato", nombre: "Cambió un dato", ayuda: "Teléfono, precio, horario, dirección. Se guarda y se renueva la ficha técnica en el acto.", tipo: "nota", titulo: "Ej.: Nuevo WhatsApp", texto: "Ej.: El WhatsApp vigente es +507 6086-6581 desde el 9 de octubre de 2026. El anterior ya no se usa." },
  { id: "regla", nombre: "Una regla para escribir", ayuda: "Cómo se escribe para este cliente: lo que la IA sigue SIEMPRE.", tipo: "pautas", titulo: "Ej.: Siempre de usted", texto: "Ej.: Nunca tutear. Cerrar cada caption con «Escríbanos al WhatsApp»." },
  { id: "info", nombre: "Información de la marca", ayuda: "Productos, público, historia, lo que la IA busca cuando lo necesita.", tipo: "nota", titulo: "Ej.: Servicio de demoliciones", texto: "" },
  { id: "interna", nombre: "Algo interno", ayuda: "Costos, márgenes, proveedores: lo ve el equipo y nunca sale en lo que se publica.", tipo: "nota", interna: true, titulo: "Ej.: Márgenes 2026", texto: "" },
];

function EditorNota({ nota, lectura, onCerrar, onGuardar, onNota }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const [f, setF] = useState({ titulo: nota.titulo, texto: nota.texto, tipo: nota.tipo, interna: Boolean(nota.interna) });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const nueva = !nota.id;
  // Una nota que ya existe se abre para LEER (formateada); «Editar» la cambia a escribir.
  const [editando, setEditando] = useState(Boolean(nota.editar) || nueva);
  const [que, setQue] = useState(nueva && !nota.titulo ? "" : "propia");
  const opcion = QUE_ANADIR.find((o) => o.id === que);

  const escoger = (o) => {
    setQue(o.id);
    setF((x) => ({ ...x, tipo: o.tipo, interna: Boolean(o.interna) }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ ...f, id: nota.id, renovar: que === "dato" });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  if (!editando) {
    return (
      <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <div ref={ref} className="dialog cerebro-editor" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
          <h3 id={`${ids}-t`}>{nota.titulo}</h3>
          <p className="cerebro-meta">
            <span className={`badge cerebro-tipo cerebro-tipo-${nota.tipo}`}>{nombreDeTipo(nota.tipo)}</span>
            {nota.interna && <span className="badge cerebro-interna"><Icon name="lock" size={12} /> Interna</span>}
            {nota.fuente && <span>De <code>{nota.fuente}</code></span>}
            {nota.actualizada && <span>{fecha(nota.actualizada)}</span>}
          </p>
          <NotaLegible texto={nota.texto} onNota={(ruta) => { onCerrar(); onNota?.(ruta); }} />
          <div className="cerebro-editor-pie">
            <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>
            {!lectura && <button type="button" className="btn btn-primary" onClick={() => setEditando(true)}><Icon name="pencil" size={16} /> Editar</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form ref={ref} className="dialog cerebro-editor" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} onSubmit={enviar}>
        <h3 id={`${ids}-t`}>{nueva ? "Añadir al cerebro" : "Editar la nota"}</h3>
        {!nueva && nota.fuente && <p className="hint">De <code>{nota.fuente}</code>. Si le cambias el texto, al actualizar desde GitHub no se pisa (se te avisará si allí cambió).</p>}

        {nueva && (
          <fieldset className="cerebro-que">
            <legend className="label">¿Qué quieres añadir?</legend>
            <div className="cerebro-que-opciones">
              {QUE_ANADIR.map((o) => (
                <button key={o.id} type="button" className="filter-chip" aria-pressed={que === o.id} onClick={() => escoger(o)}>{o.nombre}</button>
              ))}
            </div>
            {opcion && <p className="hint">{opcion.ayuda}</p>}
          </fieldset>
        )}

        {(!nueva || que) && (
          <>
            <div className="field">
              <label className="label" htmlFor={`${ids}-ti`}>Título</label>
              <input id={`${ids}-ti`} className="input" value={f.titulo} maxLength={140} placeholder={opcion?.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-tx`}>Texto</label>
              <textarea id={`${ids}-tx`} className="input cerebro-texto" rows={12} value={f.texto} placeholder={opcion?.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} required />
              <p className="hint">{formatoCaracteres(f.texto.length)} de 200 mil caracteres. Con «## Títulos» la búsqueda encuentra mejor lo que necesita.</p>
            </div>
            <details className="cerebro-avanzado" open={!nueva}>
              <summary>Tipo y candado</summary>
              <div className="cerebro-editor-fila">
                <div className="field">
                  <label className="label" htmlFor={`${ids}-tp`}>Tipo</label>
                  <select id={`${ids}-tp`} className="input" value={f.tipo}
                    onChange={(e) => setF({ ...f, tipo: e.target.value, interna: e.target.value === "pautas" ? false : f.interna })}>
                    {Object.entries(TIPOS_VISTA).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
                  </select>
                  <p className="hint">{TIPOS_VISTA[f.tipo]?.ayuda}</p>
                </div>
                <div className="field">
                  <label className="cerebro-casilla" htmlFor={`${ids}-in`}>
                    <input id={`${ids}-in`} type="checkbox" checked={f.interna} disabled={f.tipo === "pautas"} onChange={(e) => setF({ ...f, interna: e.target.checked })} />
                    <span>Interna: no sale en los textos que se publican</span>
                  </label>
                  <p className="hint">{f.tipo === "pautas"
                    ? "Las pautas no pueden ser internas: existen justamente para que la IA las siga al escribir."
                    : "Para costos, márgenes, proveedores: lo que el equipo sabe y el cliente no debe leer nunca en un caption."}</p>
                </div>
              </div>
            </details>
          </>
        )}

        {error && <p role="alert" className="cerebro-error">{error}</p>}
        <div className="cerebro-editor-pie">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          {(!nueva || que) && (
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? "Guardando…" : que === "dato" ? "Guardar y renovar la ficha" : "Guardar"}
            </button>
          )}
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
