import Icon from "./Icon";
import ContadorAtrasadas from "./ContadorAtrasadas";

// ============================================================
// La barra de abajo en el móvil
//
// En el teléfono lo que se usa todo el día —Mi día, el calendario del
// cliente, el asistente— quedaba detrás del menú hamburguesa o en un
// botón flotante que tapaba la última publicación. Aquí está al alcance
// del pulgar —también «Referencia»: guardar el enlace de un video bueno en
// el banco de ideas en dos toques—. «Más» abre el cajón con el resto de secciones y los
// clientes. Sólo se ve por debajo de 1024 px (index.css).
// ============================================================

export default function BarraInferior({ ruta, hayCliente, chatAbierto, pulso = 0, onMiDia, onCalendario, onChat, onSubir, onReferencia = null, onMas }) {
  const item = (props) => (
    <button type="button" className="barra-inferior-item" {...props} />
  );
  return (
    <nav className="barra-inferior" aria-label="Accesos rápidos" style={{ gridTemplateColumns: `repeat(${onReferencia ? 6 : 5}, 1fr)` }}>
      {item({
        onClick: onMiDia,
        "aria-current": ruta.vista === "tareas" ? "page" : undefined,
        children: (<><span className="barra-inferior-icono"><Icon name="clipboardCheck" size={22} /><ContadorAtrasadas pulso={pulso} /></span><span>Mi día</span></>),
      })}
      {item({
        onClick: onCalendario,
        "aria-current": ruta.vista === "panel" && hayCliente ? "page" : undefined,
        children: (<><Icon name="calendar" size={22} /><span>{hayCliente ? "Calendario" : "Inicio"}</span></>),
      })}
      {item({
        onClick: onSubir,
        children: (<><Icon name="upload" size={22} /><span>Subir</span></>),
      })}
      {onReferencia && item({
        onClick: onReferencia,
        "aria-label": "Guardar una referencia en el banco de ideas",
        children: (<><Icon name="link" size={22} /><span aria-hidden="true">Enlace</span></>),
      })}
      {item({
        onClick: onChat,
        "aria-pressed": chatAbierto,
        children: (<><Icon name="messageCircle" size={22} /><span>Asistente</span></>),
      })}
      {item({
        onClick: onMas,
        children: (<><Icon name="menu" size={22} /><span>Más</span></>),
      })}
    </nav>
  );
}
