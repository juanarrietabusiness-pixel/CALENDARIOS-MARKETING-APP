import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { Interruptor } from "./Interruptor";
import {
  leerSalud, leerSaldos, estadoPush, activarPush, desactivarPush, probarPush, quitarDispositivo, soportaPush, esIPhoneSinInstalar,
} from "../lib/saludApi";
import "./SeccionSalud.css";

// ============================================================
// Ajustes → Salud y avisos (en diferido: su chunk)
//
// Para TODOS: «Recibir avisos en este dispositivo» (Web Push: lo importante llega al teléfono aunque la aplicación esté
// cerrada). Para el ADMINISTRADOR: la salud del sistema —cada tarea del cron (si corre, si falla y por qué, si se está
// saltando), cada proveedor con la llave del servidor (último éxito, último error, el saldo que se puede leer gratis) y
// cada integración del espacio (publicar y medir en Meta, TikTok y YouTube; Drive)—. Lo de publicar y medir sale de la
// cola y de la foto de métricas; lo demás lo apunta el servidor cuando las llamadas ocurren (worker/lib/salud.js).
// ============================================================

const ESTADOS = {
  bien: { texto: "Bien", icono: "checkCircle" },
  falla: { texto: "Falla", icono: "alert" },
  "en-pausa": { texto: "Falla · en pausa", icono: "pause" },
  "sin-saldo": { texto: "Sin saldo", icono: "alert" },
  "sin-datos": { texto: "Sin datos aún", icono: "clock" },
  "sin-configurar": { texto: "Sin conectar", icono: "plug" },
};

const relativo = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
/** «hace 5 minutos», «hace 2 horas», «ayer». */
function hace(iso, ahora = Date.now()) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const s = Math.round((t - ahora) / 1000);
  const a = Math.abs(s);
  if (a < 60) return "hace un momento";
  if (a < 3600) return relativo.format(Math.round(s / 60), "minute");
  if (a < 86_400) return relativo.format(Math.round(s / 3600), "hour");
  return relativo.format(Math.round(s / 86_400), "day");
}
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" }) : "");

function Estado({ estado }) {
  const e = ESTADOS[estado] ?? ESTADOS["sin-datos"];
  return <span className="badge salud-estado" data-estado={estado}><Icon name={e.icono} size={13} /> {e.texto}</span>;
}

/** Una fila: nombre y estado arriba; debajo, qué es, el último éxito y el último error. */
function Fila({ nombre, que, estado, okAt, errorAt, error, extra }) {
  const conError = errorAt && error && (!okAt || errorAt >= okAt || estado !== "bien");
  return (
    <li className="salud-fila" data-estado={estado}>
      <div className="salud-fila-cabecera">
        <span className="salud-nombre">{nombre}</span>
        <Estado estado={estado} />
      </div>
      {que && <p className="hint salud-que">{que}</p>}
      <p className="salud-detalle">
        {okAt ? <>Último éxito: {hace(okAt)}.</> : estado === "sin-configurar" ? null : <>Sin éxitos apuntados todavía.</>}
        {extra ? <> {extra}</> : null}
      </p>
      {conError && <p className="salud-error"><Icon name="alert" size={13} /> {hace(errorAt)}: {error}</p>}
    </li>
  );
}

