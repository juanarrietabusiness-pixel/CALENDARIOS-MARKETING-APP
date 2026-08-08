import { supabase } from "./supabase";
import { clientToRow, calendarToRow } from "./supabase";
import { lsGet, lsSet } from "../utils";

const LEGACY_KEY = "jads-data";
const DONE_KEY = "jads-migrado-a-supabase";

/**
 * Sube a Supabase los datos que quedaron en el navegador.
 *
 * Sólo actúa si la cuenta está vacía: si ya hay clientes en la base de
 * datos, volver a importar duplicaría todo. Los datos locales **no se
 * borran** — quedan como red de seguridad hasta que se compruebe que la
 * migración fue bien.
 */
export async function migrateLocalData(ownerId) {
  if (lsGet(DONE_KEY)) return { migrados: 0, motivo: "ya-migrado" };

  const raw = lsGet(LEGACY_KEY);
  if (!raw) return { migrados: 0, motivo: "sin-datos-locales" };

  let local;
  try {
    local = JSON.parse(raw);
  } catch {
    return { migrados: 0, motivo: "json-ilegible" };
  }
  if (!Array.isArray(local) || local.length === 0) {
    return { migrados: 0, motivo: "sin-datos-locales" };
  }

  const { count, error: countErr } = await supabase
    .from("clients").select("id", { count: "exact", head: true });
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    // La cuenta ya tiene datos: no se toca nada, pero tampoco se vuelve
    // a intentar en cada inicio de sesión.
    lsSet(DONE_KEY, new Date().toISOString());
    return { migrados: 0, motivo: "cuenta-no-vacia" };
  }

  let migrados = 0;
  for (const cliente of local) {
    const row = clientToRow(cliente, ownerId);
    delete row.id; // los ids locales no son uuid

    const { data: nuevoCliente, error } = await supabase
      .from("clients").insert(row).select().single();
    if (error) throw error;

    for (const cal of cliente.calendars ?? []) {
      const calRow = calendarToRow(cal, nuevoCliente.id, ownerId);
      delete calRow.id;
      const { error: calErr } = await supabase.from("calendars").insert(calRow);
      if (calErr) throw calErr;
    }

    migrados++;
  }

  lsSet(DONE_KEY, new Date().toISOString());
  return { migrados, motivo: "ok" };
}
