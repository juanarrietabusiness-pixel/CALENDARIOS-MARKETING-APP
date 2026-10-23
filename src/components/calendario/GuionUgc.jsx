import { lazy, Suspense, useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { CopyButton } from "./primitivas";
import { mediosDe } from "../../lib/publicacion";
import { DURACIONES_UGC, duracionUgc, partirGuionUgc, vozDelGuion, tomasDelGuion, medidaDeLaVoz, conGancho } from "../../lib/ugc";
import "./GuionUgc.css";

// «Extraer guion y adaptar»: sólo se descarga al abrirlo.
const ExtraerUgc = lazy(() => import("./ExtraerUgc"));

// ============================================================
// UGC · guion para grabar, en el panel de una publicación
//
// Lo que necesita quien va a grabar: la duración, el guion en columnas
// (tiempo · lo que dice · lo que se ve), si la voz cabe en el tiempo, tres
// ganchos para probar y dos botones para copiar —la voz seguida, para el
// teleprompter, y la lista de tomas—. El guion sigue siendo `post.guion`
// (texto): se edita en su campo de siempre, debajo (lib/ugc.js).
// ============================================================

export default function GuionUgc({ form, sf, setForm, client, onAviso }) {
  const ids = useId();
  const [extrayendo, setExtrayendo] = useState(false);
  const tramos = useMemo(() => partirGuionUgc(form.guion), [form.guion]);
  const duracion = duracionUgc(form.duracionUgc);
  const medida = medidaDeLaVoz(form.guion, duracion);
  const ganchos = Array.isArray(form.ganchosUgc) ? form.ganchosUgc : [];
  const videos = mediosDe(form).filter((m) => m?.tipo === "video");

  return (
    <section className="guion-ugc" aria-labelledby={`${ids}-t`}>
      <div className="guion-ugc-cabeza">
        <h4 id={`${ids}-t`} className="label" style={{ margin: 0 }}><Icon name="user" size={14} /> UGC · guion para grabar</h4>
        <label className="guion-ugc-duracion" htmlFor={`${ids}-dur`}>
          Dura
          <select id={`${ids}-dur`} className="input" value={duracion} onChange={(e) => sf("duracionUgc", Number(e.target.value))}>
            {DURACIONES_UGC.map((d) => <option key={d} value={d}>{d} s</option>)}
          </select>
        </label>
      </div>

      {tramos.length > 0 ? (
        <>
          <div className="guion-ugc-tabla" role="table" aria-label="El guion, tramo a tramo">
            <div role="row" className="guion-ugc-fila guion-ugc-titulos">
              <span role="columnheader">Tiempo</span><span role="columnheader">Lo que dice</span><span role="columnheader">Lo que se ve</span>
            </div>
            {tramos.map((t, i) => (
              <div role="row" className="guion-ugc-fila" key={i}>
                <span role="cell" className="guion-ugc-tiempo">{t.desde != null ? `${t.desde}–${t.hasta} s` : "—"}</span>
                <span role="cell">{t.voz ? `«${t.voz}»` : <span className="hint">(sin voz)</span>}</span>
                <span role="cell">{t.seVe}{t.texto && <span className="guion-ugc-texto">En pantalla: «{t.texto}»</span>}</span>
              </div>
            ))}
          </div>
          <p className={`hint guion-ugc-medida${medida.sobra ? " is-largo" : ""}`} role="status">
            {medida.palabras} palabras de voz · caben unas {medida.caben} en {duracion} s
            {medida.sobra ? ` — sobran ${medida.sobra}: recorta o sube la duración.` : "."}
          </p>
          <div className="guion-ugc-copiar">
            <CopyButton text={vozDelGuion(form.guion)} label="Copiar la voz" describes="lo que se dice, seguido" />
            <CopyButton text={tomasDelGuion(form.guion)} label="Copiar la lista de tomas" describes="la lista de tomas" />
          </div>
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Pulsa «IA» en el guion para escribirlo por tramos (lo que dice, palabra por palabra, y lo que se ve), o extráelo
          de un video que funciona.
        </p>
      )}

      {ganchos.length > 0 && (
        <div className="guion-ugc-ganchos">
          <p className="label" style={{ margin: 0 }}>Ganchos para probar</p>
          <ul>
            {ganchos.map((g) => (
              <li key={g}>
                <span>«{g}»</span>
                {tramos.length > 0 && tramos[0].voz !== g && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => sf("guion", conGancho(form.guion, g))}>Usar este</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {client && (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setExtrayendo(true)}>
          <Icon name="video" size={14} /> Extraer guion de un video y adaptarlo
        </button>
      )}
      {extrayendo && (
        <Suspense fallback={null}>
          <ExtraerUgc
            client={client} videos={videos} duracion={duracion} productoId={form.productoId ?? ""}
            onCerrar={() => setExtrayendo(false)}
            onUsar={(pub) => {
              // Pone el guion, los ganchos, la duración y el caption (éste sólo si estaba vacío); lo demás se queda.
              setForm((p) => ({
                ...p, guion: pub.guion, ganchosUgc: pub.ganchosUgc ?? [], duracionUgc: pub.duracionUgc,
                ...(String(p.descripcion ?? "").trim() || !pub.descripcion ? {} : { descripcion: pub.descripcion }),
                ...(String(p.title ?? "").trim() || !pub.title ? {} : { title: pub.title }),
              }));
              setExtrayendo(false);
              onAviso?.("Listo: el guion adaptado está en la publicación. Revísalo antes de grabar.");
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
