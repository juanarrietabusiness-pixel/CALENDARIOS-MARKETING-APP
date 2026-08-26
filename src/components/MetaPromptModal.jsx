import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { loadADN, cargarReceta, generateMetaPiecesEnTandas, despliegueDesfasado, adnParaEscribir } from "../api";
import { buildMetaMasterPrompt, faltantesDeReceta, faltantesCriticos, avisosDeComposicion, MODOS_META } from "../metaPrompt";
import { MONTHS } from "../constants";
import { primeras, siguientes, restantes, alternar as alternarSeleccion } from "../lib/seleccion";

/**
 * Lo que hizo falta para responder «¿por qué falta este campo?».
 *
 * Sin esto, cada fallo costaba una suposición, un despliegue y una captura
 * de pantalla. Con esto, la respuesta está en la propia pantalla: qué
 * archivos llegaron, cuáles se recortaron, de dónde salió la receta y qué
 * campos vinieron vacíos.
 */
function construirDiag(adn, receta, origen, avisoJson) {
  return {
    origen,
    version: adn?.version ?? 0,
    avisoJson: avisoJson || "",
    totalChars: adn?.totalChars ?? 0,
    truncado: Boolean(adn?.truncated),
    archivos: (adn?.files || []).map((f) => ({
      nombre: f.name,
      papel: f.role,
      chars: f.chars,
      recortado: f.truncated,
    })),
    assets: (adn?.assets || []).map((a) => a.name),
    vacios: Object.entries({
      "fuentes.url": !receta?.fuentes?.url,
      escala: !(receta?.escala || []).length,
      "reticula.texto": !receta?.reticula?.texto,
      bloqueEstilo: !receta?.bloqueEstilo,
      negativos: !receta?.negativos,
      "logo.posicion": !receta?.logo?.posicion,
      colores: !(receta?.colores || []).length,
      plantillas: !(receta?.plantillas || []).length,
    }).filter(([, vacio]) => vacio).map(([campo]) => campo),
  };
}

/**
 * Prompt maestro para Meta AI.
 *
 * El calendario ya está escrito y aprobado; esto lo traduce al formato
 * que Meta AI ejecuta sin improvisar. La receta visual —retícula, escala,
 * bloque de estilo, negativos, reglas del logo— sale del repositorio del
 * cliente y se compila una vez: mientras el SHA del archivo de origen no
 * cambie, no se vuelve a pagar esa llamada.
 *
 * Lo que la IA escribe aquí es sólo la sección 6, las piezas. Las otras
 * seis las arma `metaPrompt.js` en JavaScript, para que ninguna de las
 * reglas literales pase por un modelo que pueda «mejorarlas».
 */
