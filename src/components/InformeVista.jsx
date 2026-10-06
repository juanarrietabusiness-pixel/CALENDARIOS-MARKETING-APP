import "./InformeVista.css";
import Icon from "./Icon";
import { GraficaLinea, GraficaBarras } from "./Graficas";
import { numeroCorto, NOMBRE_FORMATO } from "../lib/resultados";
import { normalizarColor, textoSobre, conAlfa } from "../lib/colores";
import { formatoMoneda } from "../lib/anuncios";
import logoMark from "../assets/logo-mark.png";

// ============================================================
// El informe mensual, como documento
//
// Lo pintan la vista previa de la agencia (Resultados) y la página
// pública que abre el cliente (/informe?t=…). Tema CLARO con el color de
// la marca del cliente, y listo para imprimir: «Descargar PDF» es la
// impresión del navegador, que en todos los sistemas deja guardar como
// PDF. Sin librería de PDF: serían cientos de kB para lo que el
// navegador ya hace.
// ============================================================

const REDES = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };

function Cambio({ valor }) {
  if (valor == null || !Number.isFinite(valor)) return null;
  const sube = valor >= 0;
  return (
    <span className="informe-cambio" data-tono={Math.abs(valor) < 0.5 ? "igual" : sube ? "bien" : "mal"}>
      <Icon name={sube ? "arrowUp" : "arrowDown"} size={12} /> {Math.abs(valor).toLocaleString("es", { maximumFractionDigits: 1 })} % vs. mes anterior
    </span>
  );
}

function Cifra({ titulo, cifra, sufijo = "" }) {
  if (cifra?.valor == null) return null;
  return (
    <div className="informe-cifra">
      <p className="informe-cifra-titulo">{titulo}</p>
      <p className="informe-cifra-valor">{numeroCorto(cifra.valor)}{sufijo}</p>
      <Cambio valor={cifra.cambio} />
    </div>
  );
}

function Lista({ titulo, items, icono }) {
  if (!items?.length) return null;
  return (
    <section className="informe-bloque">
      <h2>{titulo}</h2>
      <ul className="informe-lista">
        {items.map((t) => <li key={t}><Icon name={icono} size={16} /> <span>{t}</span></li>)}
      </ul>
    </section>
  );
}

const porcentaje = (v) => (v == null ? "—" : `${v.toLocaleString("es", { maximumFractionDigits: 2 })} %`);

/**
 * La publicidad pagada del mes: la cuenta entera y cada campaña que gastó
 * algo —también las creadas en el Administrador de anuncios—, con su costo
 * por resultado, y lo que dice la IA. Sin cuenta publicitaria, no sale.
 */
