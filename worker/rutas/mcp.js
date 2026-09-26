// ============================================================
// Conectar Claude: el servidor MCP y su OAuth
//
// Se añade UNA vez en claude.ai → Ajustes → Conectores → «Añadir conector
// personalizado» con la dirección `https://<la app>/mcp`, y funciona en
// Claude web, escritorio, móvil y Claude Code.
//
// FUERA DE /api (el Worker los atiende antes que los estáticos, ver
// `run_worker_first` en wrangler.jsonc):
//   GET  /.well-known/oauth-protected-resource   Quién autoriza este recurso
//   GET  /.well-known/oauth-authorization-server Dónde se registra, autoriza y canjea
//   POST /oauth/register                         Registro dinámico (RFC 7591)
//   POST /oauth/token                            Código → tokens; renovar
//   POST /mcp                                    JSON-RPC de MCP (Bearer)
//
// CON SESIÓN, en /api/mcp (la pantalla de permiso es la de la app):
//   GET    /api/mcp/cliente?client_id=…&redirect_uri=…  Qué pide permiso
//   POST   /api/mcp/autorizar                           Dar permiso → a dónde volver
//   GET    /api/mcp/conexiones                          Quién está conectado
//   DELETE /api/mcp/conexiones/:id                      Desconectar
//
// La pantalla de permiso es `/conectar-claude` (la SPA): así se entra con
// la sesión de siempre, y si no la hay, la propia pantalla de acceso.
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido, CABECERAS_API } from "../lib/respuesta.js";
import { crearAcceso } from "../lib/acceso.js";
import {
  registrarClienteMCP, clienteMCP, crearCodigoMCP, canjearCodigoMCP, renovarTokenMCP, usuarioDeTokenMCP,
} from "../lib/sesion.js";
import { HERRAMIENTAS_MCP, crearHerramientasMCP } from "../lib/mcp.js";

const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCCIONES = "Herramientas de la agencia Juancito Ads: sus clientes, sus calendarios de contenido, la cola de publicación en Instagram, Facebook y TikTok, las tareas, el banco de ideas y los resultados. Consulta antes de escribir (listar_clientes, ver_calendario) y confirma con la persona antes de borrar o cancelar. Las horas son de Panamá.";

// Claude (y cualquier cliente MCP) llama desde otro origen, con Bearer:
// sin cookies, así que abrir CORS no expone ninguna sesión.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};
const conCors = (datos, estado = 200, extra = {}) => json(datos, estado, { ...CORS, ...extra });
const errorOAuth = (codigo, descripcion, estado = 400) => conCors({ error: codigo, error_description: descripcion }, estado);

const origenDe = (req) => new URL(req.url).origin;

