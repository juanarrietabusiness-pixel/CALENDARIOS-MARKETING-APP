// ============================================================
// Google Drive como banco de contenido
//
// Todo lo que el banco hacía, pero sobre la carpeta de Drive del
// cliente: explorar, ver, subir, mandar a la papelera, adjuntar al chat,
// analizar un video y poner una imagen en una publicación.
//
// TRES REGLAS
//
//   1. Nada fuera de la carpeta del cliente. Cada id que llega del
//      navegador se comprueba subiendo por sus padres hasta la raíz del
//      cliente (`dentroDelCliente`). Sin eso, con la sesión de la
//      agencia se podría leer cualquier archivo de su Drive.
//   2. Lo que se sirve desde este origen no puede ejecutarse. Un .html o
//      un .svg de Drive servido tal cual aquí sería código corriendo con
//      la sesión de la agencia. Sólo imagen (sin SVG) y video se sirven
//      en línea, y todo lleva `sandbox` y `nosniff`.
//   3. Lo que se pone en una publicación se COPIA a R2. La página de
//      aprobación del cliente y el HTML exportado no tienen acceso al
//      Drive, y si leyeran de ahí se romperían en cuanto alguien moviera
//      el archivo.
// ============================================================

import { json, error, cuerpo, noEncontrado, CABECERAS_API } from "../lib/respuesta.js";
import { crearAcceso } from "../lib/acceso.js";
import { difundir, firma } from "../lib/vivo.js";
import { ahora, uuid, testigo } from "../lib/ids.js";
import {
  COOKIE_OAUTH, DriveDesconectado, drive, errorDe, driveConfigurado,
  dentroDelCliente, marcarVerificado, olvidarVerificado, respuestaDeFallo,
  urlConsentimiento, urlRedireccion, firmarEstado, leerEstado, canjearCodigo, cifrar, descifrar,
  revocar, olvidarToken, tokenDeAcceso, idDeCarpeta,
} from "../lib/google.js";
import { MIME_CARPETA, tipoDeArchivo } from "../../src/lib/drive.js";

const CAMPOS_ARCHIVO = "id,name,mimeType,size,modifiedTime,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(durationMillis)";
const MAX_SUBIDA = 100 * 1024 * 1024; // lo que un Worker acepta de cuerpo
const MAX_A_PUBLICACION = 20 * 1024 * 1024;
const MAX_VIDEO_PUBLICACION = 300 * 1024 * 1024;
const PROFUNDIDAD_MAX = 12;
const CARPETA_MIGRACION = "Banco de la app";
const POR_TANDA_MIGRACION = 4;

/** «image/svg+xml» es una imagen que ejecuta código: fuera. */
const SE_VE_EN_LINEA = (mime = "") => (mime.startsWith("image/") && !mime.includes("svg")) || mime.startsWith("video/");

