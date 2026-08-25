import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { loadADN, cargarReceta, generateMetaPieces, fetchGitHubADN } from "../api";
import { buildMetaMasterPrompt, faltantesDeReceta, faltantesCriticos, avisosDeComposicion, MODOS_META } from "../metaPrompt";
import { MONTHS } from "../constants";

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

  const [modo, setModo] = useState("lote");
  const [tema, setTema] = useState(cal?.campaign || "");
  const [publico, setPublico] = useState("");
  const [fase, setFase] = useState("config");
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [faltan, setFaltan] = useState(() => (client.metaRecipe ? faltantesDeReceta(client.metaRecipe) : []));
  const [aviso, setAviso] = useState("");
  const [diag, setDiag] = useState(null);
  const [diagAbierto, setDiagAbierto] = useState(false);

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
  const seleccion = candidatas.slice(0, tope);

  const recetaSlug = `${(client.name || "marca").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const generar = async () => {
    setError("");
    setAviso("");
    setFase("trabajando");

    try {
      // ---- 1. El ADN, del repositorio ----
      setEstado("Leyendo el ADN del repositorio…");
      const adn = await loadADN(client, { forzar: true });
      if (!adn.content) {
        throw new Error(
          "Este cliente no tiene ADN conectado. Ábrelo en «Editar cliente» → pestaña GitHub y conecta su carpeta del repositorio."
        );
      }
      if (adn.truncated) {
        setAviso("El ADN es más largo que el presupuesto de lectura y se recortó por lo menos prioritario. La receta y las guías de marca sí entraron completas.");
      }

      // ---- 2. La receta ----
      // Siempre se relee: con 05_receta.json es instantáneo y gratis, así
      // que cachearla sólo servía para arrastrar una versión vieja.
      setEstado(adn.sections?.recetaJson
        ? "Leyendo la receta del repositorio…"
        : "Compilando la receta visual del cliente…");
      const { receta, origen, avisoJson } = await cargarReceta(adn, client);
      receta.slug = receta.slug || recetaSlug;
      setDiag(construirDiag(adn, receta, origen, avisoJson));
      if (avisoJson) {
        setAviso(`El 05_receta.json de ${client.name} no se pudo leer (${avisoJson}), así que se compiló con IA. Revisa ese archivo.`);
      }
      onPersistClient?.({
        ...client,
        metaRecipe: receta,
        metaRecipeSha: adn.recipeSha || "",
        metaRecipeAt: new Date().toISOString(),
      });

      const pendientes = faltantesDeReceta(receta);
      setFaltan(pendientes);

      // Con el sistema visual incompleto no se emite. El estándar es
      // explícito: si un dato no está, se pide — no se rellena.
      const criticos = pendientes.filter((x) => x.critico);
      if (criticos.length) {
        throw new Error(
          `El sistema visual de ${client.name} está incompleto: falta ${criticos.length === 1 ? "1 dato" : `${criticos.length} datos`}. ` +
          `Créale su 01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md en el repositorio y vuelve a recompilar la receta.`
        );
      }

      // ---- 3. Las piezas ----
      setEstado(`Escribiendo ${seleccion.length} piezas…`);
      const piezas = await generateMetaPieces({
        client,
        calendar: cal,
        receta,
        posts: seleccion,
        modo,
        tema,
        adnTexto: adn.content,
      });

      // ---- 4. El ensamblado, sin IA ----
      setEstado("Armando el prompt…");
      // La composición puede descubrir un titular que no cabe en el cuerpo
      // más pequeño. Eso lo arregla el humano acortando la línea, no Meta AI.
      const problemas = avisosDeComposicion(receta, piezas);
      if (problemas.length) {
        setAviso(problemas.join(" "));
      }
      setPrompt(buildMetaMasterPrompt({ receta, piezas, modo, tema, publico }));
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

  const recompilar = async () => {
    setError("");
    setFase("trabajando");
    try {
      setEstado("Releyendo el repositorio…");
      const fresco = await fetchGitHubADN(client.githubRepo, client.githubFolder);
      setEstado(fresco.sections?.recetaJson
        ? "Leyendo la receta del repositorio…"
        : "Recompilando la receta visual…");
      const { receta, origen, avisoJson } = await cargarReceta(fresco, client);
      receta.slug = receta.slug || recetaSlug;
      setDiag(construirDiag(fresco, receta, origen, avisoJson));
      onPersistClient?.({
        ...client,
        githubContext: fresco.content,
        metaRecipe: receta,
        metaRecipeSha: fresco.recipeSha || "",
        metaRecipeAt: new Date().toISOString(),
      });
      const pendientes = faltantesDeReceta(receta);
      setFaltan(pendientes);
      const criticos = pendientes.filter((x) => x.critico);
      setEstado(criticos.length
        ? `Receta recompilada, pero siguen faltando ${criticos.length} datos del sistema visual.`
        : "Receta recompilada desde el repositorio.");
      setFase("config");
    } catch (e) {
      setError(e.message || "No se pudo recompilar la receta.");
      setFase("config");
    }
  };

  const tieneReceta = Boolean(client.metaRecipe);
  // Con receta compilada y datos críticos ausentes, generar sólo gastaría una
  // llamada para devolver un prompt con huecos.
  const bloqueado = tieneReceta && faltantesCriticos(client.metaRecipe).length > 0;

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
              <div><strong>{seleccion.length}</strong> publicaciones entran en el lote{candidatas.length > tope ? ` (de ${candidatas.length} con contenido; el modo «${MODOS_META[modo].label}» admite ${tope})` : ""}.</div>
              <div style={{ color: "var(--text-dim)" }}>
                Receta visual: {tieneReceta
                  ? <>compilada{client.metaRecipeAt ? ` el ${new Date(client.metaRecipeAt).toLocaleDateString("es-PA")}` : ""}</>
                  : "sin compilar — se compila en esta misma generación"}
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
                    hace improvisar a Meta AI. Créale a {client.name} su{" "}
                    <code style={{ fontSize: "var(--fs-3xs)" }}>01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md</code>{" "}
                    y recompila la receta.
                  </p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              {tieneReceta && client.githubRepo && (
                <button className="btn btn-ghost" onClick={recompilar}>
                  <Icon name="refresh" size={16} /> Recompilar receta
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

        {fase === "trabajando" && (
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
                <div>ADN leído: {diag.totalChars.toLocaleString("es-PA")} caracteres{diag.truncado ? " · SE RECORTÓ ALGO" : ""}</div>
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
