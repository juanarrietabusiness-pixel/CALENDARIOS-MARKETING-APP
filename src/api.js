import { supabase, isSupabaseEnabled } from "./lib/supabase";
import { bloque, cachedBlock, parseBloques, parseJSONLoose, parseGitHubUrl, parsePiezas } from "./lib/parse";
import { enTandas } from "./lib/tandas";

// Se reexportan porque media aplicación las importa desde aquí. Viven en
// `lib/parse.js` para poder probarlas sin arrastrar el cliente de Supabase.
export { parseAIResponse, parseGitHubUrl, parsePiezas, parseJSONLoose, parseBloques, cachedBlock, bloque } from "./lib/parse";

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
    // El error útil viene en el cuerpo de la respuesta, no en
    // `error.message` (que sólo dice «non-2xx status code»). Y cuando el
    // cuerpo no es JSON, el código de estado es la única pista que queda:
    // decir «no se pudo contactar con el servidor» ante un 504 manda a
    // buscar un problema de red que no existe.
    const status = error.context?.status ?? 0;
    let mensaje = "";
    try {
      mensaje = (await error.context?.json())?.error ?? "";
    } catch {
      /* la respuesta no era JSON: pasa en los cortes del gateway */
    }
    if (mensaje) throw new Error(mensaje);

    if (status === 504 || status === 408 || status === 0) {
      throw new Error(
        `La función «${name}» tardó más de lo que aguanta Supabase y se cortó. ` +
        "Si estabas generando un lote, prueba con menos publicaciones."
      );
    }
    throw new Error(`La función «${name}» respondió ${status || "sin cuerpo legible"}.`);
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
export async function callAI(content, { maxTokens, tier, tolerarCorte = false } = {}) {
  const data = await invokeFunction("ai", { content, maxTokens, tier });

  // El servidor avisa si el modelo se quedó sin tokens a media respuesta.
  // Sin esto, un texto cortado a la mitad se trataría como completo.
  //
  // `tolerarCorte` es para quien sabe rescatar lo que sí llegó: en un lote
  // de piezas, que la última quede a medias no invalida las anteriores.
  if (data?.truncated && !tolerarCorte) {
    throw new Error("La respuesta se cortó por longitud. Prueba con menos piezas por tanda.");
  }
  if (tolerarCorte) {
    return {
      texto: data?.text ?? "",
      cortada: Boolean(data?.truncated),
      segundos: data?.segundos,
      diagnostico: data?.diagnostico ?? null,
    };
  }
  return data?.text ?? "";
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

/**
 * Prompt para escribir SÓLO las descripciones de un lote de publicaciones.
 *
 * El asistente de creación tiene dos pasos separados a propósito: primero
 * se acuerdan las ideas y se revisan, y sólo después se escriben los
 * captions. Pedir guion y descripción a la vez —que es lo que hace
 * `buildScriptPrompt`— gasta el doble de presupuesto para tirar la mitad,
 * y en un mes entero eso es la diferencia entre una tanda y tres.
 *
 * El contrato de salida es el mismo `<<<PUBLICACION_ID:…>>>` de siempre,
 * para poder leerlo con `parseAIResponse` sin un segundo parser.
 */
export function buildDescripcionesPrompt(client, calendar, posts, adnExtra = "") {
  const ctx = buildClientContext(client, calendar, adnExtra);

  const reglas = {
    post: "Caption de post estático: gancho en la primera línea, cuerpo breve, CTA y hashtags al final.",
    reel: "Caption de reel: gancho corto que invite a ver el vídeo, CTA y hashtags al final.",
    carrusel: "Caption de carrusel: promete lo que se aprende deslizando, CTA y hashtags al final.",
    historia: "Texto para la historia: dos líneas como mucho, directo, con hashtags al final.",
    live: "Caption de anuncio del live: día, hora y motivo para conectarse, con hashtags al final.",
  };

  const lista = posts.map((p) => `<<<PUBLICACION_ID:${p.id}>>>
FORMATO: ${p.format}
CATEGORIA: ${p.category || "N/A"}
DIA: ${p._date} (${p._dayName || ""})
SEMANA: ${p._weekNumber || ""} — ${p._concept || "libre"}
IDEA: ${p.idea}
REGLA: ${reglas[p.format] || reglas.post}`).join("\n\n");

  return `${ctx}

ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
WHATSAPP: ${client.whatsapp || "N/A"}
HASHTAGS BASE: ${client.hashtags || "#Panama"}
CAMPAÑA: ${calendar?.campaign || "N/A"}
${calendar?.offers ? `OFERTAS Y DESCUENTOS DEL MES: ${calendar.offers}` : ""}
${calendar?.promoCode ? `CÓDIGO PROMOCIONAL: ${calendar.promoCode}` : ""}

---

INSTRUCCIONES:
Escribe la DESCRIPCION (el caption que se publica) de CADA publicación de
la lista, partiendo de su idea. No escribas guion, ni títulos, ni notas de
producción: sólo el caption.

Cada caption lleva emojis con medida, una llamada a la acción hacia
WhatsApp (${client.whatsapp || "N/A"}) y los hashtags al final del propio
texto. No uses un campo de hashtags aparte.

FORMATO DE RESPUESTA OBLIGATORIO, sin nada más:
<<<PUBLICACION_ID:id_de_la_publicacion>>>
DESCRIPCION:
(caption completo, con los hashtags al final)

---

PUBLICACIONES:
${lista}`;
}

/**
 * Lee el ADN de marca del repositorio del cliente.
 *
 * Ya no recibe token: el de GitHub es uno solo del servidor. Antes cada
 * cliente guardaba el suyo en el navegador y acababa dentro del JSON de
 * «Exportar».
 */
/**
 * Versión mínima del contrato de `github-adn` que esta aplicación necesita.
 *
 * v2 trajo la lectura completa del repositorio: sin ella la función
 * recorta cada archivo a 3000 caracteres y no lee el 05_receta.json, así
 * que la receta se deduce con IA y vuelven a faltar campos.
 *
 * v3 decodifica la carpeta del cliente: sin ella, la carpeta de un cliente
 * con un espacio en el nombre («Baby Caleb/…», guardada como
 * «Baby%20Caleb/…») no coincide con ninguna ruta del repositorio y el ADN
 * vuelve vacío.
 *
 * Los dos se ven igual que «el repositorio está mal», y no lo es: es un
 * despliegue que no entró.
 */
export const VERSION_ADN_REQUERIDA = 3;

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
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${client.aiInstructions ? `\n═══════════════════════════════════════════════════════════\nINSTRUCCIONES OBLIGATORIAS DEL CLIENTE\n═══════════════════════════════════════════════════════════\n${client.aiInstructions}` : ""}`;
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
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${client.aiInstructions ? `\nINSTRUCCIONES OBLIGATORIAS DEL CLIENTE:\n${client.aiInstructions}` : ""}`;
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
/** Falta el despliegue de la función, y se dice con esas palabras. */
export function despliegueDesfasado(adn) {
  return (adn?.version ?? 0) < VERSION_ADN_REQUERIDA;
}

export async function loadADN(client, { forzar = false } = {}) {
  if (!forzar && client.githubContext) {
    return { content: client.githubContext, sections: {}, cacheado: true };
  }
  if (!client.githubRepo) return { content: "", sections: {}, cacheado: false };
  const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
  return { ...result, cacheado: false };
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
export async function cargarReceta(adn, client) {
  // 1. El camino bueno: el cliente tiene su receta escrita en JSON.
  //
  //    Ni una llamada a un modelo. La receta es un dato, no una deducción:
  //    pedirle a un modelo que extraiga veinticuatro campos de cincuenta mil
  //    caracteres de prosa funcionaba casi siempre, y «casi siempre» en un
  //    sistema visual significa una pieza publicada con la tipografía
  //    equivocada. Es la regla que PanaClaw tiene escrita en su raíz:
  //    máquina antes que prosa.
  const crudo = adn?.sections?.recetaJson;
  if (crudo) {
    try {
      const receta = JSON.parse(crudo);
      return { receta, origen: "json" };
    } catch (e) {
      // Un JSON con una coma de más no debe dejar al cliente sin entregar:
      // se cae al compilador y se dice por qué.
      console.error("05_receta.json no se pudo leer:", e);
      const compilada = await compileMetaRecipe(adn.content, client);
      return { receta: compilada, origen: "ia", avisoJson: e.message };
    }
  }

  // 2. El camino de respaldo, para los clientes que aún no tengan su JSON.
  const receta = await compileMetaRecipe(adn.content, client);
  return { receta, origen: "ia" };
}

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
3. \`fuentes.url\`: la URL de Google Fonts va COMPLETA, con sus \`&\` y sus
   \`:wght@\`. Está en la sección del contrato del HTML del ADN. Cópiala
   entera; una URL a medias carga la mitad de las fuentes y la pieza deja
   de ser de la marca.
4. \`escala\`: el ADN suele traerla como tabla. Conviértela fila a fila —
   una entrada por cada rol tipográfico, sin saltarte ninguna. \`elemento\`
   es el rol («Titular XL · 2–3 líneas»), \`px\` el tamaño como número,
   \`interlinea\` y \`tracking\` como texto si los trae. Este campo es de los
   que más se olvidan: si el ADN tiene una tabla de tamaños, tiene escala.
5. \`logo\`: describe dónde va y con qué reglas, nunca cómo se dibuja. El
   logo de este cliente es un archivo que el humano carga; no se
   reproduce con formas ni con texto.
6. \`tildes\`: las palabras con tilde o eñe que aparecen en el vocabulario
   de esta marca y que un modelo escribe mal (página, diseño, CAMPAÑA…).
7. \`cifrasPermitidas\`: sólo las que estén verificadas en el ADN.
8. \`productoFisico\`: true si la marca vende producto tangible.
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

  // La URL de Google Fonts no se le pide a un modelo: es una cadena exacta
  // que está en el ADN o no está. Pedírsela a un modelo que acaba de leer
  // 50 000 caracteres es darle la oportunidad de olvidarla, y la olvidaba.
  if (!receta.fuentes?.url) {
    const url = adnTexto.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^\s"'`)\]]+/)?.[0];
    if (url) receta.fuentes = { ...(receta.fuentes || {}), url };
  }
  // Los tres literales van fuera del JSON: son el texto que más comillas y
  // saltos de línea lleva, y es donde el escapado se rompía.
  const bloques = parseBloques(raw, ["RETICULA", "BLOQUE_ESTILO", "NEGATIVOS"]);
  receta.reticula = { texto: bloques.RETICULA || "" };
  receta.bloqueEstilo = bloques.BLOQUE_ESTILO || "";
  receta.negativos = bloques.NEGATIVOS || "";

  return await repescarFaltantes(receta, adnTexto, client);
}