function AvisosEnEsteDispositivo() {
  const [estado, setEstado] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState("");
  const [fallo, setFallo] = useState("");

  const cargar = useCallback(() => {
    estadoPush().then(setEstado).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const hacer = async (clave, accion) => {
    setTrabajando(clave);
    setFallo("");
    setAviso("");
    try { await accion(); } catch (e) { setFallo(e.message); }
    setTrabajando("");
    cargar();
  };

  const cambiar = (on) => hacer("interruptor", async () => {
    if (on) {
      await activarPush(estado?.clave);
      setAviso("Listo: este dispositivo recibirá los avisos importantes. Prueba con «Mandar un aviso de prueba».");
    } else {
      await desactivarPush();
      setAviso("Este dispositivo ya no recibirá avisos.");
    }
  });
  const probar = () => hacer("prueba", async () => {
    const r = await probarPush();
    setAviso(r.enviados ? `Aviso de prueba enviado a ${r.enviados} ${r.enviados === 1 ? "dispositivo" : "dispositivos"}.` : "No llegó a ningún dispositivo.");
  });

  const iPhone = esIPhoneSinInstalar();
  const soportado = soportaPush();
  const bloqueado = estado?.permiso === "denied";
  const motivo = !soportado
    ? (iPhone ? null : "Este navegador no puede recibir avisos.")
    : bloqueado ? "El navegador tiene los avisos bloqueados para esta aplicación: permítelos en sus ajustes." : null;

  return (
    <div className="salud-bloque">
      <h3 className="salud-subtitulo"><Icon name="bell" size={16} /> Avisos en este dispositivo</h3>
      <p className="hint" style={{ margin: 0 }}>
        Lo importante te llega al teléfono aunque la aplicación esté cerrada: una publicación que no salió, el cliente que pidió cambios o
        terminó su revisión, lo que termina o falla en el Estudio, la hora de publicar a mano y un saldo que se acabó. Lo demás sigue sólo en la campana.
      </p>
      {iPhone && (
        <p className="notice" style={{ margin: 0 }}>
          En el iPhone los avisos sólo llegan con la aplicación INSTALADA: en Safari, toca Compartir → «Añadir a pantalla de inicio», ábrela desde
          ahí y vuelve aquí para encenderlos.
        </p>
      )}
      <div className="interruptor-fila">
        <div className="interruptor-texto">
          <span id="salud-push-etiqueta" className="interruptor-etiqueta" data-desactivado={!soportado || bloqueado || undefined}>Recibir avisos en este dispositivo</span>
          {motivo && <p id="salud-push-motivo" className="hint interruptor-motivo" style={{ margin: 0 }}>{motivo}</p>}
        </div>
        <Interruptor
          encendido={Boolean(estado?.suscrito)} onCambiar={cambiar} etiquetadoPor="salud-push-etiqueta"
          descritoPor={motivo ? "salud-push-motivo" : undefined}
          disabled={!estado || !soportado || bloqueado || Boolean(trabajando)}
        />
      </div>
      <div role="status" aria-live="polite">{aviso && <p className="notice notice-ok" style={{ margin: 0 }}>{aviso}</p>}</div>
      {fallo && <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{fallo}</p>}
      {estado?.dispositivos?.length > 0 && (
        <>
          <ul className="salud-dispositivos" aria-label="Tus dispositivos con avisos">
            {estado.dispositivos.map((d) => (
              <li key={d.id}>
                <Icon name="bell" size={14} />
                <span className="salud-dispositivo-nombre">{d.dispositivo || "Dispositivo"}</span>
                <span className="hint" style={{ margin: 0 }}>desde {hace(d.desde)}</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)}
                  onClick={() => hacer(`quitar-${d.id}`, () => quitarDispositivo(d.endpoint))}
                  aria-label={`Quitar ${d.dispositivo || "este dispositivo"}`}>
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={probar} disabled={Boolean(trabajando)} aria-busy={trabajando === "prueba" || undefined}>
            <Icon name="send" size={16} /> {trabajando === "prueba" ? "Mandando…" : "Mandar un aviso de prueba"}
          </button>
        </>
      )}
    </div>
  );
}

function SaludDelSistema({ pulso }) {
  const [datos, setDatos] = useState(null);
  const [saldos, setSaldos] = useState(null);
  const [fallo, setFallo] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback((otraVez = false) => {
    setCargando(true);
    setFallo("");
    Promise.all([
      leerSalud().then(setDatos),
      leerSaldos(otraVez).then((r) => setSaldos(r.saldos)).catch(() => setSaldos(null)),
    ]).catch((e) => setFallo(e.message)).finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const enProblemas = datos
    ? [...datos.tareas, ...datos.proveedores, ...datos.integraciones].filter((x) => ["falla", "en-pausa", "sin-saldo"].includes(x.estado)).length
    : 0;

  return (
    <div className="salud-bloque">
      <div className="salud-cabecera">
        <h3 className="salud-subtitulo"><Icon name="bolt" size={16} /> Salud del sistema</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => cargar(true)} disabled={cargando} aria-busy={cargando || undefined}>
          <Icon name="refresh" size={14} /> {cargando ? "Mirando…" : "Volver a mirar"}
        </button>
      </div>
      {fallo && <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{fallo}</p>}
      {!datos && !fallo && <p className="hint" style={{ margin: 0 }}>Cargando…</p>}
      {datos && (
        <>
          <p className={`notice${datos.cronParado || enProblemas ? " notice-error" : " notice-ok"}`} style={{ margin: 0 }} role="status">
            {datos.cronParado
              ? `El cron no ha corrido desde ${hace(datos.cronVisto)}: no se publica ni se avanza nada solo. Revisa el Worker en Cloudflare.`
              : enProblemas
                ? `${enProblemas} ${enProblemas === 1 ? "cosa falla" : "cosas fallan"} ahora mismo: abajo dice cuál y por qué. Lo que falla se salta un rato y lo demás sigue.`
                : "Todo funciona: el cron corre y nada está fallando."}
          </p>

          <h4 className="salud-grupo">Tareas automáticas (cada minuto)</h4>
          <ul className="salud-lista">
            {datos.tareas.map((t) => (
              <Fila key={t.id} nombre={t.nombre} que={t.que} estado={t.estado} okAt={t.okAt} errorAt={t.errorAt} error={t.error}
                extra={t.estado === "en-pausa"
                  ? `${t.fallos} fallos seguidos: se salta hasta las ${hora(t.saltarHasta)} y lo demás sigue.`
                  : t.trabajoAt ? `Con trabajo por última vez ${hace(t.trabajoAt)}.` : ""} />
            ))}
          </ul>

          <h4 className="salud-grupo">Proveedores (con la llave del servidor)</h4>
          <ul className="salud-lista">
            {datos.proveedores.map((p) => {
              const s = saldos?.[p.id];
              const saldo = !p.configurado ? `Falta la llave ${p.llave} en los secretos del Worker.`
                : p.leeSaldo ? (s ? `Saldo: ${s.texto}` : "") : "Saldo: sin consulta; se sabe cuando un pedido falla por saldo (y se avisa).";
              return (
                <Fila key={p.id} nombre={p.nombre} estado={s?.bajo && p.estado === "bien" ? "sin-saldo" : p.estado}
                  okAt={p.okAt} errorAt={p.errorAt} error={p.error}
                  extra={[saldo, p.estado === "sin-saldo" && p.recargar ? `Recárgalo en ${p.recargar}.` : ""].filter(Boolean).join(" ")} />
              );
            })}
          </ul>

          <h4 className="salud-grupo">Integraciones de este espacio</h4>
          <ul className="salud-lista">
            {datos.integraciones.map((i) => (
              <Fila key={i.id} nombre={i.nombre} estado={i.estado} okAt={i.okAt} errorAt={i.errorAt} error={i.error}
                extra={i.conectado ? "" : "No está conectado (Ajustes → Integraciones)."} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function SeccionSalud({ esAdmin = false, pulso = 0 }) {
  // Se llega con «#salud» desde la campana: la sección llega en diferido y Ajustes no la encontraba al montar.
  useEffect(() => {
    if (window.location.hash === "#salud") requestAnimationFrame(() => document.getElementById("salud")?.scrollIntoView({ block: "start" }));
  }, []);
  return (
    <section id="salud" className="ajustes-seccion" aria-labelledby="ajustes-salud">
      <h2 className="ajustes-titulo" id="ajustes-salud"><Icon name="bell" size={18} /> Salud y avisos</h2>
      <p className="ajustes-intro">
        Que nada falle en silencio: los avisos importantes en tu teléfono y, para el administrador, qué funciona y qué no, con su motivo.
      </p>
      <div className="salud">
        <AvisosEnEsteDispositivo />
        {esAdmin
          ? <SaludDelSistema pulso={pulso} />
          : <p className="hint" style={{ margin: 0 }}>La salud del sistema (el cron, los proveedores y sus saldos) la ve el administrador.</p>}
      </div>
    </section>
  );
}
