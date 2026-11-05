import Icon from "./Icon";

// ============================================================
// «Muchas de una vez» del Estudio (en «Avanzado» de Crear): el lote y «Recrear con mi marca»
//
// Va en su chunk (lazy): el del Estudio está en su tope de 20 kB comprimidos (rendimiento.bundle.test.js), y esto es
// casi todo texto.
// ============================================================

export default function EstudioMuchas({ onLote, onRecrear }) {
  return (
    <div className="card est-lote-entrada">
      <div>
        <strong>Muchas de una vez</strong>
        <p className="hint">Anuncios en matriz (deseos × perfiles × niveles), por tipo de pieza o el MES completo con el ritmo del cliente. La IA escribe cada pieza, tú revisas y ves el costo, y cada una llega al calendario lista para revisión. O recrea con tu marca un anuncio de otra cuenta que te guste.</p>
      </div>
      <div className="est-lote-botones">
        <button type="button" className="btn btn-secondary" onClick={onLote}><Icon name="megaphone" size={16} /> Producir varias piezas</button>
        <button type="button" className="btn btn-secondary" onClick={onRecrear}><Icon name="refresh" size={16} /> Recrear con mi marca</button>
      </div>
    </div>
  );
}
