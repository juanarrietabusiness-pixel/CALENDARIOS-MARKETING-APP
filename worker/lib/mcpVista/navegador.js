// ============================================================
// La página de la VISTA PREVIA que claude.ai pinta en el chat (MCP Apps). Corre en un iframe aislado, sin sesión y sin
// red: habla con claude.ai por `postMessage` en JSON-RPC (el protocolo de MCP Apps) y todo lo que necesita le llega así.
//
//   1. `ui/initialize` → el tema y los colores del chat; `ui/notifications/initialized`.
//   2. `ui/notifications/tool-result`: el resultado de la herramienta (texto + imágenes + `structuredContent`) → se pinta.
//   3. Si la vista dice `seguir` (un encargo en marcha), la página llama ESA herramienta (sólo de la vista) cada pocos
//      segundos por `tools/call` —claude.ai la reenvía al conector— y las piezas aparecen según salen.
//   4. Lo que toca la persona: «Me gusta» (`me_gusta_pieza`), «Pedir un cambio» y «Crear» escriben en el chat
//      (`ui/message`: Claude sigue con sus herramientas y su confirmación de costo), «Abrir en el Estudio» (`ui/open-link`).
//   5. Los AUDIOS y VIDEOS (la muestra de una voz, la locución, la música, el mp4) se reproducen con <audio>/<video> desde
//      su dirección firmada en el origen del conector (el recurso la declara en su `csp.resourceDomains`). Cada
//      reproductor se REUTILIZA al repintar: si no, una vuelta o un «Me gusta» cortaría lo que se está oyendo. Si no
//      carga y su dirección caducó, se pide otra (`vista_medios`); si aun así no, «Abrir» (fuera del iframe).
//
// Sin dependencias: el protocolo son cuatro mensajes, y la página va entera dentro del recurso (pagina.generada.js, que
// sale de aquí con `node scripts/mcp/generar-vista.mjs`). Lo puro está en modelo.js y tiene sus pruebas.
// ============================================================

import {
  leerResultado, idsConImagen, proximaVuelta, mensajeDeCambio, mensajeDeCrear, cuentaDeListas, ESTADOS_PIEZA,
  conFallo, tocaRenovar, conRenovados, direccionValida, reloj,
} from "./modelo.js";

const PROTOCOLO = "2026-01-26";
const PLAZO_MS = 90_000;

// ------------------------------------------------------------
// El protocolo
// ------------------------------------------------------------

let siguienteId = 1;
const pendientes = new Map();
const enviar = (m) => window.parent.postMessage(m, "*");

function pedir(method, params) {
  const id = siguienteId++;
  enviar({ jsonrpc: "2.0", id, method, params });
  return new Promise((ok, mal) => {
    pendientes.set(id, { ok, mal });
    setTimeout(() => { if (pendientes.delete(id)) mal(new Error("claude.ai no contestó.")); }, PLAZO_MS);
  });
}
const avisar = (method, params = {}) => enviar({ jsonrpc: "2.0", method, params });
const responder = (id, result) => enviar({ jsonrpc: "2.0", id, result });

let capacidades = {};
let modelo = null;
let vueltas = 0;
let fallos = 0;
let temporizador = null;
let ampliada = null;
let estado = "";
/** Se dejó de preguntar (muchos fallos, o demasiado tiempo): «Actualizar» lo retoma. */
let detenido = false;
/** La huella de lo último pintado: si una vuelta no trae nada nuevo, no se repinta (ni se pierde el foco). */
let huella = "";
const cambios = new Map(); // id de la pieza → { abierto, borrador }
/** Los reproductores ya creados (`audio:<id>`, `video:<id>`): se reutilizan al repintar para no cortar lo que suena. */
const reproductores = new Map();
/** Las direcciones que se están renovando (no se pide dos veces la misma). */
const renovando = new Set();

