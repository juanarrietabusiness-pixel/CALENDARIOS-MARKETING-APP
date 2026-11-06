import { useEffect, useState } from "react";
import Icon from "../Icon";
import { revisionesPendientes } from "../../lib/revision3qApi";
import { navegar, construirRuta, slugsDeClientes } from "../../lib/rutas";

// ============================================================
// Mi día: «Revisar las campañas de <cliente>» (la revisión 3Q, curso de campañas, entrega 5)
//
// El curso pide mirar a diario que las campañas se muestren y CAMBIAR cada 5 a 7 días, para que el algoritmo aprenda.
// Esto sale por cada cliente con cuenta publicitaria cuya última revisión tiene 6 días o más (o nunca se hizo), y se va
// solo en cuanto alguien abre la revisión (Resultados → Anuncios): abrirla es hacerla. Lo GRAVE de cada día no espera
// a esto: va a la campana (el cron, worker/lib/revision3q.js).
//
// Es un GET ligero (dos lecturas de D1, nada de Meta); los nombres salen de la lista de clientes que ya tiene la
// pantalla. Quien sólo mira no lo ve: abrir la revisión no cuenta como hecha para él.
// ============================================================

export default function RevisarCampanasDia({ clients = [], pulso = 0, yo = null }) {
  const [pendientes, setPendientes] = useState([]);
  const lectura = Boolean(yo?.soloLectura);
  useEffect(() => {
    if (lectura) return undefined;
    let vivo = true;
    revisionesPendientes().then((r) => { if (vivo) setPendientes(r?.pendientes ?? []); }).catch(() => {});
    return () => { vivo = false; };
  }, [pulso, lectura]);

  const porId = new Map(clients.map((c) => [c.id, c]));
  const lista = pendientes.filter((p) => porId.has(p.clientId));
  if (lectura || !lista.length) return null;
  const slugs = slugsDeClientes(clients);
  const ruta = (id) => construirRuta({ cliente: slugs.get(id) ?? id, pestana: "resultados", seccion: "anuncios" });

  return (
    <section className="dia-bloque" aria-label="Campañas por revisar">
      <div className="notice" style={{ display: "block" }}>
        <p style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "var(--sp-2)", margin: 0 }}>
          <Icon name="megaphone" size={16} /> {lista.length === 1 ? "Toca revisar unas campañas" : `Toca revisar las campañas de ${lista.length} clientes`}
        </p>
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", margin: "var(--sp-1) 0" }}>
          Lo que corre en su Ads Manager, con el número mágico y las 3 Q. Se cambia cada 5 a 7 días; abrir la revisión la da por hecha.
        </p>
        <ul style={{ margin: "var(--sp-1) 0 0 var(--sp-4)", fontSize: "var(--fs-2xs)" }}>
          {lista.map((p) => (
            <li key={p.clientId}>
              <a href={ruta(p.clientId)} onClick={(e) => { e.preventDefault(); navegar(ruta(p.clientId)); }}>
                Revisar las campañas de {porId.get(p.clientId).name}
              </a>
              {" · "}{p.dias == null ? "nunca se han revisado aquí" : `la última revisión fue hace ${p.dias} días`}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
