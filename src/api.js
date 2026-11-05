import { parseJSONLoose, parseGitHubUrl } from "./lib/parse";
import { normalizarColor, coloresDelTexto, tresColores } from "./lib/colores";
import { hora12 } from "./lib/horas";
import { dayName } from "./utils";
import { semanaDelMes } from "./lib/semanas";
import { INSTRUCCION_PIEZAS, INSTRUCCION_ADJUNTOS } from "./lib/mensajeChat";
import { base64DeImagen, fotogramasDeVideo } from "./lib/medios";
import { mediosDe } from "./lib/publicacion";
import { analizarVideo } from "./lib/db";
import { fechaEnZona } from "./lib/agenda";
import { diasPorSemanaDelMes, nombreDelDia } from "./lib/meses";
import { fechasDelMes, fechasParaLaIA } from "./lib/fechasEspeciales";
import { semanasDelMes, conceptosDelMes } from "./lib/campanas";

/**
 * Las fechas especiales del mes del calendario, como bloque para la IA
 * (vacío si no hay): las del catálogo más las que eligió el cliente, con
 * las delicadas marcadas para que no haga promociones ahí.
 */
export function bloqueFechasEspeciales(client, calendar) {
  if (!Number.isInteger(calendar?.month) || !calendar?.year) return "";
  const txt = fechasParaLaIA(fechasDelMes(calendar.year, calendar.month, client?.fechasEspeciales));
  return txt ? `FECHAS ESPECIALES DEL MES:\n${txt}` : "";
}
import { partirSSE } from "../worker/lib/flujoAnthropic.js";
import { sinCapaMaquetacion, prepararContenidoIA, TITULO_FICHA } from "./lib/contextoADN";
import { textoEstableDelCerebro, consultaDeTanda, consultaDePublicacion, usaElCerebro, contextoDelChat, adnConPautas } from "./lib/cerebroCliente";

// Se reexportan porque media aplicación las importa desde aquí. Viven en
// `lib/parse.js` para poder probarlas sin arrastrar el cliente de Supabase.
export { parseAIResponse, parseGitHubUrl, parsePiezas, parseJSONLoose, parseBloques, cachedBlock, bloque } from "./lib/parse";

/**
 * Llama a una ruta del servidor.
 *
 * Las claves de IA y el token de GitHub viven en los secretos del
 * Worker: el navegador nunca las ve. La sesión viaja en la cookie
 * `__Host-`, que el navegador manda sola —antes había que adjuntar el
 * token de supabase-js a mano—.
 *
 * El error útil viene en el cuerpo. Cuando el cuerpo no es JSON, el
 * código de estado es la única pista que queda: decir «no se pudo
 * contactar con el servidor» ante un 504 manda a buscar un problema de
 * red que no existe.
 */
const RUTAS = { ai: "/api/ia", "github-adn": "/api/adn" };

