import "../InformeVista.css";
import "./InformeAnuncios.css";
import Icon from "../Icon";
import { GraficaBarras } from "../Graficas";
import { numeroCorto } from "../../lib/resultados";
import { normalizarColor, textoSobre, conAlfa } from "../../lib/colores";
import { formatoMoneda } from "../../lib/anuncios";
import logoMark from "../../assets/logo-mark.png";

// ============================================================
// El informe de anuncios, como documento
//
// Lo pintan la vista previa de la agencia (Anuncios → Informes) y la
// página pública del cliente (/informe-anuncios?t=…). Usa el mismo
// documento CLARO del informe de redes (InformeVista.css) con la marca del
// cliente, y se imprime igual: «Descargar PDF» es la impresión del
// navegador. Si el costo por resultado no viene en las cifras (la agencia
// decidió no enseñarlo), no aparece en ninguna parte.
// ============================================================

const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");
// Sólo la primera: «Conversaciones por WhatsApp» → «conversaciones por WhatsApp».
const minuscula = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : "");

/** El cambio frente al mes anterior. `inverso`: que baje es bueno (el costo por resultado). */
function Cambio({ valor, inverso = false }) {
  if (valor == null || !Number.isFinite(valor)) return <span className="informe-cambio">Sin mes anterior para comparar</span>;
  const sube = valor >= 0;
  const bueno = inverso ? !sube : sube;
  return (
    <span className="informe-cambio" data-tono={Math.abs(valor) < 0.5 ? "igual" : bueno ? "bien" : "mal"}>
      <Icon name={sube ? "arrowUp" : "arrowDown"} size={12} /> {Math.abs(valor).toLocaleString("es", { maximumFractionDigits: 1 })} % vs. mes anterior
    </span>
  );
}

function Grande({ titulo, valor, cambio, inverso, icono }) {
  return (
    <div className="ia-kpi">
      <p className="ia-kpi-titulo"><Icon name={icono} size={16} /> {titulo}</p>
      <p className="ia-kpi-valor">{valor}</p>
      <Cambio valor={cambio} inverso={inverso} />
    </div>
  );
}

