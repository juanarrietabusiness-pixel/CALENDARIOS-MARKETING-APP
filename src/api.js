import { supabase, isSupabaseEnabled } from "./lib/supabase";

/**
 * Llama a una función del servidor.
 *
 * Las claves de IA y el token de GitHub viven en los secretos del
 * proyecto: el navegador nunca las ve. supabase-js adjunta el token de
 * la sesión, así que las funciones pueden exigir que haya una.
 *
 * El error útil viene en el cuerpo de la respuesta, no en `error.message`
 * (que sólo dice «non-2xx status code»), de ahí la lectura de `context`.
 */
async function invokeFunction(name, body) {
  if (!isSupabaseEnabled) {
    throw new Error("El servidor de IA no está configurado en este despliegue.");
  }

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let mensaje = "";
    try {
      mensaje = (await error.context?.json())?.error ?? "";
    } catch {
      /* la respuesta no era JSON */
    }
    throw new Error(mensaje || "No se pudo contactar con el servidor.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Genera texto con la IA.
 *
 * Los reintentos y la elección de proveedor ya no están aquí: los hace
 * la función del servidor, que además no tiene el límite de tiempo del
 * navegador cerrando la pestaña a medias.
 */
export async function callAI(content, { maxTokens, tier } = {}) {
  const data = await invokeFunction("ai", { content, maxTokens, tier });
  // El servidor avisa si el modelo se quedó sin tokens a media respuesta.
  // Sin esto, un prompt maestro cortado a media pieza llega a Meta AI
  // como si estuviera entero.
  if (data?.truncated) {
    throw new Error("La respuesta se cortó por longitud. Prueba con menos piezas por tanda.");
  }
  return data?.text ?? "";
}

/**
 * Marca un bloque para la caché de prompt de Anthropic.
 *
 * El ADN del cliente son decenas de miles de caracteres y se reenvía en
 * cada tanda de seis publicaciones. Marcado, se paga una vez y las tandas
 * siguientes lo leen de la caché.
 */
export function cachedBlock(text) {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function parseAIResponse(rawText) {
  const results = {};
  const blocks = rawText.split(/<<<PUBLICACION_ID:/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const idEnd = block.indexOf(">>>");
    if (idEnd === -1) continue;
    const id = block.slice(0, idEnd).trim();
    let rest = block.slice(idEnd + 3);
    const nextBlock = rest.indexOf("<<<PUBLICACION_ID:");
    if (nextBlock !== -1) rest = rest.slice(0, nextBlock);

    const guionMatch = rest.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|<<<|$)/i);
    const descMatch = rest.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|<<<|$)/i);
    const hashMatch = rest.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|<<<|$)/i);

    const guion = guionMatch ? guionMatch[1].trim() : "";
    const descripcion = descMatch ? descMatch[1].trim() : "";
    const hashtagsFinales = hashMatch ? hashMatch[1].trim() : "";

    if (guion || descripcion || hashtagsFinales) {
      results[id] = { guion, descripcion, hashtagsFinales };
    }
  }
  return results;
}

