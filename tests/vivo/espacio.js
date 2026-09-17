// ============================================================
// Un espacio de verdad, con dos personas dentro
//
// POR QUÉ ESTO EXISTE
//
// `tests/despliegue/tiempo-real.test.js` comprueba que cada evento que
// emite el servidor tiene su `case` en `App.jsx`, que toda escritura
// lleva su `difundir()` pegado y que el Durable Object usa
// `acceptWebSocket`. Todo eso lo hace LEYENDO los ficheros: prueba que
// el tiempo real está ESCRITO.
//
// Que esté escrito y que llegue no son lo mismo. Entre una cosa y la
// otra están el binding `HUB` —sin él `difundir()` hace `return` y no
// se entera nadie—, la ruta `/api/live`, la cookie que el socket lleva
// o no lleva, y que las dos personas caigan en el MISMO Durable
// Object. Ninguna de esas cinco cosas se ve leyendo un fichero, y las
// cinco fallan calladas: la escritura entra en D1, la respuesta es 200,
// y la otra persona sigue viendo lo de antes hasta que recargue.
//
// Así que esto levanta workerd de verdad, con su D1 y su Durable
// Object, mete a dos personas en un espacio y mira si el cambio de una
// aparece en el socket de la otra.
//
// NO NECESITA LLAVES. `wrangler dev` corre en local: ni toca la cuenta
// de Cloudflare ni necesita nada configurado. Por eso esto sí puede
// correr en CI y en cualquier clon, y por eso entra en `verificar`.
// ============================================================

import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { hashearContrasena } from "../../worker/lib/sesion.js";

const ejecutar = promisify(execFile);
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** La contraseña de las dos cuentas de prueba. Larga porque el alta lo exige. */
const CLAVE = "contrasena-de-prueba-larga";

/**
 * Ids FIJOS, y las filas se borran antes de sembrarlas.
 *
 * Con un uuid nuevo en cada pasada, el `insert` del usuario choca por
 * correo, la fila vieja se queda con su id antiguo, y la pertenencia
 * apunta a alguien que no existe: «FOREIGN KEY constraint failed», que
 * no dice ni qué clave ni por qué. Es la misma piedra con la que tropezó
 * la importación desde Supabase.
 */
export const ANA = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  email: "ana@prueba.local",
  nombre: "Ana",
  pestana: "pestana-de-ana",
};
export const BRUNO = {
  id: "bbbbbbbb-0000-4000-8000-000000000002",
  email: "bruno@prueba.local",
  nombre: "Bruno",
  pestana: "pestana-de-bruno",
};

/** Un puerto libre de verdad: dos ejecuciones a la vez no pueden chocar. */
function puertoLibre() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Levanta el Worker en local y deja el espacio listo.
 *
 * `--persist-to` apunta a un directorio temporal y NUNCA a `.wrangler/`:
 * ése es el estado del `wrangler dev` de quien esté trabajando, y
 * además no se versiona a propósito.
 */