window.addEventListener("message", (ev) => {
  if (ev.source !== window.parent) return;
  const m = ev.data;
  if (!m || m.jsonrpc !== "2.0") return;
  if (!m.method && m.id !== undefined && m.id !== null) {
    const p = pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.error) p.mal(new Error(m.error.message || "No se pudo."));
    else p.ok(m.result);
    return;
  }
  switch (m.method) {
    case "ui/notifications/tool-result":
      vueltas = 0;
      fallos = 0;
      detenido = false;
      modelo = leerResultado(m.params, modelo);
      pintar();
      programar();
      break;
    case "ui/notifications/tool-cancelled":
      if (!modelo) modelo = { tipo: "piezas", titulo: "", piezas: [] };
      modelo.error = "Se canceló.";
      pintar();
      break;
    case "ui/notifications/host-context-changed":
      aplicarContexto(m.params);
      break;
    case "ui/resource-teardown":
      clearTimeout(temporizador);
      if (m.id !== undefined) responder(m.id, {});
      break;
    case "ping":
      if (m.id !== undefined) responder(m.id, {});
      break;
    default:
      // Una petición que no se conoce se contesta con error (las notificaciones, nada).
      if (m.id !== undefined && m.id !== null) enviar({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Método no disponible" } });
  }
});

function aplicarContexto(ctx = {}) {
  const raiz = document.documentElement;
  if (ctx.theme === "dark" || ctx.theme === "light") raiz.dataset.tema = ctx.theme;
  const variables = ctx.styles?.variables ?? {};
  for (const [k, v] of Object.entries(variables)) if (/^--[a-z0-9-]+$/.test(k) && typeof v === "string") raiz.style.setProperty(k, v);
}

/** Avisa a claude.ai del alto de la página para que el iframe crezca con ella (como hace el SDK oficial). */
function observarTamano() {
  let pendiente = false;
  let ancho = 0;
  let alto = 0;
  const medir = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      const raiz = document.documentElement;
      const antes = raiz.style.height;
      raiz.style.height = "max-content";
      const h = Math.ceil(raiz.getBoundingClientRect().height);
      raiz.style.height = antes;
      const w = Math.ceil(window.innerWidth);
      if (w !== ancho || h !== alto) {
        ancho = w;
        alto = h;
        avisar("ui/notifications/size-changed", { width: w, height: h });
      }
    });
  };
  medir();
  const ro = new ResizeObserver(medir);
  ro.observe(document.documentElement);
  ro.observe(document.body);
}

// ------------------------------------------------------------
// Ponerse al día mientras el encargo sigue
// ------------------------------------------------------------

function programar() {
  clearTimeout(temporizador);
  if (detenido) return;
  const ms = proximaVuelta(modelo, vueltas);
  if (ms === null) {
    if (modelo?.seguir && !modelo.error) { detenido = true; pintar(); }
    return;
  }
  temporizador = setTimeout(vuelta, ms);
}

async function vuelta() {
  if (!modelo?.seguir) return;
  vueltas++;
  try {
    const r = await pedir("tools/call", { name: modelo.seguir.herramienta, arguments: { ...modelo.seguir.argumentos, ya: idsConImagen(modelo) } });
    fallos = 0;
    modelo = leerResultado(r, modelo);
  } catch {
    fallos++;
    if (fallos >= 3) {
      detenido = true;
      estado = "No pude ponerla al día. Pulsa «Actualizar» o pídele a Claude que mire cómo va.";
    }
  }
  pintar();
  programar();
}

function retomar() {
  detenido = false;
  vueltas = 0;
  fallos = 0;
  estado = "";
  vuelta();
}

// ------------------------------------------------------------
// Lo que toca la persona
// ------------------------------------------------------------

async function meGusta(pieza, boton) {
  const nuevo = !pieza.gusta;
  modelo.gustos = { ...(modelo.gustos ?? {}), [pieza.id]: nuevo };
  pieza.gusta = nuevo;
  pintar();
  try {
    const r = await pedir("tools/call", { name: "me_gusta_pieza", arguments: { archivo_id: pieza.id, me_gusta: nuevo } });
    if (r?.isError) throw new Error((r.content ?? []).map((b) => b.text).join(" "));
    estado = nuevo ? "Marcada con «Me gusta»: el kit aprende de ella." : "Quitado el «Me gusta».";
  } catch (e) {
    modelo.gustos[pieza.id] = !nuevo;
    pieza.gusta = !nuevo;
    estado = `No se pudo: ${e.message}`;
  }
  pintar();
  boton?.focus();
}