export default function MetaPromptModal({ client, cal, onClose, onPersistClient }) {
  const ref = useDialogA11y(onClose);
  const idModo = useId();
  const idTema = useId();
  const idPublico = useId();
  const idPrompt = useId();
  const idDiag = useId();
  const idLista = useId();

  const [modo, setModo] = useState("lote");
  const [tema, setTema] = useState(cal?.campaign || "");
  const [publico, setPublico] = useState("");
  const [fase, setFase] = useState("config");
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aviso, setAviso] = useState("");
  const [diag, setDiag] = useState(null);
  const [diagAbierto, setDiagAbierto] = useState(false);

  // La receta que se va a usar, leída del repositorio al abrir. No se
  // arranca con `client.metaRecipe`: ésa es la copia guardada en la base de
  // datos, y arrancar con ella enseñaba los huecos de una compilación vieja
  // y dejaba el botón bloqueado hasta que alguien supiera pulsar
  // «Recompilar». Leer el 05_receta.json es instantáneo y gratis, así que se
  // hace siempre y no hay estado viejo que arrastrar.
  const [receta, setReceta] = useState(null);
  const [adn, setAdn] = useState(null);

  // Lo que costó de verdad, sumado tanda a tanda. Sin esto, «¿esto sale
  // caro?» sólo se podía contestar estimando.
  const [gasto, setGasto] = useState(null);

  // Sólo entran las publicaciones que ya tienen contenido: el prompt
  // maestro traduce lo aprobado, no lo inventa sobre la marcha.
  const candidatas = useMemo(() => {
    return (cal?.days || []).flatMap((d) =>
      (d.posts || [])
        .filter((p) => p.idea || p.descripcion || p.guion || p.script)
        .map((p) => ({
          ...p,
          _date: d.date,
          _dayName: d.dayName,
          _concept: d.concept,
          _category: d.category,
        }))
    );
  }, [cal]);

  const tope = modo === "carrusel" ? 10 : modo === "semana" ? 5 : 12;

  /**
   * Qué publicaciones entran en el lote.
   *
   * Antes era `candidatas.slice(0, tope)` y punto: con 21 publicaciones con
   * contenido, nueve se caían del lote sin que nadie lo decidiera, sin
   * aparecer en ningún sitio y sin forma de generarlas después. El tope
   * sigue existiendo —es el que aguanta una tanda—, pero ahora eliges tú
   * cuáles, y «Las siguientes» retoma justo donde acabó el lote anterior.
   */
  const [elegidas, setElegidas] = useState(() => new Set());
  const [listaAbierta, setListaAbierta] = useState(false);

  // Al abrir, y cuando cambia el modo (y con él el tope), se propone la
  // misma tanda que antes salía sola: las primeras del calendario.
  useEffect(() => {
    setElegidas(new Set(primeras(candidatas, tope)));
  }, [candidatas, tope]);

  // Se filtra sobre `candidatas` y no sobre el Set para que el lote salga en
  // orden de calendario pase lo que pase con el orden de marcado.
  const seleccion = useMemo(
    () => candidatas.filter((p) => elegidas.has(p.id)),
    [candidatas, elegidas],
  );

  const alternar = (id) => setElegidas((prev) => alternarSeleccion(prev, id, tope));

  // Cuántas quedan detrás de la última marcada. Es lo que convierte
  // «se perdieron nueve» en «genera las nueve».
  const quedan = restantes(candidatas, elegidas);
  const siguienteTanda = () => setElegidas(new Set(siguientes(candidatas, elegidas, tope)));

  const recetaSlug = `${(client.name || "marca").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  /**
   * Lee el ADN y la receta del repositorio.
   *
   * Se llama al abrir el diálogo y desde «Releer receta». Con
   * `05_receta.json` no hay ninguna llamada a un modelo, así que releer es
   * más barato que cachear: lo que se ahorraba cacheando era una lectura
   * instantánea, y lo que costaba era enseñar una receta de hace un mes.
   */
  const cargar = useCallback(async () => {
    setError("");
    setEstado("Leyendo la receta del repositorio…");
    const fresco = await loadADN(client, { forzar: true });
    if (!fresco.content) {
      throw new Error(
        "Este cliente no tiene ADN conectado. Ábrelo en «Editar cliente» → pestaña GitHub y conecta su carpeta del repositorio."
      );
    }
    const { receta: r, origen, avisoJson } = await cargarReceta(fresco, client);
    r.slug = r.slug || recetaSlug;

    setAdn(fresco);
    setReceta(r);
    setDiag(construirDiag(fresco, r, origen, avisoJson));
    setEstado("");

    if (despliegueDesfasado(fresco)) {
      // Se dice antes que nada: mientras esto pase, todo lo demás que
      // muestre esta pantalla es consecuencia de ello y no de los datos.
      setAviso(
        "La función github-adn desplegada en Supabase es una versión anterior: " +
        "está recortando el ADN y no lee el 05_receta.json, así que la receta se " +
        "está deduciendo con IA. Haz `git pull` en tu clon y vuelve a ejecutar " +
        "`npx supabase functions deploy github-adn`. Hasta entonces, los datos " +
        "que falten aquí abajo son de eso, no del repositorio."
      );
    } else if (avisoJson) {
      setAviso(`El 05_receta.json de ${client.name} no se pudo leer (${avisoJson}), así que se compiló con IA. Revisa ese archivo.`);
    } else if (fresco.truncated) {
      setAviso("El ADN es más largo que el presupuesto de lectura y se recortó por lo menos prioritario. La receta y las guías de marca sí entraron completas.");
    }

    onPersistClient?.({
      ...client,
      metaRecipe: r,
      metaRecipeSha: fresco.recipeSha || "",
      metaRecipeAt: new Date().toISOString(),
    });
    return { adn: fresco, receta: r };
  }, [client, recetaSlug, onPersistClient]);

  // Al abrir. `hecho` evita que el diálogo relea si React vuelve a montar
  // el efecto, que en modo estricto pasa dos veces.
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    setFase("cargando");
    cargar()
      .then(() => setFase("config"))
      .catch((e) => { setError(e.message || "No se pudo leer la receta."); setFase("config"); });
  }, [cargar]);

  const generar = async () => {
    setError("");
    setGasto(null);
    setFase("trabajando");

    try {
      const datos = receta ? { adn, receta } : await cargar();


      // ---- 3. Las piezas ----
      setEstado(`Escribiendo ${seleccion.length} piezas…`);
      const piezas = await generateMetaPiecesEnTandas({
        client,
        calendar: cal,
        receta: datos.receta,
        posts: seleccion,
        modo,
        tema,
        adnTexto: adnParaEscribir(datos.adn),
        alMedir: (d) => setGasto((prev) => ({
          tandas: (prev?.tandas ?? 0) + 1,
          entrada: (prev?.entrada ?? 0) + (d.entrada || 0),
          salida: (prev?.salida ?? 0) + (d.salida || 0),
          cacheLeido: (prev?.cacheLeido ?? 0) + (d.cacheLeido || 0),
          cacheEscrito: (prev?.cacheEscrito ?? 0) + (d.cacheEscrito || 0),
        })),
      }, (hechas, total) => {
        // Un lote de doce va en tres tandas y tarda un par de minutos. Sin
        // esto la pantalla se queda quieta y parece colgada.
        setEstado(hechas < total
          ? `Escribiendo piezas… ${hechas} de ${total}`
          : "Componiendo la maquetación…");
      });

      // ---- 4. El ensamblado, sin IA ----
      setEstado("Armando el prompt…");
      // La composición puede descubrir un titular que no cabe en el cuerpo
      // más pequeño. Eso lo arregla el humano acortando la línea, no Meta AI.
      const problemas = avisosDeComposicion(datos.receta, piezas);
      if (problemas.length) {
        setAviso(problemas.join(" "));
      }
      setPrompt(buildMetaMasterPrompt({ receta: datos.receta, piezas, modo, tema, publico }));
      setFase("listo");
      setEstado("");
    } catch (e) {
      setError(e.message || "No se pudo generar el prompt.");
      setFase("config");
      setEstado("");
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setEstado("Prompt copiado al portapapeles.");
    } catch {
      setEstado("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  };

  const copiarLogo = async () => {
    if (!client.logo) return;
    try {
      await navigator.clipboard.writeText(`const LOGO_MARCA = "${client.logo}";`);
      setEstado("Línea del logo copiada. Pégala en el HTML que devuelva Meta AI, sustituyendo la que trae vacía.");
    } catch {
      setEstado("No se pudo copiar el logo.");
    }
  };

  const descargar = () => {
    const nombre = `prompt-maestro-${recetaSlug}-${cal?.name || MONTHS[cal?.month] || "lote"}.txt`
      .toLowerCase().replace(/\s+/g, "-");
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  const releer = async () => {
    setFase("cargando");
    setAviso("");
    try {
      await cargar();
      setEstado("Receta releída del repositorio.");
    } catch (e) {
      setError(e.message || "No se pudo leer la receta.");
    }
    setFase("config");
  };

  // Todo se deriva de la receta que se acaba de leer, no de la guardada.
  const faltan = receta ? faltantesDeReceta(receta) : [];
  const bloqueado = Boolean(receta) && faltantesCriticos(receta).length > 0;
  const desdeJson = diag?.origen === "json";

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Prompt maestro para Meta AI"
        style={{ maxWidth: fase === "listo" ? 780 : 520, width: "100%" }}
      >
        <h3 style={{ fontSize: "var(--fs-base)", fontWeight: 700, marginBottom: "var(--sp-2)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <Icon name="wand" size={20} /> Prompt maestro para Meta AI
        </h3>

        {fase !== "listo" && (
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-3)", lineHeight: 1.5 }}>
            Meta AI genera los fondos y monta el HTML. No escribe nada: el texto
            va escrito aquí y lo copia literal. El logo tampoco lo dibuja — el
            documento trae un cuadro para cargarlo y lo imprime en cada descarga.
          </p>
        )}

        {error && (
          <div role="alert" style={{ background: "var(--danger-soft, #2a0d0d)", border: "1px solid var(--danger, #C62828)", borderRadius: "var(--radius-sm)", padding: "var(--sp-2)", marginBottom: "var(--sp-3)", fontSize: "var(--fs-2xs)" }}>
            {error}
          </div>
        )}

        {estado && (
          <div role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: "var(--sp-3)" }}>
            {estado}
          </div>
        )}

        {aviso && (
          <div role="status" style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginBottom: "var(--sp-3)", lineHeight: 1.5 }}>
            {aviso}
          </div>
        )}

        {fase === "config" && (
          <>
            <div className="field">
              <label className="label" htmlFor={idModo}>Qué se entrega</label>
              <select id={idModo} className="input" value={modo} onChange={(e) => setModo(e.target.value)}>
                {Object.entries(MODOS_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label} — {m.piezas} piezas</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor={idTema}>Tema del lote</label>
              <input id={idTema} className="input" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="La campaña del mes" />
            </div>

            <div className="field">
              <label className="label" htmlFor={idPublico}>A quién le habla</label>
              <input id={idPublico} className="input" value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Se toma del ADN si lo dejas vacío" />
            </div>

            <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "var(--sp-2)", marginBottom: "var(--sp-3)", fontSize: "var(--fs-2xs)", lineHeight: 1.6 }}>
              <div>
                <strong>{seleccion.length}</strong> de {candidatas.length} publicaciones con contenido
                entran en el lote. El modo «{MODOS_META[modo].label}» admite {tope}.
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)", marginTop: "var(--sp-1)" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: "var(--tap-sm)", fontSize: "var(--fs-3xs)" }}
                  aria-expanded={listaAbierta}
                  aria-controls={idLista}
                  onClick={() => setListaAbierta((v) => !v)}
                >
                  <Icon name={listaAbierta ? "chevronUp" : "chevronDown"} />
                  {listaAbierta ? "Ocultar la lista" : "Elegir cuáles"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: "var(--tap-sm)", fontSize: "var(--fs-3xs)" }}
                  disabled={!quedan}
                  onClick={siguienteTanda}
                  title={quedan
                    ? "Marca las que vienen después de la última elegida"
                    : "No queda ninguna publicación después de la última elegida"}
                >
                  Las siguientes {Math.min(tope, quedan)}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: "var(--tap-sm)", fontSize: "var(--fs-3xs)" }}
                  onClick={() => setElegidas(new Set(primeras(candidatas, tope)))}
                >
                  Las primeras {Math.min(tope, candidatas.length)}
                </button>
              </div>

              {listaAbierta && (
                <ul id={idLista} style={{ listStyle: "none", margin: "var(--sp-2) 0 0", padding: 0, maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {candidatas.map((p) => {
                    const marcada = elegidas.has(p.id);
                    const lleno = !marcada && elegidas.size >= tope;
                    return (
                      <li key={p.id}>
                        <label
                          style={{
                            display: "flex", alignItems: "flex-start", gap: "var(--sp-1)",
                            minHeight: "var(--tap-sm)", padding: "var(--sp-1)",
                            borderRadius: "var(--radius-sm)",
                            background: marcada ? "var(--accent-soft)" : "transparent",
                            opacity: lleno ? 0.45 : 1,
                            cursor: lleno ? "not-allowed" : "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={marcada}
                            disabled={lleno}
                            onChange={() => alternar(p.id)}
                            style={{ marginTop: 2 }}
                          />
                          <span>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{p._date}</span>
                            {" · "}{p.format || "post"}
                            {p._concept ? ` · ${p._concept}` : ""}
                            <span style={{ display: "block", color: "var(--text-dim)" }}>
                              {(p.idea || p.descripcion || p.guion || p.script || "").slice(0, 90) || "sin idea escrita"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {elegidas.size >= tope && candidatas.length > tope && (
                <div style={{ marginTop: "var(--sp-1)", color: "var(--text-dim)" }}>
                  Llegaste al tope del modo. Desmarca una para poder marcar otra, o genera
                  este lote y vuelve con «Las siguientes».
                </div>
              )}
              <div style={{ color: "var(--text-dim)" }}>
                Receta visual: {receta
                  ? (desdeJson ? "leída de 05_receta.json, sin IA" : "compilada con IA desde la prosa del ADN")
                  : "sin leer todavía"}
              </div>
              <div style={{ color: client.logo ? "var(--text-dim)" : "var(--accent-alt, #F5A623)" }}>
                Logo del cliente: {client.logo ? "cargado, se ofrece para pegar en el HTML" : "sin cargar — el HTML pedirá que lo cargues a mano"}
              </div>
            </div>

            {faltan.length > 0 && (
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, marginBottom: "var(--sp-1)" }}>
                  Falta en el ADN, y no se inventa:
                </div>
                <ul style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", paddingLeft: "var(--sp-3)", lineHeight: 1.7 }}>
                  {faltan.map((f) => (
                    <li key={f.que} style={{ color: f.critico ? "var(--text-muted)" : undefined }}>
                      {f.que} — <code style={{ fontSize: "var(--fs-3xs)" }}>{f.donde}</code>
                      {f.critico && " · imprescindible"}
                    </li>
                  ))}
                </ul>
                {bloqueado && (
                  <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginTop: "var(--sp-2)", lineHeight: 1.6 }}>
                    Sin esos datos el prompt sale con huecos, y un hueco es lo que
                    hace improvisar a Meta AI. Complétale a {client.name} su{" "}
                    <code style={{ fontSize: "var(--fs-3xs)" }}>01_ADN_y_Memoria/05_receta.json</code>{" "}
                    en el repositorio y vuelve a abrir esto.
                  </p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              {client.githubRepo && (
                <button className="btn btn-ghost" onClick={releer}>
                  <Icon name="refresh" size={16} /> Releer receta
                </button>
              )}
              <button className="btn btn-primary" onClick={generar} disabled={!seleccion.length || bloqueado}>
                <Icon name="wand" size={16} /> Generar prompt
              </button>
            </div>

            {!seleccion.length && (
              <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginTop: "var(--sp-2)" }}>
                Ninguna publicación de este calendario tiene idea ni contenido todavía.
              </p>
            )}
          </>
        )}

        {(fase === "trabajando" || fase === "cargando") && (
          <div style={{ padding: "var(--sp-4) 0", textAlign: "center", fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
            <div className="progress-bar" style={{ marginBottom: "var(--sp-3)" }}>
              <div className="progress-fill" style={{ width: "100%", opacity: .5 }} />
            </div>
            <div>{estado || "Trabajando…"}</div>
          </div>
        )}

        {fase === "listo" && (
          <>
            {faltan.length > 0 && (
              <div style={{ marginBottom: "var(--sp-3)", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "var(--sp-2)" }}>
                <div style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, marginBottom: "var(--sp-1)" }}>Qué no incluye</div>
                <ul style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", paddingLeft: "var(--sp-3)", lineHeight: 1.6 }}>
                  {faltan.map((f) => (
                    <li key={f.que}>{f.que} — <code style={{ fontSize: "var(--fs-3xs)" }}>{f.donde}</code></li>
                  ))}
                </ul>
              </div>
            )}

            <label className="label" htmlFor={idPrompt}>
              El prompt — {prompt.length.toLocaleString("es-PA")} caracteres. Pégalo entero en Meta AI.
            </label>
            <textarea
              id={idPrompt}
              className="input"
              readOnly
              value={prompt}
              rows={16}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "var(--fs-3xs)", lineHeight: 1.5, resize: "vertical", marginBottom: "var(--sp-3)" }}
            />

            <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={() => setFase("config")}>Volver</button>
              {client.logo && (
                <button className="btn btn-ghost" onClick={copiarLogo}>
                  <Icon name="image" size={16} /> Copiar el logo
                </button>
              )}
              <button className="btn btn-ghost" onClick={descargar}>
                <Icon name="download" size={16} /> Descargar .txt
              </button>
              <button className="btn btn-primary" onClick={copiar}>
                <Icon name="copy" size={16} /> Copiar prompt
              </button>
            </div>
          </>
        )}

        {diag && (
          <div style={{ marginTop: "var(--sp-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--sp-2)" }}>
            <button
              className="btn btn-ghost"
              onClick={() => setDiagAbierto((d) => !d)}
              aria-expanded={diagAbierto}
              aria-controls={idDiag}
              style={{ fontSize: "var(--fs-2xs)", padding: "var(--sp-1) 0" }}
            >
              <Icon name="terminal" size={14} /> {diagAbierto ? "Ocultar" : "Ver"} diagnóstico
            </button>
            {diagAbierto && (
              <div id={idDiag} style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", lineHeight: 1.7, marginTop: "var(--sp-2)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                <div>
                  Receta leída de{" "}
                  <strong style={{ color: diag.origen === "json" ? "var(--text-muted)" : "var(--accent-alt, #F5A623)" }}>
                    {diag.origen === "json" ? "05_receta.json — sin IA" : "prosa, compilada con IA"}
                  </strong>
                </div>
                <div>
                  Función github-adn: v{diag.version}
                  {diag.version < 2 && <strong style={{ color: "var(--accent-alt, #F5A623)" }}> · DESFASADA, hace falta v2</strong>}
                </div>
                <div>ADN leído: {(diag.totalChars || 0).toLocaleString("es-PA")} caracteres{diag.truncado ? " · SE RECORTÓ ALGO" : ""}</div>
                <div style={{ marginTop: "var(--sp-1)" }}>Archivos:</div>
                <ul style={{ paddingLeft: "var(--sp-3)" }}>
                  {diag.archivos.map((a) => (
                    <li key={a.nombre}>
                      {a.nombre} · {a.papel} · {a.chars?.toLocaleString("es-PA")} car.
                      {a.recortado ? " · RECORTADO" : ""}
                    </li>
                  ))}
                </ul>
                {diag.assets.length > 0 && <div>Assets visuales: {diag.assets.join(", ")}</div>}
                <div style={{ marginTop: "var(--sp-1)" }}>
                  Campos vacíos: {diag.vacios.length ? diag.vacios.join(", ") : "ninguno"}
                </div>
                {diag.avisoJson && <div style={{ marginTop: "var(--sp-1)" }}>Error del JSON: {diag.avisoJson}</div>}
                {gasto && (
                  <div style={{ marginTop: "var(--sp-2)" }}>
                    <div><strong>Gasto real del lote</strong> · {gasto.tandas} tanda{gasto.tandas === 1 ? "" : "s"}</div>
                    <div>Entrada: {gasto.entrada.toLocaleString("es-PA")} tokens</div>
                    <div>Salida: {gasto.salida.toLocaleString("es-PA")} tokens</div>
                    <div>
                      Caché: {gasto.cacheLeido.toLocaleString("es-PA")} leídos ·{" "}
                      {gasto.cacheEscrito.toLocaleString("es-PA")} escritos
                      {gasto.tandas > 1 && gasto.cacheLeido === 0
                        ? " — la caché NO está funcionando"
                        : ""}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
