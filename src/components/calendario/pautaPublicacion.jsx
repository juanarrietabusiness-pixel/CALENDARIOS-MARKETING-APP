import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { Plegable } from "./editorPublicacion";
import { CopyButton } from "./primitivas";
import { fieldHeaderStyle } from "./formato";
import { leerNegocio } from "../../lib/negocioApi";
import { ETAPAS_CICLO, etapaCiclo } from "../../lib/cicloVentas";
import { NIVELES_CONSCIENCIA, nombreDeNivel } from "../../lib/consciencia";
import FilaInterruptor from "../Interruptor";
import {
  limpiarPauta, vaAPauta, nivelDePauta, etapaSugerida, describirPauta, anuncioATexto, botonPorDefecto, COMO_PAUTA, BOTONES_PAUTA,
  MIN_TEXTOS, MAX_TEXTOS, MAX_TITULOS, MAX_TEXTO_ANUNCIO, MAX_TITULO_ANUNCIO, MAX_DESCRIPCION_ANUNCIO, PRIMERA_LINEA,
} from "../../lib/pauta";

// ============================================================
// «Se va a pautar» en la pestaña Idea de una publicación (lib/pauta.js)
//
// En el Ads Manager se escoge una publicación ya hecha y su texto NO se puede
// cambiar: el caption ES el texto principal del anuncio. Marcarla aquí hace
// que la IA escriba su caption como anuncio (la etapa del ciclo manda) y,
// aparte, sus TEXTOS DE ANUNCIO para montarlo subiendo la pieza: de 3 a 5
// textos principales, títulos, descripción y botón, cada uno con «Copiar».
// La agencia monta de las dos formas; «cómo» sólo dice cuál se espera.
//
// Quitarla deja `pauta: false`: así el asistente del mes no la vuelve a
// proponer. Lo que puso la app (`auto`) se dice, y se quita igual.
// ============================================================

// El destino (WhatsApp o web) del cliente: sus números del negocio, una vez por cliente mientras la página está abierta.
const destinos = new Map();
function useDestino(clienteId, activo) {
  const [d, setD] = useState(() => destinos.get(clienteId) ?? "");
  useEffect(() => {
    if (!activo || !clienteId || destinos.has(clienteId)) return undefined;
    let vivo = true;
    leerNegocio(clienteId, { meta: false })
      .then((r) => { const x = r?.negocio?.destino ?? ""; destinos.set(clienteId, x); if (vivo) setD(x); })
      .catch(() => destinos.set(clienteId, ""));
    return () => { vivo = false; };
  }, [clienteId, activo]);
  return d;
}

const lista = (x) => (Array.isArray(x) ? x.map((t) => String(t ?? "")) : []);

