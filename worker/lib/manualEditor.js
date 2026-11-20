// ============================================================
// El MANUAL DEL EDITOR de videos grabados: leerlo, guardarlo con versión y volver a una versión vieja
//
// Lo puro (la base de la casa, las partes, la huella, juntar al guardar, lo compacto para Claude) está en
// src/lib/manualEditor.js; la ruta, en worker/rutas/manualEditor.js. Aquí sólo lo que toca D1
// (`manual_editor_versiones`, migración 0082): vale la ÚLTIMA versión y cada guardado es una fila nueva con el número
// siguiente. Nada se borra.
//
// No pisar a nadie: guardar lleva la versión que se leyó. Si ya hay otra más nueva, no se escribe y se devuelve la
// última (la pantalla junta por partes y vuelve a guardar). Si dos guardan a la vez con la misma versión leída, el
// índice único (owner_id, version) deja entrar a uno y el otro recibe lo mismo que si hubiera llegado tarde.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { limpiarPartes, huellasDeLaBase, cambiosDeLaCasa, partesDistintas } from "../../src/lib/manualEditor.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) ?? d : (t ?? d); } catch { return d; } };
/** Cuántas versiones enseña la lista (las más nuevas). */
export const VERSIONES_EN_LISTA = 30;
const MAX_MOTIVO = 200;

/** Una fila → lo que ve la pantalla y Claude. */
const deFila = (f) => (f ? {
  version: f.version,
  partes: limpiarPartes(leerJSON(f.partes, {})),
  bases: leerJSON(f.bases, {}),
  motivo: f.motivo ?? "",
  por: f.por_nombre || "",
  cuando: f.created_at,
} : null);

/** La versión vigente del espacio, o null si la agencia nunca lo cambió (vale el de la casa). */
export async function versionVigente(acceso) {
  return deFila((await acceso.leer("manual_editor_versiones", {}, "version desc", 1))[0]);
}

/** Una versión concreta, o null. */
export async function versionDel(acceso, numero) {
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) return null;
  return deFila(await acceso.leerUno("manual_editor_versiones", { version: n }));
}

/**
 * Lo que enseña la pantalla: la vigente (sus partes, quién y cuándo), qué partes cambió la casa desde que la agencia
 * las editó, y la lista de versiones con qué partes cambió cada una respecto de la anterior.
 */
export async function estadoDelManual(acceso) {
  const filas = await acceso.leerColumnas("manual_editor_versiones", ["version", "partes", "motivo", "por_nombre", "created_at"], {}, "version desc", VERSIONES_EN_LISTA + 1);
  const vigente = await versionVigente(acceso);
  const versiones = filas.slice(0, VERSIONES_EN_LISTA).map((f, i) => {
    const anterior = filas[i + 1];
    return {
      version: f.version,
      motivo: f.motivo ?? "",
      por: f.por_nombre || "",
      cuando: f.created_at,
      // La más vieja de la lista sin su anterior a la vista: si es la 1, se compara con la casa.
      cambia: anterior || f.version === 1 ? partesDistintas(leerJSON(anterior?.partes, {}), leerJSON(f.partes, {})) : null,
    };
  });
  return {
    version: vigente?.version ?? 0,
    partes: vigente?.partes ?? {},
    guardada: vigente ? { por: vigente.por, cuando: vigente.cuando, motivo: vigente.motivo } : null,
    cambiosDeLaCasa: vigente ? cambiosDeLaCasa(vigente.partes, vigente.bases) : [],
    versiones,
  };
}

/**
 * Guarda una versión nueva si `leida` es la vigente. → { ok: true } o { choque: { version, partes } } con la última.
 * Guardar lo mismo que ya hay no crea versión (`sinCambios`).
 */
export async function guardarVersion(acceso, { partes, leida, motivo = "", usuario = null, bases: conocidas = null }) {
  const vigente = await versionVigente(acceso);
  const actual = vigente?.version ?? 0;
  const ultima = () => ({ choque: { version: actual, partes: vigente?.partes ?? {} } });
  if (Number(leida ?? 0) !== actual) return ultima();
  const limpias = limpiarPartes(partes);
  if (!partesDistintas(vigente?.partes ?? {}, limpias).length) return { ok: true, sinCambios: true };
  // La huella de la base se conserva para las partes que no cambian ahora: si no, guardar OTRA parte apagaría el aviso
  // de que la casa cambió una que la agencia editó antes. Al volver a una versión vieja llegan las huellas de ESA versión
  // (`conocidas`): sus textos se escribieron sobre aquella base, no sobre la de hoy.
  const bases = { ...huellasDeLaBase(limpias) };
  for (const id of Object.keys(limpias)) {
    if (vigente?.partes?.[id] === limpias[id] && vigente.bases?.[id]) bases[id] = vigente.bases[id];
    else if (conocidas?.[id]) bases[id] = conocidas[id];
  }
  try {
    await acceso.insertar("manual_editor_versiones", {
      id: uuid(), version: actual + 1, partes: JSON.stringify(limpias), bases: JSON.stringify(bases),
      motivo: String(motivo ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MOTIVO), por: usuario?.id ?? null,
      por_nombre: String(usuario?.nombre ?? "").slice(0, 80), created_at: ahora(),
    });
  } catch (e) {
    // Otra persona guardó la misma versión en el mismo instante: el índice único lo paró.
    if (/unique/i.test(String(e?.message ?? e))) {
      const nueva = await versionVigente(acceso);
      return { choque: { version: nueva?.version ?? 0, partes: nueva?.partes ?? {} } };
    }
    throw e;
  }
  return { ok: true };
}
