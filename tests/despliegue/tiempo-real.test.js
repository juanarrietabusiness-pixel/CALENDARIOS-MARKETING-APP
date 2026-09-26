import { describe, it, expect } from "vitest";
import { leer, listar, buscar, rel, hay } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// El tiempo real y el equipo
//
// LO QUE VIGILA ESTE FICHERO
//
// Todo lo de aquí falla EN SILENCIO. Un evento que el servidor manda y
// el navegador no atiende no es un error: la escritura fue bien, la
// respuesta fue 200, y la otra persona sigue viendo lo de antes. Igual
// que una escritura que no avisa a nadie, o una pantalla que resuelve
// una dirección que nadie sabe construir.
//
// Nada de esto se ve mirando la aplicación con una sola sesión abierta,
// que es como se mira siempre.
// ============================================================

const APP = leer("src/App.jsx");
const HUB = leer("worker/hub.js");
const VIVO_SERVIDOR = leer("worker/lib/vivo.js");
const VIVO_CLIENTE = leer("src/lib/vivo.js");
const DATOS = leer("worker/rutas/datos.js");
const EQUIPO = leer("worker/rutas/equipo.js");
const INDEX = leer("worker/index.js");
const FUENTES_WORKER = [DATOS, EQUIPO, INDEX, HUB].join("\n");