export async function levantarEspacio() {
  const puerto = await puertoLibre();
  const estado = await mkdtemp(join(tmpdir(), "calendarios-vivo-"));
  const base = `http://127.0.0.1:${puerto}`;

  const d1 = (comando) =>
    ejecutar("npx", [
      "wrangler", "d1", "execute", "calendarios-db", "--local",
      "--persist-to", estado, "--command", comando,
    ], { cwd: RAIZ });

  // Las migraciones ANTES de arrancar: el servidor se encuentra el
  // esquema puesto y no hay que reiniciarlo a media prueba.
  await ejecutar("npx", [
    "wrangler", "d1", "migrations", "apply", "calendarios-db",
    "--local", "--persist-to", estado,
  ], { cwd: RAIZ });

  // Ana funda el espacio; Bruno entra en el suyo como editor. El espacio
  // es el id de quien lo funda, así que `owner_id` es el de Ana en las dos.
  await d1(`delete from users where email in ('${ANA.email}','${BRUNO.email}');`);
  for (const p of [ANA, BRUNO]) {
    const { salt, password_hash } = await hashearContrasena(CLAVE);
    await d1(
      `insert into users (id, email, password_hash, salt, created_at)
       values ('${p.id}', '${p.email}', '${password_hash}', '${salt}', '${new Date().toISOString()}');`,
    );
  }
  await d1(
    `insert or replace into memberships (user_id, owner_id, rol, nombre, color) values
       ('${ANA.id}',   '${ANA.id}', 'admin',  '${ANA.nombre}',   '#1E90FF'),
       ('${BRUNO.id}', '${ANA.id}', 'editor', '${BRUNO.nombre}', '#EC4899');`,
  );

  // `detached` hace del hijo el LÍDER DE SU GRUPO, y eso es lo que
  // permite matarlo entero después. Sin esto, `npx` deja detrás al
  // `node` que lanza —y ése es el que tiene el puerto y workerd—: cada
  // pasada de `verificar` abandonaba un Worker vivo, y en CI eso son
  // procesos colgados que nadie ve hasta que el runner se queda sin
  // nada. El síntoma no se parece a la causa: los tests pasan.
  const proceso = spawn("npx", [
    "wrangler", "dev", "--port", String(puerto),
    "--persist-to", estado, "--log-level", "warn",
  ], { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"], detached: true });

  let salida = "";
  proceso.stdout.on("data", (d) => { salida += d; });
  proceso.stderr.on("data", (d) => { salida += d; });

  // Se espera a que conteste, no un tiempo fijo: en CI arranca más lento.
  let vivo = false;
  for (let i = 0; i < 120 && !vivo; i++) {
    try {
      const r = await fetch(`${base}/api/yo`);
      vivo = r.status === 401; // sin sesión: exactamente lo que debe decir
    } catch {
      await esperar(500);
    }
  }
  /** Se mata el GRUPO (-pid), no el proceso: ver el comentario del spawn. */
  const matarGrupo = (senal) => {
    try { process.kill(-proceso.pid, senal); } catch { /* ya no está */ }
  };

  if (!vivo) {
    matarGrupo("SIGKILL");
    await rm(estado, { recursive: true, force: true });
    throw new Error(`El Worker no arrancó en local.\n${salida.slice(-2000)}`);
  }

  const sesiones = new Map();

  /** Entra y se queda con la cookie de sesión. */
  async function entrar(persona) {
    const r = await fetch(`${base}/api/acceso`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: persona.email, password: CLAVE }),
    });
    if (!r.ok) throw new Error(`No pudo entrar ${persona.email}: ${r.status} ${await r.text()}`);
    const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error(`Entró ${persona.email} pero no vino ninguna cookie.`);
    const { usuario } = await r.json();
    sesiones.set(persona.id, cookie);
    return usuario;
  }

  /** Una llamada a la API como esa persona, con su pestaña declarada. */
  const api = (persona, ruta, opciones = {}) =>
    fetch(`${base}${ruta}`, {
      ...opciones,
      headers: {
        "content-type": "application/json",
        Cookie: sesiones.get(persona.id),
        "X-Pestana": persona.pestana,
        ...(opciones.headers ?? {}),
      },
    });

  const sockets = [];

  /**
   * Abre el socket de esa persona y va apuntando lo que le llega.
   *
   * `recibidos` es el buzón; `esperarEvento` espera a que aparezca uno
   * de un tipo, en vez de dormir una cantidad fija y cruzar los dedos.
   */
  async function conectar(persona) {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}/api/live`, {
      headers: { Cookie: sesiones.get(persona.id) },
    });
    const recibidos = [];
    ws.on("message", (d) => {
      try { recibidos.push(JSON.parse(d.toString())); } catch { /* el latido no es JSON */ }
    });
    await new Promise((res, rej) => {
      ws.once("open", res);
      ws.once("error", rej);
    });
    sockets.push(ws);

    return {
      quien: persona,
      recibidos,
      de: (tipo) => recibidos.filter((e) => e.tipo === tipo),
      async esperarEvento(tipo, limite = 8000) {
        const hasta = Date.now() + limite;
        while (Date.now() < hasta) {
          const e = recibidos.find((x) => x.tipo === tipo);
          if (e) return e;
          await esperar(50);
        }
        const vistos = recibidos.map((e) => e.tipo).join(", ") || "ninguno";
        throw new Error(`«${tipo}» no llegó a ${persona.nombre} en ${limite} ms. Llegaron: ${vistos}.`);
      },
    };
  }

  async function cerrar() {
    for (const ws of sockets) { try { ws.close(); } catch { /* ya estaba */ } }
    matarGrupo("SIGTERM");
    // Se espera a que muera de verdad antes de rematar: workerd cierra
    // sus ficheros al salir, y borrar el estado por debajo deja avisos
    // que parecen fallos del test.
    for (let i = 0; i < 20 && !proceso.killed; i++) await esperar(100);
    matarGrupo("SIGKILL");
    await rm(estado, { recursive: true, force: true });
  }

  return { base, entrar, api, conectar, cerrar, registro: () => salida };
}