async function invokeFunction(name, body) {
  const ruta = RUTAS[name];
  if (!ruta) throw new Error(`No hay ninguna ruta para «${name}».`);

  let res;
  try {
    res = await fetch(ruta, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu red.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* la respuesta no era JSON: pasa en los cortes del borde */
  }

  // El medidor de gasto de la cabecera se relee al terminar cualquier
  // llamada de IA, haya ido bien o mal: una que falla a medias también cuesta.
  if (name === "ai") {
    window.dispatchEvent(new Event("ia:gasto"));
  }

  if (!res.ok) {
    if (data?.error) throw new Error(data.error);
    if (res.status === 504 || res.status === 408) {
      throw new Error(
        `La ruta «${name}» se quedó sin margen y se cortó. ` +
        "Si estabas generando un lote, prueba con menos publicaciones."
      );
    }
    if (res.status === 401) throw new Error("La sesión caducó. Vuelve a entrar.");
    throw new Error(`La ruta «${name}» respondió ${res.status}.`);
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
/**
 * `funcion` y `clienteId` sólo sirven para el contador de gasto: dicen en
 * qué se fue cada dólar y de qué cliente. El `tier` ya no elige nada.
 */
export async function callAI(content, { maxTokens, tier, tolerarCorte = false, funcion, clienteId } = {}) {
  // El ADN va en su propio bloque con caché: es lo mismo en cada tanda de
  // una generación y sólo cambian las publicaciones (`lib/contextoADN.js`).
  const data = await invokeFunction("ai", { content: prepararContenidoIA(content), maxTokens, tier, funcion, clienteId });

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

// Los pedidos de texto de antes (buildScriptPrompt, buildDescripcionesPrompt, generateSinglePost,
// generateFieldForPost, instruccionIdea) ya no existen: TODO texto de una publicación —la idea, el guion, el caption,
// el texto de la pieza, los hashtags— va por el motor de ideas del servidor (modos «publicacion», «plan» y «campos» de
// POST /api/estudio/<c>/lote/ideas; src/lib/escribirTextos.js y src/lib/camposTexto.js), con la ficha del cliente, la
// estrategia del mes y una sola regla por formato (src/lib/reglasFormato.js). Se cargan en diferido: esta carga es la
// inicial.

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

/**
 * «Escribir a partir del contenido»: la IA MIRA lo subido —las imágenes,
 * y de un video su análisis de Gemini y unos fotogramas— y escribe en una
 * sola llamada el texto, los hashtags, el primer comentario, el texto
 * alternativo, la idea y el título. Antes el botón «IA» mandaba sólo texto
 * y, con una foto sin idea escrita, escribía a ciegas.
 *
 * Devuelve la propuesta; quien llama la pone con `rellenarDesdeContenido`,
 * que no pisa lo que ya hay escrito.
 */
export async function escribirDesdeContenido(client, post, { calendar = null, fecha = "", alProgresar = () => {} } = {}) {
  const medios = mediosDe(post).filter((m) => m.src.startsWith("/api/media/"));
  if (!medios.length) throw new Error("Primero sube una imagen o un video: la IA escribe mirándolo.");
  const bloques = [];
  const notas = [];
  for (const [i, m] of medios.slice(0, 6).entries()) {
    if (m.tipo === "imagen") {
      alProgresar(`Preparando la imagen ${i + 1}…`);
      const data = await base64DeImagen(m.src, 1024).catch(() => null);
      if (data) {
        bloques.push({ type: "text", text: `Imagen ${i + 1} de la publicación:` });
        bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
      }
      continue;
    }
    alProgresar("Mirando el video (puede tardar un poco)…");
    const [analisis, fotos] = await Promise.allSettled([
      analizarVideo(m.src.replace(/^\/api\/media\//, "")),
      fotogramasDeVideo(m.src, 4, 640),
    ]);
    if (analisis.status === "fulfilled" && analisis.value?.analisis) notas.push(`Lo que se ve y se oye en el video ${i + 1}:\n${analisis.value.analisis}`);
    if (fotos.status === "fulfilled") {
      bloques.push({ type: "text", text: `Fotogramas del video ${i + 1}:` });
      for (const f of fotos.value) bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.base64 } });
    }
  }
  if (!bloques.length && !notas.length) throw new Error("No pude leer el archivo para enseñárselo a la IA.");

  alProgresar("Escribiendo…");
  const adn = await loadADN(client).catch(() => ({ content: "" }));
  const adnExtra = adn.content;
  const pasajes = await pasajesDeLaPublicacion(client, adn, calendar, post, { concept: "" });
  const ctx = buildClientContext(client, calendar, adnExtra, adn.cerebro ? { pasajes } : null);
  const formato = post.format || "post";
  const pedido = `${ctx}

Vas a escribir la publicación de ${client.name} a partir de SU CONTENIDO, que va adjunto: míralo con atención y describe lo que de verdad se ve (producto, personas, lugar, texto que aparezca), no algo genérico.
FORMATO: ${formato}${fecha ? `\nFECHA: ${fecha}` : ""}${calendar?.campaign ? `\nCAMPAÑA: ${calendar.campaign}` : ""}
${post.idea ? `IDEA YA ESCRITA (respétala): ${post.idea}` : ""}
${post.title ? `TÍTULO YA ESCRITO: ${post.title}` : ""}
${notas.join("\n\n")}

Devuelve SOLO un objeto JSON, sin texto antes ni después:
{
  "titulo": "nombre corto para el calendario (máx. 6 palabras)",
  "idea": "en una frase, de qué va la publicación",
  "descripcion": "${formato === "historia" ? "" : "el caption: gancho en la primera línea, emojis con medida y una llamada a la acción" + (client.whatsapp ? ` a WhatsApp (${client.whatsapp})` : "") + ". SIN hashtags"}",
  "hashtags": "${formato === "historia" ? "" : `de 5 a 12 hashtags relevantes separados por espacios${client.hashtags ? `, incluidos los de la marca (${client.hashtags})` : ""}`}",
  "primerComentario": "${formato === "historia" ? "" : "opcional: una línea útil para el primer comentario, o vacío"}",
  "altTexto": "texto alternativo: qué se ve, en una frase, para quien no puede verlo"
}
En español latino neutro, con el tono de la marca.`;
  const texto = await callAI([...bloques, { type: "text", text: pedido }], { funcion: "lectura de contenido", clienteId: client?.id });
  const bruto = parseJSONLoose(texto);
  const limpio = (x, max) => String(x ?? "").trim().slice(0, max);
  return {
    titulo: limpio(bruto.titulo, 80),
    idea: limpio(bruto.idea, 400),
    descripcion: limpio(bruto.descripcion, 2100),
    hashtags: limpio(bruto.hashtags, 600),
    primerComentario: limpio(bruto.primerComentario, 600),
    altTexto: limpio(bruto.altTexto, 1000),
  };
}

export async function extractClientADN(repoContent) {
  // La marca VISUAL también: antes el JSON no tenía ni un campo de color,
  // así que aunque el manual dijera «#0A2540», la ficha seguía con el
  // azul por defecto y la página del cliente salía con la marca de otro.
  const promptText = `Analiza el siguiente contenido de un repositorio de GitHub de un cliente y extrae la informacion para llenar su perfil de agencia de marketing.

CONTENIDO DEL REPOSITORIO:
${repoContent}

Responde UNICAMENTE con un JSON valido con esta estructura exacta, sin texto adicional:
{"nombre":"","industria":"","descripcion":"","valores":"","audiencia":"","competencia":"","estiloGuion":"","estiloLocucion":"","hashtags":"","whatsapp":"","instagram":"","sucursales":"","notasInspeccion":"","colores":[{"hex":"","nombre":"","rol":""}],"tipografias":"","estiloVisual":""}

- "colores": la paleta de marca tal como la defina el contenido. "hex" en formato #RRGGBB (convierte RGB a hex si viene asi; si solo hay Pantone sin equivalente, omitelo). "rol" es su papel: principal, secundario, acento, fondo, texto…
- "tipografias": las fuentes de la marca y para que se usa cada una.
- "estiloVisual": como se ven las piezas de la marca (fotografia, composicion, iluminacion, estilo grafico), en un parrafo.

Si no encuentras informacion para un campo, dejalo vacio.
No inventes datos que no esten en el contenido.`;

  const content = [{ type: "text", text: promptText }];
  const raw = await callAI(content, { funcion: "ADN de marca" });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo parsear la respuesta de IA");
  const datos = JSON.parse(jsonMatch[0]);

  let paleta = (Array.isArray(datos.colores) ? datos.colores : [])
    .map((c) => ({ hex: normalizarColor(c?.hex), nombre: String(c?.nombre ?? ""), rol: String(c?.rol ?? "") }))
    .filter((c) => c.hex);
  // Red: si la IA no devolvió paleta pero el manual trae códigos escritos.
  if (!paleta.length) paleta = coloresDelTexto(repoContent).map((hex) => ({ hex, nombre: "", rol: "" }));
  const tres = tresColores(paleta);

  const visual = [
    String(datos.estiloVisual ?? "").trim(),
    datos.tipografias ? `Tipografías: ${String(datos.tipografias).trim()}` : "",
    paleta.length ? `Paleta: ${paleta.map((c) => `${c.hex}${c.nombre ? ` ${c.nombre}` : ""}${c.rol ? ` (${c.rol})` : ""}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  delete datos.colores;
  delete datos.tipografias;
  return {
    ...datos,
    estiloVisual: visual,
    colorPrincipal: tres.principal,
    colorSecundario: tres.secundario,
    colorAcento: tres.acento,
    paleta,
  };
}

/** Una imagen del repositorio del ADN (el logo), como Blob. */
export async function imagenDelADN(repoUrl, path) {
  const res = await fetch("/api/adn/imagen", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl, path }),
  });
  if (!res.ok) {
    let d = null;
    try { d = await res.json(); } catch { /* no era JSON */ }
    throw new Error(d?.error || `GitHub respondió ${res.status}.`);
  }
  return res.blob();
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
/** El plan de contenido del cliente, como lo guardó su ficha (plantillasPlan.js, `lineaDelPlan`). */
// La línea del plan para la IA: la del plan semanal ÚNICO (lib/planSemanal.js) o, sin él, la de la plantilla de antes.
const lineaDelPlanDe = (client) => String(client?.planSemanal?.linea || client?.planContenido?.linea || "").slice(0, 400);

export function buildClientContext(client, calendar, adnCompleto = "", cerebro = null) {
  // Quien llama a esto ESCRIBE texto —ideas, guiones, captions—: la capa de
  // maquetación para Meta AI no le sirve y son ~41 000 caracteres en Dcasa.
  //
  // `cerebro` ({ pasajes }) es el modo del cerebro del cliente: `adnCompleto`
  // trae su ficha técnica y sus cifras, y los pasajes que esta tarea necesita
  // van DESPUÉS del título de la ficha de la aplicación —es donde se parte
  // la caché—, porque cambian con cada tanda.
  const conCerebro = Boolean(cerebro);
  // La capa de maquetación (el prompt maestro de Meta AI) ya no la lee nadie, tampoco el asistente: eran
  // instrucciones de un proyecto viejo y ahora diseña el director creativo (lib/director.js).
  const adnExtra = conCerebro ? adnCompleto : sinCapaMaquetacion(adnCompleto);
  const pasajes = String(cerebro?.pasajes ?? "").trim();
  if (adnExtra) {
    return `Escribes para ${client.name}, cliente de la agencia Juancito Ads.

═══════════════════════════════════════════════════════════
QUÉ MANDA, CUANDO DOS COSAS SE CONTRADIGAN
═══════════════════════════════════════════════════════════
1. ${conCerebro
    ? "El cerebro del cliente que viene abajo —su ficha técnica, sus cifras y los pasajes de sus notas—. Es la fuente de verdad."
    : "El ADN del repositorio que viene abajo. Es la fuente de verdad."}
2. La campaña y las ofertas de este calendario.
3. La ficha de la aplicación. Es un índice de contacto, no una fuente:
   si dice algo distinto de ${conCerebro ? "el cerebro, gana el cerebro" : "el ADN, gana el ADN"}.

Tres reglas del orquestador de la agencia, que aquí no se negocian:
· No mezcles memoria, tono ni assets con los de otro cliente, aunque
  compartan nicho.
· No inventes identidad de marca, ofertas ni precios. Toda cifra, precio,
  plazo, testimonio y caso sale de ${conCerebro ? "las cifras vigentes y los pasajes de abajo" : "el ADN"} y sólo de ahí. Si un dato no está,
  no se usa: se deja fuera y se dice qué falta.
· Escribe en español de Panamá, con tildes y con signos de apertura.

═══════════════════════════════════════════════════════════
${conCerebro ? "CEREBRO" : "ADN"} DE ${(client.name || "").toUpperCase()} — ${conCerebro ? "su ficha técnica y sus cifras" : "leído de su repositorio"}
═══════════════════════════════════════════════════════════
${adnExtra}

═══════════════════════════════════════════════════════════
${TITULO_FICHA}
═══════════════════════════════════════════════════════════
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${lineaDelPlanDe(client)}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${pasajes ? `\n═══════════════════════════════════════════════════════════\nPASAJES DEL CEREBRO — lo más relevante para esta tarea\n═══════════════════════════════════════════════════════════\n${pasajes}` : ""}
${client.aiInstructions ? `\n═══════════════════════════════════════════════════════════\nINSTRUCCIONES OBLIGATORIAS DEL CLIENTE\n═══════════════════════════════════════════════════════════\n${client.aiInstructions}` : ""}`;
  }

  // Sin ADN en esta llamada, la ficha es lo único que hay. Se dice, para
  // que el modelo no rellene los huecos como si supiera. Y se dice la
  // verdad: los pasos de sugerencias del asistente de planificación
  // llaman aquí a propósito, sin gastar el ADN entero, con clientes que SÍ
  // lo tienen; decirles «no tiene ADN conectado» hacía que el modelo
  // desconfiara de una marca perfectamente documentada.
  const conectado = Boolean(client.githubContext || client.githubRepo);
  return `CLIENTE: ${client.name}
${conectado
    ? `AVISO: en esta consulta no viaja el ADN completo del cliente, sólo su ficha.
Trabaja con lo que hay aquí abajo y no inventes cifras, precios ni ofertas
que no estén escritos.`
    : `AVISO: este cliente no tiene ADN conectado desde su repositorio. Trabaja
sólo con lo que hay aquí abajo y no inventes lo que falte.`}
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${lineaDelPlanDe(client)}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${client.aiInstructions ? `\nINSTRUCCIONES OBLIGATORIAS DEL CLIENTE:\n${client.aiInstructions}` : ""}`;
}

// ============================================================
// El cerebro del cliente
// ============================================================

/**
 * Lo que el cerebro del cliente le da a una tarea: su ficha técnica, sus
 * cifras y los pasajes de sus notas que responden a `consulta`. `null` si
 * el cliente aún no tiene cerebro o si falla: la generación vuelve entonces
 * al ADN de la ficha, como antes, en vez de romperse.
 */
export async function contextoDelCerebro(clienteId, consulta = "", { presupuesto = 9000, para = "texto", postIds = null } = {}) {
  if (!clienteId) return null;
  try {
    const res = await fetch(`/api/cerebro/${encodeURIComponent(clienteId)}/contexto`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      // `postIds`: para qué publicaciones se pide. Con ellos el servidor apunta qué notas se le dieron a la IA para
      // escribirlas, y así sabe después a qué notas atribuirle un sí o un no del cliente.
      body: JSON.stringify(postIds?.length ? { consulta, para, presupuesto, postIds } : { consulta, para, presupuesto }),
    });
    if (!res.ok) return null;
    const c = await res.json();
    return c?.notas > 0 ? c : null;
  } catch {
    return null;
  }
}

/**
 * Lo que va detrás de la marca de caché en el contexto: los pasajes que
 * esta tanda necesita. Vacío si el cliente no usa el cerebro. Los pasajes
 * de la tanda de sofás no son los de la de hashtags, y por eso se piden
 * por tanda y no una vez para toda la generación.
 */
export async function pasajesDeLaTanda(client, adn, calendar, posts) {
  if (!adn?.cerebro) return "";
  const c = await contextoDelCerebro(client?.dbId || client?.id, consultaDeTanda(calendar, posts), {
    presupuesto: 6000, postIds: (posts ?? []).map((p) => p?.id).filter(Boolean),
  });
  return c?.pasajes ?? "";
}

/** Lo mismo para UNA publicación. */
export async function pasajesDeLaPublicacion(client, adn, calendar, post, day) {
  if (!adn?.cerebro) return "";
  const c = await contextoDelCerebro(client?.dbId || client?.id, consultaDePublicacion(calendar, post, day), {
    presupuesto: 6000, postIds: post?.id ? [post.id] : null,
  });
  return c?.pasajes ?? "";
}

// ============================================================
// El ADN del cliente
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
  // Si el cliente tiene cerebro, manda él: su ficha, sus cifras y sus pautas, sin releer
  // el repositorio. Con `forzar` se sigue leyendo GitHub, que es lo que
  // hace la ficha del cliente para probar la conexión.
  let pautas = "";
  if (!forzar) {
    const cerebro = await contextoDelCerebro(client?.dbId || client?.id);
    if (cerebro && usaElCerebro(cerebro, client)) {
      return { content: textoEstableDelCerebro(cerebro), sections: {}, cacheado: false, cerebro: true, notas: cerebro.notas };
    }
    pautas = cerebro?.pautas ?? "";
  }
  if (!forzar && client.githubContext) {
    return { content: adnConPautas(client.githubContext, pautas), sections: {}, cacheado: true };
  }
  if (!client.githubRepo) return { content: "", sections: {}, cacheado: false };
  const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
  return { ...result, cacheado: false };
}