/**
 * Lo que falta de un campo crítico se vuelve a pedir, solo.
 *
 * La primera pasada saca veinticuatro campos de cincuenta mil caracteres, y
 * ahí siempre se cae algo: con D'CASA se caían la URL de las fuentes y la
 * escala, que están las dos en su archivo. Una segunda llamada que pregunta
 * por dos cosas concretas acierta donde una que pregunta por veinticuatro
 * falla, y sólo se paga cuando hace falta. El ADN va marcado para la caché,
 * así que la segunda pasada no lo vuelve a cobrar entero.
 */
async function repescarFaltantes(receta, adnTexto, client) {
  const huecos = [
    { campo: "escala", falta: !(receta.escala || []).length,
      pide: "El array `escala`: una entrada por rol tipográfico, con elemento, px, interlinea, tracking y mayusculas. Si el ADN trae una tabla de tamaños, conviértela fila a fila sin saltarte ninguna." },
    { campo: "plantillas", falta: !(receta.plantillas || []).length,
      pide: "El array `plantillas`: una por cada plantilla o tipo de pieza que describa el ADN, con id, nombre, cuando y composicion." },
    { campo: "logo", falta: !receta.logo?.posicion,
      pide: "El objeto `logo`: posicion, ancho, ancla, proporcion, resguardo, sobreFondo y reglas. Dónde va y con qué resguardo, nunca cómo se dibuja." },
    { campo: "colores", falta: !(receta.colores || []).length,
      pide: "El array `colores`: hex, nombre y el papel de cada uno." },
  ].filter((h) => h.falta);

  if (!huecos.length) return receta;

  const promptText = `Del ADN de «${client?.name || ""}» que va abajo faltan por extraer estos
campos. En la primera lectura se quedaron vacíos, y casi siempre es porque
se pasaron por alto, no porque el dato no esté. Búscalos con atención.

${huecos.map((h) => `· ${h.pide}`).join("\n\n")}

Si después de buscarlo de verdad un dato NO está en el ADN, devuelve ese
campo vacío. No lo inventes: un campo vacío es una pregunta al humano, uno
inventado es una pieza publicada que está mal.

Responde ÚNICAMENTE con un JSON que contenga sólo estos campos:
${huecos.map((h) => h.campo).join(", ")}

═══ ADN DEL CLIENTE ═══
${adnTexto}`;

  try {
    const raw = await callAI([cachedBlock(promptText)], { maxTokens: 8000, tier: "calidad" });
    const parcial = parseJSONLoose(raw);
    for (const { campo } of huecos) {
      const v = parcial[campo];
      const traeAlgo = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : Boolean(v);
      if (traeAlgo) receta[campo] = v;
    }
  } catch (e) {
    // La repesca es una mejora, no un requisito: si falla, la receta sigue
    // valiendo con los huecos que tenga y la interfaz los enseña.
    console.error("repesca de la receta:", e);
  }
  return receta;
}

