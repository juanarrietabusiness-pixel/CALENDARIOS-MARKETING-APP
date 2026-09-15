import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { leer, ruta, listar, rel } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// Las funciones del servidor y su despliegue
//
// Aquí vive todo lo que el navegador no puede tener: las claves de IA, el
// token de GitHub, la clave de servicio. Son cuatro archivos y cada uno es
// una puerta abierta a internet.
//
// La parte que más se rompe no es el código: es el despliegue. Una
// función que está en el repositorio pero no en el workflow se queda en la
// versión que alguien subió a mano hace semanas, y el síntoma —campos que
// faltan, respuestas recortadas— no se parece en nada a la causa.
// ============================================================

const DIR = "supabase/functions";
const funciones = readdirSync(ruta(DIR))
  .filter((n) => statSync(ruta(DIR, n)).isDirectory())
  .sort();

const workflow = leer(".github/workflows/desplegar-funciones.yml");

describe("el repositorio y el despliegue dicen lo mismo", () => {
  it("hay funciones que comprobar", () => {
    expect(funciones.length).toBeGreaterThan(0);
  });

  it("toda función del repositorio se despliega desde el workflow", () => {
    const sinDesplegar = funciones.filter(
      (f) => !new RegExp(`functions\\s+deploy\\s+${f}\\b`).test(workflow),
    );
    const lista = sinDesplegar.map((f) => fallo({
      que: `la función «${f}» no se despliega nunca`,
      donde: ".github/workflows/desplegar-funciones.yml",
      porque: "Está en el repositorio, así que parece desplegada; en producción sigue corriendo lo último que alguien subió a mano. El síntoma no se parece a la causa: campos que faltan, respuestas recortadas, y un diff limpio.",
      arreglo: `Añade un paso: supabase functions deploy ${f} --project-ref "$PROJECT_REF"`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("el workflow no despliega funciones que ya no existen", () => {
    const desplegadas = [...workflow.matchAll(/functions\s+deploy\s+([\w-]+)/g)].map((m) => m[1]);
    const fantasmas = desplegadas.filter((f) => !funciones.includes(f));
    const lista = fantasmas.map((f) => fallo({
      que: `el workflow despliega «${f}», que no está en el repositorio`,
      donde: ".github/workflows/desplegar-funciones.yml",
      porque: "El despliegue falla entero en ese paso, así que las funciones de los pasos siguientes tampoco se actualizan.",
      arreglo: `Quita el paso de ${f}, o recupera su código en ${DIR}/${f}/.`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("el workflow se dispara con cualquier cambio en las funciones", () => {
    expect(workflow).toMatch(/paths:/);
    expect(workflow, "el disparador no cubre supabase/functions/**").toMatch(/supabase\/functions\/\*\*/);
  });

  it("el workflow avisa en claro si falta el token de despliegue", () => {
    expect(
      workflow,
      fallo({
        que: "el workflow no comprueba SUPABASE_ACCESS_TOKEN",
        donde: ".github/workflows/desplegar-funciones.yml",
        porque: "Sin el secreto, el CLI falla con un error suyo que no menciona que falta configurar nada.",
        arreglo: "Deja el paso «Comprobar que hay token» antes de los despliegues.",
      }),
    ).toMatch(/SUPABASE_ACCESS_TOKEN/);
  });
});

describe.each(funciones)("supabase/functions/%s", (nombre) => {
  const fuente = leer(DIR, nombre, "index.ts");
  const donde = `${DIR}/${nombre}/index.ts`;

  it("exige una sesión de verdad, no sólo un token firmado", () => {
    // `verify_jwt` sólo comprueba que el token esté firmado por el
    // proyecto, y la clave anónima —que va en el bundle— también lo está.
    // getUser() es lo que distingue una sesión de una clave pública.
    expect(
      fuente,
      fallo({
        que: `${nombre} no confirma la sesión con getUser()`,
        donde,
        porque: "verify_jwt acepta la clave anónima, que está en el bundle y la tiene cualquiera. Sin getUser(), la función queda abierta a internet gastando la clave de IA de la agencia.",
        arreglo: "Crea el cliente con el Authorization entrante y comprueba `const { data, error } = await supabase.auth.getUser()`.",
      }),
    ).toMatch(/auth\.getUser\(\)/);
  });

  it("responde 401 cuando no hay sesión", () => {
    expect(fuente, `${nombre} no devuelve 401 ante una sesión inválida`).toMatch(/401/);
  });

  it("contesta al preflight de CORS", () => {
    expect(
      fuente,
      fallo({
        que: `${nombre} no responde al OPTIONS`,
        donde,
        porque: "El navegador manda un preflight antes del POST: sin respuesta, la llamada falla como error de red y manda a buscar un problema de conectividad que no existe.",
        arreglo: 'if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });',
      }),
    ).toMatch(/"OPTIONS"/);
  });

  it("permite acotar los orígenes por configuración", () => {
    expect(
      fuente,
      fallo({
        que: `${nombre} no lee ALLOWED_ORIGINS`,
        donde,
        porque: "Sin lista, se refleja el origen que venga: cómodo en local, pero en producción cualquier sitio puede llamar a la función desde el navegador de alguien con sesión.",
        arreglo: 'Lee ALLOWED_ORIGINS y refleja el origen sólo si está en la lista.',
      }),
    ).toMatch(/ALLOWED_ORIGINS/);
  });

  it("acota el tamaño del cuerpo", () => {
    expect(
      fuente,
      fallo({
        que: `${nombre} no limita el tamaño de la petición`,
        donde,
        porque: "Las publicaciones llevan imágenes en base64: sin tope, una petición basta para agotar la memoria de la función.",
        arreglo: "Compara `req.headers.get('content-length')` con un máximo y devuelve 413.",
      }),
    ).toMatch(/content-length/);
  });

  it("no cachea sus respuestas", () => {
    expect(fuente, `${nombre} no manda Cache-Control: no-store`).toMatch(/no-store/);
  });

  it("no devuelve al cliente el error crudo de un tercero", () => {
    const filtra = /error:\s*(await\s+)?(res|respuesta)\.(text|json)\(\)|JSON\.stringify\(\s*(await\s+)?res\./;
    expect(
      filtra.test(fuente),
      fallo({
        que: `${nombre} reenvía al navegador el error del proveedor`,
        donde,
        porque: "Ese mensaje puede describir la clave, la cuenta o el plan contratado.",
        arreglo: "Registra el error con console.error y devuelve un mensaje propio.",
      }),
    ).toBe(false);
  });

  it("se rinde dentro del margen de Supabase", () => {
    // Supabase corta a los 150 s, y al cortar no devuelve JSON sino una
    // página del gateway que el navegador no sabe leer: el error llega
    // como «no se pudo contactar con el servidor».
    const esperaAFuera = /fetch\(\s*["'`]https?:\/\//.test(fuente);
    if (!esperaAFuera) return;
    expect(
      /AbortController|AbortSignal|signal/.test(fuente),
      fallo({
        que: `${nombre} llama a un tercero sin plazo propio`,
        donde,
        porque: "Si el proveedor tarda, corta el gateway a los 150 s con una página HTML y el error llega al navegador como problema de red.",
        arreglo: "Envuelve la llamada en un AbortController con un presupuesto por debajo de 150 s y devuelve un 504 explicándolo.",
      }),
    ).toBe(true);
  });
});

describe("el proxy de IA", () => {
  const ai = leer(DIR, "ai", "index.ts");

  it("recorre todos los bloques de la respuesta, no el primero", () => {
    // Basta un bloque de pensamiento por delante para que un `find`
    // devuelva undefined y el texto llegue vacío sin ningún error.
    expect(
      /content\.find\(|\.find\(\s*\(?\s*b\s*\)?\s*=>\s*b\.type\s*===\s*["']text["']/.test(ai),
      fallo({
        que: "la respuesta de Anthropic se lee con .find()",
        donde: `${DIR}/ai/index.ts`,
        porque: "Un bloque de pensamiento por delante hace que `find` devuelva undefined: el texto llega vacío, sin error, y parece que el modelo no respondió.",
        arreglo: "Filtra y concatena: bloques.filter(b => b?.type === 'text').map(b => b?.text ?? '').join('').",
      }),
    ).toBe(false);
    expect(ai, "no se concatenan los bloques de texto").toMatch(/\.filter\([\s\S]{0,80}type\s*===\s*"text"/);
  });

  it("avisa cuando la respuesta se cortó por longitud", () => {
    expect(
      ai,
      fallo({
        que: "la función no informa de stop_reason",
        donde: `${DIR}/ai/index.ts`,
        porque: "Desde el navegador, un texto cortado a la mitad no se distingue de un modelo que decidió parar. Es la diferencia entre un prompt maestro entero y uno cortado a media pieza.",
        arreglo: 'Devuelve `truncated: data?.stop_reason === "max_tokens"`.',
      }),
    ).toMatch(/stop_reason/);
  });

  it("fija la política de pensamiento en vez de dejarla al modelo", () => {
    // Los modelos actuales piensan si no se les dice que no, y ese
    // pensamiento se paga del mismo max_tokens que el texto.
    expect(
      ai,
      fallo({
        que: "no se configura `thinking` en la llamada a Anthropic",
        donde: `${DIR}/ai/index.ts`,
        porque: "Sin ese campo el modelo corre en modo adaptativo: el razonamiento se come el presupuesto, la respuesta vuelve con stop_reason max_tokens y sin un solo bloque de texto.",
        arreglo: "Manda `thinking: { type: 'disabled' }` en el nivel de calidad, y documenta AI_PENSAR para volver a encenderlo.",
      }),
    ).toMatch(/thinking/);
  });

  it("no deja que el navegador elija el modelo", () => {
    expect(
      ai,
      fallo({
        que: "el modelo no sale de una lista cerrada",
        donde: `${DIR}/ai/index.ts`,
        porque: "Si el cuerpo de la petición elige el modelo, cualquiera con sesión puede pedir el más caro que exista.",
        arreglo: "Mapea `tier` contra MODEL_TIERS y cae al nivel rápido ante cualquier otro valor.",
      }),
    ).toMatch(/MODEL_TIERS\[tier\]\s*\?\?/);
  });

  it("acota max_tokens por arriba y por abajo", () => {
    expect(ai).toMatch(/Math\.min\(Math\.max\(/);
  });

  it("devuelve diagnóstico para no tener que adivinar", () => {
    expect(ai).toMatch(/diagnostico/);
  });
});

describe("la lectura del ADN de marca", () => {
  const adn = leer(DIR, "github-adn", "index.ts");

  it("sólo habla con GitHub", () => {
    expect(
      adn,
      fallo({
        que: "github-adn no valida el destino de la petición",
        donde: `${DIR}/github-adn/index.ts`,
        porque: "Sin esa comprobación, una URL manipulada convierte la función en un proxy con token hacia cualquier sitio, incluida la red interna.",
        arreglo: "Comprueba que el host es api.github.com o raw.githubusercontent.com antes de llamar.",
      }),
    ).toMatch(/api\.github\.com/);
    expect(adn).toMatch(/raw\.githubusercontent\.com/);
  });

  it("deshace el escapado de la ruta del ADN", () => {
    // GitHub escribe los espacios como %20 en la barra de direcciones, y
    // las rutas del árbol vienen sin escapar: la carpeta no coincidía y la
    // lectura volvía vacía, sólo para los clientes con espacio en el nombre.
    expect(
      adn,
      fallo({
        que: "github-adn no decodifica el %20 de la carpeta",
        donde: `${DIR}/github-adn/index.ts`,
        porque: "La ficha del cliente guarda la ruta copiada del navegador, con %20. El árbol de GitHub la devuelve sin escapar: no casan, la lectura vuelve vacía y el cliente parece desconectado.",
        arreglo: "Pasa basePath por decodeURIComponent segmento a segmento antes de comparar.",
      }),
    ).toMatch(/decodeURIComponent/);
  });

  it("distingue una carpeta que no existe de una carpeta vacía", () => {
    expect(
      adn,
      fallo({
        que: "una carpeta inexistente no devuelve 404",
        donde: `${DIR}/github-adn/index.ts`,
        porque: "Un 200 con todo vacío se lee como «este cliente no tiene ADN» en vez de «la ruta está mal escrita».",
        arreglo: "Devuelve 404 nombrando la carpeta cuando no aparece en el árbol.",
      }),
    ).toMatch(/404/);
  });

  it("acota lo que lee: presupuesto, tamaño, número y profundidad", () => {
    for (const tope of ["MAX_TOTAL_CHARS", "MAX_FILE_BYTES", "MAX_FILES", "MAX_DEPTH"]) {
      expect(adn, `github-adn no declara ${tope}`).toMatch(new RegExp(tope));
    }
  });

  it("versiona su contrato de respuesta", () => {
    expect(
      adn,
      fallo({
        que: "github-adn no declara VERSION",
        donde: `${DIR}/github-adn/index.ts`,
        porque: "Sin ella, correr una versión vieja se deduce de tres campos vacíos en un diagnóstico. Ya costó una tarde.",
        arreglo: "Mantén `const VERSION = n` y devuélvelo en la respuesta.",
      }),
    ).toMatch(/VERSION\s*=\s*\d+/);
  });
});

describe("las funciones de Netlify", () => {
  it("cada una declara su ruta", () => {
    for (const abs of listar("netlify/functions", /\.mjs$/)) {
      expect(leer(rel(abs)), `${rel(abs)} no exporta config.path`).toMatch(/export\s+const\s+config\s*=\s*\{[^}]*path:/);
    }
  });

  it("ninguna arrastra el cliente de Supabase", () => {
    // Arrastra el módulo de Realtime, que exige WebSocket nativo y
    // revienta al construirse según el runtime de turno.
    for (const abs of listar("netlify/functions", /\.mjs$/)) {
      // Se busca la importación, no la mención: admin-seed explica en un
      // comentario por qué NO usa el cliente, y ese comentario es la
      // documentación de la decisión, no su incumplimiento.
      const importa = /^\s*(?:import\s[^;]*from\s*|const\s[^=]*=\s*(?:await\s+)?(?:require|import)\s*\()\s*["'`]@supabase\/supabase-js/m;
      expect(
        importa.test(leer(rel(abs))),
        fallo({
          que: `${rel(abs)} importa @supabase/supabase-js`,
          donde: rel(abs),
          porque: "El cliente arrastra Realtime, que exige un WebSocket nativo y revienta al construirse aunque la función no suscriba nada.",
          arreglo: "Llama a la API de Auth por HTTP con fetch; son tres peticiones sueltas.",
        }),
      ).toBe(false);
    }
  });
});