/**
 * El ADN que recibe el asistente de UN cliente. No es `loadADN`: el chat lo pide en cada mensaje, y `loadADN`
 * puede releer el repositorio de GitHub (decenas de peticiones) cuando el cliente no tiene ADN guardado. Aquí sólo
 * se mira el cerebro —y su respuesta se recuerda un minuto: la ficha no cambia de un mensaje a otro—; sin cerebro,
 * lo que el cliente ya lleva en su ficha, que es lo que el chat usaba antes.
 */
export async function adnParaElChat(client) {
  const id = client?.dbId || client?.id;
  let cerebro = contextoDelChat.leer(id);
  if (cerebro === undefined) {
    cerebro = await contextoDelCerebro(id);
    contextoDelChat.poner(id, cerebro);
  }
  if (cerebro && usaElCerebro(cerebro, client)) return { content: textoEstableDelCerebro(cerebro), cerebro: true, notas: cerebro.notas };
  return { content: adnConPautas(client?.githubContext || "", cerebro?.pautas), cerebro: false, notas: cerebro?.notas ?? 0 };
}

// ============================================================
// Chat del asistente por cliente
// ============================================================

/**
 * Una vuelta del asistente, en streaming.
 *
 * El Worker reenvía el texto según se escribe (`onEvento` recibe
 * «texto», «pensando» y «herramienta») y resuelve con el evento «fin»:
 * los `mensajes` que añadió en esta vuelta —se reenvían TAL CUAL en la
 * siguiente, razonamiento con firma incluido— y, si el modelo pidió
 * herramientas del navegador, los resultados de las del servidor que
 * hay que juntar con los de aquí en un mismo mensaje.
 */
