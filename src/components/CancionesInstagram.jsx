import { useId, useState } from "react";
import Icon from "./Icon";
import { limpiarCanciones, textoDeCancion, MAX_CANCIONES } from "../lib/cancionesInstagram";

// ============================================================
// Las CANCIONES DE INSTAGRAM que le van a un cliente (Marca → Kit y voz, junto a la música de la marca; lazy)
//
// La API de Instagram no deja poner su música: un carrusel «con música» se publica a mano desde el teléfono, y la
// pantalla de /a-mano sugiere una de esta lista (sin repetir la última usada). Las escribe la agencia, con su nombre y
// su artista tal como salen al buscarlas en Instagram. Se guardan dentro de `kit.musica` con el kit entero (el PUT de
// siempre): lo demás de la música de la marca se queda como está.
// ============================================================

export default function CancionesInstagram({ kit, lectura = false, onGuardar }) {
  const ids = useId();
  const guardadas = limpiarCanciones(kit?.musica?.cancionesInstagram);
  const [lista, setLista] = useState(guardadas);
  const [nombre, setNombre] = useState("");
  const [artista, setArtista] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const cambiado = JSON.stringify(lista) !== JSON.stringify(guardadas);
  const anadir = (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setLista((l) => limpiarCanciones([...l, { nombre, artista }]));
    setNombre("");
    setArtista("");
  };
  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const nuevo = await onGuardar({ ...kit, musica: { ...(kit?.musica ?? {}), cancionesInstagram: lista } });
      setLista(limpiarCanciones(nuevo?.musica?.cancionesInstagram ?? lista));
      setAviso({ ok: true, texto: "Guardadas: la pantalla del teléfono sugiere una al publicar a mano." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="field">
      <span className="label">Canciones de Instagram que le van</span>
      <p className="hint" style={{ margin: 0 }}>
        Para lo que se publica a mano con la música de Instagram (un carrusel: la API no deja ponerla). Al publicar desde el
        teléfono se sugiere una de estas, sin repetir la última usada. Escríbelas como salen al buscarlas en Instagram.
      </p>
      {lista.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--sp-1)" }} aria-label="Canciones de Instagram del cliente">
          {lista.map((c) => (
            <li key={textoDeCancion(c)} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", justifyContent: "space-between" }}>
              <span><Icon name="music" size={14} /> {textoDeCancion(c)}</span>
              {!lectura && (
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar «${textoDeCancion(c)}»`} disabled={guardando}
                  onClick={() => setLista((l) => l.filter((x) => textoDeCancion(x) !== textoDeCancion(c)))}>
                  <Icon name="close" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!lectura && (
        <form onSubmit={anadir} style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 180px" }}>
            <label className="label" htmlFor={`${ids}-nombre`}>Canción</label>
            <input id={`${ids}-nombre`} className="input" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ojitos lindos" disabled={guardando || lista.length >= MAX_CANCIONES} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label className="label" htmlFor={`${ids}-artista`}>Artista <span className="hint">(opcional)</span></label>
            <input id={`${ids}-artista`} className="input" maxLength={60} value={artista} onChange={(e) => setArtista(e.target.value)} placeholder="Bad Bunny" disabled={guardando || lista.length >= MAX_CANCIONES} />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!nombre.trim() || guardando || lista.length >= MAX_CANCIONES}>
            <Icon name="plus" size={14} /> Añadir
          </button>
        </form>
      )}
      {!lectura && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!cambiado || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar las canciones"}
          </button>
        </div>
      )}
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
    </div>
  );
}
