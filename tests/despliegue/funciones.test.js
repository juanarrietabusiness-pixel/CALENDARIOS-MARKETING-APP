import { describe, it, expect } from "vitest";
import { leer, rutasWorker, fuentesWorker, rel } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// El código de servidor
//
// Antes esto vigilaba la paridad entre `supabase/functions/` y el
// workflow que las desplegaba una por una, porque `ai-chat` corrió
// semanas con código que no estaba en ningún commit: el workflow sólo
// desplegaba `ai` y `github-adn`. El síntoma —campos que faltan,
// respuestas recortadas— no se parecía a la causa, y el diff estaba
// limpio.
//
// `wrangler deploy` sube el Worker entero, así que ese desajuste ya no
// puede darse. Lo que sí puede darse ahora es una ruta escrita y no
// enrutada: el fichero existe, el código está en el commit, y nadie
// llega nunca a ejecutarlo.
// ============================================================

const INDEX = leer("worker/index.js");
const RUTAS = rutasWorker();
const IA = leer("worker/rutas/ia.js");
const CHAT = leer("worker/rutas/chat.js");
const ADN = leer("worker/rutas/adn.js");

describe("todo lo que se escribe se enruta", () => {
  it("hay rutas que comprobar", () => {
    expect(RUTAS.length, "no se encuentra ninguna ruta en worker/rutas/").toBeGreaterThan(0);
  });

  it("cada fichero de worker/rutas/ se importa desde index.js", () => {
    const huerfanos = RUTAS.filter((abs) => {
      const nombre = rel(abs).replace("worker/rutas/", "").replace(/\.js$/, "");
      return !new RegExp(`from "\\./rutas/${nombre}\\.js"`).test(INDEX);
    });

    const lista = huerfanos.map((abs) => fallo({
      que: `«${rel(abs)}» no lo importa nadie`,
      donde: "worker/index.js",
      porque: "El código está en el commit y desplegado, y aun así no se ejecuta nunca. Es la versión silenciosa del fallo de ai-chat: el diff está limpio y la función no responde.",
      arreglo: `Impórtala en worker/index.js y dale una ruta, o bórrala si ya no hace falta.`,
    }));
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("cada función exportada por una ruta se usa", () => {
    const sinUsar = [];
    for (const abs of RUTAS) {
      const fuente = leer(rel(abs));
      for (const m of fuente.matchAll(/export async function (\w+)/g)) {
        if (!new RegExp(`\\b${m[1]}\\b`).test(INDEX)) sinUsar.push(`${rel(abs)} → ${m[1]}()`);
      }
    }
    const lista = sinUsar.map((x) => fallo({
      que: `«${x}» se exporta y no se llama`,
      donde: "worker/index.js",
      porque: "Una ruta escrita que nadie enruta parece desplegada y no lo está.",
      arreglo: "Enrútala en index.js o retírala.",
    }));
    expect(lista, fallos(lista)).toEqual([]);
  });
});

describe("la puerta: sesión, tamaño y errores", () => {
  it("lo público va ANTES de resolver la sesión", () => {
    // Si /api/publico cayera detrás de la sesión, todos los enlaces de
    // aprobación ya enviados dejarían de abrirse: el cliente final no
    // tiene cuenta y nunca la va a tener.
    const iPublico = INDEX.indexOf('partes[0] === "publico"');
    const iSesion = INDEX.indexOf("await usuarioDeLaPeticion(");
    expect(
      iPublico >= 0 && iSesion >= 0 && iPublico < iSesion,
      fallo({
        que: "el enlace público no se atiende antes de exigir sesión",
        donde: "worker/index.js",
        porque: "La página de aprobación la abre el cliente final, que no tiene cuenta. Detrás de la sesión, todos los enlaces ya enviados devuelven 401.",
        arreglo: "Mueve el bloque de /api/publico por encima de la resolución de sesión.",
      }),
    ).toBe(true);
  });

  it("todo lo demás exige sesión de verdad", () => {
    expect(
      INDEX,
      fallo({
        que: "no se corta la petición cuando no hay sesión",
        donde: "worker/index.js",
        porque: "Sin ese corte, las rutas de datos se ejecutarían sin dueño y la capa de acceso no tendría a quién acotar.",
        arreglo: "Tras usuarioDeLaPeticion(), devuelve noAutenticado() si no hay usuario.",
      }),
    ).toMatch(/if\s*\(!usuario\)\s*return noAutenticado\(\)/);
  });

  it("las rutas de IA acotan el tamaño del cuerpo", () => {
    for (const [nombre, fuente] of [["ia", IA], ["chat", CHAT], ["adn", ADN]]) {
      expect(
        fuente,
        fallo({
          que: `la ruta «${nombre}» no acota el tamaño del cuerpo`,
          donde: `worker/rutas/${nombre}.js`,
          porque: "Una ruta sin límite acepta lo que le manden y lo carga en memoria; el isolate tiene 128 MB.",
          arreglo: "Compara content-length con MAX_BODY_BYTES y devuelve 413.",
        }),
      ).toMatch(/MAX_BODY_BYTES/);
    }
  });

  it("ninguna ruta devuelve al cliente el error crudo de un tercero", () => {
    // El cuerpo de error de un proveedor puede describir la clave, la
    // cuenta o el plan contratado.
    const lista = [];
    for (const abs of [...RUTAS, ...fuentesWorker().filter((f) => /lib\//.test(rel(f)))]) {
      const fuente = leer(rel(abs));
      for (const _hit of fuente.matchAll(/return (?:error|json)\([^)]*await res\.text\(\)/g)) {
        lista.push(fallo({
          que: `«${rel(abs)}» devuelve el cuerpo de error del proveedor`,
          donde: rel(abs),
          porque: "Ese texto puede describir la clave, la cuenta o el plan. Al registro sí; al navegador no.",
          arreglo: "Regístralo con console.error y devuelve un mensaje propio en español.",
        }));
      }
    }
    expect(lista, fallos(lista)).toEqual([]);
  });
});

describe("el proxy de IA", () => {
  it("recorre todos los bloques de la respuesta, no el primero", () => {
    // Basta un bloque de pensamiento por delante para que `find`
    // devuelva undefined y el texto llegue vacío sin ningún error.
    for (const [nombre, fuente] of [["ia", IA], ["chat", CHAT]]) {
      expect(
        fuente,
        fallo({
          que: `«${nombre}» no concatena todos los bloques de texto`,
          donde: `worker/rutas/${nombre}.js`,
          porque: "Con content.find(b => b.type === 'text'), un bloque de pensamiento por delante deja el texto vacío y no hay ningún error que lo explique.",
          arreglo: "filter(b => b.type === 'text').map(b => b.text).join('')",
        }),
      ).toMatch(/filter\([\s\S]{0,60}type === "text"\)[\s\S]{0,120}join\(""\)/);
    }
  });

  it("avisa cuando la respuesta se cortó por longitud", () => {
    expect(
      IA,
      fallo({
        que: "no se informa de stop_reason: max_tokens",
        donde: "worker/rutas/ia.js",
        porque: "Es la diferencia entre un prompt maestro entero y uno cortado a media pieza, y desde el navegador no se distingue de un modelo que decidió parar.",
        arreglo: 'Devuelve truncated: data.stop_reason === "max_tokens".',
      }),
    ).toMatch(/max_tokens/);
  });

  it("fija la política de pensamiento en vez de dejarla al modelo", () => {
    // Los modelos actuales piensan si no se les dice que no, y ese
    // pensamiento se paga del mismo max_tokens que el texto.
    expect(
      IA,
      fallo({
        que: "no se fija el campo thinking",
        donde: "worker/rutas/ia.js",
        porque: "Sin él, el modelo corre en modo adaptativo: una respuesta puede volver con stop_reason «max_tokens» y sin un solo bloque de texto. Subir el presupuesto no lo arregla, sólo cambia cuánto razona.",
        arreglo: 'Manda thinking: { type: "disabled" } en el nivel de calidad.',
      }),
    ).toMatch(/thinking/);
    // El asistente corre en Opus 5.5, donde el razonamiento NO se puede
    // apagar (`disabled` es un 400). La política ahí es otra: adaptativo
    // dicho en voz alta, el esfuerzo lo fija el servidor, y el tope de
    // salida deja sitio al razonamiento —que se paga del mismo max_tokens—.
    expect(CHAT, "el asistente vuelve a apagar el pensamiento: en Opus 5.5 es un 400").not.toMatch(/type:\s*"disabled"/);
    expect(CHAT, "el asistente no fija el razonamiento").toMatch(/thinking:\s*\{\s*type:\s*"adaptive"/);
    expect(CHAT, "el asistente no fija el esfuerzo").toMatch(/output_config:\s*\{\s*effort/);
    const tope = Number((/MAX_TOKENS\s*=\s*([\d_]+)/.exec(CHAT)?.[1] ?? "0").replace(/_/g, ""));
    expect(tope, "max_tokens del asistente sin sitio para razonar").toBeGreaterThanOrEqual(16_000);
  });

  it("no deja que el navegador elija el modelo", () => {
    // Un modelo elegido desde el cliente es una factura elegida desde el
    // cliente. Lo que llega es un NIVEL, y el servidor lo traduce.
    expect(
      IA,
      fallo({
        que: "el modelo puede venir en el cuerpo de la petición",
        donde: "worker/rutas/ia.js",
        porque: "Quien elige el modelo elige el coste. El navegador manda un nivel («rapido», «calidad») y el servidor decide a qué modelo corresponde.",
        arreglo: "Traduce body.tier contra una tabla del servidor; nunca leas body.model.",
      }),
    ).not.toMatch(/body\.model|body\?\.model/);
  });

  it("acota max_tokens por arriba y por abajo", () => {
    expect(IA).toMatch(/Math\.min\(Math\.max\(/);
    expect(IA, "no hay tope de max_tokens").toMatch(/MAX_TOKENS_CAP/);
  });

  it("devuelve diagnóstico para no tener que adivinar", () => {
    for (const campo of ["stopReason", "pensamiento", "entrada", "salida"]) {
      expect(IA, `el diagnóstico no incluye «${campo}»`).toContain(campo);
    }
  });

  it("se rinde dentro de un presupuesto y lo dice en segundos", () => {
    expect(IA).toMatch(/PRESUPUESTO_MS/);
    expect(IA, "no se informa del tiempo transcurrido").toMatch(/segundos/);
  });
});

describe("la lectura del ADN de marca", () => {
  it("sólo habla con GitHub", () => {
    expect(
      ADN,
      fallo({
        que: "no se comprueba el destino de la descarga",
        donde: "worker/rutas/adn.js",
        porque: "Sin esa comprobación, la ruta se puede usar de proxy para descargar cualquier cosa desde la red de Cloudflare con el token del servidor.",
        arreglo: "Comprueba que el host sea api.github.com o raw.githubusercontent.com antes de cada fetch.",
      }),
    ).toMatch(/raw\.githubusercontent\.com/);
  });

  it("deshace el escapado de la ruta del ADN", () => {
    // GitHub escribe los espacios como %20 en la barra de direcciones y
    // las rutas del árbol vienen SIN escapar: la carpeta no coincidía con
    // ninguna y el cliente parecía desconectado. Sólo les pasaba a los
    // clientes con un espacio en el nombre, que es lo que lo hacía
    // invisible.
    expect(
      ADN,
      fallo({
        que: "no se decodifica la ruta de la carpeta",
        donde: "worker/rutas/adn.js",
        porque: "Una ficha guardada con «Baby%20Caleb/…» no casa con ninguna ruta del árbol. La lectura vuelve vacía y el cliente aparece como conectado y sin archivos.",
        arreglo: "Pasa el folder por decodeRuta() antes de compararlo con el árbol.",
      }),
    ).toMatch(/decodeRuta\(String\(body\.folder/);
  });

  it("distingue una carpeta que no existe de una carpeta vacía", () => {
    expect(
      ADN,
      fallo({
        que: "una carpeta inexistente no devuelve 404",
        donde: "worker/rutas/adn.js",
        porque: "Un 200 con todo vacío se enseña como «conectado, sin archivos». El fallo del %20 vivió meses ahí dentro.",
        arreglo: "Si ninguna ruta del árbol está bajo basePath, devuelve 404 nombrando la carpeta.",
      }),
    ).toMatch(/no existe en \$\{owner\}\/\$\{repo\}/);
  });

  it("acota lo que lee: presupuesto, tamaño, número y profundidad", () => {
    for (const tope of ["MAX_TOTAL_CHARS", "MAX_FILE_BYTES", "MAX_FILES", "MAX_DEPTH"]) {
      expect(ADN, `falta el tope ${tope}`).toContain(tope);
    }
  });

  it("versiona su contrato de respuesta", () => {
    expect(
      ADN,
      fallo({
        que: "la respuesta no lleva versión",
        donde: "worker/rutas/adn.js",
        porque: "Sin ella, «estás corriendo una versión vieja» hay que deducirlo de tres campos vacíos. Pasó, y costó una tarde.",
        arreglo: "Mantén const VERSION y devuélvela en el cuerpo.",
      }),
    ).toMatch(/const VERSION = \d+/);
  });

  it("nunca devuelve download_url", () => {
    // En un repositorio privado lleva un parámetro de acceso en la URL.
    expect(ADN).not.toMatch(/download_url:/);
  });
});
