import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { REDES } from "../lib/publicacion";

// ============================================================
// Ajustes → Integraciones → Instagram y Facebook (Meta)
//
// Igual que Drive, tres estados y cada uno dice qué hacer: sin
// configurar (los pasos en Meta, con la dirección de vuelta EXACTA),
// configurado sin conectar (el botón), y conectado. Conectado añade lo
// que Drive no tiene: la lista de páginas e Instagram que llegaron, y a
// qué cliente va cada una. Sin esa asignación no se publica: el
// calendario de Café Luna no sabe solo cuál es su Instagram.
// ============================================================

function leerVuelta() {
  const p = new URLSearchParams(window.location.search);
  const meta = p.get("meta");
  if (!meta) return null;
  const vuelta = { ok: meta === "ok", motivo: p.get("motivo") ?? "" };
  window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  return vuelta;
}

const PERMISOS = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights", "business_management",
  "instagram_basic", "instagram_content_publish", "instagram_manage_insights", "instagram_manage_comments",
];

export default function SeccionMeta({ esAdmin, clients = [], pulso = 0 }) {
  const ids = useId();
  const [estado, setEstado] = useState(null);
  const [vuelta] = useState(leerVuelta);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState("");

  const cargar = useCallback(() => {
    db.estadoRedes().then(setEstado).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* sin portapapeles: el texto está seleccionable */ }
  };

  const hacer = async (clave, accion, ok = "") => {
    setTrabajando(clave);
    setFallo("");
    setAviso("");
    try {
      await accion();
      if (ok) setAviso(ok);
      cargar();
    } catch (e) {
      setFallo(e.message);
    }
    setTrabajando("");
  };

  const meta = estado?.meta;
  const cuentas = (estado?.cuentas ?? []).filter((c) => c.red === "instagram" || c.red === "facebook");
  const nombreCliente = (id) => clients.find((c) => (c.dbId || c.id) === id)?.name ?? "";

  return (
    <div className="integracion">
      <div className="integracion-cabecera">
        <span className="integracion-icono" aria-hidden="true"><Icon name="send" size={22} /></span>
        <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Instagram y Facebook</p>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            Publica y programa en las cuentas de tus clientes desde el calendario: feed, carrusel, reels e historias.
          </p>
        </div>
        {meta && (
          <span className={`badge ${meta.conectado ? "badge-ok" : ""}`} data-estado={meta.conectado ? "ok" : meta.configurado ? "pendiente" : "sin-configurar"}>
            {meta.conectado ? "Conectado" : meta.configurado ? "Sin conectar" : "Pendiente de configurar"}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite">
        {vuelta?.ok && <p className="notice notice-ok">Meta quedó conectado.{vuelta.motivo ? ` ${vuelta.motivo}` : ""}</p>}
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {vuelta && !vuelta.ok && (
        <p role="alert" className="notice notice-error">No se conectó: {vuelta.motivo || "Facebook no dio el permiso."}</p>
      )}
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {meta && !meta.configurado && (
        <div className="integracion-pasos">
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            Falta crear la app de Meta (unos 20 minutos, una sola vez, con el Facebook de la agencia). No hace falta la
            revisión de Meta: la app es tuya y quienes conectan tienen un rol en ella.
          </p>
          <ol>
            <li>
              En <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> →
              <strong> Crear app</strong>. Caso de uso <strong>Otro</strong>, tipo <strong>Empresa</strong>, y asóciala al
              portafolio comercial de la agencia.
            </li>
            <li>
              Añade los productos <strong>Inicio de sesión con Facebook para empresas</strong> e <strong>Instagram</strong>
              (configuración con inicio de sesión con Facebook).
            </li>
            <li>
              En <strong>Inicio de sesión con Facebook para empresas → Configuración</strong>, pega esta dirección en
              «URI de redireccionamiento de OAuth válidos»:
              <span className="integracion-uri">
                <code>{meta.redireccion}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(meta.redireccion)}>
                  <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
                </button>
              </span>
            </li>
            <li>
              En <strong>Configuraciones → Crear configuración</strong>: token de acceso <strong>de usuario</strong>, y marca
              estos permisos: <span className="permisos-meta">{PERMISOS.map((p) => <code key={p}>{p}</code>)}</span>
              Guarda y copia el <strong>ID de configuración</strong>.
            </li>
            <li>
              En <strong>Configuración de la app → Básica</strong>: copia el <strong>Identificador de la app</strong> y la
              <strong> Clave secreta</strong>, y pon como política de privacidad <code>{meta.redireccion.replace(/\/api\/.*/, "/privacidad")}</code>.
            </li>
            <li>
              En Cloudflare → <strong>Workers &amp; Pages → calendarios → Settings → Variables and Secrets</strong>, añade como
              <strong> Secret</strong>: <code>META_APP_ID</code>, <code>META_APP_SECRET</code> y <code>META_CONFIG_ID</code>.
            </li>
            <li>Pon la app en modo <strong>Activo</strong> (arriba, en el panel de la app) y vuelve aquí a pulsar <strong>Conectar</strong>.</li>
          </ol>
        </div>
      )}

      {meta?.configurado && !meta.conectado && (
        esAdmin ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", alignItems: "flex-start" }}>
            <a className="btn btn-primary" href={db.urlConectarMeta()}>
              <Icon name="send" size={18} /> Conectar con Facebook
            </a>
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
              Entra con el Facebook que administra las páginas de los clientes. Cuando Meta pregunte, marca TODAS las
              páginas y cuentas de Instagram que quieras publicar desde aquí.
            </p>
          </div>
        ) : (
          <p className="hint">Sólo el administrador puede conectar Meta.</p>
        )
      )}

      {meta?.conectado && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <p style={{ fontSize: "var(--fs-2xs)", flex: 1, minWidth: 200 }}>
              Conectado como <strong>{meta.nombre || "la cuenta de la agencia"}</strong>.
              {" "}Publicar y medir no caducan: cada página guarda su propio permiso, y ése no vence.
              {meta.expira && (Date.parse(meta.expira) > Date.now()
                ? <> Para traer páginas NUEVAS sirve «Actualizar cuentas» hasta el {new Date(meta.expira).toLocaleDateString("es-PA", { day: "numeric", month: "long" })}; después, «Volver a conectar».</>
                : <> Para traer páginas nuevas, pulsa «Volver a conectar».</>)}
            </p>
            {esAdmin && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
                  onClick={() => hacer("sinc", async () => { const r = await db.sincronizarMeta(); return r; }, "Cuentas actualizadas.")}>
                  <Icon name="refresh" size={14} /> {trabajando === "sinc" ? "Actualizando…" : "Actualizar cuentas"}
                </button>
                <a className="btn btn-ghost btn-sm" href={db.urlConectarMeta()}>Volver a conectar</a>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!!trabajando}
                  onClick={() => hacer("desc", db.desconectarMeta)}>
                  Desconectar
                </button>
              </>
            )}
          </div>

          {cuentas.length === 0 ? (
            <p className="hint">
              No llegó ninguna página. Revisa que tu usuario administre las páginas de los clientes (o que te hayan dado
              acceso como socio en su Business Suite) y pulsa «Actualizar cuentas».
            </p>
          ) : (
            <ul className="cuentas-sociales" aria-label="Cuentas y a qué cliente van">
              {cuentas.map((c) => (
                <li key={c.id}>
                  <span className="cuentas-sociales-red"><Icon name={REDES[c.red]?.icono ?? "globe"} size={16} /> {REDES[c.red]?.nombre}</span>
                  <span className="cuentas-sociales-nombre">
                    <strong>{c.usuario ? `@${c.usuario}` : c.nombre}</strong>
                    {c.usuario && c.nombre && <span> · {c.nombre}</span>}
                  </span>
                  <label className="sr-only" htmlFor={`${ids}-${c.id}`}>Cliente de {c.usuario || c.nombre}</label>
                  <select
                    id={`${ids}-${c.id}`}
                    className="input cuentas-sociales-cliente"
                    value={c.clientId ?? ""}
                    disabled={!!trabajando}
                    onChange={(e) => {
                      const destino = e.target.value;
                      void hacer(`a-${c.id}`, () => db.asignarCuenta(c.id, destino),
                        destino ? `${c.usuario ? `@${c.usuario}` : c.nombre} publica ahora para ${nombreCliente(destino)}.` : "");
                    }}
                  >
                    <option value="">Sin cliente</option>
                    {clients.map((cl) => <option key={cl.id} value={cl.dbId || cl.id}>{cl.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
          <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
            Cada cliente, una cuenta por red. ¿Falta alguna? El cliente te da acceso a su página (y su Instagram) como socio
            desde su Business Suite, y luego pulsas «Actualizar cuentas».
          </p>
        </>
      )}
    </div>
  );
}