export function buildScriptPrompt(client, calendar, posts, adnExtra = "") {
  const ctx = buildClientContext(client, calendar, adnExtra);
  const postsList = posts.map((p) => {
    const formatRules = {
      post: "Solo DESCRIPCION (caption con emojis, CTA y hashtags al final). No escribas GUION.",
      reel: "GUION (escena por escena: Hook → Desarrollo → CTA) + DESCRIPCION (caption con hashtags al final)",
      carrusel: "GUION (texto por cada card/slide, separados por ---) + DESCRIPCION (caption con hashtags al final)",
      historia: "GUION (nota breve, max 2 oraciones) + DESCRIPCION (texto overlay con hashtags al final)",
      live: "GUION (puntos clave a cubrir en el live, formato bullet) + DESCRIPCION (caption de anuncio con hashtags al final)",
    };
    return `<<<PUBLICACION_ID:${p.id}>>>
FORMATO: ${p.format}
CATEGORIA: ${p.category || "N/A"}
DIA: ${p._date} (${p._dayName || ""})
SEMANA: ${p._weekNumber || ""}
CONCEPTO_SEMANAL: ${p._concept || "N/A"}
IDEA: ${p.idea || "genera según contexto del cliente"}
REGLAS_FORMATO: ${formatRules[p.format] || formatRules.post}`;
  }).join("\n\n");

  return `${ctx}

ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "Natural y profesional"}
WHATSAPP: ${client.whatsapp || "N/A"}
HASHTAGS BASE: ${client.hashtags || "#Panama"}
CAMPAÑA: ${calendar?.campaign || "N/A"}
${calendar?.offers ? `OFERTAS Y DESCUENTOS DEL MES: ${calendar.offers}` : ""}
${calendar?.promoCode ? `CÓDIGO PROMOCIONAL: ${calendar.promoCode}` : ""}

---

INSTRUCCIONES:
Genera el contenido para CADA publicación listada abajo.
Respeta el formato de salida EXACTAMENTE.
Cada publicación va delimitada por <<<PUBLICACION_ID:xxx>>> con su ID correspondiente.

REGLAS POR FORMATO:
- post: Solo DESCRIPCION (caption con emojis + CTA + hashtags al final del texto). NO incluir GUION.
- reel: GUION (Hook → Desarrollo → CTA, escena por escena) + DESCRIPCION (incluye hashtags al final)
- carrusel: GUION (texto por card, separados por ---) + DESCRIPCION (incluye hashtags al final)
- historia: GUION (nota breve) + DESCRIPCION (incluye hashtags al final)
- live: GUION (bullet points del live) + DESCRIPCION (incluye hashtags al final)

IMPORTANTE: Los hashtags deben ir DENTRO de la DESCRIPCION, al final del caption. NO uses un campo HASHTAGS_FINALES separado.

FORMATO DE RESPUESTA OBLIGATORIO:
<<<PUBLICACION_ID:id_del_post>>>
GUION:
(contenido del guión aquí, o vacío si es post)
DESCRIPCION:
(caption/descripción aquí, con hashtags al final)

---

PUBLICACIONES A GENERAR:
${postsList}`;
}

export function parseGitHubUrl(url) {
  if (!url) return null;
  const treeMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)/);
  if (treeMatch) {
    return { owner: treeMatch[1], repo: treeMatch[2].replace(/\.git$/, ""), folder: treeMatch[3].replace(/\/$/, "") };
  }
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2].replace(/\.git$/, ""), folder: "" };
  }
  return null;
}

/**
 * Lee el ADN de marca del repositorio del cliente.
 *
 * Ya no recibe token: el de GitHub es uno solo del servidor. Antes cada
 * cliente guardaba el suyo en el navegador y acababa dentro del JSON de
 * «Exportar».
 */
export async function fetchGitHubADN(repoUrl, folder = "") {
  if (!parseGitHubUrl(repoUrl)) {
    return { content: "", files: [], subfolders: [] };
  }
  return await invokeFunction("github-adn", { repoUrl, folder });
}

export async function generateSinglePost(client, post, day, calendar) {
  const isPost = post.format === "post";
  const adnExtra = (await loadADN(client)).content;
  const ctx = buildClientContext(client, calendar, adnExtra);

  const formatRules = {
    post: `DESCRIPCION: caption completo con emojis, CTA a WhatsApp (${client.whatsapp || "N/A"}) y hashtags al final (${client.hashtags || "#Panama"})`,
    reel: `GUION:\nHook (0-3s): ...\nDesarrollo (3-20s): ...\nCTA final: ...\n\nDESCRIPCION: caption para Instagram con emojis, CTA y hashtags al final`,
    carrusel: `GUION:\nPortada: ...\nSlide 1: ...\nSlide 2: ...\nCTA: ...\n\nDESCRIPCION: caption para Instagram con emojis, CTA y hashtags al final`,
    historia: `GUION: nota breve de que cubrir\n\nDESCRIPCION: texto overlay con hashtags al final`,
    live: `GUION: bullet points del live\n\nDESCRIPCION: caption de anuncio del live con hashtags al final`,
  };

  let promptText = `${ctx}

CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})
${post.idea ? `IDEA: ${post.idea}` : "Genera basandote en el contexto del cliente, la categoria y el concepto semanal."}

Genera el contenido en este formato exacto:
${formatRules[post.format] || formatRules.post}

${isPost ? "No incluyas GUION para posts estaticos, solo DESCRIPCION." : ""}
Escribe directamente el contenido, sin preambulos.`;

  const content = [];
  if (post.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: post.image.includes(",") ? post.image.split(",")[1] : post.image,
      },
    });
    promptText = `Basandote en la imagen adjunta y el siguiente contexto:\n\n${promptText}`;
  }
  content.push({ type: "text", text: promptText });

  const txt = await callAI(content);

  const guionMatch = txt.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|$)/i);
  const descMatch = txt.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|$)/i);
  const hashMatch = txt.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|$)/i);

  return {
    guion: guionMatch ? guionMatch[1].trim() : "",
    descripcion: descMatch ? descMatch[1].trim() : (isPost ? txt.trim() : ""),
    hashtagsFinales: hashMatch ? hashMatch[1].trim() : "",
  };
}