// La caché del prompt dura cinco minutos y escribirla cuesta 1,25×: sólo
// se pide cuando la conversación va seguida, que es cuando se va a leer.
const VIDA_CACHE_MS = 4.5 * 60_000;
let ultimaLlamadaChat = 0;

export async function conversarIA({ messages, system, tools, clienteId = null, conversacionId = null, onEvento = () => {}, onRecuperando = () => {} }) {
  const seguido = Date.now() - ultimaLlamadaChat < VIDA_CACHE_MS;
  ultimaLlamadaChat = Date.now();
  // El id de esta vuelta: el servidor guarda su final con él. Si la conexión se corta (teléfono bloqueado, pestaña en
  // segundo plano), al volver se pide y se sigue en vez de dar error (`recuperarTurno`).
  const turnoId = globalThis.crypto?.randomUUID?.() ?? "";
  let res;
  try {
    res = await fetch("/api/ia/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, tools, clienteId, conversacionId, seguido, turnoId }),
    });
  } catch {
    // Pudo salir y cortarse la respuesta: si el servidor la recibió, su final llega por el turno.
    if (turnoId) { onRecuperando(); return recuperarTurno(turnoId); }
    throw new Error("No hay conexión con el servidor. Revisa tu red.");
  }
  if (!res.ok || !res.body) {
    let data = null;
    try { data = await res.json(); } catch { /* no era JSON */ }
    if (res.status === 401) throw new Error("La sesión caducó. Vuelve a entrar.");
    throw new Error(data?.error || `El asistente respondió ${res.status}.`);
  }

  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let fin = null;
  let cortada = false;
  try {
    for (;;) {
      let leido;
      try {
        leido = await lector.read();
      } catch {
        // La conexión se cortó a mitad (lo normal al bloquear el teléfono): el servidor sigue y guarda el final.
        cortada = true;
        break;
      }
      const { done, value } = leido;
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const { eventos, resto } = partirSSE(buffer);
      buffer = resto;
      for (const { datos: ev } of eventos) {
        if (ev.t === "error") throw new Error(ev.mensaje || "No se pudo generar la respuesta.");
        if (ev.t === "fin") fin = ev;
        else onEvento(ev);
      }
    }
  } finally {
    // El medidor de gasto de la cabecera se relee: esta respuesta ya costó.
    window.dispatchEvent(new Event("ia:gasto"));
  }
  if (fin) return fin;
  if (turnoId && (cortada || !fin)) { onRecuperando(); return recuperarTurno(turnoId); }
  throw new Error("La respuesta del asistente se cortó. Inténtalo de nuevo.");
}

