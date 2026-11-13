// ============================================================
// `kit_descargable`: TODO lo de la marca de un cliente en un ZIP, para que Claude trabaje fuera del calendario
//
// Claude arma videos e imágenes con código en su propia máquina; antes tenía que buscar el logo, las fotos de cada
// producto y la música uno a uno en la galería y bajarlos con exportar_piezas. Aquí va de una vez:
//   logo/          el logo del kit, en su archivo original
//   letras/        la tipografía real de la marca (TTF, OTF, WOFF…), si el kit la tiene
//   productos/     las fotos de cada producto ACTIVO del catálogo, una carpeta por producto
//   personajes/    las imágenes de los personajes de la marca
//   musica/        la música de la marca (la favorita del cliente o, si no tiene, la de la agencia)
//   paleta.json    los colores del kit (hex, nombre y papel) y los TOKENS con que los dibuja el motor de video
//   kit.json       lo demás del kit (estilo, luz, lo que nunca, reglas, la letra, el logo) y los productos con su precio
//   LEEME.txt      qué hay y cómo se usa
//
// El mismo mecanismo que exportar_piezas (exportarPiezas.js): la herramienta COMPRUEBA y devuelve un enlace firmado, sin
// sesión, que vale 15 minutos; al abrirlo se vuelve a leer TODO por la capa de acceso (lo cambiado entretanto sale como
// esté) y el ZIP se arma por flujo desde R2. Nada se guarda. No gasta IA.
// ============================================================

import { crearAcceso, NULO } from "./acceso.js";
import { firmarCon, leerFirmado } from "./firmas.js";
import { secretoDeVista } from "./medioVista.js";
import { zipPorFlujo, nombreSeguro, ErrorExportar, MAX_ARCHIVOS_ZIP, MAX_BYTES_ZIP, VIDA_ZIP_MS, RUTA_EXPORTAR } from "./exportarPiezas.js";
import { limpiarKit } from "../../src/lib/kitMarca.js";
import { limpiarCatalogo } from "../../src/lib/estudioMercado.js";
import { paletaDelKit } from "../../src/lib/motorVideo.js";

