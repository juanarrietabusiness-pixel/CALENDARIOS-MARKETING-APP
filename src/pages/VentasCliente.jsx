import { useEffect, useId, useState } from "react";
import Icon from "../components/Icon";
import { ventasPublicas, guardarVentasPublicas } from "../lib/ventasApi";
import { limpiarVentas, leerMonto, dinero, VENTANA_CLIENTE } from "../lib/ventasSemana";
import "./VentasCliente.css";

// ============================================================
// /ventas?t=… — «Tus ventas de la semana», la página que abre el CLIENTE
//
// Sin sesión, como la de aprobación: el testigo del enlace es todo lo que hace falta. Se llena en 30 segundos desde el
// teléfono: cuántas ventas cerró por WhatsApp y por cuánto (lo único obligatorio); lo de los anuncios y lo de otros
// canales, plegado. Enseña lo que la aplicación ya sabe («esta semana te escribieron 84 personas por los anuncios»)
// para que el número tenga sentido, y las dos semanas anteriores para corregir. Nunca un costo.
//
// Va con la marca del CLIENTE (su nombre, su logo y su color), no con la de la agencia.
// ============================================================

/** El color del cliente si es un #RRGGBB; si no, uno neutro. */
function colorDe(c) {
  return /^#[0-9a-f]{6}$/i.test(String(c ?? "")) ? c : "#1F6FD1";
}

/** Texto blanco o casi negro sobre un color, el que más contraste (luminancia relativa, WCAG). */
function textoSobre(hex) {
  const canal = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? "#FFFFFF" : "#111827";
}

const personas = (n) => `${n.toLocaleString("es-PA")} ${n === 1 ? "persona" : "personas"}`;

/** Lo que la aplicación ya sabe de esa semana, dicho para el cliente. */
function loQueSabemos(s) {
  if (s.conversaciones == null || s.conversaciones <= 0) return "";
  const cuando = s.nombre === "Esta semana" ? "Esta semana" : s.nombre === "La semana pasada" ? "La semana pasada" : "Esa semana";
  return `${cuando} te escribieron ${personas(s.conversaciones)} por los anuncios.`;
}

/** Un campo de texto grande del formulario, con su etiqueta y su ayuda. */
function Campo({ etiqueta, ayuda, valor, onCambio, modo = "numeric", prefijo = "", obligatorio = false }) {
  const id = useId();
  return (
    <div className="ventas-campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="ventas-entrada" data-prefijo={prefijo ? "" : undefined}>
        {prefijo && <span aria-hidden="true">{prefijo}</span>}
        <input
          id={id}
          type="text"
          inputMode={modo}
          autoComplete="off"
          value={valor}
          required={obligatorio}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          onChange={(e) => onCambio(e.target.value)}
        />
      </div>
      {ayuda && <p id={`${id}-ayuda`} className="ventas-ayuda">{ayuda}</p>}
    </div>
  );
}