function Anuncios({ datos, analisis }) {
  if (!datos?.total || (!datos.total.gasto && !datos.campanas?.length)) return null;
  const t = datos.total;
  const dinero = (v) => (v == null ? "—" : formatoMoneda(v, datos.moneda));
  return (
    <section className="informe-bloque">
      <h2>Publicidad pagada</h2>
      {analisis?.resumen && <p>{analisis.resumen}</p>}
      <div className="informe-cifras">
        <div className="informe-cifra"><p className="informe-cifra-titulo">Inversión</p><p className="informe-cifra-valor">{dinero(t.gasto)}</p></div>
        <div className="informe-cifra"><p className="informe-cifra-titulo">Personas alcanzadas</p><p className="informe-cifra-valor">{numeroCorto(t.alcance)}</p></div>
        <div className="informe-cifra"><p className="informe-cifra-titulo">Impresiones</p><p className="informe-cifra-valor">{numeroCorto(t.impresiones)}</p></div>
        <div className="informe-cifra"><p className="informe-cifra-titulo">Clics</p><p className="informe-cifra-valor">{numeroCorto(t.clics)}</p></div>
        <div className="informe-cifra"><p className="informe-cifra-titulo">CTR</p><p className="informe-cifra-valor">{porcentaje(t.ctr)}</p></div>
        <div className="informe-cifra"><p className="informe-cifra-titulo">Costo por clic</p><p className="informe-cifra-valor">{dinero(t.cpc)}</p></div>
      </div>
      {datos.campanas?.length > 0 && (
        <table className="informe-tabla">
          <thead>
            <tr><th scope="col">Campaña</th><th scope="col">Objetivo</th><th scope="col">Inversión</th><th scope="col">Resultados</th><th scope="col">Costo por resultado</th></tr>
          </thead>
          <tbody>
            {datos.campanas.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.nombre || "Sin nombre"}</th>
                <td>{c.objetivo}</td>
                <td>{dinero(c.gasto)}</td>
                <td>{c.resultados == null ? "—" : numeroCorto(c.resultados)}</td>
                <td>{dinero(c.costoPorResultado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {datos.otras > 0 && <p className="informe-nota">Y {datos.otras} {datos.otras === 1 ? "campaña más" : "campañas más"} con menos inversión.</p>}
      {analisis?.recomendaciones?.length > 0 && (
        <ul className="informe-lista" aria-label="Recomendaciones de publicidad">
          {analisis.recomendaciones.map((r) => <li key={r}><Icon name="megaphone" size={16} /> <span>{r}</span></li>)}
        </ul>
      )}
    </section>
  );
}

export default function InformeVista({ informe, cliente }) {
  const { cifras, analisis } = informe ?? {};
  if (!cifras) return <p className="hint">Este informe no tiene datos.</p>;
  const marca = normalizarColor(cliente?.primaryColor) || "#1E90FF";
  const estilo = {
    "--marca": marca,
    "--marca-texto": textoSobre(marca),
    "--marca-suave": conAlfa(marca, 0.1),
    "--marca-linea": conAlfa(marca, 0.35),
  };
  const k = cifras.kpis ?? {};

  return (
    <article className="informe" style={estilo}>
      <header className="informe-portada">
        {cliente?.logo && <img src={cliente.logo} alt={`Logo de ${cliente.name}`} className="informe-logo" />}
        <div>
          <p className="informe-sobre">Informe de redes sociales</p>
          <h1>{cliente?.name ?? cifras.cliente?.nombre}</h1>
          <p className="informe-mes">{cifras.nombreMes.charAt(0).toUpperCase() + cifras.nombreMes.slice(1)}</p>
          {cifras.redes?.length > 0 && (
            <p className="informe-redes">
              {cifras.redes.map((r) => `${REDES[r.red] ?? r.red}${r.usuario ? ` @${r.usuario}` : ""}`).join(" · ")}
            </p>
          )}
        </div>
      </header>

      {analisis?.resumen && (
        <section className="informe-bloque informe-resumen">
          <h2>El mes en pocas palabras</h2>
          <p>{analisis.resumen}</p>
        </section>
      )}

      <section className="informe-bloque">
        <h2>Las cifras</h2>
        <div className="informe-cifras">
          <Cifra titulo="Seguidores" cifra={k.seguidores} />
          <Cifra titulo="Personas alcanzadas" cifra={k.alcance} />
          <Cifra titulo="Vistas" cifra={k.vistas} />
          <Cifra titulo="Interacciones" cifra={k.interacciones} />
          <Cifra titulo="Tasa de interacción" cifra={k.tasaInteraccion} sufijo=" %" />
          <Cifra titulo="Publicaciones" cifra={k.publicaciones} />
        </div>
        {k.seguidores?.ganados != null && (
          <p className="informe-nota">
            {k.seguidores.ganados >= 0 ? `+${numeroCorto(k.seguidores.ganados)} seguidores nuevos` : `${numeroCorto(k.seguidores.ganados)} seguidores`} durante el mes.
          </p>
        )}
      </section>

      <Lista titulo="Lo más destacado" items={analisis?.destacados} icono="sparkles" />

      <div className="informe-graficas">
        <section className="informe-bloque">
          <h2>Seguidores</h2>
          <GraficaLinea titulo="Seguidores" datos={cifras.seguidores ?? []} />
        </section>
        <section className="informe-bloque">
          <h2>Personas alcanzadas por día</h2>
          <GraficaBarras titulo="Alcance" datos={cifras.alcance ?? []} />
        </section>
      </div>

      {cifras.mejores?.length > 0 && (
        <section className="informe-bloque">
          <h2>Las publicaciones que mejor funcionaron</h2>
          <ol className="informe-top">
            {cifras.mejores.map((p) => (
              <li key={`${p.enlace}${p.publicadaAt}`}>
                <p className="informe-top-meta">
                  {REDES[p.red] ?? p.red} · {NOMBRE_FORMATO[p.tipo] ?? p.tipo} · {new Date(p.publicadaAt).toLocaleDateString("es", { day: "numeric", month: "long" })}
                </p>
                <p className="informe-top-texto">{p.texto || "Sin texto"}</p>
                <p className="informe-top-cifras">
                  <strong>{numeroCorto(p.interacciones)}</strong> interacciones
                  {p.alcance > 0 && <> · {numeroCorto(p.alcance)} personas alcanzadas</>}
                  {p.vistas > 0 && <> · {numeroCorto(p.vistas)} vistas</>}
                  {p.enlace && <> · <a href={p.enlace} target="_blank" rel="noreferrer">verla</a></>}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="informe-graficas">
        {cifras.formatos?.length > 0 && (
          <section className="informe-bloque">
            <h2>Por formato</h2>
            <table className="informe-tabla">
              <thead><tr><th scope="col">Formato</th><th scope="col">Publicaciones</th><th scope="col">Interacción media</th></tr></thead>
              <tbody>
                {cifras.formatos.map((f) => <tr key={f.tipo}><th scope="row">{f.nombre}</th><td>{f.cantidad}</td><td>{numeroCorto(f.interacciones)}</td></tr>)}
              </tbody>
            </table>
          </section>
        )}
        {cifras.momentos?.length > 0 && (
          <section className="informe-bloque">
            <h2>Los mejores momentos para publicar</h2>
            <ul className="informe-lista">
              {cifras.momentos.map((m) => <li key={`${m.dia}${m.franja}`}><Icon name="clock" size={16} /> <span>{m.dia}, de {m.franja}: {numeroCorto(m.media)} interacciones de media</span></li>)}
            </ul>
          </section>
        )}
      </div>

      {cifras.competencia?.length > 0 && (
        <section className="informe-bloque">
          <h2>Cómo va la competencia</h2>
          <table className="informe-tabla">
            <thead><tr><th scope="col">Cuenta</th><th scope="col">Seguidores</th><th scope="col">Cambio</th><th scope="col">Interacción media</th></tr></thead>
            <tbody>
              {cifras.competencia.map((c) => (
                <tr key={c.usuario}>
                  <th scope="row">@{c.usuario}</th>
                  <td>{numeroCorto(c.seguidores)}</td>
                  <td>{c.cambio == null ? "—" : `${c.cambio >= 0 ? "+" : ""}${c.cambio.toLocaleString("es", { maximumFractionDigits: 1 })} %`}</td>
                  <td>{numeroCorto(c.interaccionesPromedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Anuncios datos={cifras.anuncios} analisis={analisis?.anuncios} />

      <Lista titulo="Lo que aprendimos" items={analisis?.aprendizajes} icono="bulb" />
      <Lista titulo="Lo que vamos a hacer el próximo mes" items={analisis?.recomendaciones} icono="check" />

      {analisis?.ideas?.length > 0 && (
        <section className="informe-bloque">
          <h2>Ideas para el próximo mes</h2>
          <ul className="informe-ideas">
            {analisis.ideas.map((i) => (
              <li key={i.idea}>
                {i.formato && <span className="informe-etiqueta">{NOMBRE_FORMATO[i.formato] ?? i.formato}</span>}
                {i.idea}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cifras.plan?.planificadas > 0 && (
        <p className="informe-nota">
          Este mes se planificaron {cifras.plan.planificadas} publicaciones y se aprobaron {cifras.plan.aprobadas}.
        </p>
      )}

      <footer className="informe-pie">
        <img src={logoMark} alt="" width={28} height={28} />
        <span>Preparado por Juancito Ads</span>
      </footer>
    </article>
  );
}
