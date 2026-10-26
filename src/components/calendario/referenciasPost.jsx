import { lazy, Suspense, useState } from "react";
import Icon from "../Icon";
import { referenciasDe } from "../../lib/referenciasPost";
import { mediosDe, conMedios } from "../../lib/publicacion";
import { formatoDeMedios } from "../../lib/subir";

// «Extraer guion y adaptar»: sólo se descarga al abrirlo.
const ExtraerUgc = lazy(() => import("./ExtraerUgc"));

// ============================================================
// Las referencias de una publicación (pestaña Idea)
//
// El video o la imagen de OTRA cuenta que se trajo con la idea —desde
// «Guardar referencia» o desde «Inspiración»— va en `post.referencias`, no
// en `medios`: lo que está en medios se publica, y lo de otra cuenta no
// debe salir en el perfil del cliente sin que alguien lo decida. Desde aquí:
//   · «Recrear con mi marca»: su forma, con el producto y la marca del
//     cliente (lib/otraVersion.js); la pieza nueva SÍ va a los medios.
//   · «Extraer guion y adaptar» (un video): el guion UGC para grabar.
//   · «Usar como contenido»: para lo que sí es del cliente (su UGC, un
//     repost con permiso), con una pregunta antes.
//   · «Quitar».
// ============================================================

export function ReferenciasPost({ form, setForm, client, cal, onAviso }) {
  const refs = referenciasDe(form);
  const [ocupado, setOcupado] = useState("");
  const [progreso, setProgreso] = useState("");
  const [extraer, setExtraer] = useState(null);
  if (!refs.length) return null;
  const uso = cal && form.id ? cal.dbId || cal.id : null;

  const quitar = (r) => setForm((p) => ({ ...p, referencias: referenciasDe(p).filter((x) => x.src !== r.src) }));

  const comoContenido = (r) => {
    if (!window.confirm(`Esto se PUBLICARÁ en el perfil de ${client?.name ?? "el cliente"}. Úsalo sólo si es suyo o tienes permiso${r.cuenta ? ` de ${r.cuenta}` : ""}. ¿Lo pongo en lo que se publica?`)) return;
    setForm((p) => {
      const medios = [...mediosDe(p), { src: r.src, tipo: r.tipo, nombre: r.cuenta ? `De ${r.cuenta}` : "" }];
      const siguiente = { ...conMedios(p, medios), referencias: referenciasDe(p).filter((x) => x.src !== r.src), mediosCambiadosAt: new Date().toISOString() };
      return mediosDe(p).length ? siguiente : { ...siguiente, format: formatoDeMedios(medios) ?? p.format };
    });
    onAviso?.("Puesto en la pestaña Subir: ahora sí se publica.");
  };

  const recrear = async (r) => {
    if (ocupado || !client) return;
    setOcupado(r.src);
    onAviso?.("");
    try {
      const { recrearConLaMarca } = await import("../../lib/otraVersion");
      const nueva = await recrearConLaMarca({
        client, post: form, medio: r, calendarId: uso, alProgresar: setProgreso,
        confirmar: (costo) => window.confirm(`Recrearla cuesta unos ${costo.toFixed(2).replace(".", ",")} $. ¿Sigo?`),
      });
      if (nueva) {
        const { medioDeArchivo } = await import("../../lib/estudio");
        setForm((p) => {
          const medios = [...mediosDe(p), medioDeArchivo(nueva)];
          const siguiente = { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
          return mediosDe(p).length ? siguiente : { ...siguiente, format: formatoDeMedios(medios) ?? p.format };
        });
        onAviso?.("Lista: recreada con la marca. La pieza nueva está en la pestaña Subir; la referencia se queda aquí.");
      }
    } catch (e) {
      onAviso?.(`No se pudo recrear con la marca: ${e.message}`);
    }
    setOcupado("");
    setProgreso("");
  };

  return (
    <div className="field referencias-post">
      <span className="label">Referencias <span style={{ fontWeight: 400, textTransform: "none" }}>· no se publican</span></span>
      <ul className="referencias-post-lista">
        {refs.map((r) => (
          <li key={r.src} className="referencias-post-item">
            <div className="referencias-post-vista">
              {r.tipo === "video"
                ? <video src={r.src} controls preload="metadata" playsInline aria-label={`Video de referencia${r.cuenta ? ` de ${r.cuenta}` : ""}`} />
                : <img src={r.src} alt={`Referencia${r.cuenta ? ` de ${r.cuenta}` : ""}`} loading="lazy" />}
            </div>
            <div className="referencias-post-datos">
              {r.cuenta && <strong>De {r.cuenta}</strong>}
              {r.enlace && <a href={r.enlace} target="_blank" rel="noopener noreferrer" className="hint"><Icon name="external" size={12} /> Ver el original</a>}
              <div className="referencias-post-acciones">
                <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} aria-busy={ocupado === r.src || undefined} onClick={() => recrear(r)}
                  title="Su forma (composición, ritmo, planos) con el producto, el texto y la marca de este cliente">
                  <Icon name="wand" size={13} /> {ocupado === r.src ? "Recreando…" : "Recrear con mi marca"}
                </button>
                {r.tipo === "video" && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} onClick={() => setExtraer(r)}>
                    <Icon name="user" size={13} /> Extraer guion y adaptar
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => comoContenido(r)}>
                  <Icon name="upload" size={13} /> Usar como contenido
                </button>
                <button type="button" className="btn-icon" disabled={Boolean(ocupado)} onClick={() => quitar(r)} aria-label="Quitar esta referencia">
                  <Icon name="trash" size={14} />
                </button>
              </div>
              {ocupado === r.src && progreso && <p className="hint" role="status" style={{ margin: 0 }}>{progreso}</p>}
            </div>
          </li>
        ))}
      </ul>
      {extraer && client && (
        <Suspense fallback={null}>
          <ExtraerUgc
            client={client} productoId={form.productoId ?? ""}
            inicial={{ ...(extraer.id ? { id: extraer.id } : {}), src: extraer.src, nombre: extraer.cuenta ? `El video de ${extraer.cuenta}` : "El video de referencia", cuenta: extraer.cuenta, enlace: extraer.enlace }}
            onCerrar={() => setExtraer(null)}
            onUsar={(pub) => {
              // Como «Extraer guion» del guion UGC: el guion, los ganchos y la duración; el caption y el título, sólo si
              // estaban vacíos. Sin nada subido todavía, la publicación pasa a ser un reel UGC.
              setForm((p) => ({
                ...p, guion: pub.guion, ganchosUgc: pub.ganchosUgc ?? [], duracionUgc: pub.duracionUgc,
                ...(String(p.descripcion ?? "").trim() || !pub.descripcion ? {} : { descripcion: pub.descripcion }),
                ...(String(p.title ?? "").trim() || !pub.title ? {} : { title: pub.title }),
                ...(mediosDe(p).length ? {} : { format: "reel", rostro: true }),
              }));
              setExtraer(null);
              onAviso?.("Listo: el guion adaptado está en la publicación. Revísalo antes de grabar.");
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