export async function generateFieldForPost(client, post, day, calendar, field) {
  const adnExtra = (await loadADN(client)).content;
  const ctx = buildClientContext(client, calendar, adnExtra);
  let promptText = "";

  if (field === "idea") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})

Genera UNA idea creativa y concreta para una publicacion de ${post.format} para este cliente.
La idea debe ser especifica, accionable y alineada con la marca, la categoria y el concepto semanal.
Responde SOLO con la idea, sin preambulos ni explicaciones. Maximo 2 oraciones.`;
  } else if (field === "guion") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})
IDEA: ${post.idea || "N/A"}

Basandote en la idea y el contexto del cliente, genera el GUION para esta publicacion.
${post.format === "reel" ? "Formato: Hook (0-3s) → Desarrollo (3-20s) → CTA final" : ""}
${post.format === "carrusel" ? "Formato: texto por cada slide, separados por ---" : ""}
${post.format === "historia" ? "Formato: nota breve, max 2 oraciones" : ""}
${post.format === "live" ? "Formato: bullet points de los temas a cubrir" : ""}
Responde SOLO con el guion, sin preambulos.`;
  } else if (field === "descripcion") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})
IDEA: ${post.idea || "N/A"}
${post.guion ? `GUION: ${post.guion}` : ""}

Basandote en la idea${post.guion ? ", el guion" : ""} y el contexto del cliente, genera la DESCRIPCION (caption) para esta publicacion.
Incluye emojis, CTA a WhatsApp (${client.whatsapp || "N/A"}) y hashtags relevantes al final del texto (${client.hashtags || "#Panama"}).
Responde SOLO con la descripcion/caption completa incluyendo los hashtags, sin preambulos.`;
  }

  const content = [{ type: "text", text: promptText }];
  return await callAI(content);
}

export async function generateImagePrompt(client, post, day, calendar) {
  const adnExtra = (await loadADN(client)).content;
  const ctx = buildClientContext(client, calendar, adnExtra);

  const formatInstructions = {
    post: `Genera un prompt detallado para generar UNA imagen estática para un post de Instagram.
Describe la composición visual, colores, estilo fotográfico o de ilustración, elementos principales,
iluminación, encuadre y texto overlay si lo hay.`,
    carrusel: `Genera un prompt para un set coherente de imágenes de carrusel de Instagram.
Describe el estilo visual unificado, la composición de cada slide (portada, slides intermedios, CTA final),
paleta de colores consistente, tipografía y elementos gráficos que conecten las slides.`,
    reel: `Genera un prompt para un video corto (reel) de Instagram.
Describe el concepto visual escena por escena: tipo de tomas, transiciones, ritmo,
estilo de edición, texto en pantalla, estilo de color grading y música sugerida.`,
    historia: `Genera un prompt para una imagen o visual de historia de Instagram.
Describe la composición vertical (9:16), elementos visuales, texto overlay,
stickers o elementos interactivos sugeridos, y estilo visual.`,
    live: `Genera un prompt para la imagen de portada/anuncio de un live de Instagram.
Describe la composición visual que transmita urgencia y exclusividad,
incluye elementos como hora, tema y speakers si aplica.`,
  };

  const promptText = `${ctx}

CAMPAÑA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORÍA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})
IDEA: ${post.idea || "N/A"}
${post.guion ? `GUION: ${post.guion}` : ""}
${post.descripcion ? `DESCRIPCION: ${post.descripcion}` : ""}

${formatInstructions[post.format] || formatInstructions.post}

REGLAS:
- El prompt debe estar en español.
- Respeta los colores de marca del cliente si los conoces del contexto.
- Sé específico con estilos visuales: fotografía, ilustración, 3D, flat design, etc.
- Incluye dimensiones recomendadas (1080x1080 para post, 1080x1920 para reel/historia).
- No incluyas preámbulos ni explicaciones, solo el prompt visual listo para usar.
- El prompt debe ser autocontenido: quien lo lea debe poder generar la imagen sin contexto adicional.`;

  return await callAI([{ type: "text", text: promptText }]);
}

export async function extractClientADN(repoContent) {
  const promptText = `Analiza el siguiente contenido de un repositorio de GitHub de un cliente y extrae la informacion para llenar su perfil de agencia de marketing.

