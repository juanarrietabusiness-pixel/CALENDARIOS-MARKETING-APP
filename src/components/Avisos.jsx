import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { pedir } from "../lib/db";
import { navegar } from "../lib/rutas";

// ============================================================
// La campana: la bandeja de avisos de cada persona
//
// Te asignaron algo, el cliente aprobó o pidió cambios en algo tuyo, algo
// no se publicó, te mencionaron. Se guarda en el servidor, así que llega
// aunque no estuvieras conectado. Es un desplegable (Escape y clic fuera),
// no un diálogo.
//
// «Avisarme en este navegador» usa las notificaciones del sistema: salen
// aunque la pestaña esté en segundo plano, mientras siga abierta.
// ============================================================

const cuando = (iso) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short" });
};

const puedeNotificar = () => typeof window !== "undefined" && "Notification" in window;

export default function Avisos({ pulso = 0, onAbrirPublicacion }) {
  const [datos, setDatos] = useState({ avisos: [], sinLeer: 0 });
  const [abierto, setAbierto] = useState(false);
  const [permiso, setPermiso] = useState(() => (puedeNotificar() ? Notification.permission : "denied"));
  const caja = useRef(null);
  const boton = useRef(null);
  const vistos = useRef(null);
  const id = useId();

  const cargar = useCallback(async () => {
    try {
      const r = await pedir("/avisos");
      if (!r) return;
      // Lo nuevo desde la última lectura, al sistema (si se dio permiso).
      if (vistos.current && puedeNotificar() && Notification.permission === "granted") {
        for (const a of r.avisos.filter((x) => !x.leido && !vistos.current.has(x.id)).slice(0, 3)) {
          try { new Notification("Juancito Ads", { body: a.texto, tag: a.id }); } catch { /* sin soporte */ }
        }
      }
      vistos.current = new Set(r.avisos.map((a) => a.id));
      setDatos(r);
    } catch { /* la campana no debe romper la cabecera */ }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, pulso]);
  // Red por si el socket está caído: una lectura corta cada dos minutos.
  useEffect(() => {
    const t = setInterval(() => { void cargar(); }, 120_000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    window.addEventListener("pointerdown", fuera, true);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const leer = async (cuerpo) => {
    try { await pedir("/avisos/leer", { method: "POST", body: JSON.stringify(cuerpo) }); } catch { /* se reintenta al abrir otra vez */ }
    void cargar();
  };

  const abrir = (a) => {
    setAbierto(false);
    if (!a.leido) void leer({ ids: [a.id] });
    if (!a.enlace) return;
    const u = new URL(a.enlace, window.location.origin);
    const post = u.searchParams.get("publicacion");
    const [, , clientId, calendarId] = u.pathname.split("/").map(decodeURIComponent);
    if (post && clientId && calendarId && onAbrirPublicacion) onAbrirPublicacion({ clientId, calendarId, postId: post });
    else navegar(u.pathname);
  };

  const pedirPermiso = async () => {
    if (!puedeNotificar()) return;
    try { setPermiso(await Notification.requestPermission()); } catch { /* el navegador lo negó */ }
  };

  const n = datos.sinLeer;
  return (
    <div className="avisos" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="btn-icon avisos-boton"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={n ? `Avisos: ${n} sin leer` : "Avisos"}
        onClick={() => setAbierto((v) => !v)}
      >
        <Icon name="bell" />
        {n > 0 && <span className="avisos-numero" aria-hidden="true">{n > 9 ? "9+" : n}</span>}
      </button>
      {abierto && (
        <div id={id} className="avisos-panel" role="group" aria-label="Avisos">
          <div className="avisos-cabecera">
            <strong>Avisos</strong>
            {n > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => leer({ todos: true })}>Marcar todo leído</button>}
          </div>
          {datos.avisos.length ? (
            <ul className="avisos-lista">
              {datos.avisos.map((a) => (
                <li key={a.id}>
                  <button type="button" className="avisos-item" data-leido={a.leido || undefined} onClick={() => abrir(a)}>
                    <span className="avisos-texto">{a.texto}</span>
                    <span className="avisos-cuando">{cuando(a.fecha)}{a.leido ? "" : " · nuevo"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="avisos-vacio">Nada por aquí. Te llegará lo que te asignen, lo que responda el cliente en lo tuyo y lo que no se publique.</p>
          )}
          {puedeNotificar() && permiso === "default" && (
            <button type="button" className="btn btn-secondary btn-sm avisos-permiso" onClick={pedirPermiso}>
              <Icon name="bell" size={14} /> Avisarme también en este navegador
            </button>
          )}
        </div>
      )}
    </div>
  );
}