async function escribirEnElChat(texto) {
  if (!texto) return false;
  try {
    await pedir("ui/message", { role: "user", content: [{ type: "text", text: texto }] });
    estado = "Enviado al chat.";
    return true;
  } catch (e) {
    estado = `No se pudo escribir en el chat (${e.message}). Escríbelo tú: «${texto}»`;
    return false;
  } finally {
    pintar();
  }
}

async function abrirDireccion(url) {
  if (!direccionValida(url)) return;
  try {
    await pedir("ui/open-link", { url });
  } catch (e) {
    estado = `No se pudo abrir (${e.message}). Cópiala: ${url}`;
    pintar();
  }
}

/** Un reproductor no cargó: si su dirección caducó, se pide otra; si no (o ya se pidió), se marca y sale «Abrir». */
async function alFallarMedio(tipo, id) {
  const lista = tipo === "video" ? modelo?.videos : modelo?.audios;
  const m = lista?.find((x) => x.id === id);
  if (!m) return;
  if (tocaRenovar(m) && !renovando.has(m.ref)) {
    renovando.add(m.ref);
    try {
      const r = await pedir("tools/call", { name: "vista_medios", arguments: { refs: [m.ref] } });
      const nuevo = conRenovados(modelo, r);
      const otra = (tipo === "video" ? nuevo?.videos : nuevo?.audios)?.find((x) => x.id === id);
      if (otra?.renovado) {
        modelo = nuevo;
        reproductores.delete(`${tipo}:${id}`);
        pintar();
        return;
      }
    } catch {
      // Sin respuesta: queda marcado y sale «Abrir».
    } finally {
      renovando.delete(m.ref);
    }
  }
  modelo = conFallo(modelo, tipo, id);
  pintar();
}

async function abrirEstudio() {
  const url = modelo?.cliente?.enlace;
  if (!url) return;
  try { await pedir("ui/open-link", { url }); } catch (e) { estado = `No se pudo abrir: ${e.message}`; pintar(); }
}

// ------------------------------------------------------------
// Pintar
// ------------------------------------------------------------

function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "texto") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h);
  return n;
}

const raiz = () => document.getElementById("vista");

function cabecera() {
  const { listas, total } = cuentaDeListas(modelo);
  const enMarcha = modelo.estado === "en_marcha" || (modelo.seguir && listas < total);
  const partes = [
    modelo.subtitulo || (modelo.tipo === "piezas" && total > 1 ? `${listas} de ${total} listas` : ""),
    modelo.cliente?.nombre ?? "",
  ].filter(Boolean);
  return el("header", { class: "cabecera" },
    el("div", { class: "titulos" },
      el("h1", { texto: modelo.titulo || "Vista previa" }),
      partes.length ? el("p", { class: "sub", texto: partes.join(" · ") }) : null),
    enMarcha ? el("span", { class: "pastilla viva", texto: "En marcha" }) : null);
}

function insignia(p) {
  if (p.estado !== "lista") return el("span", { class: `insignia ${p.estado}`, texto: ESTADOS_PIEZA[p.estado] ?? p.estado });
  if (!p.control) return null;
  const ok = p.control.estado === "ok";
  return el("span", { class: `insignia ${ok ? "ok" : "revisar"}`, texto: `${ok ? "Revisada" : "Revisar"}${p.control.puntaje ? ` · diseño ${p.control.puntaje}/10` : ""}` });
}

function formularioDeCambio(p) {
  const c = cambios.get(p.id);
  if (!c?.abierto) return null;
  const id = `cambio-${p.id}`;
  const area = el("textarea", { id, rows: 3, placeholder: "Ej.: el titular más grande y arriba; sin el fondo azul." });
  area.value = c.borrador ?? "";
  area.addEventListener("input", () => { c.borrador = area.value; });
  const enviarCambio = async () => {
    const texto = mensajeDeCambio({ pieza: p, cliente: modelo.cliente, indicacion: area.value });
    if (!texto) { area.focus(); return; }
    if (await escribirEnElChat(texto)) { cambios.delete(p.id); pintar(); }
  };
  const form = el("div", { class: "cambio" },
    el("label", { for: id, texto: "¿Qué le cambio?" }),
    area,
    el("div", { class: "fila" },
      el("button", { type: "button", class: "primario", texto: "Enviar a Claude", onclick: enviarCambio }),
      el("button", { type: "button", texto: "Cancelar", onclick: () => { cambios.delete(p.id); pintar(); } })));
  queueMicrotask(() => { if (c.enfocar) { c.enfocar = false; area.focus(); } });
  return form;
}

