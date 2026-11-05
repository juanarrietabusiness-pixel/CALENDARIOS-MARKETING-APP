import { useCallback, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { leerCreditosSC, guardarTopeSC, guardarTendenciasSC, releerAnunciosSC } from "../lib/loMejorApi";
import "./LoMejor.css";

// ============================================================
// Ajustes → Integraciones: Scrape Creators (anuncios y TikTok)
//
// La llave vive SÓLO en el Worker (`SCRAPECREATORS_API_KEY`): aquí se dice si
// está y se escoge el TOPE de créditos por semana del espacio (10 por defecto)
// para lo automático de «Lo mejor»: la relectura de las búsquedas guardadas de
// anuncios, las cuentas de TikTok de cada cliente y las tendencias de sus
// palabras. Todo comparte el MISMO tope y va lo más viejo primero; lo que no
// cabe espera a la semana siguiente, y aquí se dice qué espera. Lo que se busca
// a mano también suma al contador (no se bloquea): el automático se para antes.
// 0 apaga lo automático. El interruptor apaga las tendencias de TikTok.
// ============================================================

/** «faltan 3 cuentas de TikTok por leer · 2 palabras de tendencia · los anuncios de 4 búsquedas». */
function textoEspera(espera, tendencias) {
  if (!espera) return "";
  const partes = [
    espera.tiktok ? `${espera.tiktok} ${espera.tiktok === 1 ? "cuenta" : "cuentas"} de TikTok` : "",
    tendencias && espera.palabras ? `${espera.palabras} ${espera.palabras === 1 ? "palabra" : "palabras"} de tendencia` : "",
    espera.anuncios ? `los anuncios de ${espera.busquedas} ${espera.busquedas === 1 ? "búsqueda" : "búsquedas"}` : "",
  ].filter(Boolean);
  return partes.length ? `Faltan por leer: ${partes.join(" · ")}.` : "Todo está leído esta semana.";
}

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
  const cambiarTendencias = (e) => {
    const activas = e.target.checked;
    void hacer("tendencias", async () => {
      await guardarTendenciasSC(activas);
      setAviso(activas ? "Tendencias de TikTok encendidas: las palabras de cada cliente se buscan una vez por semana." : "Tendencias de TikTok apagadas.");
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
          <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Scrape Creators (anuncios y TikTok)</p>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            La Biblioteca de anuncios entera y, en «Lo mejor», los anuncios de tus búsquedas guardadas, las cuentas de TikTok de cada
            cliente y las tendencias de sus palabras, una vez por semana y dentro del tope. Instagram no gasta créditos: va por la API de Meta.
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
            {estado.sc && ` ${textoEspera(estado.espera, estado.tendencias)}`}
            {estado.sc && estado.total >= estado.tope && estado.tope > 0 && " Lo que no cupo espera a la semana que viene (el lunes)."}
            {estado.sc && estado.tope === 0 && " Con el tope en 0 no se lee nada solo."}
            {estado.releidoAt ? ` Última relectura de anuncios: ${new Date(estado.releidoAt).toLocaleString("es-PA", { dateStyle: "medium", timeStyle: "short" })}.` : ""}
          </p>
          {estado.total > estado.tope && (
            <p className="hint" style={{ margin: 0 }}>Se pasó del tope por lo buscado a mano: eso no se bloquea, pero lo automático no gasta más esta semana.</p>
          )}
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
          <label className="casilla" htmlFor={`${ids}-tendencias`}>
            <input id={`${ids}-tendencias`} type="checkbox" checked={estado.tendencias !== false} onChange={cambiarTendencias}
              disabled={!esAdmin || Boolean(trabajando)} aria-describedby={`${ids}-tendencias-nota`} />
            <span>Tendencias de TikTok</span>
          </label>
          <p id={`${ids}-tendencias-nota`} className="hint" style={{ margin: 0 }}>
            Las palabras o #hashtags que cada cliente tiene en Inspiración → Cuentas: los videos con más vistas de la semana, un crédito por palabra.
          </p>
          {!esAdmin && <p className="hint" style={{ margin: 0 }}>El tope y las tendencias los cambia quien administra el espacio.</p>}
        </>
      )}
    </div>
  );
}
