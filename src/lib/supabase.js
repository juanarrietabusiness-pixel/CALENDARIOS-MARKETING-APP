import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * ¿Está configurado Supabase en este despliegue?
 *
 * La aplicación funciona sin él: los datos viven en localStorage. En
 * cuanto se definen las variables de entorno, `supabase` deja de ser
 * null y las funciones de sincronización pasan a estar disponibles.
 */
export const isSupabaseEnabled = Boolean(url && anonKey);

export const supabase = isSupabaseEnabled
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Convierte un cliente del formato de la aplicación al de la base de datos.
 * El token de GitHub se omite a propósito: es un secreto del usuario y no
 * debe salir del navegador.
 */
export function clientToRow(client, ownerId) {
  return {
    id: client.dbId || undefined,
    owner_id: ownerId,
    name: client.name,
    industry: client.industry || "",
    instagram: client.instagram || "",
    phone: client.phone || "",
    whatsapp: client.whatsapp || "",
    sucursales: client.sucursales || "",
    direcciones: client.direcciones || "",
    primary_color: client.primaryColor || "#1E90FF",
    secondary_color: client.secondaryColor || "#FFFFFF",
    accent_color: client.accentColor || "#F5A623",
    logo: client.logo || null,
    descripcion: client.descripcion || "",
    valores: client.valores || "",
    audiencia: client.audiencia || "",
    competencia: client.competencia || "",
    estilo_guion: client.estiloGuion || "",
    estilo_locucion: client.estiloLocucion || "",
    hashtags: client.hashtags || "",
    notas_inspeccion: client.notasInspeccion || "",
    github_repo: client.githubRepo || "",
    github_folder: client.githubFolder || "",
    github_context: client.githubContext || "",
    ideas_bank: client.ideasBank || [],
    saved_categories: client.savedCategories || [],
    weekly_structure: client.weeklyStructure || [],
  };
}

/** Inverso de clientToRow. */
export function rowToClient(row) {
  return {
    id: row.id,
    dbId: row.id,
    name: row.name,
    industry: row.industry,
    instagram: row.instagram,
    phone: row.phone,
    whatsapp: row.whatsapp,
    sucursales: row.sucursales,
    direcciones: row.direcciones,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    logo: row.logo,
    descripcion: row.descripcion,
    valores: row.valores,
    audiencia: row.audiencia,
    competencia: row.competencia,
    estiloGuion: row.estilo_guion,
    estiloLocucion: row.estilo_locucion,
    hashtags: row.hashtags,
    notasInspeccion: row.notas_inspeccion,
    githubRepo: row.github_repo,
    githubFolder: row.github_folder,
    githubContext: row.github_context,
    githubToken: "",
    ideasBank: row.ideas_bank || [],
    savedCategories: row.saved_categories || [],
    weeklyStructure: row.weekly_structure || [],
    savedPlans: [],
    calendars: [],
  };
}

export function calendarToRow(cal, clientDbId, ownerId) {
  return {
    id: cal.dbId || undefined,
    client_id: clientDbId,
    owner_id: ownerId,
    name: cal.name || "",
    month: cal.month,
    year: cal.year,
    campaign: cal.campaign || "",
    week_concepts: cal.weekConcepts || [],
    days: cal.days || [],
    approval_id: cal.approvalId || null,
    generated_at: cal.generatedAt || null,
  };
}

export function rowToCalendar(row) {
  return {
    id: row.id,
    dbId: row.id,
    name: row.name,
    month: row.month,
    year: row.year,
    campaign: row.campaign,
    weekConcepts: row.week_concepts || [],
    days: row.days || [],
    approvalId: row.approval_id || undefined,
    generatedAt: row.generated_at,
  };
}