/** El final de una vuelta que se cortó (src/lib/turnoChat.js, en diferido: sólo hace falta si se corta). */
const recuperarTurno = async (turnoId) => (await import("./lib/turnoChat.js")).recuperarTurno(turnoId);

/** El resumen guardado de una conversación del asistente. */
export async function leerResumenChat(conversacionId) {
  const res = await fetch(`/api/ia/chat/resumen?conversacion=${encodeURIComponent(conversacionId)}`, { credentials: "same-origin" });
  if (!res.ok) return { resumen: "", hasta: null };
  return res.json();
}

/** Pliega lo viejo en el resumen si la conversación ya es larga. */
export async function resumirChat(conversacionId) {
  const res = await fetch("/api/ia/chat/resumen", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversacionId }),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Lo que el asistente de UN cliente sabe de su cerebro, según cómo esté. Con ficha técnica recibe ficha y cifras y
 * busca el resto; con notas pero sin ficha recibe el ADN de antes, y antes no se le decía que existía un cerebro:
 * contestaba con datos que ya se habían corregido allí. Pura.
 */
export function avisoDelCerebro({ usado = false, notas = 0 } = {}) {
  if (usado) return "\n\nPARA MÁS DETALLE de este cliente (precios, personas, límites, pautas, lo que se le ha subido) usa buscar_cerebro: lo de arriba es sólo su ficha técnica y sus cifras. No digas que no sabes algo sin buscarlo antes.";
  if (notas > 0) return `\n\nESTE CLIENTE YA TIENE CEREBRO (${notas} ${notas === 1 ? "nota" : "notas"}), aún sin ficha técnica: lo de arriba es su ADN de antes y puede estar desactualizado. Busca con buscar_cerebro antes de responder sobre su marca, sus productos o sus reglas; si el cerebro dice otra cosa, gana el cerebro.`;
  return "\n\nEl cerebro de este cliente aún está vacío: lo que sabes de él es lo de arriba. Si falta algo, pídelo o sugiere añadirlo como nota en la pestaña Cerebro.";
}

