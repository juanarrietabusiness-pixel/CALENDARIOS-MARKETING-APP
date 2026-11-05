import { useCallback, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { leerCreditosSC, guardarTopeSC, releerAnunciosSC } from "../lib/loMejorApi";
import "./LoMejor.css";

// ============================================================
// Ajustes → Integraciones: Scrape Creators (la Biblioteca de anuncios y «Lo mejor»)
//
// La llave vive SÓLO en el Worker (`SCRAPECREATORS_API_KEY`): aquí se dice si
// está y se escoge el TOPE de créditos por semana del espacio (10 por defecto)
// para la relectura automática de las búsquedas guardadas, que alimenta «Lo
// mejor». Lo que se busca a mano en la Biblioteca también suma al contador: el
// automático se para antes. 0 apaga la relectura automática.
// ============================================================

export default function SeccionScrapeCreators({ esAdmin = false, pulso = 0 }) {
  const ids = useId();
  const [estado, setEstado] = useState(null);
  const [tope, setTope] = useState("");
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");

  const cargar = useCallback(() => {
    leerCreditosSC().then((e) => { setEstado(e); setTope(String(e.tope)); }).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const hacer = async (clave, accion) => {
    setTrabajando(clave);
    setFallo("");
    setAviso("");
    try { await accion(); } catch (e) { setFallo(e.message); }
    setTrabajando("");
    cargar();
  };

  const guardar = (e) => {
    e.preventDefault();
    void hacer("tope", async () => {
      await guardarTopeSC(Number(tope));
      setAviso(Number(tope) === 0 ? "La relectura automática queda apagada." : `Tope guardado: ${tope} créditos por semana.`);
    });
  };
  const releer = () => hacer("releer", async () => {
    const r = await releerAnunciosSC();
    setAviso(`Releídas ${r.filtros} búsquedas: ${r.anuncios} anuncios, ${r.creditos} ${r.creditos === 1 ? "crédito" : "créditos"}.${r.sinCreditos ? " Se paró en el tope de la semana." : ""}${r.errores?.length ? ` No se pudo: ${r.errores.join("; ")}` : ""}`);
  });

  return (
    <div className="integracion" id="scrape-creators">
      <div className="integracion-cabecera">
        <span className="integracion-icono" aria-hidden="true"><Icon name="megaphone" size={22} /></span>
        <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Scrape Creators (anuncios de la competencia)</p>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            La Biblioteca de anuncios entera y, en «Lo mejor», los anuncios de tus búsquedas guardadas, releídos una vez por semana.
            Instagram no gasta créditos: va por la API de Meta.
          </p>
        </div>
        {estado && (
          <span className={`badge ${estado.sc ? "badge-ok" : ""}`} data-estado={estado.sc ? "ok" : "sin-configurar"}>
            {estado.sc ? "Conectado" : "Sin llave"}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite">{aviso && <p className="notice notice-ok">{aviso}</p>}</div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {estado && !estado.sc && (
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
          Falta la llave: en Cloudflare → Worker → <strong>Settings → Variables and Secrets</strong>, añádela como <strong>Secret</strong> con el nombre <code>SCRAPECREATORS_API_KEY</code>.
        </p>
      )}

      {estado && (
        <>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
            Esta semana: <strong>{estado.total}</strong> de {estado.tope} créditos ({estado.manual} a mano, {estado.auto} automáticos).
            {estado.releidoAt ? ` Última relectura: ${new Date(estado.releidoAt).toLocaleString("es-PA", { dateStyle: "medium", timeStyle: "short" })}.` : " Todavía no se ha releído."}
          </p>
          <form className="lo-mejor-creditos" onSubmit={guardar}>
            <div className="field">
              <label className="label" htmlFor={`${ids}-tope`}>Tope de créditos por semana</label>
              <input id={`${ids}-tope`} className="input" type="number" min="0" max="500" step="1" inputMode="numeric" value={tope}
                onChange={(e) => setTope(e.target.value)} disabled={!esAdmin || Boolean(trabajando)} />
            </div>
            {esAdmin && <button type="submit" className="btn btn-secondary" disabled={Boolean(trabajando) || tope === String(estado.tope)}>Guardar el tope</button>}
            {estado.sc && (
              <button type="button" className="btn btn-ghost" onClick={releer} disabled={Boolean(trabajando)} aria-busy={trabajando === "releer" || undefined}>
                <Icon name="refresh" size={16} /> {trabajando === "releer" ? "Releyendo…" : "Releer ahora"}
              </button>
            )}
          </form>
          {!esAdmin && <p className="hint" style={{ margin: 0 }}>El tope lo cambia quien administra el espacio.</p>}
        </>
      )}
    </div>
  );
}