export default function InformeAnunciosVista({ informe, cliente }) {
  const { cifras, analisis } = informe ?? {};
  if (!cifras?.kpis) return <p className="hint">Este informe no tiene datos.</p>;
  const marca = normalizarColor(cliente?.primaryColor) || "#1E90FF";
  const estilo = {
    "--marca": marca,
    "--marca-texto": textoSobre(marca),
    "--marca-suave": conAlfa(marca, 0.1),
    "--marca-linea": conAlfa(marca, 0.35),
  };
  const k = cifras.kpis;
  const dinero = (v) => (v == null ? "—" : formatoMoneda(v, cifras.moneda));
  const conCosto = "costoPorResultado" in k;
  const serieGasto = (cifras.serie ?? []).map((d) => ({ fecha: d.fecha, valor: d.gasto }));
  const serieResultados = (cifras.serie ?? []).map((d) => ({ fecha: d.fecha, valor: d.resultados }));
  const comentarios = analisis?.campanas ?? {};

  return (
    <article className="informe informe-anuncios" style={estilo}>
      <header className="informe-portada">
        {cliente?.logo && <img src={cliente.logo} alt={`Logo de ${cliente.name}`} className="informe-logo" />}
        <div>
          <p className="informe-sobre">Informe de publicidad</p>
          <h1>{cliente?.name}</h1>
          <p className="informe-mes">{mayuscula(cifras.nombreMes)}</p>
          <p className="informe-redes">Anuncios en Facebook e Instagram</p>
        </div>
      </header>

      <section className="informe-bloque" aria-label="Las cifras del mes">
        <div className="ia-kpis" data-cuatro={conCosto ? "si" : "no"}>
          <Grande titulo="Inversión" icono="chart" valor={dinero(k.inversion?.valor)} cambio={k.inversion?.cambio} />
          <Grande titulo={cifras.etiquetaResultados || "Resultados"} icono="checkCircle" valor={numeroCorto(k.resultados?.valor ?? 0)} cambio={k.resultados?.cambio} />
          {conCosto && <Grande titulo="Costo por resultado" icono="bolt" valor={dinero(k.costoPorResultado?.valor)} cambio={k.costoPorResultado?.cambio} inverso />}
          <Grande titulo="Personas alcanzadas" icono="users" valor={numeroCorto(k.alcance?.valor ?? 0)} cambio={k.alcance?.cambio} />
        </div>
        <p className="informe-nota">
          {numeroCorto(k.clics?.valor ?? 0)} clics en los anuncios
          {k.ctr?.valor != null && <> · {k.ctr.valor.toLocaleString("es", { maximumFractionDigits: 2 })} % de quienes los vieron hizo clic</>}.
        </p>
        {cifras.otrosObjetivos && (
          <p className="informe-nota">
            {cifras.etiquetaResultados || "Resultados"}{conCosto ? " y su costo" : ""}: las campañas de ese objetivo, que es donde más se invirtió. Las demás, con lo suyo, en la tabla de campañas.
          </p>
        )}
      </section>

      {analisis?.logros && (
        <section className="informe-bloque informe-resumen">
          <h2>Lo que logramos</h2>
          <p>{analisis.logros}</p>
        </section>
      )}

      <div className="informe-graficas">
        <section className="informe-bloque">
          <h2>Inversión por día</h2>
          <GraficaBarras titulo="Inversión" datos={serieGasto} />
        </section>
        {serieResultados.some((d) => d.valor) && (
          <section className="informe-bloque">
            <h2>{cifras.etiquetaResultados || "Resultados"} por día</h2>
            <GraficaBarras titulo={cifras.etiquetaResultados || "Resultados"} datos={serieResultados} />
          </section>
        )}
      </div>

      {cifras.mejores?.length > 0 && (
        <section className="informe-bloque">
          <h2>Los anuncios que mejor funcionaron</h2>
          <ol className="ia-mejores">
            {cifras.mejores.map((a, i) => (
              <li key={a.id}>
                <div className="ia-mejor-imagen">
                  {a.miniatura ? <img src={a.miniatura} alt={`Anuncio «${a.titulo || a.nombre}»`} loading="lazy" /> : <Icon name="megaphone" size={28} />}
                  <span className="ia-puesto" aria-hidden="true">{i + 1}</span>
                </div>
                <div className="ia-mejor-texto">
                  <p className="informe-top-meta">{a.campana}</p>
                  {a.titulo && <p className="ia-mejor-titulo">{a.titulo}</p>}
                  {a.texto && <p className="ia-mejor-cuerpo">{a.texto}</p>}
                  <p className="informe-top-cifras">
                    <strong>{numeroCorto(a.resultados)}</strong> {minuscula(cifras.etiquetaResultados || "resultados")}
                    {" · "}{dinero(a.gasto)} invertidos
                    {"costoPorResultado" in a && a.costoPorResultado != null && <> · {dinero(a.costoPorResultado)} cada uno</>}
                    {a.clics > 0 && <> · {numeroCorto(a.clics)} clics</>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cifras.campanas?.length > 0 && (
        <section className="informe-bloque">
          <h2>Las campañas del mes</h2>
          <div className="ia-tabla-envoltura">
            <table className="informe-tabla">
              <thead>
                <tr>
                  <th scope="col">Campaña</th><th scope="col">Inversión</th><th scope="col">Resultados</th>
                  {conCosto && <th scope="col">Costo por resultado</th>}
                  <th scope="col" className="ia-col-alcance">Personas alcanzadas</th>
                </tr>
              </thead>
              <tbody>
                {cifras.campanas.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      <span className="ia-campana">{c.nombre || "Sin nombre"}</span>
                      <span className="ia-campana-meta">{[c.objetivo, c.estado].filter(Boolean).join(" · ")}</span>
                      {comentarios[c.id] && <span className="ia-campana-comentario">{comentarios[c.id]}</span>}
                    </th>
                    <td>{dinero(c.gasto)}</td>
                    <td>{numeroCorto(c.resultados ?? 0)}</td>
                    {conCosto && <td>{dinero(c.costoPorResultado)}</td>}
                    <td className="ia-col-alcance">{numeroCorto(c.alcance ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cifras.otras > 0 && <p className="informe-nota">Y {cifras.otras} {cifras.otras === 1 ? "campaña más" : "campañas más"} con menos inversión.</p>}
        </section>
      )}

      {analisis?.recomendaciones?.length > 0 && (
        <section className="informe-bloque">
          <h2>Lo que haremos el próximo mes</h2>
          <ul className="informe-lista">
            {analisis.recomendaciones.map((r) => <li key={r}><Icon name="check" size={16} /> <span>{r}</span></li>)}
          </ul>
        </section>
      )}

      <footer className="informe-pie">
        <img src={logoMark} alt="" width={28} height={28} />
        <span>Preparado por Juancito Ads</span>
      </footer>
    </article>
  );
}
