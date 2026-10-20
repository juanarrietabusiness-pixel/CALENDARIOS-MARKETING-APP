import { useState } from "react";
import { BankPanel } from "./calendario/BankPanel";
import { useBancoIdeas } from "../hooks/useBancoIdeas";

// ============================================================
// La pestaña Ideas de un cliente: el banco de ideas ÚNICO de la agencia
// visto desde él (sus ideas, las generales y, con «Todas», las de todos).
// Es el mismo panel que se abre junto al calendario, a todo el ancho.
// ============================================================

export default function IdeasBank({ client, clientes = [], pulso = 0 }) {
  const [error, setError] = useState("");
  const banco = useBancoIdeas({ pulso, onError: setError });
  return (
    <>
      {error && <p role="alert" className="hint" style={{ color: "var(--danger)", marginBottom: "var(--sp-2)" }}>{error}</p>}
      <BankPanel banco={banco} client={client} clientes={clientes} modo="pagina" />
    </>
  );
}