/** Los metadatos que Claude lee para saber cómo conectarse. */
function metadatos(req) {
  const o = origenDe(req);
  return {
    recurso: { resource: `${o}/mcp`, authorization_servers: [o], bearer_methods_supported: ["header"], resource_name: "Juancito Ads" },
    servidor: {
      issuer: o,
      authorization_endpoint: `${o}/conectar-claude`,
      token_endpoint: `${o}/oauth/token`,
      registration_endpoint: `${o}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["calendario"],
    },
  };
}

async function leerFormulario(req) {
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) return (await cuerpo(req)) ?? {};
  try { return Object.fromEntries(new URLSearchParams(await req.text())); } catch { return {}; }
}

// ------------------------------------------------------------
// Lo que va sin sesión (fuera de /api)
// ------------------------------------------------------------

/** Devuelve la respuesta si la ruta es suya, o null para que siga el resto del Worker. */
export async function rutasMCPPublicas(req, env) {
  const { pathname: ruta } = new URL(req.url);
  const metodo = req.method;
  const esSuya = ruta === "/mcp" || ruta.startsWith("/.well-known/oauth-") || ruta.startsWith("/oauth/");
  if (!esSuya) return null;
  if (metodo === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });

  if (ruta.startsWith("/.well-known/oauth-protected-resource") && metodo === "GET") return conCors(metadatos(req).recurso);
  if (ruta.startsWith("/.well-known/oauth-authorization-server") && metodo === "GET") return conCors(metadatos(req).servidor);

  if (ruta === "/oauth/register" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const c = await registrarClienteMCP(env.DB, { nombre: b.client_name ?? "", redirectUris: b.redirect_uris });
    if (!c) return errorOAuth("invalid_redirect_uri", "Las direcciones de vuelta tienen que ser https (o http en la propia máquina).");
    return conCors({
      client_id: c.id, client_name: c.nombre, redirect_uris: c.redirectUris,
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    }, 201);
  }

  if (ruta === "/oauth/token" && metodo === "POST") {
    const b = await leerFormulario(req);
    if (b.grant_type === "authorization_code") {
      const t = await canjearCodigoMCP(env.DB, { codigo: b.code, clienteId: b.client_id, redirectUri: b.redirect_uri, verificador: b.code_verifier });
      return t ? conCors({ ...t, scope: "calendario" }, 200, { "Cache-Control": "no-store" }) : errorOAuth("invalid_grant", "El código no vale, caducó o ya se usó.");
    }
    if (b.grant_type === "refresh_token") {
      const t = await renovarTokenMCP(env.DB, { renovacion: b.refresh_token, clienteId: b.client_id });
      return t ? conCors({ ...t, scope: "calendario" }, 200, { "Cache-Control": "no-store" }) : errorOAuth("invalid_grant", "La conexión caducó o se desconectó: vuelve a conectar.");
    }
    return errorOAuth("unsupported_grant_type", "Sólo authorization_code y refresh_token.");
  }

  if (ruta === "/mcp") return servidorMCP(req, env);
  return conCors({ error: "Ruta no encontrada" }, 404);
}

/** Sin token (o caducado): 401 con dónde está la información para conectarse. */
function sinAutorizar(req) {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: "Conecta Claude con tu cuenta de Juancito Ads." }), {
    status: 401,
    headers: {
      ...CABECERAS_API, ...CORS,
      "WWW-Authenticate": `Bearer resource_metadata="${origenDe(req)}/.well-known/oauth-protected-resource"`,
    },
  });
}

const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function servidorMCP(req, env) {
  // Sin flujo SSE del servidor: cada petición tiene su respuesta JSON.
  if (req.method === "GET") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });

  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1]?.trim();
  const usuario = await usuarioDeTokenMCP(env.DB, bearer);
  if (!usuario) return sinAutorizar(req);

  const mensaje = await cuerpo(req);
  if (!mensaje || typeof mensaje !== "object") return conCors(rpcError(null, -32700, "JSON no válido"), 400);
  const lote = Array.isArray(mensaje) ? mensaje : [mensaje];
  const herramientas = crearHerramientasMCP({ env, acceso: crearAcceso(env.DB, usuario.ownerId, { clientes: usuario.clientes }), usuario });

  const respuestas = [];
  for (const m of lote) {
    // Una notificación (sin id) no lleva respuesta.
    if (m?.id === undefined || m?.id === null) continue;
    switch (m.method) {
      case "initialize": {
        const pedida = m.params?.protocolVersion;
        respuestas.push(rpc(m.id, {
          protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "juancito-ads", title: "Juancito Ads", version: "1.0.0" },
          instructions: INSTRUCCIONES,
        }));
        break;
      }
      case "ping":
        respuestas.push(rpc(m.id, {}));
        break;
      case "tools/list":
        respuestas.push(rpc(m.id, { tools: HERRAMIENTAS_MCP }));
        break;
      case "tools/call": {
        const nombre = m.params?.name;
        if (!HERRAMIENTAS_MCP.some((h) => h.name === nombre)) {
          respuestas.push(rpcError(m.id, -32602, `Herramienta desconocida: ${nombre}`));
          break;
        }
        // Sólo lectura: Claude puede consultar por esa persona, no escribir.
        const herramienta = HERRAMIENTAS_MCP.find((h) => h.name === nombre);
        if (usuario.soloLectura && !herramienta.annotations?.readOnlyHint) {
          respuestas.push(rpc(m.id, { content: [{ type: "text", text: "Tu papel es de sólo lectura: puedo consultar, pero no cambiar nada." }], isError: true }));
          break;
        }
        respuestas.push(rpc(m.id, await herramientas.llamar(nombre, m.params?.arguments ?? {})));
        break;
      }
      default:
        respuestas.push(rpcError(m.id, -32601, `Método no disponible: ${m.method}`));
    }
  }
  if (!respuestas.length) return new Response(null, { status: 202, headers: CORS });
  return conCors(Array.isArray(mensaje) ? respuestas : respuestas[0]);
}

// ------------------------------------------------------------
// Con sesión: la pantalla de permiso y las conexiones
// ------------------------------------------------------------

export async function rutasMCP(req, env, { acceso, usuario, partes, metodo }) {
  const [, seccion, id] = partes;
  const url = new URL(req.url);

  if (seccion === "cliente" && metodo === "GET") {
    const c = await clienteMCP(env.DB, url.searchParams.get("client_id"));
    if (!c) return noEncontrado("Aplicación");
    const vuelta = url.searchParams.get("redirect_uri") ?? "";
    if (!c.redirectUris.includes(vuelta)) return error("La dirección de vuelta no es la que registró esta aplicación.", 400);
    return json({ nombre: c.nombre || "Claude", vuelta: new URL(vuelta).host, espacio: usuario.nombre });
  }

  if (seccion === "autorizar" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const c = await clienteMCP(env.DB, b.clientId);
    if (!c) return noEncontrado("Aplicación");
    if (!c.redirectUris.includes(b.redirectUri)) return error("La dirección de vuelta no es la que registró esta aplicación.", 400);
    if (b.metodo !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(String(b.reto ?? ""))) return error("Falta el reto PKCE (S256).", 400);
    const destino = new URL(b.redirectUri);
    if (b.permitir === false) {
      destino.searchParams.set("error", "access_denied");
    } else {
      destino.searchParams.set("code", await crearCodigoMCP(env.DB, { clienteId: c.id, usuario, redirectUri: b.redirectUri, reto: b.reto }));
    }
    if (b.state) destino.searchParams.set("state", String(b.state));
    return json({ redirect: destino.toString() });
  }

  if (seccion === "conexiones" && !id && metodo === "GET") {
    const tokens = await acceso.leer("mcp_tokens", {}, "created_at desc");
    const salida = [];
    for (const t of tokens) {
      const c = await clienteMCP(env.DB, t.cliente_id);
      salida.push({ id: t.id, nombre: c?.nombre || "Claude", persona: t.user_id === usuario.id ? "tú" : "otra persona del equipo", desde: t.created_at, usado: t.usado_at });
    }
    return json(salida);
  }

  if (seccion === "conexiones" && id && metodo === "DELETE") {
    const n = await acceso.borrar("mcp_tokens", { id });
    return n ? sinContenido() : noEncontrado("Conexión");
  }

  return noEncontrado("Ruta");
}