const escaparQ = (t) => String(t).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** La cadena de carpetas desde la raíz del cliente hasta `id`, con nombres. */
async function migas(env, acceso, raiz, id) {
  const salida = [];
  let actual = id;
  for (let i = 0; i < PROFUNDIDAD_MAX; i++) {
    const f = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(actual)}`, { query: { fields: "id,name,parents" } });
    salida.unshift({ id: f.id, nombre: f.name });
    if (actual === raiz || !f.parents?.length) break;
    actual = f.parents[0];
  }
  return salida;
}

const aArchivo = (f) => ({
  id: f.id,
  nombre: f.name,
  mime: f.mimeType,
  tipo: tipoDeArchivo(f.mimeType),
  tamano: Number(f.size ?? 0),
  modificado: f.modifiedTime ?? null,
  miniatura: Boolean(f.thumbnailLink),
  ancho: f.imageMediaMetadata?.width ?? null,
  alto: f.imageMediaMetadata?.height ?? null,
  duracion: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) : null,
});

// ------------------------------------------------------------
// Conectar y desconectar
// ------------------------------------------------------------

/** GET /api/drive/callback — sin sesión: la identidad viaja en el `state` firmado. */
export async function rutaDriveCallback(req, env) {
  const url = new URL(req.url);
  const volver = (resultado, motivo = "") => {
    const destino = new URL("/ajustes", url.origin);
    destino.searchParams.set("drive", resultado);
    if (motivo) destino.searchParams.set("motivo", motivo.slice(0, 200));
    destino.hash = "integraciones";
    return new Response(null, {
      status: 302,
      headers: {
        Location: destino.toString(),
        "Set-Cookie": `${COOKIE_OAUTH}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    });
  };

  if (!driveConfigurado(env)) return volver("error", "Falta configurar Google en el servidor.");
  if (url.searchParams.get("error")) return volver("error", url.searchParams.get("error") === "access_denied" ? "Cancelaste el permiso en Google." : url.searchParams.get("error"));

  const estado = await leerEstado(env, url.searchParams.get("state"));
  const cookie = /(?:^|;\s*)__Host-drive-oauth=([^;]+)/.exec(req.headers.get("Cookie") ?? "")?.[1];
  if (!estado || !cookie || cookie !== estado.nonce) {
    return volver("error", "El enlace de conexión caducó o no salió de esta pestaña. Vuelve a pulsar «Conectar».");
  }

  let tokens;
  try {
    tokens = await canjearCodigo(env, req, url.searchParams.get("code") ?? "");
  } catch (e) {
    return volver("error", `Google no aceptó la conexión: ${e.message}`);
  }
  if (!tokens.refresh_token) {
    return volver("error", "Google no dio un permiso duradero. Quita la app en myaccount.google.com → Seguridad y vuelve a conectar.");
  }

  const acceso = crearAcceso(env.DB, estado.ownerId);
  let email = "";
  try {
    const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    email = (await r.json())?.user?.emailAddress ?? "";
  } catch { /* el correo es sólo para enseñarlo */ }

  const previa = await acceso.leerUno("integracion_drive", { id: estado.ownerId });
  await acceso.guardar("integracion_drive", {
    id: estado.ownerId,
    email,
    refresh_cifrado: await cifrar(env, tokens.refresh_token),
    conectado_por: estado.userId ?? null,
    created_at: previa?.created_at ?? ahora(),
    updated_at: ahora(),
  });
  olvidarToken(estado.ownerId);
  difundir(env, estado.ownerId, { tipo: "ajustes", por: { userId: estado.userId, nombre: "Google Drive", color: "#1E90FF" } });
  return volver("ok");
}

// ------------------------------------------------------------
// Las rutas con sesión
// ------------------------------------------------------------

export async function rutasDrive(req, env, { acceso, usuario, partes, metodo }) {
  try {
    return await rutasConSesion(req, env, { acceso, usuario, partes, metodo });
  } catch (e) {
    return respuestaDeFallo(e);
  }
}