function acciones(p) {
  if (!p.archivo || p.estado !== "lista") return null;
  const titulo = p.titulo || "la pieza";
  return el("div", { class: "acciones" },
    el("button", {
      type: "button", class: `chico${p.gusta ? " activo" : ""}`, "aria-pressed": p.gusta ? "true" : "false", "aria-label": `Me gusta «${titulo}»`,
      texto: p.gusta ? "Me gusta ✓" : "Me gusta", onclick: (ev) => meGusta(p, ev.currentTarget),
    }),
    el("button", {
      type: "button", class: "chico", "aria-expanded": cambios.get(p.id)?.abierto ? "true" : "false", "aria-label": `Pedir un cambio de «${titulo}»`, texto: "Cambiar",
      onclick: () => { const c = cambios.get(p.id) ?? {}; c.abierto = !c.abierto; c.enfocar = c.abierto; cambios.set(p.id, c); pintar(); },
    }));
}

function tarjeta(p, i) {
  const titulo = p.titulo || `Pieza ${i + 1}`;
  let visual;
  if (p.src) {
    visual = el("button", { type: "button", class: "imagen", "aria-label": `Ampliar «${titulo}»`, onclick: () => { ampliada = p.id; pintar(); } },
      el("img", { src: p.src, alt: titulo, decoding: "async" }));
  } else {
    const texto = p.estado === "lista" ? (p.sinImagen ? "Sin vista previa" : "Cargando la imagen…") : ESTADOS_PIEZA[p.estado] ?? "";
    visual = el("div", { class: `hueco ${p.estado}`, role: "img", "aria-label": `${titulo}: ${texto}` }, el("span", { texto }));
  }
  return el("li", { class: "tarjeta" },
    visual,
    el("div", { class: "pie" },
      el("p", { class: "nombre", texto: titulo }),
      insignia(p),
      p.nota ? el("p", { class: "nota", texto: p.nota }) : null,
      acciones(p),
      formularioDeCambio(p)));
}

/** El <audio> o <video> de un medio: el mismo elemento mientras no cambie su dirección. */
function reproductor(tipo, m) {
  const clave = `${tipo}:${m.id}`;
  const previo = reproductores.get(clave);
  if (previo && previo.dataset.src === m.url) return previo;
  const titulo = m.titulo || (tipo === "video" ? "el video" : "el audio");
  const n = document.createElement(tipo);
  n.controls = true;
  n.preload = "metadata";
  if (tipo === "video") {
    n.playsInline = true;
    n.setAttribute("playsinline", "");
    if (m.poster) n.poster = m.poster;
  }
  n.dataset.src = m.url;
  n.setAttribute("aria-label", `${tipo === "video" ? "Ver" : "Escuchar"} «${titulo}»`);
  n.addEventListener("error", () => { if (reproductores.get(clave) === n) alFallarMedio(tipo, m.id); });
  n.src = m.url;
  reproductores.set(clave, n);
  return n;
}

function tarjetaDeMedio(tipo, m) {
  const titulo = m.titulo || (tipo === "video" ? "Video" : "Audio");
  const datos = [m.voz ? `Voz: ${m.voz}` : "", reloj(m.duracion), m.estado === "lista" ? m.nota ?? "" : ""].filter(Boolean).join(" · ");
  let cuerpo;
  if (m.estado !== "lista") {
    const texto = m.nota || ESTADOS_PIEZA[m.estado] || "";
    cuerpo = el("div", { class: `hueco-medio ${m.estado}`, role: "img", "aria-label": `${titulo}: ${texto}` }, el("span", { texto }));
  } else if (!m.url) {
    cuerpo = el("p", { class: "fallo-medio", texto: "No se puede reproducir aquí: está en la aplicación, en el Estudio del cliente." });
  } else if (m.fallo) {
    cuerpo = el("div", { class: "fallo-medio" },
      el("p", { texto: `No se pudo cargar ${tipo === "video" ? "el video" : "el audio"} aquí.` }),
      el("button", { type: "button", texto: "Abrir", "aria-label": `Abrir «${titulo}» fuera del chat`, onclick: () => abrirDireccion(m.url) }));
  } else {
    cuerpo = reproductor(tipo, m);
  }
  return el("li", { class: `medio ${tipo}` },
    el("p", { class: "nombre", texto: titulo }),
    datos ? el("p", { class: "nota", texto: datos }) : null,
    cuerpo);
}

