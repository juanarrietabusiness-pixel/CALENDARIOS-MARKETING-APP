// ============================================================
// Conversión Postgres → D1
//
// Puro: sin red, sin ficheros, sin Supabase. Aquí vive todo lo que
// puede corromper datos EN SILENCIO durante la migración —un null que
// se vuelve "null", un jsonb que se serializa dos veces, una imagen
// que se pierde— y por eso está separado de los scripts que hablan
// con la red: para poder probarlo.
//
// Las columnas se enumeran a mano, una por una. Un `{...fila}` copiaría
// también lo que Postgres tenga de más y callaría lo que falte; la
// lista explícita falla en el test el día que alguien añada una columna
// y se olvide de traerla.
// ============================================================

/** Fila máxima que acepta D1. Ver docs/migracion-cloudflare.md § 5.2. */
export const LIMITE_FILA_D1 = 2_000_000;

/** Postgres devuelve null donde la aplicación espera cadena vacía. */
export function texto(v) {
  return v === null || v === undefined ? "" : String(v);
}

/** Igual, pero conservando el null: hay columnas que sí lo admiten. */
export function textoONulo(v) {
  return v === null || v === undefined || v === "" ? null : String(v);
}

export function entero(v, porDefecto = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : porDefecto;
}

/** boolean → 0/1, que es como lo guarda SQLite. */
export function booleano(v) {
  return v ? 1 : 0;
}

/**
 * jsonb → texto.
 *
 * El cliente de Postgres devuelve `jsonb` ya deserializado, pero un
 * volcado en JSON puede traerlo de las dos formas. Si ya es texto se
 * valida y se deja: volver a serializarlo lo convertiría en una cadena
 * dentro de una cadena, y `json_valid()` lo daría por bueno.
 */
export function json(v, porDefecto = "[]") {
  if (v === null || v === undefined) return porDefecto;
  if (typeof v === "string") {
    try {
      JSON.parse(v);
      return v;
    } catch {
      return porDefecto;
    }
  }
  return JSON.stringify(v);
}

/**
 * timestamptz → ISO-8601 UTC.
 *
 * Esto convierte un INSTANTE, que es lo que ISO-8601 representa sin
 * ambigüedad. No sirve para obtener un día del calendario: para eso
 * está `fmtDate()` en utils.js, y usar `toISOString()` allí desplaza
 * la fecha en medio mundo.
 */