CONTENIDO DEL REPOSITORIO:
${repoContent}

Responde UNICAMENTE con un JSON valido con esta estructura exacta, sin texto adicional:
{"nombre":"","industria":"","descripcion":"","valores":"","audiencia":"","competencia":"","estiloGuion":"","estiloLocucion":"","hashtags":"","whatsapp":"","instagram":"","sucursales":"","notasInspeccion":""}

Si no encuentras informacion para un campo, dejalo como string vacio.
No inventes datos que no esten en el contenido.`;

  const content = [{ type: "text", text: promptText }];
  const raw = await callAI(content);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo parsear la respuesta de IA");
  return JSON.parse(jsonMatch[0]);
}

export async function checkImageGenConfigured() {
  try {
    const data = await invokeFunction("image-gen", { prompt: "__ping__" });
    if (data?.error === "not_configured") return false;
    return true;
  } catch {
    return false;
  }
}

export async function generateImage(prompt, format = "post") {
  const data = await invokeFunction("image-gen", { prompt, format });
  if (data?.error === "not_configured") {
    throw new Error("NOT_CONFIGURED");
  }
  if (data?.error) throw new Error(data.error);
  return data?.imageUrl ?? "";
}

/**
 * El contexto que ve el modelo antes de escribir nada.
 *
 * El orden importa y antes estaba al revés. La ficha de la aplicación
 * —nueve campos cortos que alguien tecleó una vez— iba primero, y el ADN
 * del repositorio iba al final bajo el título «CONTEXTO ADICIONAL»: el
 * modelo leía como accesorio lo que el orquestador define como fuente de
 * verdad, y como autoritativo un resumen de trece cadenas.
 *
 * Ahora el ADN va primero, dice de qué archivo sale cada trozo, y la
 * ficha queda debajo declarada como lo que es: un índice, no una fuente.
 */
export function buildClientContext(client, calendar, adnExtra = "") {
  if (adnExtra) {
    return `Escribes para ${client.name}, cliente de la agencia Juancito Ads.

═══════════════════════════════════════════════════════════
QUÉ MANDA, CUANDO DOS COSAS SE CONTRADIGAN
═══════════════════════════════════════════════════════════
1. El ADN del repositorio que viene abajo. Es la fuente de verdad.
2. La campaña y las ofertas de este calendario.
3. La ficha de la aplicación. Es un índice de contacto, no una fuente:
   si dice algo distinto del ADN, gana el ADN.

Tres reglas del orquestador de la agencia, que aquí no se negocian:
· No mezcles memoria, tono ni assets con los de otro cliente, aunque
  compartan nicho.
· No inventes identidad de marca, ofertas ni precios. Toda cifra, precio,
  plazo, testimonio y caso sale del ADN y sólo de ahí. Si un dato no está,
  no se usa: se deja fuera y se dice qué falta.
· Escribe en español de Panamá, con tildes y con signos de apertura.

═══════════════════════════════════════════════════════════
ADN DE ${(client.name || "").toUpperCase()} — leído de su repositorio
═══════════════════════════════════════════════════════════
${adnExtra}

═══════════════════════════════════════════════════════════
FICHA EN LA APLICACIÓN — datos de contacto y preferencias
═══════════════════════════════════════════════════════════
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}`;
  }

  // Sin ADN del repositorio, la ficha es lo único que hay. Se dice, para
  // que el modelo no rellene los huecos como si supiera.
  return `CLIENTE: ${client.name}