function medios() {
  const audios = modelo.audios ?? [];
  const videos = modelo.videos ?? [];
  // Lo que ya no se enseña suelta su reproductor (y deja de sonar).
  const vivos = new Set([...audios.map((m) => `audio:${m.id}`), ...videos.map((m) => `video:${m.id}`)]);
  for (const [k, n] of reproductores) if (!vivos.has(k)) { n.pause?.(); reproductores.delete(k); }
  if (!audios.length && !videos.length) return null;
  return el("section", { class: "medios", "aria-label": videos.length && audios.length ? "Videos y audios" : videos.length ? "Videos" : "Audios" },
    el("ul", { class: "lista-medios" },
      videos.map((m) => tarjetaDeMedio("video", m)),
      audios.map((m) => tarjetaDeMedio("audio", m))));
}

function grande() {
  const lista = modelo.piezas.filter((p) => p.src);
  const k = lista.findIndex((p) => p.id === ampliada);
  if (k < 0) { ampliada = null; return null; }
  const p = lista[k];
  const ir = (d) => { ampliada = lista[(k + d + lista.length) % lista.length].id; pintar(); };
  return el("section", { class: "grande", "aria-label": "Pieza ampliada" },
    el("img", { src: p.src, alt: p.titulo || `Pieza ${k + 1}` }),
    el("p", { class: "nombre", texto: `${p.titulo || `Pieza ${k + 1}`} · ${k + 1} de ${lista.length}` }),
    el("div", { class: "fila" },
      lista.length > 1 ? el("button", { type: "button", texto: "‹ Anterior", onclick: () => ir(-1) }) : null,
      lista.length > 1 ? el("button", { type: "button", texto: "Siguiente ›", onclick: () => ir(1) }) : null,
      el("button", { type: "button", class: "primario", texto: "Ver todas", onclick: () => { ampliada = null; pintar(); } })),
    acciones(p),
    formularioDeCambio(p));
}

function plan() {
  const pl = modelo.plan ?? { piezas: [] };
  const otra = cambios.get("plan") ?? {};
  const id = "cambio-plan";
  const area = otra.abierto ? el("textarea", { id, rows: 3, placeholder: "Ej.: que la 2 sea un carrusel; sin la pieza 3." }) : null;
  if (area) {
    area.value = otra.borrador ?? "";
    area.addEventListener("input", () => { otra.borrador = area.value; });
    queueMicrotask(() => { if (otra.enfocar) { otra.enfocar = false; area.focus(); } });
  }
  return el("section", { class: "plan" },
    el("ol", {}, pl.piezas.map((p) => el("li", { class: p.error ? "no-va" : "" },
      el("p", { class: "nombre", texto: p.titulo }),
      el("p", { class: "nota", texto: p.error ? `No va: ${p.error}` : p.detalle })))),
    el("p", { class: "costo", texto: pl.costo ? `Costo aproximado: ${pl.costo}. Nada se crea hasta que digas que sí.` : "Nada se crea hasta que digas que sí." }),
    el("div", { class: "fila" },
      el("button", { type: "button", class: "primario", texto: pl.costo ? `Crear (unos ${pl.costo})` : "Crear", onclick: () => escribirEnElChat(mensajeDeCrear(modelo)) }),
      el("button", { type: "button", "aria-expanded": otra.abierto ? "true" : "false", texto: "Cambiar algo", onclick: () => { otra.abierto = !otra.abierto; otra.enfocar = otra.abierto; cambios.set("plan", otra); pintar(); } })),
    area ? el("div", { class: "cambio" },
      el("label", { for: id, texto: "¿Qué cambio del plan?" }),
      area,
      el("div", { class: "fila" },
        el("button", { type: "button", class: "primario", texto: "Enviar a Claude", onclick: async () => { const t = String(area.value ?? "").trim(); if (!t) { area.focus(); return; } if (await escribirEnElChat(`Cambia el plan: ${t}`)) { cambios.delete("plan"); pintar(); } } }),
        el("button", { type: "button", texto: "Cancelar", onclick: () => { cambios.delete("plan"); pintar(); } }))) : null);
}