const USO = "kit-zip";
export const RUTA_KIT = `${RUTA_EXPORTAR}kit/`;

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) ?? d : (t ?? d); } catch { return d; } };
const extension = (clave, defecto = "bin") => /\.([a-z0-9]{2,5})$/i.exec(String(clave ?? ""))?.[1]?.toLowerCase() ?? defecto;
const deEsteCliente = (clave, clientId) => typeof clave === "string" && clave.startsWith(`clientes/${clientId}/`) && !clave.includes("..");
const megas = (b) => `${(b / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;

export const DEFINICION_KIT = Object.freeze({
  name: "kit_descargable",
  description:
    "Todo lo de la MARCA de un cliente en un ZIP, para trabajar fuera del calendario (armar un video o una imagen con código): el logo original, la " +
    "tipografía real (TTF/OTF), las fotos de cada producto activo del catálogo (una carpeta por producto), los personajes, la música de la marca, " +
    "paleta.json (hex, nombre y papel de cada color, y los tokens fondo/texto/acento… con que los dibuja el motor de video) y kit.json (estilo, luz, " +
    "lo que nunca, reglas, productos con su precio). Devuelve un enlace que funciona sin iniciar sesión durante 15 minutos. Lo hecho con él se " +
    "sube con subir_a_galeria. Sólo lee: no gasta IA ni cambia nada.",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." } },
    required: ["cliente"],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

/**
 * Lo que lleva el ZIP de un cliente: { archivos: [{ ruta, clave }], textos: [{ ruta, texto }], omitidos }. Lee el kit y
 * el catálogo GUARDADOS (por la capa de acceso). Sólo claves de ESE cliente (la música de la agencia, de ESTE espacio).
 */
export async function planDelKit(acceso, cliente) {
  const kit = limpiarKit(leerJSON(cliente.kit_marca, {}));
  const crudo = leerJSON(cliente.kit_marca, {}) ?? {};
  const fila = await acceso.leerUno("mercado_clientes", { client_id: cliente.id }).catch(() => null);
  const catalogo = limpiarCatalogo(leerJSON(fila?.catalogo, [])).filter((p) => p.activo !== false);
  const archivos = [];
  const usadas = new Set();
  const poner = (ruta, clave, propia = true) => {
    if (!clave || usadas.has(clave) || (propia && !deEsteCliente(clave, cliente.id))) return false;
    usadas.add(clave);
    archivos.push({ ruta, clave });
    return true;
  };

  const logo = kit.logo ? `logo/logo.${extension(kit.logo, "png")}` : "";
  if (logo) poner(logo, kit.logo);
  const letra = kit.fuente?.clave ? `letras/${nombreSeguro(kit.fuente.nombre, 40) || "letra"}.${extension(kit.fuente.clave, "ttf")}` : "";
  if (letra) poner(letra, kit.fuente.clave);

  // La música de la marca: la favorita del cliente; si no tiene, la favorita de la agencia.
  let musica = null;
  const propia = (await acceso.leer("estudio_archivos", { client_id: cliente.id, tipo: "audio", favorito: 1, borrado_at: NULO }, "created_at desc", 5).catch(() => []))
    .find((f) => /^musica/.test(String(f.modelo ?? "")));
  if (propia && poner(`musica/${nombreSeguro(propia.prompt, 40) || "musica-de-la-marca"}.${extension(propia.clave, "mp3")}`, propia.clave)) musica = { nombre: propia.prompt, de: "cliente" };
  if (!musica) {
    const agencia = (await acceso.leer("biblioteca_sonidos", { categoria: "musica", favorita: 1 }, "created_at desc", 1).catch(() => []))[0];
    if (agencia?.clave && String(agencia.clave).startsWith(`biblioteca/${acceso.ownerId}/`) && poner(`musica/${nombreSeguro(agencia.nombre, 40) || "musica-de-la-agencia"}.${extension(agencia.clave, "mp3")}`, agencia.clave, false)) {
      musica = { nombre: agencia.nombre, de: "agencia" };
    }
  }

  for (const p of kit.personajes) {
    p.imagenes.forEach((c, i) => poner(`personajes/${nombreSeguro(p.nombre, 30) || "personaje"}/${String(i + 1).padStart(2, "0")}.${extension(c, "png")}`, c));
  }

  // Las fotos de los productos, al final: si no caben en el tope de archivos, se quedan fuera (y se dice).
  let omitidos = 0;
  const productos = [];
  for (const p of catalogo) {
    const carpeta = nombreSeguro(p.nombre, 40) || p.id;
    const fotos = [];
    p.fotos.forEach((c, i) => {
      const ruta = `productos/${carpeta}/${String(i + 1).padStart(2, "0")}.${extension(c, "jpg")}`;
      if (archivos.length >= MAX_ARCHIVOS_ZIP) { omitidos++; return; }
      if (poner(ruta, c)) fotos.push(ruta);
    });
    productos.push({
      nombre: p.nombre, ...(p.marca ? { marca: p.marca } : {}), ...(p.precio ? { precio: p.precio } : {}), ...(p.oferta ? { oferta: p.oferta } : {}),
      ...(p.beneficios ? { beneficios: p.beneficios } : {}), fotos,
    });
  }

  const tokens = paletaDelKit(kit.paleta);
  const textos = [
    { ruta: "paleta.json", texto: JSON.stringify({ colores: kit.paleta, tokens, nota: "tokens: los papeles con que el motor de video dibuja (fondo, superficie, texto, acento, apoyo, claro, oscuro)." }, null, 2) },
    {
      ruta: "kit.json",
      texto: JSON.stringify({
        cliente: cliente.name,
        logo: logo || null, logoModo: kit.logoModo, logoPosicion: kit.logoPosicion,
        letra: letra ? { archivo: letra, nombre: kit.fuente.nombre } : null, tipografia: kit.tipografia || null,
        estilo: kit.estilo || null, luz: kit.luz || null, nunca: kit.evitar || null, reglas: kit.reglas,
        ...(crudo.estiloVideo ? { estiloVideo: kit.estiloVideo ?? crudo.estiloVideo } : {}),
        musica: musica ? { ...musica, archivo: archivos.find((a) => a.ruta.startsWith("musica/"))?.ruta } : null,
        personajes: kit.personajes.map((p) => ({ nombre: p.nombre, descripcion: p.descripcion })),
        productos,
      }, null, 2),
    },
  ];
  textos.push({ ruta: "LEEME.txt", texto: leeme(cliente.name, { logo, letra, musica, productos, personajes: kit.personajes.length, omitidos }) });
  return { archivos, textos, omitidos, productos, logo, letra, musica };
}

function leeme(nombre, { logo, letra, musica, productos, personajes, omitidos }) {
  return [
    `Kit de marca de ${nombre} (Juancito Ads).`,
    "",
    `Logo: ${logo || "el kit no tiene logo."}`,
    `Letra: ${letra || "el kit no tiene archivo de letra (usa la tipografía que dice kit.json)."}`,
    `Música: ${musica ? `musica/ (${musica.de === "agencia" ? "la de la agencia: el cliente no tiene una favorita" : "la de la marca"})` : "ninguna marcada como favorita."}`,
    `Productos: ${productos.length} (fotos en productos/<producto>/; precios en kit.json: úsalos tal cual, nunca otros).`,
    personajes ? `Personajes: ${personajes} (personajes/).` : "",
    omitidos ? `OJO: ${omitidos} fotos de productos no cupieron en el ZIP (tope de ${MAX_ARCHIVOS_ZIP} archivos).` : "",
    "",
    "paleta.json: cada color con su papel y los tokens (fondo, texto, acento…) con que se dibujan los videos de la marca.",
    "Lo que hagas con esto se sube a la galería del cliente con subir_a_galeria.",
  ].filter((l) => l !== "").join("\n");
}

/** La herramienta. */
export function crearHerramientaKit({ env, acceso, resolverCliente, usuario }) {
  return {
    async kit_descargable({ cliente }) {
      const c = await resolverCliente(cliente);
      const plan = await planDelKit(acceso, c);
      let bytes = plan.textos.reduce((s, t) => s + t.texto.length, 0);
      const faltan = [];
      for (const a of plan.archivos) {
        const h = await env.MEDIA.head(a.clave).catch(() => null);
        if (!h) faltan.push(a.ruta);
        bytes += Number(h?.size) || 0;
      }
      if (bytes > MAX_BYTES_ZIP) throw new ErrorExportar(`El kit pesa ${megas(bytes)} y el ZIP admite como mucho ${megas(MAX_BYTES_ZIP)}: baja las fotos con exportar_piezas por partes.`);
      const secreto = await secretoDeVista(env).catch(() => null);
      if (!secreto) throw new ErrorExportar("No pude preparar el enlace de descarga ahora. Inténtalo otra vez.");
      const testigo = await firmarCon(secreto, USO, { o: usuario.ownerId ?? usuario.id, c: c.id, cl: usuario.clientes ?? null }, VIDA_ZIP_MS);
      const url = `${RUTA_KIT}${testigo}/kit-${nombreSeguro(c.name, 40) || "marca"}.zip`;
      const fotos = plan.productos.reduce((s, p) => s + p.fotos.length, 0);
      return [
        `Kit de marca de ${c.name}: ${plan.archivos.length - faltan.length} archivos (unos ${megas(bytes)}) + paleta.json, kit.json y LEEME.txt.`,
        `· Logo: ${plan.logo ? "sí" : "NO (el kit no tiene logo)"} · Letra: ${plan.letra ? "sí" : "no"} · Música: ${plan.musica ? (plan.musica.de === "agencia" ? "la de la agencia" : "la de la marca") : "ninguna"} · Productos: ${plan.productos.length} (${fotos} fotos)`,
        plan.omitidos ? `OJO: ${plan.omitidos} fotos de productos no caben (tope de ${MAX_ARCHIVOS_ZIP} archivos).` : "",
        faltan.length ? `OJO: estos ya no están en el almacenamiento y no irán: ${faltan.join(", ")}.` : "",
        `Descarga (vale 15 minutos, sin iniciar sesión): ${url}`,
        "Lo que hagas con esto se sube con subir_a_galeria.",
      ].filter(Boolean).join("\n");
    },
  };
}

/** GET /api/exportar/kit/<testigo>/<nombre>.zip — sin sesión, mientras el testigo no caduque. */
export async function rutaKit(req, env, partes) {
  const testigo = String(partes[2] ?? "");
  const noHay = () => new Response("Este enlace de descarga no existe o ya caducó (dura 15 minutos). Pídele a Claude otro.", {
    status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
  if (!testigo || testigo.length > 4000) return noHay();
  const secreto = await secretoDeVista(env).catch(() => null);
  const d = secreto ? await leerFirmado(secreto, USO, testigo) : null;
  if (!d?.o || !d?.c) return noHay();
  const acceso = crearAcceso(env.DB, d.o, Array.isArray(d.cl) ? { clientes: d.cl } : {});
  const cliente = await acceso.leerUno("clients", { id: d.c }).catch(() => null);
  if (!cliente) return noHay();
  const plan = await planDelKit(acceso, cliente);
  const enc = new TextEncoder();
  const entradas = [
    ...plan.textos.map((t) => ({ ruta: t.ruta, abrir: async () => new Response(enc.encode(t.texto)).body })),
    ...plan.archivos.map((a) => ({ ruta: a.ruta, abrir: async () => (await env.MEDIA.get(a.clave))?.body ?? null })),
  ];
  const nombre = nombreSeguro(decodeURIComponent(String(partes[3] ?? "")).replace(/\.zip$/i, ""), 80) || "kit";
  return new Response(zipPorFlujo(entradas), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nombre}.zip"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