/**
 * Escribe las piezas del lote: la sección 6 y nada más.
 *
 * Se le pasa el calendario ya generado y aprobado, así que no reinventa
 * el contenido: lo traduce a titulares con sus cortes de línea, su tramo
 * acentuado y el prompt de su fondo.
 */
/**
 * El ADN que hace falta para ESCRIBIR, que no es todo el ADN.
 *
 * Se estaban mandando los 65 698 caracteres enteros en cada tanda, con los
 * 26 042 del `.md` de la receta y los 15 363 del JSON dentro — y el sistema
 * visual ya viaja aparte, como objeto, porque la receta se pasa por su
 * cuenta. Era pagar tres veces por lo mismo y llenar la ventana de lo que no
 * se necesita.
 *
 * Para escribir una pieza hacen falta la voz, el público, el léxico, las
 * reglas duras y lo ya publicado. La retícula no: de eso se encarga
 * `metaPrompt.js` con la receta.
 */
export function adnParaEscribir(adn) {
  const s = adn?.sections;
  if (!s) return adn?.content ?? "";

  const partes = [
    ["Guías de marca", s.guidelines],
    ["Buyer personas", s.personas],
    ["Prompts maestros de la marca", s.masterPrompts],
    ["Diccionario SEO", s.seo],
    ["Lo ya publicado", s.publicado],
  ].filter(([, texto]) => texto);

  if (!partes.length) return adn.content ?? "";
  return partes.map(([titulo, texto]) => `\n═══ ${titulo} ═══\n${texto}`).join("\n");
}