async function rutasConSesion(req, env, { acceso, usuario, partes, metodo }) {
  const [, accion, clienteId, sub, archivoId] = partes;
  const esAdmin = usuario?.rol === "admin";

  // ---- estado ----
  if (accion === "estado" && metodo === "GET") {
    const fila = driveConfigurado(env) ? await acceso.leerUno("integracion_drive", { id: acceso.ownerId }) : null;
    return json({
      configurado: driveConfigurado(env),
      conectado: Boolean(fila),
      email: fila?.email ?? "",
      desde: fila?.updated_at ?? null,
      redireccion: urlRedireccion(req),
    });
  }

  // ---- conectar: el navegador NAVEGA aquí, no hace fetch ----
  if (accion === "conectar" && metodo === "GET") {
    if (!esAdmin) return error("Sólo el administrador conecta Google Drive", 403);
    if (!driveConfigurado(env)) return error("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el Worker", 503);
    const nonce = testigo(16);
    const state = await firmarEstado(env, { ownerId: acceso.ownerId, userId: usuario.id, nonce });
    return new Response(null, {
      status: 302,
      headers: {
        Location: urlConsentimiento(env, req, state),
        "Set-Cookie": `${COOKIE_OAUTH}=${nonce}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (accion === "desconectar" && metodo === "POST") {
    if (!esAdmin) return error("Sólo el administrador desconecta Google Drive", 403);
    const fila = await acceso.leerUno("integracion_drive", { id: acceso.ownerId });
    if (fila) {
      try { await revocar(await descifrar(env, fila.refresh_cifrado)); } catch { /* se borra igual */ }
      await acceso.borrar("integracion_drive", { id: acceso.ownerId });
    }
    olvidarToken(acceso.ownerId);
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json({ ok: true });
  }

  // ---- todo lo demás es de un cliente ----
  if (accion !== "clientes" || !clienteId) return noEncontrado("Ruta");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");
  const raiz = idDeCarpeta(cliente.drive_folder);
  if (!raiz) return error("Este cliente no tiene carpeta de Drive. Pégala en su ficha.", 409);
  const url = new URL(req.url);

  // Listar una carpeta.
  if (sub === "archivos" && metodo === "GET") {
    const carpeta = url.searchParams.get("carpeta") || raiz;
    if (!(await dentroDelCliente(env, acceso, raiz, carpeta))) return noEncontrado("Carpeta");
    const condiciones = [`'${escaparQ(carpeta)}' in parents`, "trashed = false"];
    const tipo = url.searchParams.get("tipo");
    if (tipo === "imagen") condiciones.push(`(mimeType contains 'image/' or mimeType = '${MIME_CARPETA}')`);
    if (tipo === "video") condiciones.push(`(mimeType contains 'video/' or mimeType = '${MIME_CARPETA}')`);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q) condiciones.push(`name contains '${escaparQ(q.slice(0, 80))}'`);

    const [lista, ruta] = await Promise.all([
      drive(env, acceso, "/drive/v3/files", {
        query: {
          q: condiciones.join(" and "),
          fields: `nextPageToken,files(${CAMPOS_ARCHIVO})`,
          orderBy: "folder,modifiedTime desc",
          pageSize: 60,
          pageToken: url.searchParams.get("pagina") || undefined,
          includeItemsFromAllDrives: "true",
        },
      }),
      migas(env, acceso, raiz, carpeta),
    ]);
    // Lo listado ya está dentro: se apunta para no volver a subir por sus padres.
    for (const f of lista.files ?? []) marcarVerificado(acceso.ownerId, raiz, f.id);
    return json({
      carpeta: ruta[ruta.length - 1] ?? { id: carpeta, nombre: "" },
      ruta,
      archivos: (lista.files ?? []).map(aArchivo),
      siguiente: lista.nextPageToken ?? null,
    });
  }

  // Crear una carpeta.
  if (sub === "carpeta" && metodo === "POST") {
    const { nombre, dentro } = (await cuerpo(req)) ?? {};
    const padre = dentro || raiz;
    if (!String(nombre ?? "").trim()) return error("Falta el nombre");
    if (!(await dentroDelCliente(env, acceso, raiz, padre))) return noEncontrado("Carpeta");
    const f = await drive(env, acceso, "/drive/v3/files", {
      metodo: "POST",
      query: { fields: CAMPOS_ARCHIVO },
      cuerpo: { name: String(nombre).trim().slice(0, 120), mimeType: MIME_CARPETA, parents: [padre] },
    });
    difundir(env, acceso.ownerId, { tipo: "banco", clientId: clienteId, por: firma(usuario, req) });
    return json(aArchivo(f), 201);
  }

  // Subir: el cuerpo es el archivo tal cual, con su Content-Type.
  if (sub === "subir" && metodo === "POST") {
    const carpeta = url.searchParams.get("carpeta") || raiz;
    const nombre = (url.searchParams.get("nombre") || "archivo").slice(0, 200);
    const mime = req.headers.get("Content-Type") || "application/octet-stream";
    const largo = Number(req.headers.get("Content-Length") ?? 0);
    if (!largo) return error("Falta el tamaño del archivo", 411);
    if (largo > MAX_SUBIDA) return error(`El archivo pesa ${Math.round(largo / 1048576)} MB; el máximo es ${MAX_SUBIDA / 1048576} MB. Súbelo directo a Drive.`, 413);
    if (!(await dentroDelCliente(env, acceso, raiz, carpeta))) return noEncontrado("Carpeta");
    const f = await subirADrive(env, acceso, { carpeta, nombre, mime, largo, cuerpo: req.body });
    difundir(env, acceso.ownerId, { tipo: "banco", clientId: clienteId, por: firma(usuario, req) });
    return json(aArchivo(f), 201);
  }

  // A la papelera de Drive (se puede recuperar desde Drive 30 días).
  if (sub === "papelera" && archivoId && metodo === "POST") {
    if (archivoId === raiz) return error("La carpeta del cliente no se puede mandar a la papelera desde aquí");
    if (!(await dentroDelCliente(env, acceso, raiz, archivoId))) return noEncontrado("Archivo");
    await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(archivoId)}`, {
      metodo: "PATCH", query: { fields: "id" }, cuerpo: { trashed: true },
    });
    olvidarVerificado(acceso.ownerId, raiz, archivoId);
    difundir(env, acceso.ownerId, { tipo: "banco:fuera", id: archivoId, clientId: clienteId, por: firma(usuario, req) });
    return json({ ok: true });
  }

  // Miniatura: la de Drive, pedida con el token y servida desde aquí.
  if (sub === "miniatura" && archivoId && metodo === "GET") {
    if (!(await dentroDelCliente(env, acceso, raiz, archivoId))) return noEncontrado("Archivo");
    const f = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(archivoId)}`, { query: { fields: "thumbnailLink,mimeType,size" } });
    if (f.thumbnailLink) {
      const tam = Math.min(Math.max(Number(url.searchParams.get("t")) || 400, 100), 1600);
      const res = await fetch(f.thumbnailLink.replace(/=s\d+$/, `=s${tam}`), {
        headers: { Authorization: `Bearer ${await tokenDeAcceso(env, acceso)}` },
      });
      const tipoRes = res.headers.get("Content-Type") ?? "";
      if (res.ok && tipoRes.startsWith("image/") && !tipoRes.includes("svg")) return servir(res.body, tipoRes, { cache: 3600 });
    }
    // Sin miniatura (recién subida, o formato raro): la imagen entera si es pequeña.
    if (SE_VE_EN_LINEA(f.mimeType) && f.mimeType.startsWith("image/") && Number(f.size ?? 0) <= 8 * 1048576) {
      const res = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(archivoId)}`, { query: { alt: "media" }, crudo: true });
      if (res.ok) return servir(res.body, f.mimeType, { cache: 3600 });
    }
    return noEncontrado("Miniatura");
  }

  // El archivo: para verlo, reproducirlo o descargarlo. Admite Range,
  // que es lo que usa el <video> para avanzar sin bajarse todo.
  if (sub === "archivo" && archivoId && metodo === "GET") {
    if (!(await dentroDelCliente(env, acceso, raiz, archivoId))) return noEncontrado("Archivo");
    const meta = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(archivoId)}`, { query: { fields: "name,mimeType,size" } });
    if (meta.mimeType === MIME_CARPETA || meta.mimeType?.startsWith("application/vnd.google-apps")) {
      return error("Los documentos de Google no se descargan desde aquí: ábrelos en Drive.", 415);
    }
    const rango = req.headers.get("Range");
    const res = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(archivoId)}`, {
      query: { alt: "media" }, crudo: true, cabeceras: rango ? { Range: rango } : {},
    });
    if (!res.ok && res.status !== 206) throw await errorDe(res);
    const descargar = url.searchParams.get("descargar") === "1" || !SE_VE_EN_LINEA(meta.mimeType);
    return servir(res.body, SE_VE_EN_LINEA(meta.mimeType) ? meta.mimeType : "application/octet-stream", {
      cache: 600,
      estado: res.status,
      nombre: meta.name,
      descargar,
      extra: {
        "Accept-Ranges": "bytes",
        ...(res.headers.get("Content-Range") ? { "Content-Range": res.headers.get("Content-Range") } : {}),
        ...(res.headers.get("Content-Length") ? { "Content-Length": res.headers.get("Content-Length") } : {}),
      },
    });
  }

  // Poner una imagen o un video de Drive en una publicación: se copia a
  // R2. La página del cliente y Meta —que descarga el medio por URL al
  // publicar— no pueden leer el Drive de la agencia.
  if (sub === "a-publicacion" && metodo === "POST") {
    const { fileId } = (await cuerpo(req)) ?? {};
    if (!fileId || !(await dentroDelCliente(env, acceso, raiz, String(fileId)))) return noEncontrado("Archivo");
    const meta = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(fileId)}`, { query: { fields: "name,mimeType,size" } });
    const esVideo = meta.mimeType?.startsWith("video/");
    if ((!meta.mimeType?.startsWith("image/") && !esVideo) || meta.mimeType.includes("svg")) {
      return error("En una publicación sólo van imágenes (JPG, PNG, WebP) o videos.");
    }
    const tope = esVideo ? MAX_VIDEO_PUBLICACION : MAX_A_PUBLICACION;
    if (Number(meta.size ?? 0) > tope) {
      return error(`El archivo pesa más de ${Math.round(tope / 1048576)} MB. Redúcelo antes de usarlo.`, 413);
    }
    const res = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(fileId)}`, { query: { alt: "media" }, crudo: true });
    if (!res.ok) throw await errorDe(res);
    const EXT = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
    const ext = EXT[meta.mimeType] ?? (esVideo ? "mp4" : "jpg");
    const clave = `clientes/${clienteId}/drive/${uuid()}.${ext}`;
    // Los videos van en flujo: cargarlos enteros en memoria no cabe en un Worker.
    await env.MEDIA.put(clave, esVideo ? res.body : await res.arrayBuffer(), { httpMetadata: { contentType: meta.mimeType } });
    return json({ clave, nombre: meta.name, tipo: esVideo ? "video" : "imagen" }, 201);
  }

  // Pasar el banco de antes (R2) a Drive, por tandas: el navegador repite
  // hasta que `quedan` sea 0. Por tandas porque cada archivo son varias
  // llamadas a Google y un Worker tiene un tope de subpeticiones.
  if (sub === "migrar-banco" && metodo === "POST") {
    const pendientes = await acceso.leer("content_bank", { client_id: clienteId }, "created_at asc");
    if (!pendientes.length) return json({ migrados: 0, quedan: 0 });
    const destino = await carpetaDeMigracion(env, acceso, raiz);
    let migrados = 0;
    const fallos = [];
    for (const item of pendientes.slice(0, POR_TANDA_MIGRACION)) {
      const objeto = await env.MEDIA.get(item.file_path);
      if (!objeto) {
        // El objeto ya no está: la fila no apunta a nada que migrar.
        await acceso.borrar("content_bank", { id: item.id });
        continue;
      }
      try {
        await subirADrive(env, acceso, {
          carpeta: destino,
          nombre: item.file_name || item.file_path.split("/").pop(),
          mime: objeto.httpMetadata?.contentType || (item.file_type === "video" ? "video/mp4" : "image/jpeg"),
          largo: objeto.size,
          cuerpo: await objeto.arrayBuffer(),
          descripcion: item.description || "",
        });
        // El objeto de R2 SE QUEDA: alguna publicación puede estar usándolo.
        await acceso.borrar("content_bank", { id: item.id });
        migrados += 1;
      } catch (e) {
        if (e instanceof DriveDesconectado) throw e;
        fallos.push(item.file_name || item.id);
        console.error("migrar-banco:", e);
      }
    }
    if (fallos.length && !migrados) return error(`No se pudo pasar a Drive: ${fallos.join(", ")}`, 502);
    difundir(env, acceso.ownerId, { tipo: "banco", clientId: clienteId, por: firma(usuario, req) });
    return json({ migrados, quedan: Math.max(pendientes.length - migrados - fallos.length, 0), fallos, carpeta: destino });
  }

  return noEncontrado("Ruta");
}

