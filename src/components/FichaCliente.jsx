import Icon from "./Icon";
import { idDeCarpeta, enlaceCarpeta } from "../lib/drive";

// ============================================================
// La ficha del cliente, para consultarla sin abrir el formulario
// ============================================================

const CAMPOS = [
  ["industry", "Industria"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["phone", "Teléfono"],
  ["sucursales", "Sucursales"],
  ["descripcion", "Descripción"],
  ["audiencia", "Audiencia"],
  ["valores", "Valores"],
  ["competencia", "Competencia"],
  ["estiloGuion", "Estilo de guion"],
  ["estiloLocucion", "Estilo de locución"],
  ["hashtags", "Hashtags"],
  ["aiInstructions", "Instrucciones para la IA"],
];

export default function FichaCliente({ client, onEditar }) {
  const drive = idDeCarpeta(client.driveFolder);
  const presentes = CAMPOS.filter(([k]) => String(client[k] ?? "").trim());
  return (
    <div className="ficha-cliente">
      <div className="ficha-cliente-cabecera">
        <div className="ficha-colores" aria-label="Colores de marca">
          {[client.primaryColor, client.secondaryColor, client.accentColor].filter(Boolean).map((c, i) => (
            <span key={i} style={{ background: c }} title={c} role="img" aria-label={`Color ${c}`} />
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onEditar}>
          <Icon name="pencil" size={16} /> Editar ficha
        </button>
      </div>

      <dl className="ficha-lista">
        {presentes.map(([k, etiqueta]) => (
          <div key={k}>
            <dt>{etiqueta}</dt>
            <dd>{client[k]}</dd>
          </div>
        ))}
        <div>
          <dt>Google Drive</dt>
          <dd>{drive ? <a href={enlaceCarpeta(drive)} target="_blank" rel="noreferrer">Abrir la carpeta</a> : "Sin carpeta"}</dd>
        </div>
        <div>
          <dt>ADN en GitHub</dt>
          <dd>{client.githubRepo ? `${client.githubRepo}${client.githubFolder ? ` · ${client.githubFolder}` : ""}` : "Sin conectar"}</dd>
        </div>
      </dl>
      {presentes.length === 0 && (
        <p className="hint">La ficha está casi vacía. Cuanto más sepa de la marca, mejor escribe la IA.</p>
      )}
    </div>
  );
}