export async function generateMetaPieces({ client, calendar, receta, posts, modo = "lote", tema = "", adnTexto = "", alMedir }) {
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

  const estable = `Eres el redactor de la agencia Juancito Ads. Escribes las piezas de un
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
Cada fondo es UNA FOTOGRAFÍA DE UN SITIO REAL. Un rectángulo de color
plano no es un fondo: es el hueco donde debería haber uno, y se nota en
cuanto la pieza se publica al lado de las de cualquier otra marca.

· En español, autocontenido, y sin una sola letra dentro de la imagen.
· Describe la composición por BANDAS DE PORCENTAJE de la altura, y di qué
  hay en CADA banda. En todas hay algo: el carril del texto no se vacía,
  se aquieta.
· El texto se lee porque encima tiene una superficie tranquila —una pared
  en penumbra, un plano desenfocado, un suelo parejo—, no porque no haya
  nada. Pide desenfoque, sombra o caída de luz; nunca ausencia de escena.

  ✓ «Del 0 % al 15 %, la pared del fondo en penumbra pareja, sin cuadros
     ni molduras. Del 15 % al 70 %, esa misma pared sigue, desenfocada y
     en sombra suave, con la luz cayendo de izquierda a derecha: hay
     pared, no vacío. Del 70 % al 90 %, el sujeto nítido y a foco. Del
     90 % al 100 %, suelo de baldosa clara, parejo y sin objetos.»

  ✗ «Del 15 % al 74 % no hay más que fondo liso, sin brillo y sin detalle.»
  ✗ «Fondo liso azul cobalto uniforme, sin textura ni degradado.»
  ✗ «Composición con espacio libre en la zona central para el texto.»

· Protege la banda del logo con una superficie tranquila —pared lisa,
  sombra pareja—, no con un vacío: un resplandor detrás del logo se lo
  come, pero un rectángulo de color lo deja flotando.
· ÚNICA excepción: si la retícula de esta pieza pide expresamente una masa
  plana de color de marca con el producto recortado encima, esa masa ES el
  fondo y el interés lo pone el producto. Sólo cuando la plantilla lo pida,
  nunca por defecto.
· No repitas el bloque de estilo ni los negativos: van aparte, una vez.

═══════════════════════════════════════════════════════════
LO QUE YA SE PUBLICÓ, Y NO SE REPITE
═══════════════════════════════════════════════════════════
El ADN de arriba incluye la carpeta \`03_Redes_Sociales/Calendarios_Aprobados/\`
de este cliente. Antes de escribir, míralo: un titular que ya salió el mes
pasado no vuelve, ni con otras palabras. Si el lote se parece demasiado a lo
ya publicado, cambia el ángulo, no el sinónimo.

Si esa carpeta está vacía, no pasa nada: es el primer lote.

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
NOTA: (una línea que se IMPRIME en el lienzo, como remate o aclaración
      de venta: «Entrega en toda la ciudad», «Stock limitado». NO es un
      recado para la agencia. Si lo que ibas a escribir es que falta un
      dato, OMITE la etiqueta entera: un «falta el precio verificado»
      acaba rotulado sobre la pieza publicada.)
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

Después de la última ficha no escribas NADA MÁS: ni resumen, ni notas
sobre lo que falta, ni comentarios sobre el lote. Lo que escribas ahí se
cuela dentro del último campo de esa pieza y viaja hasta el documento
final. Si falta un dato, ya lo dice el campo que lo necesita.

TITULAR y PROMPT_FONDO empiezan en la línea siguiente a su etiqueta.
FOTO_REAL sólo se escribe si la pieza lleva foto real; si no, se omite.

NO decidas el cuerpo del titular, ni el anclaje, ni la interlínea. Los
resuelve la aplicación a partir del número de líneas que escribas y de los
caracteres de cada una, y llegan a Meta AI ya calculados. Tu trabajo es
escribir el texto y sus cortes; la maquetación es una cuenta, no una
opinión.
${esCarrusel ? `
Es un CARRUSEL: la PRIMERA pieza lleva además DESCRIPCION_CONJUNTO y
HASHTAGS_CONJUNTO —la descripción única y el único juego de hashtags de todo
el carrusel— y las demás omiten DESCRIPCION y HASHTAGS. La primera
diapositiva lleva el titular más corto y más grande, porque es la única que se
ve en el feed sin deslizar; la última cierra o pide algo, no se muere en un
dato.` : ""}`;

  // Lo que cambia en cada tanda: las publicaciones de ESTA vuelta.
  //
  // Va en su propio bloque y detrás del estable, y no es cosmético. La
  // caché de Anthropic es por prefijo: `cache_control` marca dónde acaba
  // el trozo reutilizable, así que mientras la lista de publicaciones
  // estuvo DENTRO de ese trozo, el prefijo cambiaba en cada tanda y no se
  // reutilizaba nunca nada. Un lote de doce reenviaba seis veces los
  // ~24 000 caracteres de ADN a precio completo.
  //
  // Por eso el formato de salida subió al bloque estable y aquí abajo sólo
  // queda el recordatorio: la instrucción larga se cachea, y lo último que
  // lee el modelo antes de escribir sigue siendo qué tiene que escribir.
  const variable = `═══════════════════════════════════════════════════════════
LAS PUBLICACIONES DEL CALENDARIO
═══════════════════════════════════════════════════════════
${tema ? `TEMA DEL LOTE: ${tema}\n` : ""}Son ${posts.length}, ya aprobadas. Tu trabajo es traducirlas a piezas, no
cambiarles la idea. Si una ya trae descripción aprobada, respétala salvo
que incumpla la cuenta de hashtags.

${listaPosts}

Devuelve ahora una ficha por cada una, en este mismo orden y con el formato
exacto de arriba, empezando por <<<PIEZA:1>>>. Sin texto antes ni después.`;

  // El presupuesto es para ESCRIBIR. Mientras el modelo venía pensando por
  // su cuenta —Sonnet 5 lo hace si no se le dice lo contrario—, este número
  // se repartía entre el razonamiento y el texto, y subirlo sólo compraba
  // más razonamiento. Con el pensamiento apagado en la función del
  // servidor, 3 000 por pieza es margen de sobra incluso con guion largo.
  const maxTokens = Math.min(3000 * posts.length + 1000, MAX_TOKENS_SERVIDOR);

  const { texto, cortada, diagnostico } = await callAI(
    [cachedBlock(estable), bloque(variable)],
    { maxTokens, tier: "calidad", tolerarCorte: true },
  );

  // Los tokens reales de esta tanda suben a quien llama. `enTandas` pasa
  // las opciones tal cual, así que el diálogo se entera de las seis sin que
  // el troceador tenga que saber nada de esto.
  if (diagnostico) alMedir?.(diagnostico);

  const piezas = parsePiezas(texto);
  if (!piezas.length) {
    throw new Error(explicarLoteVacio({ cortada, texto, diagnostico }));
  }

  // Si se cortó, la última pieza viene a medias: se descarta y quien llama
  // vuelve a pedirla. Tirar las tres por culpa de la última era perder dos
  // que estaban bien, y volver a pagarlas.
  if (cortada && piezas.length > 1) piezas.pop();
  return piezas;
}

