import { useState } from "react";
import Icon from "../Icon";
import { planDrive, carpetasDeFecha } from "../../lib/drive";
import { guardarPublicacionEnDrive, fraseDeGuardado } from "../../lib/guardarDrive";

/**
 * El botón «Guardar en Drive» de una publicación: dice si ya está guardada y dónde. `onGuardado(guardadoDrive)`
 * recibe lo que hay que apuntar en la publicación.
 */
export default function BotonGuardarDrive({ clientId, post, fecha, onGuardado }) {
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const plan = planDrive(post, fecha);
  if (!plan.total) return null;
  const pendiente = plan.subir.length > 0 || plan.quitar.length > 0;
  const donde = carpetasDeFecha(fecha).join(" / ");

  const guardar = async () => {
    setTrabajando(true);
    setMensaje(null);
    try {
      const r = await guardarPublicacionEnDrive(clientId, post, fecha);
      onGuardado(r.guardadoDrive);
      setMensaje({ ok: !r.fallos.length, texto: fraseDeGuardado(r, fecha) || "Ya estaba guardado." });
    } catch (e) {
      setMensaje({ ok: false, texto: `No se guardó en Drive: ${e.message}` });
    }
    setTrabajando(false);
  };

  return (
    <div className="guardar-drive">
      <button type="button" className="btn btn-secondary btn-sm" onClick={guardar} disabled={trabajando || !pendiente}>
        <Icon name={pendiente ? "upload" : "check"} size={16} />{" "}
        {trabajando ? "Guardando en Drive…" : !pendiente ? "Guardado en Drive"
          : plan.guardadas ? `Actualizar en Drive (${plan.subir.length} ${plan.subir.length === 1 ? "cambió" : "cambiaron"})` : "Guardar en Drive"}
      </button>
      <span className="hint">{donde}</span>
      <span role="status" className={mensaje ? (mensaje.ok ? "hint" : "cerebro-error") : "sr-only"}>{mensaje?.texto ?? ""}</span>
    </div>
  );
}