/** Lo que cambia lo que se ve (sin los bytes de las imágenes: basta saber cuáles hay). */
function huellaDe() {
  if (!modelo) return "";
  return JSON.stringify([modelo, ampliada, estado, detenido, [...cambios].map(([k, v]) => [k, Boolean(v.abierto)])], (k, v) => (k === "src" ? Boolean(v) : v));
}

function pintar() {
  const r = raiz();
  if (!r) return;
  if (!modelo) { r.replaceChildren(el("p", { class: "sub espera", texto: "Esperando a Claude…" })); return; }
  const nueva = huellaDe();
  if (nueva === huella) return;
  huella = nueva;
  // Lo que tiene el foco se recupera tras repintar (el campo de un cambio, con lo que se estaba escribiendo, o el
  // reproductor que se estaba tocando): se mira ANTES de armar lo nuevo, que se lleva los reproductores consigo.
  const activo = document.activeElement;
  const id = activo?.id;
  const sel = id && "selectionStart" in activo ? [activo.selectionStart, activo.selectionEnd] : null;
  const medioActivo = [...reproductores.values()].includes(activo) ? activo : null;
  const partes = [cabecera()];
  if (modelo.error) partes.push(el("p", { class: "error", role: "alert", texto: modelo.error }));
  if (modelo.aviso) partes.push(el("p", { class: "aviso", texto: modelo.aviso }));
  const reproductoresDeMedios = modelo.tipo === "plan" ? null : medios();
  if (reproductoresDeMedios) partes.push(reproductoresDeMedios);
  if (modelo.tipo === "plan") partes.push(plan());
  else if (ampliada && modelo.piezas.some((p) => p.id === ampliada && p.src)) partes.push(grande());
  else if (modelo.piezas.length) {
    ampliada = null;
    const lista = el("ul", { class: `rejilla ${modelo.tipo === "cuadros" ? "una" : ""}`.trim() });
    modelo.piezas.forEach((p, i) => lista.append(tarjeta(p, i)));
    partes.push(lista);
  } else if (reproductoresDeMedios) {
    // Sólo audio o video: ya están arriba.
  } else if (modelo.texto) partes.push(el("p", { class: "texto", texto: modelo.texto }));
  else if (modelo.seguir) partes.push(el("p", { class: "sub espera", texto: "Preparando las piezas…" }));

  const pie = el("footer", { class: "fila" },
    modelo.cliente?.enlace ? el("button", { type: "button", texto: "Abrir en el Estudio", onclick: abrirEstudio }) : null,
    detenido && modelo.seguir ? el("button", { type: "button", texto: "Actualizar", onclick: retomar }) : null);
  if (pie.childElementCount) partes.push(pie);
  partes.push(el("p", { class: "estado", role: "status", texto: estado }));
  r.replaceChildren(...partes);
  const otra = id ? document.getElementById(id) : null;
  if (otra) {
    otra.focus();
    if (sel) otra.setSelectionRange(...sel);
  } else if (medioActivo?.isConnected) {
    medioActivo.focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------

async function iniciar() {
  pintar();
  try {
    const r = await pedir("ui/initialize", {
      appInfo: { name: "juancito-ads-vista", version: "1.0.0" },
      appCapabilities: {},
      protocolVersion: PROTOCOLO,
    });
    capacidades = r?.hostCapabilities ?? {};
    aplicarContexto(r?.hostContext ?? {});
  } catch {
    // Sin anfitrión que conteste: se pinta igual con lo que llegue.
  }
  avisar("ui/notifications/initialized", {});
  observarTamano();
}

iniciar();
// Para las pruebas: lo que sabe la página de claude.ai.
window.__vista = { capacidades: () => capacidades };