/** El formulario de UNA semana: ventas y monto (obligatorios) y lo opcional plegado. */
function FormularioSemana({ testigo, semana, hoy, moneda, onGuardada }) {
  const [ventas, setVentas] = useState(semana.ventas == null ? "" : String(semana.ventas));
  const [monto, setMonto] = useState(semana.monto == null ? "" : String(semana.monto));
  const [deAnuncios, setDeAnuncios] = useState(semana.deAnuncios == null ? "" : String(semana.deAnuncios));
  const [otros, setOtros] = useState(semana.otrosCanales == null ? "" : String(semana.otrosCanales));
  const [nota, setNota] = useState(semana.nota ?? "");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState("");
  const idNota = useId();
  const opcionalAbierto = semana.deAnuncios != null || semana.otrosCanales != null || Boolean(semana.nota);

  // Lo tecleado, como se va a guardar: «1.250» o «1,250.50» no siempre quieren decir lo que parece.
  const montoLeido = leerMonto(monto);
  const vistaMonto = montoLeido != null && !Number.isNaN(montoLeido) && String(montoLeido) !== monto.trim() ? `Se guarda como ${dinero(montoLeido, moneda)}.` : "";

  async function enviar(e) {
    e.preventDefault();
    setFallo("");
    const datos = { semana: semana.semana, ventas, monto, deAnuncios, otrosCanales: otros, nota };
    const { error } = limpiarVentas(datos, { hoy, ventana: VENTANA_CLIENTE });
    if (error) { setFallo(error); return; }
    setEnviando(true);
    try {
      const r = await guardarVentasPublicas(testigo, datos);
      onGuardada(r.semana);
    } catch (err) {
      setFallo(err.message || "No se pudo guardar. Vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="ventas-form" onSubmit={enviar} noValidate>
      <Campo etiqueta="¿Cuántas ventas cerraste por WhatsApp?" ayuda="Si no hubo, pon 0." valor={ventas} onCambio={setVentas} obligatorio />
      <Campo etiqueta="¿Por cuánto en total?" ayuda={vistaMonto || "Lo que te pagaron por esas ventas."} valor={monto} onCambio={setMonto} modo="decimal" prefijo="$" obligatorio />
      <details className="ventas-opcional" open={opcionalAbierto || undefined}>
        <summary><span>Si lo sabes (opcional)</span><Icon name="chevronDown" size={18} /></summary>
        <Campo etiqueta="¿Cuántas de esas ventas vinieron de los anuncios?" valor={deAnuncios} onCambio={setDeAnuncios} />
        <Campo etiqueta="Ventas en tienda u otros canales (no por WhatsApp)" valor={otros} onCambio={setOtros} modo="decimal" prefijo="$" />
        <div className="ventas-campo">
          <label htmlFor={idNota}>Algo que quieras contarnos</label>
          <textarea id={idNota} rows={2} maxLength={280} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </details>
      {fallo && <p role="alert" className="ventas-error">{fallo}</p>}
      <button type="submit" className="ventas-boton" disabled={enviando}>
        {enviando ? "Guardando…" : semana.apuntada ? "Guardar los cambios" : "Guardar"}
      </button>
    </form>
  );
}

/** Lo ya apuntado de una semana, en una línea. */
function resumenApuntado(s, moneda) {
  if (!s.apuntada) return "Sin apuntar";
  return `${s.ventas === 1 ? "1 venta" : `${s.ventas} ventas`} · ${dinero(s.monto, moneda)}`;
}

export default function VentasCliente() {
  const testigo = new URLSearchParams(window.location.search).get("t") ?? "";
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");
  const [gracias, setGracias] = useState("");
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    ventasPublicas(testigo)
      .then((d) => {
        setDatos(d);
        document.title = `Tus ventas de la semana · ${d.cliente?.nombre ?? ""}`.replace(/ · $/, "");
      })
      .catch((e) => setFallo(e.estado === 404 ? "Este enlace no existe o ya no está disponible. Pídele uno nuevo a tu agencia." : e.message));
  }, [testigo]);

  if (fallo) return <main className="ventas-pagina"><div className="ventas-contenido"><p role="alert" className="ventas-error ventas-solo">{fallo}</p></div></main>;
  if (!datos) return <main className="ventas-pagina"><div className="ventas-contenido"><p role="status" className="ventas-ayuda ventas-solo">Cargando…</p></div></main>;

  const color = colorDe(datos.cliente?.color);
  const estilo = { "--ventas-color": color, "--ventas-sobre-color": textoSobre(color) };
  const toca = datos.semanas.find((s) => s.semana === datos.toca) ?? datos.semanas[0];
  const otras = datos.semanas.filter((s) => s.semana !== toca.semana);

  function alGuardar(guardada) {
    setDatos((d) => ({
      ...d,
      semanas: d.semanas.map((s) => (s.semana === guardada.semana ? { ...s, ...guardada, apuntada: true } : s)),
    }));
    const s = datos.semanas.find((x) => x.semana === guardada.semana);
    setGracias(`¡Gracias! Guardamos tus ventas de la semana ${s?.etiqueta ?? ""}.`);
    setAbierta(null);
  }

  return (
    <main className="ventas-pagina" style={estilo}>
      <div className="ventas-contenido">
        <header className="ventas-cabecera">
          {datos.cliente?.logo && <img src={datos.cliente.logo} alt="" className="ventas-logo" />}
          <p className="ventas-marca">{datos.cliente?.nombre}</p>
          <h1>Tus ventas de la semana</h1>
          <p className="ventas-ayuda">Te toma 30 segundos. Con esto sabemos cuánto te deja cada dólar de publicidad.</p>
        </header>

        <p role="status" className="ventas-gracias">{gracias}</p>

        <section className="ventas-tarjeta" aria-labelledby="ventas-toca">
          <h2 id="ventas-toca">{toca.nombre} <span>{toca.etiqueta}</span></h2>
          {loQueSabemos(toca) && <p className="ventas-sabemos">{loQueSabemos(toca)}</p>}
          <FormularioSemana key={`${toca.semana}-${toca.actualizado ?? ""}`} testigo={testigo} semana={toca} hoy={datos.hoy} moneda={datos.moneda} onGuardada={alGuardar} />
        </section>

        {otras.length > 0 && (
          <section className="ventas-otras" aria-labelledby="ventas-otras">
            <h2 id="ventas-otras">¿Quieres corregir otra semana?</h2>
            {otras.map((s) => {
              const abiertaEsta = abierta === s.semana;
              const idPanel = `ventas-semana-${s.semana}`;
              return (
                <div key={s.semana} className="ventas-tarjeta ventas-tarjeta-plegada">
                  <button
                    type="button"
                    className="ventas-plegable"
                    aria-expanded={abiertaEsta}
                    aria-controls={idPanel}
                    onClick={() => setAbierta(abiertaEsta ? null : s.semana)}
                  >
                    <span className="ventas-plegable-titulo">{s.nombre} <span>{s.etiqueta}</span></span>
                    <span className="ventas-plegable-estado" data-apuntada={s.apuntada ? "" : undefined}>{resumenApuntado(s, datos.moneda)}</span>
                  </button>
                  <div id={idPanel} hidden={!abiertaEsta}>
                    {loQueSabemos(s) && <p className="ventas-sabemos">{loQueSabemos(s)}</p>}
                    {abiertaEsta && (
                      <FormularioSemana key={`${s.semana}-${s.actualizado ?? ""}`} testigo={testigo} semana={s} hoy={datos.hoy} moneda={datos.moneda} onGuardada={alGuardar} />
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