AVISO: este cliente no tiene ADN conectado desde su repositorio. Trabaja
sólo con lo que hay aquí abajo y no inventes lo que falte.
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}`;
}

// ============================================================
// Prompt maestro para Meta AI
//
// Dos llamadas y un ensamblado. La primera compila la receta del cliente
// —lo que no cambia de un mes a otro— y se guarda. La segunda escribe las
// piezas del calendario. El prompt final lo arma `metaPrompt.js` sin
// pasar por ningún modelo: así la retícula, los negativos y el contrato
// del HTML llegan a Meta AI tal y como están escritos en el repositorio.
// ============================================================

/**
 * Carga el ADN del cliente, del caché o del repositorio.
 *
 * Estaba copiado en cinco sitios con el mismo fallo: `githubContext`
 * ganaba siempre, así que el ADN se congelaba en la primera lectura y no
 * volvía a mirar el repositorio nunca. `forzar` es lo que permite
 * releerlo cuando el repositorio ha cambiado.
 */
export async function loadADN(client, { forzar = false } = {}) {
  if (!forzar && client.githubContext) {
    return { content: client.githubContext, sections: {}, cacheado: true };
  }
  if (!client.githubRepo) return { content: "", sections: {}, cacheado: false };
  const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
  return { ...result, cacheado: false };
}

/**
 * Parsea JSON de un modelo, reparando lo que un modelo rompe.
 *
 * No es paranoia: los dos fallos de abajo se dieron en producción con un
 * lote de 12 piezas. Un modelo que escribe prosa española dentro de una
 * cadena JSON acaba metiendo una comilla sin escapar —«el titular "corto"
 * va arriba»— y a partir de ahí el resto del documento es ilegible.
 *
 * Para la prosa larga ya no se usa JSON en absoluto (ver `parseBloques`).
 * Esto cubre el JSON que queda, que son valores cortos.
 */
export function parseJSONLoose(texto, apertura = "{", cierre = "}") {
  const sinVallas = texto.replace(/```(?:json)?/gi, "");
  const ini = sinVallas.indexOf(apertura);
  const fin = sinVallas.lastIndexOf(cierre);
  if (ini === -1 || fin <= ini) throw new Error("La respuesta no contenía JSON.");
  const crudo = sinVallas.slice(ini, fin + 1);

  try {
    return JSON.parse(crudo);
  } catch {
    /* se intenta reparar abajo */
  }

  // Recorre carácter a carácter llevando la cuenta de si está dentro de una
  // cadena. Dentro de una cadena: los saltos de línea y tabuladores se
  // escapan, y una comilla sólo cierra de verdad si lo siguiente que hay
  // es `,` `}` `]` o `:`. Cualquier otra es una comilla literal del texto.
  let salida = "";
  let dentro = false;
  for (let i = 0; i < crudo.length; i++) {
    const c = crudo[i];
    if (!dentro) {
      if (c === '"') dentro = true;
      salida += c;
      continue;
    }
    if (c === "\\") { salida += c + (crudo[i + 1] ?? ""); i++; continue; }
    if (c === "\n") { salida += "\\n"; continue; }
    if (c === "\r") { salida += "\\r"; continue; }
    if (c === "\t") { salida += "\\t"; continue; }
    if (c === '"') {
      const siguiente = crudo.slice(i + 1).match(/^\s*(.)/)?.[1];
      if (siguiente && !",}]:".includes(siguiente)) { salida += '\\"'; continue; }
      dentro = false;
      salida += c;
      continue;
    }
    salida += c;
  }
  // Comas colgantes antes de un cierre.
  return JSON.parse(salida.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * Lee bloques etiquetados de un texto plano.
 *
 * Es el mismo formato que ya usa `parseAIResponse` para los guiones, y por
 * la misma razón: la prosa española lleva comillas, tildes, saltos de línea
 * y guiones largos, y ninguno de ellos necesita escaparse aquí. Un campo
 * empieza en `ETIQUETA:` a principio de línea y termina donde empieza la
 * siguiente etiqueta conocida.
 */
export function parseBloques(texto, etiquetas) {
  const siguiente = `^(?:${etiquetas.join("|")}):`;
  const campos = {};
  for (const etiqueta of etiquetas) {
    // `(?![\s\S])` y no `$`: con la bandera `m`, `$` casa al final de CADA
    // línea, así que el cuantificador perezoso paraba en el primer salto y
    // los campos multilínea —el titular, el prompt del fondo, el guion—
    // llegaban vacíos o con una sola línea.
    const re = new RegExp(`^${etiqueta}:[ \\t]*([\\s\\S]*?)(?=${siguiente}|(?![\\s\\S]))`, "m");
    const m = texto.match(re);
    if (m) campos[etiqueta] = m[1].trim();
  }
  return campos;
}

const CAMPOS_RECETA = `{
  "marca": "", "slug": "", "productoFisico": false, "fotoReal": false,
  "lienzo": {"ancho":1080,"alto":1350},
  "fuentes": {"url":"","familias":[{"nombre":"","pesos":"","rol":""}]},
  "fuentesProhibidas": [],
  "colores": [{"hex":"","nombre":"","rol":""}],
  "coloresProhibidos": [{"hex":"","porque":""}],
  "combinacionesProhibidas": [],
  "anclaje": "",
  "ordenBloque": [],
  "escala": [{"elemento":"","px":0,"interlinea":"","tracking":"","mayusculas":false}],
  "acento": {"regla":""},
  "velo": "",
  "plantillas": [{"id":"","nombre":"","cuando":"","composicion":""}],
  "logo": {"posicion":"","ancho":0,"ancla":"","proporcion":"","resguardo":"","sobreFondo":"","reglas":[]},
  "trampasPropias": [],
  "interfaz": "",
  "reglasDuras": [],
  "verificacionPropia": [],
  "tildes": [],
  "hashtags": {"cantidad":0,"donde":""},
  "emojis": {"cantidad":0,"donde":""},
  "cifrasPermitidas": [],
  "cta": ""
}`;

/**
 * Compila la receta visual del cliente a partir de su repositorio.
 *
 * No inventa: extrae. Lo que no esté en el ADN se queda vacío y
 * `faltantesDeReceta()` lo enseña en la interfaz, que es lo que manda el
 * estándar — si un dato no está, se pide, no se rellena.
 */
export async function compileMetaRecipe(adnTexto, client) {
  const promptText = `Eres el compilador de recetas visuales de la agencia Juancito Ads.

Abajo está el ADN completo del cliente «${client?.name || ""}», leído de su
repositorio. Contiene, entre otros, su \`01_brand_guidelines.md\` y —si
existe— su \`05_prompt_maestro_meta_ai.md\`, que es el archivo que define
cómo se maquetan sus piezas.

TU TRABAJO: devolver ese sistema visual como JSON. No lo redactas: lo
extraes. Cada valor tiene que estar literalmente en el ADN.

REGLAS QUE NO SE ROMPEN:
1. No inventes NADA. Ni un hex, ni un píxel, ni una tipografía, ni una
   cifra. Si un dato no está en el ADN, deja el campo vacío ("" o [] o 0).
   Un campo vacío se convierte en una pregunta al humano; un campo
   inventado se convierte en una pieza publicada que está mal.
2. El bloque de estilo, los negativos y la retícula NO van en el JSON: van
   en los tres bloques de texto de abajo, y se copian LITERALES, carácter
   por carácter, del ADN. No los resumas, no los reordenes, no los
   traduzcas y no les quites un elemento por parecerte redundante.
3. \`logo\`: describe dónde va y con qué reglas, nunca cómo se dibuja. El
   logo de este cliente es un archivo que el humano carga; no se
   reproduce con formas ni con texto.
4. \`tildes\`: las palabras con tilde o eñe que aparecen en el vocabulario
   de esta marca y que un modelo escribe mal (página, diseño, CAMPAÑA…).
5. \`cifrasPermitidas\`: sólo las que estén verificadas en el ADN.
6. \`productoFisico\`: true si la marca vende producto tangible.
   \`fotoReal\`: true si su ADN pide que las piezas de producto lleven la
   foto real del cliente en vez de una imagen generada.

FORMATO DE SALIDA — primero el JSON, después los tres bloques literales.
Sin texto antes, sin texto en medio y sin bloque de código.

${CAMPOS_RECETA}

RETICULA:
(la retícula en píxeles, tal y como esté escrita en el ADN)

BLOQUE_ESTILO:
(el párrafo de estilo, literal)

NEGATIVOS:
(la lista de negativos, literal)

═══ ADN DEL CLIENTE ═══
${adnTexto}`;

  const raw = await callAI([cachedBlock(promptText)], { maxTokens: 16000, tier: "calidad" });
  const receta = parseJSONLoose(raw);
  // Los tres literales van fuera del JSON: son el texto que más comillas y
  // saltos de línea lleva, y es donde el escapado se rompía.
  const bloques = parseBloques(raw, ["RETICULA", "BLOQUE_ESTILO", "NEGATIVOS"]);
  receta.reticula = { texto: bloques.RETICULA || "" };
  receta.bloqueEstilo = bloques.BLOQUE_ESTILO || "";
  receta.negativos = bloques.NEGATIVOS || "";
  return receta;
}

/**
 * Escribe las piezas del lote: la sección 6 y nada más.
 *
 * Se le pasa el calendario ya generado y aprobado, así que no reinventa
 * el contenido: lo traduce a titulares con sus cortes de línea, su tramo
 * acentuado y el prompt de su fondo.
 */
export async function generateMetaPieces({ client, calendar, receta, posts, modo = "lote", tema = "", adnTexto = "" }) {
  const esCarrusel = modo === "carrusel";

  const listaPosts = posts.map((p, i) => `── PIEZA ${i + 1}
FECHA: ${p._date || "—"}${p._dayName ? ` (${p._dayName})` : ""}
FORMATO: ${p.format || "post"}
CATEGORÍA: ${p.category || p._category || "—"}
CONCEPTO DE LA SEMANA: ${p._concept || "—"}
IDEA: ${p.idea || "—"}
${p.guion ? `GUION YA APROBADO:\n${p.guion}` : ""}
${p.descripcion || p.script ? `DESCRIPCIÓN YA APROBADA:\n${p.descripcion || p.script}` : ""}
${p.hashtagsFinales ? `HASHTAGS YA APROBADOS: ${p.hashtagsFinales}` : ""}`).join("\n\n");

  const plantillas = (receta.plantillas || []).length
    ? `\nLAS PLANTILLAS DE ESTA MARCA — elige una por pieza y ponla en \`plantilla\`:\n${
        receta.plantillas.map((t) => `· ${t.id || t.nombre}: ${t.nombre || ""} — ${t.cuando || ""}`).join("\n")
      }\n`
    : "";

  const escalaTitular = (receta.escala || []).filter((e) => /titular/i.test(e.elemento || ""));
  const pistaCortes = escalaTitular.length
    ? `El titular se compone a ${escalaTitular[0].px} px. Con ese cuerpo caben unos 16 a 20 caracteres por línea en un lienzo de ${receta.lienzo?.ancho || 1080} px con los márgenes de la retícula. Cuenta los caracteres de cada línea que escribas.`
    : "Cuenta los caracteres de cada línea: en un titular a caja alta caben unos 16 a 20 por línea.";

  const promptText = `Eres el redactor de la agencia Juancito Ads. Escribes las piezas de un
lote que va a montar Meta AI. Meta AI no escribe: copia lo que tú
escribas, literal. Así que lo que escribas mal se publica mal.

${buildClientContext(client, calendar, adnTexto)}

═══════════════════════════════════════════════════════════
EL SISTEMA VISUAL AL QUE TIENES QUE ESCRIBIR
═══════════════════════════════════════════════════════════
LIENZO: ${receta.lienzo?.ancho || 1080}×${receta.lienzo?.alto || 1350}
RETÍCULA:
${receta.reticula?.texto || "—"}
${plantillas}
REGLA DEL ACENTO: ${receta.acento?.regla || "Un solo acento por titular."}
${receta.hashtags?.cantidad ? `HASHTAGS: exactamente ${receta.hashtags.cantidad}, ${receta.hashtags.donde || "al final de la descripción"}.` : ""}
${(receta.cifrasPermitidas || []).length ? `CIFRAS QUE PUEDES USAR, y ninguna otra: ${receta.cifrasPermitidas.join(", ")}` : "NO uses ninguna cifra que no esté en el ADN de arriba."}
${receta.cta ? `LLAMADA A LA ACCIÓN: ${receta.cta}` : ""}

═══════════════════════════════════════════════════════════
CÓMO SE ESCRIBE UN TITULAR
═══════════════════════════════════════════════════════════
· Llega con sus saltos de línea ya decididos. Tú los decides; el navegador
  no reparte nada. ${pistaCortes}
· Lleva UN SOLO tramo acentuado, marcado con ⟦ ⟧. El tramo puede cruzar un
  salto de línea y sigue siendo uno solo. Fuera de los corchetes va el
  color base. Los corchetes no se imprimen.
· Va con todas sus tildes y todas sus eñes, también en mayúsculas.
· No lleva emojis dentro. Los emojis, si el ADN los permite, van en la
  descripción, nunca en el lienzo.

═══════════════════════════════════════════════════════════
EL PROMPT DEL FONDO
═══════════════════════════════════════════════════════════
· En español, autocontenido, y sin una sola letra dentro de la imagen.
· Describe la composición por BANDAS DE PORCENTAJE de la altura, no con
  «deja espacio para el texto». Di qué hay en cada banda:
  ✓ «El sujeto ocupa entre el 74 % y el 88 % de la altura; del 15 % al
     74 % no hay más que fondo liso, sin brillo y sin detalle.»
  ✗ «Composición con espacio libre en la zona central para el texto.»
· Protege la banda del logo pidiendo fondo liso ahí: un resplandor detrás
  del logo se lo come.
· No repitas el bloque de estilo ni los negativos: van aparte, una vez.

═══════════════════════════════════════════════════════════
LAS PUBLICACIONES DEL CALENDARIO
═══════════════════════════════════════════════════════════
${tema ? `TEMA DEL LOTE: ${tema}\n` : ""}Son ${posts.length}, ya aprobadas. Tu trabajo es traducirlas a piezas, no
cambiarles la idea. Si una ya trae descripción aprobada, respétala salvo
que incumpla la cuenta de hashtags.

${listaPosts}

═══════════════════════════════════════════════════════════
FORMATO DE SALIDA
═══════════════════════════════════════════════════════════
NO uses JSON. Las descripciones y los prompts de fondo llevan comillas,
guiones largos y saltos de línea, y dentro de una cadena JSON eso se rompe.

Devuelve una ficha por pieza, en el mismo orden, con este formato exacto.
Cada etiqueta va a principio de línea y en MAYÚSCULAS. Omite la etiqueta
entera si esa pieza no lleva ese campo. Sin texto antes ni después.

<<<PIEZA:1>>>
PLANTILLA: (el id de la plantilla)
FORMATO: (post, reel, carrusel, historia o live)
FECHA: (aaaa-mm-dd)
ANTETITULO: (una línea)
TITULAR:
(una línea por cada línea del titular, con ⟦ ⟧ marcando el acento)
BAJADA: (una línea)
CIFRA: (sólo si el ADN la respalda)
NOTA: (una línea)
ANCLAJE: (una línea)
FOTO_REAL: si
PROMPT_FONDO:
(varias líneas, en español, sin una sola letra dentro de la imagen)
GUION:
(varias líneas, sólo si el formato lo lleva)
DESCRIPCION:
(el caption completo, con sus hashtags al final)
HASHTAGS: (en una sola línea)

<<<PIEZA:2>>>
…y así hasta la última.

TITULAR y PROMPT_FONDO empiezan en la línea siguiente a su etiqueta.
FOTO_REAL sólo se escribe si la pieza lleva foto real; si no, se omite.
${esCarrusel ? `
Es un CARRUSEL: la PRIMERA pieza lleva además DESCRIPCION_CONJUNTO y
HASHTAGS_CONJUNTO —la descripción única y el único juego de hashtags de todo
el carrusel— y las demás omiten DESCRIPCION y HASHTAGS. La primera
diapositiva lleva el titular más corto y más grande, porque es la única que se
ve en el feed sin deslizar; la última cierra o pide algo, no se muere en un
dato.` : ""}`;

  const raw = await callAI([cachedBlock(promptText)], { maxTokens: 24000, tier: "calidad" });
  const piezas = parsePiezas(raw);
  if (!piezas.length) {
    throw new Error("La IA no devolvió ninguna pieza reconocible. Inténtalo de nuevo.");
  }
  return piezas;
}

const ETIQUETAS_PIEZA = [
  "PLANTILLA", "FORMATO", "FECHA", "ANTETITULO", "TITULAR", "BAJADA",
  "CIFRA", "NOTA", "ANCLAJE", "FOTO_REAL", "PROMPT_FONDO", "GUION",
  "DESCRIPCION", "HASHTAGS", "DESCRIPCION_CONJUNTO", "HASHTAGS_CONJUNTO",
];

/** Convierte las fichas de texto en los objetos que espera `metaPrompt.js`. */
export function parsePiezas(texto) {
  const bloques = texto.split(/<<<PIEZA:/).slice(1);
  return bloques.map((bloque, i) => {
    const cuerpo = bloque.slice(bloque.indexOf(">>>") + 3);
    const c = parseBloques(cuerpo, ETIQUETAS_PIEZA);
    const n = Number(bloque.slice(0, bloque.indexOf(">>>")).trim()) || i + 1;
    return {
      n,
      plantilla: c.PLANTILLA || "",
      formato: c.FORMATO || "",
      fecha: c.FECHA || "",
      antetitulo: c.ANTETITULO || "",
      // El titular es una línea por línea del lienzo: los cortes ya vienen
      // decididos y no se recalculan en ningún punto de la cadena.
      titular: (c.TITULAR || "").split("\n").map((l) => l.trim()).filter(Boolean),
      bajada: c.BAJADA || "",
      cifra: c.CIFRA || "",
      nota: c.NOTA || "",
      anclaje: c.ANCLAJE || "",
      fotoReal: /^s[ií]$/i.test((c.FOTO_REAL || "").trim()),
      promptFondo: c.PROMPT_FONDO || "",
      guion: c.GUION || "",
      descripcion: c.DESCRIPCION || "",
      hashtags: c.HASHTAGS || "",
      descripcionConjunto: c.DESCRIPCION_CONJUNTO || "",
      hashtagsConjunto: c.HASHTAGS_CONJUNTO || "",
    };
  });
}
