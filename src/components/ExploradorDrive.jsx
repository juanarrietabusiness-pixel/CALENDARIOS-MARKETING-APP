import { useState, useEffect, useCallback, useId, useRef } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { tamanoLegible, enlaceCarpeta } from "../lib/drive";

// ============================================================
// La carpeta de Drive de un cliente, navegable
//
// Dos modos:
//
//   · «gestionar» (la pestaña Contenido): ver, subir, crear carpetas,
//     descargar y mandar a la papelera.
//   · «escoger» (desde el chat o una publicación): tocar para elegir;
//     con `maximo > 1` se marcan varios y se confirma.
//
// Las miniaturas las sirve el Worker desde Drive: el navegador nunca
// habla con Google (ver worker/rutas/drive.js).
// ============================================================

const FILTROS = [
  ["", "Todo"],
  ["imagen", "Imágenes"],
  ["video", "Videos"],
];

const duracion = (ms) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function ExploradorDrive({
  clienteId, raiz, modo = "gestionar", tipos = ["imagen", "video"], maximo = 1, pulso = 0,
  onSelect, onError,
}) {
  const ids = useId();
  const [carpeta, setCarpeta] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");
  const soloUno = tipos.length === 1;
  const [filtro, setFiltro] = useState(soloUno ? tipos[0] : "");
  const [marcados, setMarcados] = useState([]);
  const [subiendo, setSubiendo] = useState("");
  const [nuevaCarpeta, setNuevaCarpeta] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const entrada = useRef(null);
  const escoger = modo === "escoger";

  const cargar = useCallback(async (pagina = "") => {
    setCargando(true);
    setFallo("");
    try {
      const r = await db.listarDrive(clienteId, { carpeta, q: consulta, tipo: filtro, pagina });
      setDatos((prev) => (pagina && prev ? { ...r, archivos: [...prev.archivos, ...r.archivos] } : r));
    } catch (e) {
      setFallo(e.message || "No se pudo abrir la carpeta de Drive.");
      onError?.(e);
    }
    setCargando(false);
  }, [clienteId, carpeta, consulta, filtro, onError]);

  useEffect(() => { void cargar(); }, [cargar, pulso]);

  // La búsqueda espera a que se deje de teclear: cada consulta es una
  // llamada a Drive.
  useEffect(() => {
    const t = setTimeout(() => setConsulta(busqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const entrar = (id) => { setCarpeta(id === raiz ? "" : id); setBusqueda(""); setConsulta(""); };

  const subir = async (lista) => {
    const archivos = [...lista];
    if (!archivos.length) return;
    setFallo("");
    let hechos = 0;
    for (const f of archivos) {
      setSubiendo(`Subiendo «${f.name}» (${hechos + 1} de ${archivos.length})…`);
      try {
        await db.subirADrive(clienteId, f, carpeta);
        hechos += 1;
      } catch (e) {
        setFallo(`«${f.name}»: ${e.message}`);
      }
    }
    setSubiendo("");
    if (hechos) setAviso(`${hechos} archivo${hechos === 1 ? "" : "s"} subido${hechos === 1 ? "" : "s"} a Drive.`);
    void cargar();
  };

  const crearCarpeta = async (e) => {
    e.preventDefault();
    const nombre = nuevaCarpeta?.trim();
    if (!nombre) return;
    try {
      await db.crearCarpetaDrive(clienteId, nombre, carpeta);
      setNuevaCarpeta(null);
      setAviso(`Carpeta «${nombre}» creada.`);
      void cargar();
    } catch (err) {
      setFallo(err.message);
    }
  };

  const aPapelera = async (a) => {
    try {
      await db.papeleraDrive(clienteId, a.id);
      setConfirmando(null);
      setAviso(`«${a.nombre}» está en la papelera de Drive (se recupera desde Drive durante 30 días).`);
      setDatos((prev) => prev && { ...prev, archivos: prev.archivos.filter((x) => x.id !== a.id) });
    } catch (e) {
      setFallo(e.message);
    }
  };

  const normalizar = (a) => ({
    fuente: "drive",
    id: a.id,
    fileId: a.id,
    nombre: a.nombre,
    tipo: a.tipo,
    url: db.urlArchivoDrive(clienteId, a.id),
  });

  const tocar = (a) => {
    if (a.tipo === "carpeta") { entrar(a.id); return; }
    if (!escoger) return;
    if (maximo === 1) { onSelect?.([normalizar(a)]); return; }
    setMarcados((prev) => prev.some((m) => m.id === a.id)
      ? prev.filter((m) => m.id !== a.id)
      : prev.length >= maximo ? prev : [...prev, a]);
  };

  const visibles = (datos?.archivos ?? []).filter((a) => a.tipo === "carpeta" || tipos.includes(a.tipo) || !escoger);

  return (
    <div className="drive">
      <div className="drive-barra">
        <nav aria-label="Carpetas" className="drive-migas">
          {(datos?.ruta ?? []).map((m, i, todas) => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", minWidth: 0 }}>
              {i > 0 && <Icon name="chevronRight" size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />}
              {i === todas.length - 1 ? (
                <span aria-current="location" className="drive-miga-actual">{i === 0 ? "Carpeta del cliente" : m.nombre}</span>
              ) : (
                <button type="button" className="drive-miga" onClick={() => entrar(m.id)}>
                  {i === 0 ? "Carpeta del cliente" : m.nombre}
                </button>
              )}
            </span>
          ))}
        </nav>

        <div className="drive-controles">
          <div className="drive-buscar">
            <Icon name="search" size={16} />
            <input
              className="input"
              type="search"
              aria-label="Buscar en esta carpeta"
              placeholder="Buscar en esta carpeta"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          {!soloUno && (
            <div className="segmented" role="group" aria-label="Qué mostrar">
              {FILTROS.map(([id, nombre]) => (
                <button
                  key={id || "todo"}
                  type="button"
                  className={`segmented-btn ${filtro === id ? "active" : ""}`}
                  aria-pressed={filtro === id}
                  onClick={() => setFiltro(id)}
                >
                  {nombre}
                </button>
              ))}
            </div>
          )}
          <input
            ref={entrada}
            type="file"
            multiple
            accept={tipos.map((t) => (t === "imagen" ? "image/*" : "video/*")).join(",")}
            className="sr-only"
            aria-label="Archivos para subir a Drive"
            onChange={(e) => { void subir(e.target.files); e.target.value = ""; }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={Boolean(subiendo)}>
            <Icon name="upload" size={16} /> Subir
          </button>
          {!escoger && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevaCarpeta("")}>
              <Icon name="folder" size={16} /> Nueva carpeta
            </button>
          )}
          <a
            className="btn btn-ghost btn-sm"
            href={enlaceCarpeta(carpeta || raiz)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="link" size={16} /> Abrir en Drive
          </a>
        </div>
      </div>

      {nuevaCarpeta !== null && (
        <form onSubmit={crearCarpeta} className="drive-nueva-carpeta">
          <label htmlFor={`${ids}-carpeta`} className="sr-only">Nombre de la carpeta nueva</label>
          <input
            id={`${ids}-carpeta`}
            className="input"
            autoFocus
            placeholder="Nombre de la carpeta"
            value={nuevaCarpeta}
            onChange={(e) => setNuevaCarpeta(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">Crear</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevaCarpeta(null)}>Cancelar</button>
        </form>
      )}

      <div role="status" aria-live="polite" className={subiendo || aviso ? undefined : "sr-only"}>
        {subiendo ? <p className="notice notice-warn">{subiendo}</p> : aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {cargando && !datos && <p className="hint" role="status">Abriendo la carpeta de Drive…</p>}
      {datos && visibles.length === 0 && !cargando && (
        <div className="drive-vacio">
          <Icon name="folder" size={32} />
          <p>{consulta ? `Nada con «${consulta}» en esta carpeta.` : "Esta carpeta está vacía."}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => entrada.current?.click()}>
            <Icon name="upload" size={16} /> Subir archivos
          </button>
        </div>
      )}

      {visibles.length > 0 && (
        <ul className="drive-rejilla" aria-busy={cargando}>
          {visibles.map((a) => {
            const marcado = marcados.some((m) => m.id === a.id);
            const pulsable = a.tipo === "carpeta" || escoger;
            const contenido = (
              <>
                <span className="drive-vista">
                  {a.tipo === "carpeta" ? (
                    <Icon name="folder" size={36} />
                  ) : a.miniatura ? (
                    <img src={db.urlMiniaturaDrive(clienteId, a.id)} alt="" loading="lazy" />
                  ) : (
                    <Icon name={a.tipo === "video" ? "video" : a.tipo === "imagen" ? "image" : "file"} size={32} />
                  )}
                  {a.tipo === "video" && (
                    <span className="drive-insignia" aria-hidden="true">
                      <Icon name="play" size={12} /> {duracion(a.duracion)}
                    </span>
                  )}
                  {marcado && (
                    <span className="drive-marca" aria-hidden="true"><Icon name="check" size={14} /></span>
                  )}
                </span>
                <span className="drive-nombre">{a.nombre}</span>
                {a.tipo !== "carpeta" && (
                  <span className="drive-meta">
                    {[tamanoLegible(a.tamano), a.modificado && new Date(a.modificado).toLocaleDateString("es-PA", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")}
                  </span>
                )}
              </>
            );
            return (
              <li key={a.id} className="drive-item" data-tipo={a.tipo} data-marcado={marcado}>
                {pulsable ? (
                  <button
                    type="button"
                    className="drive-tarjeta"
                    onClick={() => tocar(a)}
                    aria-pressed={escoger && maximo > 1 && a.tipo !== "carpeta" ? marcado : undefined}
                    aria-label={a.tipo === "carpeta" ? `Abrir la carpeta ${a.nombre}` : `${a.tipo === "video" ? "Video" : "Imagen"}: ${a.nombre}`}
                  >
                    {contenido}
                  </button>
                ) : (
                  <a
                    className="drive-tarjeta"
                    href={db.urlArchivoDrive(clienteId, a.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Ver ${a.nombre}`}
                  >
                    {contenido}
                  </a>
                )}
                {!escoger && a.tipo !== "carpeta" && (
                  <div className="drive-acciones">
                    <a className="btn-icon" href={db.urlArchivoDrive(clienteId, a.id, { descargar: true })} aria-label={`Descargar ${a.nombre}`} title="Descargar">
                      <Icon name="download" size={16} />
                    </a>
                    {confirmando === a.id ? (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => aPapelera(a)}>
                        ¿A la papelera?
                      </button>
                    ) : (
                      <button type="button" className="btn-icon" onClick={() => setConfirmando(a.id)} aria-label={`Mandar ${a.nombre} a la papelera`} title="Papelera">
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {datos?.siguiente && (
        <button type="button" className="btn btn-secondary" onClick={() => cargar(datos.siguiente)} disabled={cargando} style={{ alignSelf: "center" }}>
          {cargando ? "Cargando…" : "Ver más"}
        </button>
      )}

      {escoger && maximo > 1 && (
        <div className="drive-confirmar">
          <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            {marcados.length ? `${marcados.length} marcado${marcados.length === 1 ? "" : "s"}` : `Marca hasta ${maximo}`}
          </span>
          <button type="button" className="btn btn-primary" disabled={!marcados.length} onClick={() => onSelect?.(marcados.map(normalizar))}>
            Adjuntar{marcados.length ? ` (${marcados.length})` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