export function PautaPublicacion({ form, sf, clienteId, onEscribir, escribiendo = false }) {
  const ids = useId();
  const va = vaAPauta(form);
  const pauta = limpiarPauta(form.pauta);
  const destino = useDestino(clienteId, va);
  const etapa = etapaCiclo(pauta?.etapa);
  const nivel = nivelDePauta(pauta, form);
  const cambiar = (cambios) => {
    // Lo que toca una persona deja de ser «de la app» (`auto`): ya lo decidió alguien.
    const { auto: _a, motivo: _m, ...resto } = pauta ?? {};
    sf("pauta", limpiarPauta({ ...resto, ...cambios }));
  };
  const alternar = (si) => sf("pauta", si ? limpiarPauta({ etapa: etapaSugerida(form) }) : false);

  // Los textos de anuncio se editan tal cual (se limpian al usarlos: limpiar a cada tecla movería el cursor).
  const a = form.anuncio && typeof form.anuncio === "object" ? form.anuncio : {};
  const textos = lista(a.textos);
  const titulos = lista(a.titulos);
  const ponerAnuncio = (cambios) => sf("anuncio", { textos, titulos, descripcion: a.descripcion ?? "", boton: a.boton || botonPorDefecto(destino), ...cambios });
  const conTexto = textos.some((t) => t.trim()) || titulos.some((t) => t.trim());

  return (
    <Plegable titulo="Se va a pautar" icono="megaphone" resumen={va ? describirPauta(form.pauta) : "No"} abierta={va}>
      <div className="tipo-contenido">
        <FilaInterruptor
          etiqueta="Se va a pautar en Meta"
          descripcion={<>
            En el Ads Manager el texto de una publicación ya hecha no se cambia: si va a pauta, la IA escribe su caption como anuncio
            (sin nada que caduque, con el llamado a {destino === "web" ? "la web" : "WhatsApp"}) y, aparte, los textos para montarlo subiendo la pieza.
          </>}
          encendido={va}
          onCambiar={(si) => alternar(si)}
        />
        {va && pauta?.auto && (
          <p className="hint" style={{ margin: 0 }}><Icon name="sparkles" size={13} /> La marcó el asistente del mes{pauta.motivo ? ` (${pauta.motivo.toLowerCase()})` : ""}. Si no va, quítala arriba.</p>
        )}

        {va && (
          <>
            <div className="field">
              <label className="label" htmlFor={`${ids}-etapa`}>Etapa del ciclo de ventas</label>
              <select id={`${ids}-etapa`} className="input" value={pauta.etapa} onChange={(e) => cambiar({ etapa: e.target.value, nivel: "" })}>
                {ETAPAS_CICLO.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              {etapa && <p className="hint" style={{ margin: 0 }}>{etapa.ayuda}</p>}
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-nivel`}>Nivel de consciencia del anuncio</label>
              <select id={`${ids}-nivel`} className="input" value={pauta.nivel ?? ""} onChange={(e) => cambiar({ nivel: e.target.value })}>
                <option value="">Según la etapa ({nombreDeNivel(nivel) || "—"})</option>
                {NIVELES_CONSCIENCIA.map((n) => (
                  <option key={n.clave} value={n.clave}>{n.nombre}{etapa?.niveles.includes(n.clave) ? "" : " · de otra etapa"}</option>
                ))}
              </select>
            </div>
            <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="label">Cómo se monta</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                {COMO_PAUTA.map((c) => (
                  <label key={c.id || "dos"} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start", minHeight: "var(--tap-sm)", fontSize: "var(--fs-xs)" }}>
                    <input type="radio" name={`${ids}-como`} checked={pauta.como === c.id} onChange={() => cambiar({ como: c.id })} style={{ marginTop: 3 }} />
                    <span><strong>{c.nombre}</strong> <span className="hint">· {c.ayuda}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <div style={fieldHeaderStyle}>
                <span className="label" style={{ margin: 0 }} id={`${ids}-textos`}>Textos del anuncio</span>
                <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                  {conTexto && <CopyButton text={anuncioATexto(a)} label="Copiar todo" describes="todos los textos del anuncio" />}
                  <button type="button" className="btn-ai" onClick={onEscribir} disabled={escribiendo || !onEscribir}
                    aria-label={`${conTexto ? "Reescribir" : "Escribir"} los textos del anuncio con IA`} title="Los escribe el motor de textos con la etapa, el catálogo y el estudio de mercado">
                    {escribiendo ? "Escribiendo…" : <><Icon name="sparkles" size={14} /> {conTexto ? "Reescribir con IA" : "Escribir con IA"}</>}
                  </button>
                </div>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                Para montarlo subiendo la pieza: el Ads Manager admite hasta {MAX_TEXTOS} textos principales y {MAX_TITULOS} títulos, y prueba
                combinaciones. De {MIN_TEXTOS} a {MAX_TEXTOS} textos, cada uno por un ángulo distinto; el gancho, en los primeros {PRIMERA_LINEA} caracteres.
              </p>

              <ul aria-labelledby={`${ids}-textos`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {textos.map((t, i) => (
                  <li key={i} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                    <div style={fieldHeaderStyle}>
                      <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-t${i}`}>Texto principal {i + 1}</label>
                      <div style={{ display: "flex", gap: "var(--sp-1)", alignItems: "center" }}>
                        <span className="hint" aria-hidden="true">{t.length}/{MAX_TEXTO_ANUNCIO}</span>
                        <CopyButton text={t} describes={`el texto principal ${i + 1}`} />
                        <button type="button" className="btn-icon" aria-label={`Quitar el texto principal ${i + 1}`} onClick={() => ponerAnuncio({ textos: textos.filter((_, j) => j !== i) })}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                    <textarea id={`${ids}-t${i}`} className="textarea" style={{ minHeight: 84 }} maxLength={MAX_TEXTO_ANUNCIO} value={t}
                      onChange={(e) => ponerAnuncio({ textos: textos.map((x, j) => (j === i ? e.target.value : x)) })} />
                  </li>
                ))}
              </ul>
              {textos.length < MAX_TEXTOS && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => ponerAnuncio({ textos: [...textos, ""] })}>
                  <Icon name="plus" size={14} /> Añadir un texto principal
                </button>
              )}
            </div>

            <div className="field">
              <span className="label" id={`${ids}-titulos`}>Títulos <span style={{ fontWeight: 400, textTransform: "none" }}>· hasta {MAX_TITULO_ANUNCIO} caracteres</span></span>
              <ul aria-labelledby={`${ids}-titulos`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                {titulos.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: "var(--sp-1)", alignItems: "center" }}>
                    <input className="input" style={{ flex: 1 }} aria-label={`Título ${i + 1}`} maxLength={MAX_TITULO_ANUNCIO} value={t}
                      onChange={(e) => ponerAnuncio({ titulos: titulos.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <span className="hint" aria-hidden="true">{t.length}/{MAX_TITULO_ANUNCIO}</span>
                    <CopyButton text={t} describes={`el título ${i + 1}`} />
                    <button type="button" className="btn-icon" aria-label={`Quitar el título ${i + 1}`} onClick={() => ponerAnuncio({ titulos: titulos.filter((_, j) => j !== i) })}>
                      <Icon name="trash" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              {titulos.length < MAX_TITULOS && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => ponerAnuncio({ titulos: [...titulos, ""] })}>
                  <Icon name="plus" size={14} /> Añadir un título
                </button>
              )}
            </div>

            <div className="field">
              <div style={fieldHeaderStyle}>
                <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-desc`}>Descripción <span style={{ fontWeight: 400, textTransform: "none" }}>· hasta {MAX_DESCRIPCION_ANUNCIO}</span></label>
                <CopyButton text={a.descripcion} describes="la descripción del anuncio" />
              </div>
              <input id={`${ids}-desc`} className="input" maxLength={MAX_DESCRIPCION_ANUNCIO} value={a.descripcion ?? ""}
                onChange={(e) => ponerAnuncio({ descripcion: e.target.value })} placeholder="Envío gratis · garantía de 1 año" />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-boton`}>Botón</label>
              <select id={`${ids}-boton`} className="input" value={a.boton || botonPorDefecto(destino)} onChange={(e) => ponerAnuncio({ boton: e.target.value })}>
                {BOTONES_PAUTA.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
          </>
        )}
      </div>
    </Plegable>
  );
}