export function instante(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ------------------------------------------------------------
// Imágenes
// ------------------------------------------------------------

const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i;

export function esDataUri(v) {
  return typeof v === "string" && DATA_URI.test(v);
}

export function extensionDe(dataUri) {
  const m = DATA_URI.exec(dataUri || "");
  if (!m) return "bin";
  const sub = m[1].split("/")[1].toLowerCase();
  return sub === "jpeg" ? "jpg" : sub;
}

/**
 * Saca las imágenes en base64 del JSON y las sustituye por claves de R2.
 *
 * Tres cosas que no son obvias y que el test fija:
 *
 *  - **Es idempotente.** Lo que ya es una clave se deja como está, así
 *    que la conversión se puede repetir sin duplicar objetos en R2.
 *  - **Una referencia visual puede ser un ENLACE** (`type: "link"`),
 *    y su `url` es una dirección de verdad. Convertirla la rompería.
 *    Sólo se toca lo que empieza por `data:`.
 *  - **No se reescribe la publicación entera**, sólo su campo `image`.
 *    Perder un campo aquí no da ningún error: da un dato que
 *    desaparece sin que nadie se entere hasta que alguien lo busca.
 */
export function extraerImagenes(cal, clientId, nuevaClave = claveAleatoria) {
  const imagenes = [];

  const aClave = (valor, carpeta) => {
    if (!esDataUri(valor)) return valor;
    const clave = `clientes/${clientId}/${carpeta}/${nuevaClave()}.${extensionDe(valor)}`;
    imagenes.push({ clave, dataUri: valor });
    return clave;
  };

  const days = (cal.days ?? []).map((dia) => ({
    ...dia,
    posts: (dia.posts ?? []).map((post) =>
      esDataUri(post.image) ? { ...post, image: aClave(post.image, "posts") } : post,
    ),
  }));

  const visualReferences = (cal.visualReferences ?? []).map((ref) =>
    esDataUri(ref.url) ? { ...ref, url: aClave(ref.url, "referencias") } : ref,
  );

  return { days, visualReferences, imagenes };
}

/** Identificador corto y sin ambigüedad visual. Se inyecta en los tests. */
export function claveAleatoria() {
  return crypto.randomUUID();
}

// ------------------------------------------------------------
// Filas
// ------------------------------------------------------------

export function filaCliente(row) {
  return {
    id: texto(row.id),
    owner_id: texto(row.owner_id),
    name: texto(row.name),
    industry: texto(row.industry),
    instagram: texto(row.instagram),
    phone: texto(row.phone),
    whatsapp: texto(row.whatsapp),
    sucursales: texto(row.sucursales),
    direcciones: texto(row.direcciones),
    primary_color: texto(row.primary_color) || "#1E90FF",
    secondary_color: texto(row.secondary_color) || "#FFFFFF",
    accent_color: texto(row.accent_color) || "#F5A623",
    logo: textoONulo(row.logo),
    descripcion: texto(row.descripcion),
    valores: texto(row.valores),
    audiencia: texto(row.audiencia),
    competencia: texto(row.competencia),
    estilo_guion: texto(row.estilo_guion),
    estilo_locucion: texto(row.estilo_locucion),
    hashtags: texto(row.hashtags),
    notas_inspeccion: texto(row.notas_inspeccion),
    github_repo: texto(row.github_repo),
    github_folder: texto(row.github_folder),
    github_context: texto(row.github_context),
    ai_instructions: texto(row.ai_instructions),
    ideas_bank: json(row.ideas_bank, "[]"),
    saved_categories: json(row.saved_categories, "[]"),
    weekly_structure: json(row.weekly_structure, "[]"),
    meta_recipe: row.meta_recipe == null ? null : json(row.meta_recipe, "{}"),
    meta_recipe_sha: textoONulo(row.meta_recipe_sha),
    meta_recipe_at: instante(row.meta_recipe_at),
    created_at: instante(row.created_at),
    updated_at: instante(row.updated_at),
  };
}

export function filaCalendario(row) {
  return {
    id: texto(row.id),
    client_id: texto(row.client_id),
    owner_id: texto(row.owner_id),
    name: texto(row.name),
    month: entero(row.month),
    year: entero(row.year),
    campaign: texto(row.campaign),
    week_concepts: json(row.week_concepts, "[]"),
    days: json(row.days, "[]"),
    visual_references: json(row.visual_references, "[]"),
    day_labels: json(row.day_labels, "{}"),
    offers: texto(row.offers),
    promo_code: texto(row.promo_code),
    approval_id: textoONulo(row.approval_id),
    generated_at: instante(row.generated_at),
    share_token: textoONulo(row.share_token),
    share_enabled: booleano(row.share_enabled),
    share_expires_at: instante(row.share_expires_at),
    allow_editing: booleano(row.allow_editing),
    created_at: instante(row.created_at),
    updated_at: instante(row.updated_at),
  };
}

export function filaAprobacion(row) {
  return {
    id: texto(row.id),
    calendar_id: texto(row.calendar_id),
    post_id: texto(row.post_id),
    estado: texto(row.estado),
    comentario: texto(row.comentario),
    reviewer_name: texto(row.reviewer_name),
    suggested_descripcion: textoONulo(row.suggested_descripcion),
    suggested_guion: textoONulo(row.suggested_guion),
    created_at: instante(row.created_at),
    updated_at: instante(row.updated_at),
  };
}

/**
 * Cuánto ocupa una fila, para avisar ANTES de que D1 la rechace.
 *
 * El calendario de agosto pesa medio mega con 12 de 25 publicaciones
 * ilustradas: se llega al techo usando la aplicación como está pensada.
 */
export function pesoDeFila(fila) {
  let total = 0;
  for (const v of Object.values(fila)) {
    if (typeof v === "string") total += new TextEncoder().encode(v).length;
    else if (v !== null && v !== undefined) total += String(v).length;
  }
  return total;
}

export function cabeEnD1(fila) {
  return pesoDeFila(fila) <= LIMITE_FILA_D1;
}