/** La subcarpeta «Banco de la app» dentro de la del cliente; se crea si falta. */
async function carpetaDeMigracion(env, acceso, raiz) {
  const r = await drive(env, acceso, "/drive/v3/files", {
    query: {
      q: `'${escaparQ(raiz)}' in parents and name = '${CARPETA_MIGRACION}' and mimeType = '${MIME_CARPETA}' and trashed = false`,
      fields: "files(id)",
      includeItemsFromAllDrives: "true",
    },
  });
  if (r.files?.[0]?.id) return r.files[0].id;
  const f = await drive(env, acceso, "/drive/v3/files", {
    metodo: "POST", query: { fields: "id" },
    cuerpo: { name: CARPETA_MIGRACION, mimeType: MIME_CARPETA, parents: [raiz] },
  });
  return f.id;
}

/**
 * Subida reanudable: se abre una sesión con los metadatos y se manda el
 * cuerpo de una vez. El cuerpo puede ser un stream (lo que llega del
 * navegador, sin copiarlo en memoria) o bytes.
 */
async function subirADrive(env, acceso, { carpeta, nombre, mime, largo, cuerpo: datos, descripcion = "" }) {
  const inicio = await drive(env, acceso, "/upload/drive/v3/files", {
    metodo: "POST",
    query: { uploadType: "resumable", fields: CAMPOS_ARCHIVO },
    cuerpo: { name: nombre, parents: [carpeta], ...(descripcion ? { description: descripcion.slice(0, 1000) } : {}) },
    cabeceras: { "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(largo) },
    crudo: true,
  });
  const sesion = inicio.headers.get("Location");
  if (!inicio.ok || !sesion) throw await errorDe(inicio);

  // Un stream con largo conocido: FixedLengthStream en Workers. Sin él
  // (pruebas en Node), se lee entero.
  let cuerpoFinal = datos;
  if (datos instanceof ReadableStream) {
    const Fijo = globalThis.FixedLengthStream;
    if (typeof Fijo === "function") {
      const { readable, writable } = new Fijo(largo);
      datos.pipeTo(writable).catch(() => {});
      cuerpoFinal = readable;
    } else {
      cuerpoFinal = await new Response(datos).arrayBuffer();
    }
  }
  const res = await fetch(sesion, {
    method: "PUT",
    headers: { "Content-Type": mime, "Content-Length": String(largo) },
    body: cuerpoFinal,
  });
  if (!res.ok) throw await errorDe(res);
  return res.json();
}



function servir(cuerpoRes, tipo, { cache = 0, estado = 200, nombre = "", descargar = false, extra = {} } = {}) {
  const cabeceras = new Headers({
    ...CABECERAS_API,
    "Content-Type": tipo,
    "Cache-Control": cache ? `private, max-age=${cache}` : "no-store",
    "X-Content-Type-Options": "nosniff",
    // Aunque algo se colara con un tipo que el navegador ejecute, sin
    // scripts ni origen: no corre nada con la sesión de la agencia.
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    ...extra,
  });
  if (nombre) {
    const limpio = nombre.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    cabeceras.set("Content-Disposition", `${descargar ? "attachment" : "inline"}; filename="${limpio}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  }
  return new Response(cuerpoRes, { status: estado, headers: cabeceras });
}