/**
 * Por qué una tanda volvió sin ninguna pieza.
 *
 * El mensaje viejo decía siempre «prueba con menos publicaciones», y en el
 * fallo que de verdad ocurría ese consejo empeoraba las cosas: menos piezas
 * es menos presupuesto, y el presupuesto no se estaba yendo en piezas. Aquí
 * se distingue el caso y se enseñan los tokens que informó el servidor, para
 * no volver a deducirlos.
 */
function explicarLoteVacio({ cortada, texto, diagnostico }) {
  const d = diagnostico;
  const cuenta = d ? ` (entrada ${d.entrada}, salida ${d.salida} de ${d.maxTokens}; bloques: ${(d.tipos || []).join(", ") || "ninguno"})` : "";

  if (cortada && !texto.trim()) {
    return (
      "El modelo agotó el presupuesto de la tanda sin escribir una sola línea" +
      `${cuenta}. Es el síntoma de que está razonando en vez de transcribir: ` +
      "revisa que la función «ai» desplegada apague el pensamiento en el nivel " +
      "«calidad». Pedir menos publicaciones NO lo arregla."
    );
  }
  if (cortada) {
    return `La respuesta se cortó antes de terminar la primera pieza${cuenta}. Prueba con menos publicaciones por tanda.`;
  }
  if (!texto.trim()) {
    return `El servidor de IA devolvió una respuesta vacía${cuenta}. Inténtalo de nuevo.`;
  }
  return `La IA respondió, pero sin ninguna ficha «<<<PIEZA:n>>>» reconocible${cuenta}. Inténtalo de nuevo.`;
}

/** El tope que acepta la función del servidor. Más alto, lo recorta ella. */
const MAX_TOKENS_SERVIDOR = 32000;

/** Genera las piezas del lote en tandas, para no pasarse del límite. */
export function generateMetaPiecesEnTandas(opciones, alProgresar) {
  return enTandas(opciones, generateMetaPieces, alProgresar);
}