export function buildChatSystemPrompt(client, calendar, adnExtra = "", memories = [], cerebro = null, { notasCerebro = 0 } = {}) {
  // Con cerebro, el asistente recibe la ficha y las cifras —lo estable— y busca el resto con
  // `buscar_cerebro`: volcarle todo el ADN en cada mensaje era lo que más gastaba.
  const ctx = buildClientContext(client, calendar, adnExtra, cerebro) +
    avisoDelCerebro({ usado: Boolean(cerebro), notas: notasCerebro });

  let calendarInfo = "";
  if (calendar) {
    // La SEMANA y el DÍA van en cada línea porque es como se pide el
    // trabajo —«los guiones de la semana 2», «pon las 9am los lunes»— y
    // sin ellos el modelo tiene que deducirlos de la fecha, que es
    // justo donde se equivoca. La semana es la FILA de la rejilla
    // (`semanaDelMes`, lunes a domingo): la misma de la campaña de cada
    // semana y la que filtra `editar_publicaciones_lote` (lib/lote.js).
    const postLines = [];
    for (const day of calendar.days || []) {
      for (const post of day.posts || []) {
        const parts = [`ID:${post.id}`, day.date];
        if (day.date) parts.push(`semana ${semanaDelMes(day.date)}`);
        parts.push(dayName(day.date));
        if (post.format) parts.push(post.format);
        if (post.category) parts.push(post.category);
        parts.push(post.publishTime ? `Hora: ${hora12(post.publishTime)}` : "Hora: sin asignar");
        if (post.idea) parts.push(`Idea: «${post.idea}»`);
        if (post.descripcion) parts.push(`Descripción: «${post.descripcion}»`);
        if (post.guion) parts.push(`Guion: «${post.guion}»`);
        if (post.hashtagsFinales) parts.push(`Hashtags: ${post.hashtagsFinales}`);
        if (post.status && post.status !== "pending") parts.push(`[${post.status}]`);
        postLines.push("  · " + parts.join(" | "));
      }
    }
    const hoy = fechaEnZona();
    calendarInfo = `\nHOY: ${hoy} (${nombreDelDia(hoy)}), hora de Panamá.
CALENDARIO SELECCIONADO: ${calendar.name || "Sin nombre"}
MES: ${(calendar.month ?? 0) + 1}/${calendar.year}${Number.isInteger(calendar.month) && calendar.year ? `
DÍAS DE ESTE MES POR DÍA DE LA SEMANA (úsalo tal cual; no calcules el día de la semana de una fecha):
${diasPorSemanaDelMes({ year: calendar.year, month: calendar.month })}
Puedes crear publicaciones en CUALQUIER día de este mes, tenga ya publicaciones o no.` : ""}
CAMPAÑA: ${calendar.campaign || "N/A"}
CAMPAÑA DE CADA SEMANA: ${Number.isInteger(calendar.month) && calendar.year
  ? semanasDelMes(calendar.year, calendar.month).map((x, i) => `S${x.numero} (${+x.desde.slice(8)}–${+x.hasta.slice(8)}): ${conceptosDelMes(calendar)[i] || "sin nombre"}`).join(" · ")
  : (calendar.weekConcepts || []).join(", ") || "N/A"}${
  calendar.offers ? `\nOFERTAS: ${calendar.offers}` : ""
}${calendar.promoCode ? `\nCÓDIGO PROMOCIONAL: ${calendar.promoCode}` : ""}${
  bloqueFechasEspeciales(client, calendar) ? `\n${bloqueFechasEspeciales(client, calendar)}` : ""
}
PUBLICACIONES (${postLines.length}):
${postLines.length ? postLines.join("\n") : "  (vacío)"}`;
  }

  let memoriesBlock = "";
  if (memories.length > 0) {
    // Las memorias de antes del cerebro: se siguen leyendo hasta que la agencia las pase a mano y las borre, pero
    // ya no crecen. Con su id: borrarlas por el texto exacto fallaba en cuanto el modelo cambiaba una letra.
    memoriesBlock = `\n\n═══════════════════════════════════════════════════════════
MEMORIAS DE ANTES DE ESTE CLIENTE (las de antes del cerebro)
═══════════════════════════════════════════════════════════
${memories.map((m) => `· [${m.id}] ${m.content}`).join("\n")}

Úsalas como contexto. Lo NUEVO ya no va aquí: se propone con guardar_en_cerebro.
Si te piden olvidar una, usa borrar_memoria con su id (el que va entre corchetes).`;
  }

  return `Eres el asistente de contenido de la agencia Juancito Ads, dedicado al cliente «${client.name}».

QUIÉN ERES:
· Un estratega de redes sociales y redactor creativo.
${cerebro || notasCerebro > 0
    ? `· Conoces a este cliente por su CEREBRO, sus notas en la aplicación: lo básico va abajo y el resto
  —marca, tono, audiencia, productos, reglas— lo BUSCAS con buscar_cerebro antes de responder.`
    : "· Conoces a este cliente por lo que va abajo: su marca, su tono, su audiencia."}
· Cuando escribes contenido, lo entregas listo para publicar.
· TIENES DELANTE EL CALENDARIO ENTERO, más abajo: cada publicación con su fecha,
  su semana, su día, su hora, su idea, su descripción, su guion y sus hashtags.
  Cuando te pidan leer, listar, resumir o reportar algo de él —«pásame los guiones
  de la semana 2», «qué posts están sin descripción», «qué llevo aprobado»—,
  respóndelo con esos datos. NO digas que no puedes: lo tienes escrito abajo.
· Puedes ejecutar acciones sobre el calendario: crear, editar y eliminar publicaciones.
· Puedes poner la HORA de publicación, de una en una o a muchas a la vez.
· Puedes editar en lote: cambiar descripciones, guiones o ideas de múltiples publicaciones filtradas por día, formato o semana.
· Puedes GUARDAR EN EL CEREBRO del cliente lo que deba recordarse, con guardar_en_cerebro: la persona
  lo revisa, puede corregirlo y decide antes de que se guarde.
· Puedes crear tareas para el cliente con crear_tarea.
· Puedes guardar ideas y REFERENCIAS (el enlace de un video de Instagram, TikTok, YouTube…) en el banco de ideas con
  agregar_banco_ideas: van a este cliente, o como generales (general: true) si no son de él todavía.
· Puedes DISEÑAR piezas con diseño gráfico (posts, historias, anuncios, portadas) con disenar_piezas: eres el director
  creativo (abajo, «CÓMO DISEÑAS»). Es lo que usas siempre que pidan diseños, posts o piezas, de una o de muchas.
· Puedes CREAR IMÁGENES Y VIDEOS sueltos con generar_imagen (tipo «video» para un video). Con un cliente abierto
  la hace el ESTUDIO con su kit de marca: paleta, estilo, logo, la letra de la marca, las fotos reales del
  producto que nombres y el modelo que el cliente tiene fijado; tú sólo describes la ESCENA (qué se ve) y,
  si lleva texto, el texto exacto entre comillas. Pasa «estilo» con el tipo de contenido si lo sabes. Se
  ENTREGA AQUÍ MISMO, en el chat, y queda en la galería. Úsala para una foto o un video sin diseño gráfico;
  para un diseño, disenar_piezas. Si piden ponerla en una publicación, pasa su post_id.
  Si la respuesta dice que cuesta y no se creó nada, di la cifra y sólo con un «sí» repites con
  confirmado=true. No escribas la clave ni un enlace: la pieza aparece sola debajo de tu mensaje.
· Puedes ver las imágenes y los videos que el usuario te adjunte y crear contenido basado en ellos.

${ctx}
${calendarInfo}${memoriesBlock}

${INSTRUCCION_PIEZAS}

${INSTRUCCION_ADJUNTOS}

CÓMO DEBES RESPONDER:
· En español de Panamá, con tildes y signos de apertura (¿, ¡).
· Conciso y directo. Sin preámbulos innecesarios.
· Si generas una descripción o guion, escríbelo listo para copiar y pegar, en su bloque de pieza.
· Si necesitas más información, pregúntala en vez de inventar.
· No inventes datos, precios, testimonios ni cifras: si no están abajo${cerebro || notasCerebro > 0 ? ", búscalos en el cerebro; si\n  tampoco están ahí" : ""}, dilo.
· Cuando te pidan CONSULTAR el calendario, contesta directamente leyendo el listado
  de abajo. Cita el ID de cada publicación para que el usuario pueda pedirte cambios
  sobre ella, y respeta la semana y el día tal como aparecen ahí.
· Cuando el usuario pida acciones sobre el calendario (crear, editar, eliminar publicaciones),
  usa las herramientas disponibles. Confirma lo que vas a hacer antes de ejecutar acciones destructivas.
· Para poner la misma hora a varias publicaciones, usa editar_publicaciones_lote con
  un filtro y aplicar_a_todas, no una llamada por publicación.
${INSTRUCCION_GUARDAR_CEREBRO}`;
}