/** Los `tipo: "x"` que el servidor puede llegar a mandar. */
function tiposQueEmiteElServidor() {
  return [...new Set([...FUENTES_WORKER.matchAll(/tipo:\s*"([^"]+)"/g)].map((m) => m[1]))].sort();
}

/**
 * Los tipos que el navegador atiende.
 *
 * Cuenta los `case "x"` del `switch` y también los `ev.tipo === "x"` que
 * van por delante: la presencia se atiende antes de entrar al switch,
 * porque es lo único que NO lleva firma y no hay que filtrar por eco.
 */
function tiposQueAtiendeElCliente() {
  return new Set([
    ...[...APP.matchAll(/case\s+"([^"]+)"/g)].map((m) => m[1]),
    ...[...APP.matchAll(/ev\.tipo === "([^"]+)"/g)].map((m) => m[1]),
  ]);
}

describe("ningún evento se queda sin atender", () => {
  it("hay eventos que comprobar", () => {
    expect(tiposQueEmiteElServidor().length).toBeGreaterThan(5);
  });

  it("cada evento que emite el servidor tiene su caso en el cliente", () => {
    const atendidos = tiposQueAtiendeElCliente();
    const huerfanos = tiposQueEmiteElServidor().filter((t) => !atendidos.has(t));

    const lista = huerfanos.map((t) => fallo({
      que: `el servidor manda «${t}» y nadie lo recoge`,
      donde: "src/App.jsx",
      porque: "No falla nada: la escritura fue bien y la respuesta fue 200. Simplemente, la otra persona sigue viendo lo de antes hasta que recargue. Con una sola sesión abierta es invisible.",
      arreglo: `Añade un \`case "${t}"\` al escuchador de eventos de Workspace —aunque sólo suba el pulso para que el panel que corresponda vuelva a leer—.`,
    }));

    expect(lista, fallos(lista)).toEqual([]);
  });
});

describe("toda escritura avisa al espacio", () => {
  // Una ruta que guarda y no difunde no falla: guarda perfectamente.
  const ESPERADOS = [
    "cliente", "cliente:fuera",
    "calendario", "calendario:recargar", "calendario:fuera", "calendario:enlace",
    "tarea", "tarea:fuera",
    "banco", "banco:fuera",
    "memoria",
  ];

  it("las rutas de datos difunden todo lo que escriben", () => {
    const faltan = ESPERADOS.filter((t) => !DATOS.includes(`tipo: "${t}"`));
    const lista = faltan.map((t) => fallo({
      que: `no se difunde «${t}»`,
      donde: "worker/rutas/datos.js",
      porque: "La escritura entra en D1 y el resto del equipo no se entera. El síntoma es «a mí sí me aparece», que no apunta a ninguna parte.",
      arreglo: `Llama a difundir() justo después de la escritura, con { tipo: "${t}", … }.`,
    }));
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("el enlace público avisa cuando el cliente final responde", () => {
    expect(
      INDEX,
      fallo({
        que: "una aprobación del cliente final no avisa al espacio",
        donde: "worker/index.js",
        porque: "La agencia no ve la respuesta hasta la siguiente vuelta del sondeo, que ahora es de un minuto porque el camino principal es el socket.",
        arreglo: 'Difunde { tipo: "aprobacion", … } tras enviarAprobacion y actualizarContenido.',
      }),
    ).toMatch(/tipo:\s*"aprobacion"/);
  });

  it("difundir nunca hace esperar a la escritura", () => {
    // Si se esperara al Durable Object, un aviso lento retrasaría cada
    // guardado, y uno fallido convertiría en error una escritura que ya
    // había entrado en D1.
    expect(
      VIVO_SERVIDOR.includes("await hub.fetch") || VIVO_SERVIDOR.includes("return hub.fetch"),
      fallo({
        que: "la difusión se espera antes de contestar",
        donde: "worker/lib/vivo.js",
        porque: "El aviso es un efecto secundario: si el Durable Object tarda, retrasa cada guardado, y si falla convierte en error una escritura que ya entró en D1.",
        arreglo: "Lanza la petición al hub sin await y traga el error con .catch(() => {}).",
      }),
    ).toBe(false);
  });
});

describe("el eco de uno mismo no se aplica", () => {
  it("las escrituras llevan el identificador de la pestaña", () => {
    expect(
      leer("src/lib/db.js"),
      fallo({
        que: "las peticiones no identifican la pestaña que las hace",
        donde: "src/lib/db.js",
        porque: "El Durable Object reparte a todos —no sabe de qué socket salió un cambio que le llegó por HTTP—, así que tu propio guardado vuelve. Aplicarlo te pisa lo que hayas seguido escribiendo: el cursor salta y la última palabra desaparece.",
        arreglo: "Manda la cabecera X-Pestana en `pedir` y descarta en App.jsx los eventos cuyo `por.tab` sea el tuyo.",
      }),
    ).toContain("X-Pestana");
  });

  it("y el navegador descarta los suyos", () => {
    expect(
      APP,
      fallo({
        que: "el navegador se aplica sus propios eventos",
        donde: "src/App.jsx",
        porque: "Lo mismo que arriba, visto desde el otro lado.",
        arreglo: "Compara `ev.por?.tab` con db.PESTANA y vuelve sin hacer nada si coinciden.",
      }),
    ).toMatch(/por\??\.tab\s*===\s*db\.PESTANA/);
  });

  it("un calendario a medio escribir no se pisa con el de otra persona", () => {
    expect(
      APP,
      fallo({
        que: "un evento remoto se aplica sobre un calendario con escritura pendiente",
        donde: "src/App.jsx",
        porque: "Si alguien guarda el mes que tú estás editando, aplicar su versión borra lo que tienes a medias sin decir nada.",
        arreglo: "Comprueba pendingSaves/saveTimers antes de aplicar, y avisa en vez de pisar.",
      }),
    ).toMatch(/pendingSaves\.current\.has/);
  });
});

describe("la conexión se cuida sola", () => {
  it("reintenta con espera creciente y con tope", () => {
    expect(VIVO_CLIENTE, "no hay reintento con espera creciente").toMatch(/2\s*\*\*\s*this\.intentos/);
    expect(VIVO_CLIENTE, "la espera no tiene tope").toContain("ESPERA_MAX_MS");
  });

  it("manda latido: los proxies móviles cortan lo que está callado", () => {
    // Sin el ping, la aplicación parece conectada y hace un rato que no
    // recibe nada. Es el fallo más difícil de reproducir de todos.
    expect(VIVO_CLIENTE, "no hay latido").toContain("LATIDO_MS");
    expect(HUB, "el servidor no contesta al latido").toContain("pong");
  });

  it("vuelve a conectar al volver a primer plano", () => {
    // iOS y Android congelan la pestaña y el socket muere sin avisar.
    expect(VIVO_CLIENTE, "no se escucha visibilitychange").toContain("visibilitychange");
  });

  it("y al reconectar se relee todo, porque el socket no es la fuente de verdad", () => {
    expect(
      APP,
      fallo({
        que: "una reconexión no recarga los datos",
        donde: "src/App.jsx",
        porque: "Mientras el socket estuvo caído no llegó ningún evento. Sin releer, la pantalla se queda con un hueco que nadie ve: parece al día y no lo está.",
        arreglo: "En alCambiarEstado, llama a cargar() cuando se vuelve a «conectado» tras haberlo estado.",
      }),
    ).toMatch(/yaEstuvo/);
  });

  it("el Durable Object hiberna: acceptWebSocket, no accept()", () => {
    expect(
      HUB,
      fallo({
        que: "el Durable Object no usa hibernación",
        donde: "worker/hub.js",
        porque: "Sin hibernación, tener el panel abierto toda la tarde sin tocar nada mantiene el objeto en memoria y se paga. Con ella, los sockets sobreviven a que se descargue.",
        arreglo: "Usa state.acceptWebSocket(servidor) en vez de servidor.accept().",
      }),
    ).toContain("acceptWebSocket");
  });

  it("la identidad de quien edita la pone el servidor, no el mensaje", () => {
    // Si `por` viniera del cliente, cualquiera firmaría como otro.
    const trozo = HUB.slice(HUB.indexOf('m.tipo === "editando"'));
    expect(
      trozo,
      fallo({
        que: "el aviso de «está editando» se firma con lo que manda el cliente",
        donde: "worker/hub.js",
        porque: "Cualquiera podría firmar como otra persona con sólo mandar otro nombre por el socket.",
        arreglo: "Compón `por` a partir de los datos guardados en el socket (datos.userId, datos.nombre), no de m.",
      }),
    ).toMatch(/userId:\s*datos\.userId/);
  });
});

describe("la sesión y el espacio son dos cosas", () => {
  it("el acceso a datos se acota por el espacio, no por la persona", () => {
    expect(
      INDEX,
      fallo({
        que: "crearAcceso recibe el id de la persona",
        donde: "worker/index.js",
        porque: "Quien entra por invitación vería un panel vacío: sus filas están a nombre del espacio, no suyo. La aplicación «funciona» y no tiene nada dentro.",
        arreglo: "Pásale usuario.ownerId, que es el espacio.",
      }),
    ).toMatch(/crearAcceso\(env\.DB,\s*usuario\.ownerId[,)]/);
  });

  it("el enlace de invitación se atiende ANTES de exigir sesión", () => {
    const iInvitacion = INDEX.indexOf('partes[0] === "invitacion"');
    const iSesion = INDEX.indexOf("await usuarioDeLaPeticion(");
    expect(
      iInvitacion >= 0 && iSesion >= 0 && iInvitacion < iSesion,
      fallo({
        que: "la invitación cae detrás de la sesión",
        donde: "worker/index.js",
        porque: "Quien abre una invitación no tiene cuenta: ése es justo el motivo de invitarlo. Detrás de la sesión, el enlace devuelve 401 a todo el mundo menos a quien no lo necesita.",
        arreglo: "Mueve el bloque de /api/invitacion por encima de usuarioDeLaPeticion().",
      }),
    ).toBe(true);
  });

  it("el WebSocket va DESPUÉS de la sesión", () => {
    const iLive = INDEX.indexOf('partes[0] === "live"');
    const iSesion = INDEX.indexOf("await usuarioDeLaPeticion(");
    expect(
      iLive > iSesion && iSesion >= 0,
      fallo({
        que: "/api/live no exige sesión",
        donde: "worker/index.js",
        porque: "Sería un canal abierto a los cambios de un espacio ajeno con sólo adivinar la dirección. El Durable Object no lee cookies y no debe: la autorización vive en un solo sitio.",
        arreglo: "Resuelve la sesión antes y usa usuario.ownerId para elegir el objeto.",
      }),
    ).toBe(true);
  });

  it("sólo quien administra reparte llaves", () => {
    const invitar = EQUIPO.slice(EQUIPO.indexOf('sub === "invitacion" && metodo === "POST"'));
    expect(
      invitar.slice(0, 400),
      fallo({
        que: "invitar no comprueba el papel",
        donde: "worker/rutas/equipo.js",
        porque: "Invitar es dar acceso a todos los clientes de la agencia: es la única acción que reparte llaves.",
        arreglo: "Devuelve 403 si usuario.rol no es «admin».",
      }),
    ).toContain("esAdmin");
  });

  it("el papel se lee de la sesión, nunca del cuerpo de la petición", () => {
    // `rol` sí viene del cuerpo al CREAR una invitación —quien la crea ya
    // es administrador—, pero el papel de QUIEN PIDE sale de la sesión.
    expect(EQUIPO).toMatch(/const esAdmin = usuario\.rol === "admin"/);
  });

  it("el testigo de la invitación sólo se guarda en huella", () => {
    expect(
      EQUIPO,
      fallo({
        que: "la invitación guarda su testigo en claro",
        donde: "worker/rutas/equipo.js",
        porque: "Un volcado de D1 —o una consulta de más— devolvería enlaces utilizables para entrar en el espacio.",
        arreglo: "Guarda sha256(testigo) en token_hash y devuelve el testigo una sola vez.",
      }),
    ).toMatch(/token_hash:\s*await sha256\(/);
  });
});

describe("las direcciones", () => {
  it("existe el módulo de rutas y sus tests", () => {
    expect(hay("src/lib/rutas.js"), "falta src/lib/rutas.js").toBe(true);
    expect(hay("src/lib/rutas.test.js"), "falta src/lib/rutas.test.js").toBe(true);
  });

  it("qué se está mirando NO vive en useState", () => {
    // Era lo que hacía que recargar te devolviera al principio y que no
    // se pudiera pasar un enlace a nadie.
    const sospechosos = buscar(
      [`${process.cwd()}/src/App.jsx`],
      /useState\([^)]*\)\s*;?\s*$/,
    ).filter((h) => /selectedClientId|selectedCalId/.test(h.texto));

    const lista = sospechosos.map((h) => fallo({
      que: "el cliente o el calendario seleccionados vuelven a ser estado",
      donde: `${h.archivo}:${h.linea} — ${h.texto}`,
      porque: "Si no salen de la dirección, recargar devuelve al inicio y un enlace compartido no abre lo mismo que veía quien lo mandó.",
      arreglo: "Derívalos de `ruta` con porRuta(), y navega con navegar() en vez de guardarlos.",
    }));
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("el respaldo de la SPA sigue puesto: /cliente/x tiene que servir index.html", () => {
    // Sin él, recargar en una dirección con cliente devuelve 404 —que es
    // exactamente lo que estas direcciones vienen a arreglar—.
    expect(
      leer("wrangler.jsonc"),
      fallo({
        que: "no está el respaldo de la aplicación de una sola página",
        donde: "wrangler.jsonc",
        porque: "Sin él, recargar en /cliente/baby-caleb devuelve 404 del servidor de assets. Las direcciones nuevas sólo existen dentro del navegador.",
        arreglo: '"not_found_handling": "single-page-application" en el bloque assets.',
      }),
    ).toContain("single-page-application");
  });
});

describe("el acceso lleva la sesión a la pantalla", () => {
  it("Login recibe con qué avisar de que ha entrado", () => {
    // EL FALLO: `signIn` devolvía el usuario y Login no hacía nada con
    // él, confiando en el `onAuthStateChange` que se fue con Supabase.
    // Entrar ponía la cookie, el servidor respondía 200, y la pantalla
    // de acceso se quedaba quieta hasta recargar.
    expect(
      APP,
      fallo({
        que: "a Login no se le pasa cómo avisar de la sesión",
        donde: "src/App.jsx",
        porque: "Sin eso, entrar deja la cookie puesta y la pantalla quieta: sólo se entra al recargar, que es cuando se pregunta a /api/yo.",
        arreglo: "<Login onAcceso={setSession} />, con setSession sacado de useSession().",
      }),
    ).toMatch(/<Login onAcceso=\{setSession\}/);
  });

  it("y Login lo usa", () => {
    expect(
      leer("src/pages/Login.jsx"),
      fallo({
        que: "Login no hace nada con lo que devuelve signIn",
        donde: "src/pages/Login.jsx",
        porque: "Es exactamente el fallo de antes: la sesión existe en el servidor y no existe en la pantalla.",
        arreglo: "Llama a onAcceso(sesion) con lo que devuelve signIn.",
      }),
    ).toMatch(/onAcceso\(/);
  });

  it("la invitación entra igual: crea la cuenta y deja la sesión puesta", () => {
    expect(leer("src/pages/Invitacion.jsx"), "Invitacion no propaga la sesión").toMatch(/onAcceso\(/);
  });

  it("nadie más se inventa su propio fetch a la API", () => {
    // Dos copias del mismo fetch es una que un día deja de mandar la
    // cookie —o de leer el error del cuerpo— y nadie sabe por qué esa
    // pantalla concreta dice «Failed to fetch».
    const fuentes = listar("src", /\.jsx?$/)
      .filter((f) => !/\.test\.js$/.test(rel(f)))
      .filter((f) => !["src/lib/db.js", "src/lib/auth.js", "src/api.js", "src/pages/Aprobar.jsx"].includes(rel(f)));

    const sueltos = buscar(fuentes, /fetch\(\s*[`"']\/api/);
    const lista = sueltos.map((h) => fallo({
      que: "hay una llamada a la API fuera de los módulos que la centralizan",
      donde: `${h.archivo}:${h.linea} — ${h.texto}`,
      porque: "Se salta el manejo de errores y la cabecera de pestaña, así que sus eventos vuelven y se aplican sobre lo que estabas escribiendo.",
      arreglo: "Usa `pedir` de src/lib/db.js.",
    }));
    expect(lista, fallos(lista)).toEqual([]);
  });
});
