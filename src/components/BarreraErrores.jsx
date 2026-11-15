import { Component } from "react";
import { esFalloDeCarga, recargarUnaVez } from "../lib/recargaDespliegue";

/**
 * Una barrera de errores: lo que falla DENTRO no tumba lo de fuera. Va en el armazón (toda la aplicación) y alrededor
 * de cada pantalla grande, del asistente y de los diálogos: una pestaña rota enseña «Algo falló en esta pantalla» y el
 * resto sigue funcionando. Un trozo que no se pudo descargar (una pestaña abierta durante un despliegue) recarga la
 * página una vez (lib/recargaDespliegue.js).
 *
 * `llave`: cuando cambia (otra pantalla, otro cliente), la barrera se rearma. `completa`: ocupa la pantalla entera
 * (la del armazón); `flotante`: abajo, por encima de todo (el asistente y los diálogos, que no tienen sitio propio).
 * Tiene que ser una clase: React sólo recoge errores de render con `getDerivedStateFromError`.
 */
export default class BarreraErrores extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, llave: props.llave };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    return props.llave !== state.llave ? { error: null, llave: props.llave } : null;
  }

  componentDidCatch(error) {
    if (esFalloDeCarga(error) && recargarUnaVez()) return;
    console.error("Algo falló en esta pantalla:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const carga = esFalloDeCarga(error);
    const caja = (
      <div role="alert" className="notice notice-error" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--sp-2)" }}>
        <span style={{ flex: "1 1 220px" }}>
          <strong>Algo falló en esta pantalla.</strong>{" "}
          {carga ? "Hay una versión nueva de la aplicación: vuelve a cargar para seguir." : "Vuelve a cargar; si se repite, cuéntanos qué estabas haciendo."}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => globalThis.location?.reload()}>Volver a cargar</button>
      </div>
    );
    if (this.props.flotante) return <div style={{ position: "fixed", insetInline: "var(--sp-4)", bottom: "var(--sp-4)", zIndex: "var(--z-sobre-dialogo)" }}>{caja}</div>;
    if (!this.props.completa) return caja;
    return <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "var(--sp-5)" }}><div style={{ maxWidth: 480 }}>{caja}</div></div>;
  }
}