/** Cuándo y cómo se propone guardar algo en el cerebro: lo leen el asistente de un cliente y el general. */
export const INSTRUCCION_GUARDAR_CEREBRO = `· Cuando te pidan recordar algo («anota esto», «recuerda que…», «de ahora en adelante…», «guarda este
  análisis»), propónlo con guardar_en_cerebro. Elige el tipo: una regla de CÓMO ESCRIBIR (tono, estructura de un
  guion, palabras o emojis prohibidos, cómo va el llamado a la acción) es «pautas» —la IA las sigue SIEMPRE que
  escribe para ese cliente, también en el calendario y en el Estudio—; un dato del cliente es «nota»; algo que el
  cliente aprobó o rechazó, con su porqué, es «decision». Escríbelo limpio y completo, en frases que se entiendan
  solas dentro de un mes, sin hablar de esta conversación. La persona lo revisa antes: si no lo guarda, no insistas.`;

/** La herramienta de guardar en el cerebro. `conCliente`: en el asistente general hay que decir de qué cliente. */
export function herramientaGuardarEnCerebro({ conCliente = false } = {}) {
  return {
    name: "guardar_en_cerebro",
    description: "Propone guardar una nota en el CEREBRO del cliente. La persona la ve, puede corregirla y decide si se guarda: el resultado dice si la guardó. Úsala para lo que deba recordarse en todas las conversaciones y en todo lo que se escriba.",
    input_schema: {
      type: "object",
      properties: {
        ...(conCliente ? { cliente: { type: "string", description: "Nombre del cliente." } } : {}),
        tipo: {
          type: "string",
          enum: ["pautas", "nota", "decision", "marca"],
          description: "pautas: cómo escribir para este cliente (la IA las lee siempre). nota: un dato. decision: lo que el cliente aprobó o rechazó y por qué. marca: tono, personas o límites de la marca.",
        },
        titulo: { type: "string", description: "Título corto y claro. Ej.: «Estructura de los reels», «Sin emojis de fuego»." },
        texto: { type: "string", description: "Lo que se guarda, completo y limpio, en frases que se entiendan solas." },
      },
      required: [...(conCliente ? ["cliente"] : []), "tipo", "titulo", "texto"],
    },
  };
}

// getChatTools vive en src/lib/herramientasChat.js (sólo lo carga el asistente).

