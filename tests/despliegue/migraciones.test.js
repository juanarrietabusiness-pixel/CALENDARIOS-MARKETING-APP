import { describe, it, expect } from "vitest";
import {
  esquema, sqlCompleto, tablasCreadas, politicas, funciones,
  revocaciones, concesiones, indices, clavesAjenas,
} from "../utils/sql";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// El esquema y sus políticas
//
// Aquí no hay pantalla que mirar. Una política mal escrita no rompe
// nada: la aplicación sigue funcionando, con un solo usuario todo se ve
// igual, y el fallo sólo existe para quien vaya a buscarlo. Por eso se
// comprueba leyendo el SQL en vez de confiando en que se revisó.
//
// Las reglas son las que ya están escritas en CLAUDE.md y en los
// comentarios de las propias migraciones. La diferencia es que ahora
// fallan solas.
// ============================================================

const TODO = sqlCompleto();
const TABLAS = tablasCreadas();
const POLITICAS = politicas();
const FUNCIONES = funciones();

describe("el lector de migraciones ve el esquema", () => {
  // Si estos números caen a cero, los casos de abajo pasarían por vacío.
  it("encuentra migraciones, tablas, políticas y funciones", () => {
    expect(esquema().length).toBeGreaterThan(5);
    expect(TABLAS.length).toBeGreaterThan(5);
    expect(POLITICAS.length).toBeGreaterThan(5);
    expect(FUNCIONES.length).toBeGreaterThan(3);
  });

  it("reproduce los borrados: lo sustituido deja de contar", () => {
    // Todo lo de abajo se apoya en que `politicas()` devuelve el estado
    // FINAL. Si el reproductor se equivocara y arrastrara una política ya
    // sustituida, los casos de seguridad fallarían sin motivo; si se
    // comiera una viva, pasarían sin mirar nada. Se comprueba contra un
    // caso real: las tres políticas abiertas del banco de contenido se
    // borraron y se sustituyeron por otras acotadas al propietario.
    const vivas = politicas().map((p) => p.nombre);
    const historicas = politicas({ historico: true }).map((p) => p.nombre);

    const sustituida = "Authenticated users can read own content-bank";
    expect(historicas, "la política vieja debería seguir en el histórico").toContain(sustituida);
    expect(vivas, "la política vieja no debería seguir vigente").not.toContain(sustituida);
    expect(vivas, "la política nueva debería estar vigente").toContain("content-bank: el propietario lee");

    // Y ninguna política vigente puede estar duplicada por nombre y tabla.
    const claves = politicas().map((p) => `${p.tabla}::${p.nombre}`);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe("row level security", () => {
  it("toda tabla de public la tiene habilitada", () => {
    const sin = TABLAS.filter(
      (t) => !new RegExp(`alter\\s+table\\s+(?:public\\.)?${t.nombre}\\s+enable\\s+row\\s+level\\s+security`, "i").test(TODO),
    );
    const lista = sin.map((t) => fallo({
      que: `la tabla ${t.nombre} no habilita RLS`,
      donde: t.archivo,
      porque: "Sin RLS, la clave anónima que va en el bundle lee la tabla entera desde cualquier navegador.",
      arreglo: `alter table public.${t.nombre} enable row level security;`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("toda tabla con owner_id tiene una política que lo comprueba", () => {
    const conDueno = TABLAS.filter((t) => /\bowner_id\b/.test(t.columnas));
    const sin = conDueno.filter((t) => {
      const suyas = POLITICAS.filter((p) => p.tabla === t.nombre);
      return !suyas.some((p) => /owner_id/.test(p.using + p.conCheck));
    });
    const lista = sin.map((t) => fallo({
      que: `la tabla ${t.nombre} tiene owner_id pero ninguna política lo usa`,
      donde: t.archivo,
      porque: "La columna sugiere que cada fila es de alguien, pero nada lo hace cumplir: cualquier sesión ve las filas de todas.",
      arreglo: `create policy ... on public.${t.nombre} using (owner_id = (select auth.uid()));`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("ninguna política de escritura se queda sin with check", () => {
    // `using` decide qué filas se pueden tocar; `with check`, cómo quedan
    // después. Sin el segundo, un UPDATE puede reasignar la fila a otro.
    const escritura = POLITICAS.filter((p) => ["all", "insert", "update"].includes(p.para));
    const sin = escritura.filter((p) => !p.conCheck.trim());
    const lista = sin.map((p) => fallo({
      que: `la política «${p.nombre}» escribe sin with check`,
      donde: `${p.archivo} → ${p.tabla}`,
      porque: "Sin with check, un UPDATE puede dejar la fila con otro owner_id y regalársela a otra cuenta.",
      arreglo: "Añade `with check (...)` con la misma condición que el `using`.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("las políticas de storage acotan algo más que el nombre del bucket", () => {
    // Éste es el caso que se escapó: tres políticas llamadas «own
    // content-bank» cuya única condición era `bucket_id = 'content-bank'`.
    // Con eso, cualquier sesión autenticada lee y BORRA los archivos de
    // todos los clientes, no los suyos.
    const deStorage = POLITICAS.filter((p) => p.tabla === "objects" || /storage\./.test(p.cuerpo) || /bucket_id/.test(p.using + p.conCheck));
    const abiertas = deStorage.filter((p) => {
      const cond = `${p.using} ${p.conCheck}`;
      const acota = /auth\.uid\(\)|\bowner\b|owner_id|foldername/.test(cond);
      return !acota;
    });
    const lista = abiertas.map((p) => fallo({
      que: `la política de storage «${p.nombre}» sólo comprueba el bucket`,
      donde: `${p.archivo} → storage.objects (${p.para})`,
      porque: "Toda sesión autenticada alcanza los archivos de cualquier cliente. En un ALL o un DELETE eso es borrado ajeno, no sólo lectura.",
      arreglo: "Acota por propietario: `owner = (select auth.uid())`, o por la primera carpeta de la ruta con `(storage.foldername(name))[1]`.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});

describe("rendimiento de las políticas", () => {
  it("auth.uid() se evalúa una vez, no por fila", () => {
    // `auth.uid()` suelto se reevalúa en cada fila. Con cuatro clientes da
    // igual; es la clase de coste que sólo se nota cuando ya duele.
    const malas = POLITICAS.filter((p) => {
      const cond = `${p.using} ${p.conCheck}`;
      const suelto = /(^|[^(])\bauth\.uid\(\)/.test(cond.replace(/\(\s*select\s+auth\.uid\(\)\s*\)/gi, "«ok»"));
      return suelto;
    });
    const lista = malas.map((p) => fallo({
      que: `la política «${p.nombre}» llama a auth.uid() por fila`,
      donde: `${p.archivo} → ${p.tabla}`,
      porque: "Postgres no puede sacar la llamada del bucle: la ejecuta una vez por fila examinada y el plan se degrada al crecer la tabla.",
      arreglo: "Envuélvela: `(select auth.uid())` en lugar de `auth.uid()`.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("toda clave ajena tiene un índice que la cubre", () => {
    const idx = indices();
    const sin = clavesAjenas().filter(
      (fk) => !idx.some((i) => i.tabla === fk.tabla && i.columnas[0] === fk.columna),
    );
    const lista = sin.map((fk) => fallo({
      que: `${fk.tabla}.${fk.columna} referencia a ${fk.referencia} sin índice`,
      donde: fk.archivo,
      porque: "Cada consulta por esa columna recorre la tabla entera, y borrar el padre obliga a un escaneo completo del hijo.",
      arreglo: `create index if not exists ${fk.tabla}_${fk.columna}_idx on public.${fk.tabla} (${fk.columna});`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});

describe("funciones con privilegios", () => {
  it("toda security definer fija search_path", () => {
    const sin = FUNCIONES.filter((f) => f.securityDefiner && !f.searchPath);
    const lista = sin.map((f) => fallo({
      que: `la función ${f.nombre} es security definer sin search_path`,
      donde: f.archivo,
      porque: "Un esquema en el search_path de quien la llama puede suplantar una tabla dentro de una función con privilegios, y la función ejecuta sobre la tabla del atacante.",
      arreglo: "Añade `set search_path = ''` y cualifica todos los nombres (public.calendars, extensions.gen_random_bytes…).",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("las security definer con search_path vacío cualifican sus tablas", () => {
    const malas = [];
    for (const f of FUNCIONES) {
      if (!f.securityDefiner || f.searchPath !== "''") continue;
      // Referencias a tablas sin esquema dentro del cuerpo.
      // Palabras que siguen a from/into/update sin ser una tabla:
      // `do update set`, `insert into ... values`, subconsultas…
      const RESERVADAS = new Set([
        "set", "values", "select", "where", "returning", "strict", "found",
        "exists", "lateral", "only", "table", "result",
      ]);
      const sinCualificar = [...f.cuerpo.matchAll(/\b(?:from|join|into|update)\s+(?!public\.|extensions\.|auth\.|storage\.|pg_catalog\.|information_schema\.|jsonb|json|\()(\w+)/gi)]
        .map((m) => m[1])
        .filter((n) => !RESERVADAS.has(n.toLowerCase()))
        .filter((n) => !/^v_/.test(n));
      if (sinCualificar.length) malas.push({ f, sinCualificar: [...new Set(sinCualificar)] });
    }
    const lista = malas.map(({ f, sinCualificar }) => fallo({
      que: `${f.nombre} usa nombres sin esquema: ${sinCualificar.join(", ")}`,
      donde: f.archivo,
      porque: "Con `search_path = ''` un nombre sin cualificar no resuelve y la función falla en ejecución, no al crearse.",
      arreglo: "Escribe `public.<tabla>` en cada referencia.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("las funciones de la agencia están revocadas a anon explícitamente", () => {
    // Este proyecto concede EXECUTE a anon por defecto en toda función
    // nueva de public, y `revoke ... from public` NO deshace una
    // concesión por rol. Hay que revocar de anon con su nombre.
    const soloAgencia = ["share_calendar", "set_share_enabled"];
    const revs = revocaciones();
    const lista = [];
    for (const nombre of soloAgencia) {
      const suya = revs.filter((r) => r.funcion === nombre);
      const revocaAnon = suya.some((r) => r.de.includes("anon") || r.de.some((d) => /\banon\b/.test(d)));
      if (!revocaAnon) {
        lista.push(fallo({
          que: `${nombre} no revoca EXECUTE de anon`,
          donde: "supabase/migrations/",
          porque: "El `alter default privileges` del proyecto ya se lo concedió a anon. `revoke ... from public` no lo deshace: cualquiera sin sesión podría abrir o revocar enlaces de aprobación.",
          arreglo: `revoke all on function public.${nombre}(...) from public, anon;`,
        }));
      }
    }
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("ninguna función de trigger queda expuesta en la API REST", () => {
    const triggers = FUNCIONES.filter((f) => /returns\s+trigger/i.test(f.cabecera));
    const revs = revocaciones();
    const sin = triggers.filter((f) => {
      const suya = revs.filter((r) => r.funcion === f.nombre);
      return !suya.some((r) => r.de.some((d) => /anon/.test(d)) && r.de.some((d) => /authenticated/.test(d)));
    });
    const lista = sin.map((f) => fallo({
      que: `la función de trigger ${f.nombre} es invocable por la API`,
      donde: f.archivo,
      porque: "PostgREST publica toda función de public: una función de trigger llamada a mano corre fuera del contexto para el que se escribió.",
      arreglo: `revoke all on function public.${f.nombre}() from public, anon, authenticated;`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("las funciones públicas por token validan el token antes de tocar nada", () => {
    // `get_shared_calendar`, `submit_approval` y `update_post_content` son
    // las tres que anon puede llamar. Un token corto no puede ser válido y
    // se corta antes de llegar a la tabla.
    const publicas = concesiones().filter((c) => c.a.some((r) => /anon/.test(r))).map((c) => c.funcion);
    const lista = [];
    for (const nombre of [...new Set(publicas)]) {
      const f = FUNCIONES.filter((x) => x.nombre === nombre).pop();
      if (!f) continue;
      if (!/length\(\s*p_token\s*\)\s*<\s*\d+/i.test(f.cuerpo)) {
        lista.push(fallo({
          que: `${nombre} no comprueba la longitud del token`,
          donde: f.archivo,
          porque: "Sin ese corte, cada intento a ciegas ejecuta una consulta sobre calendars: sale gratis sondear el enlace.",
          arreglo: "Empieza el cuerpo con `if p_token is null or length(p_token) < 24 then ...`.",
        }));
      }
      if (!/share_enabled/.test(f.cuerpo) || !/share_expires_at/.test(f.cuerpo)) {
        lista.push(fallo({
          que: `${nombre} no respeta la revocación o la caducidad del enlace`,
          donde: f.archivo,
          porque: "Un enlace revocado que sigue respondiendo es un enlace que no se puede revocar.",
          arreglo: "Filtra por `cal.share_enabled and (cal.share_expires_at is null or cal.share_expires_at > now())`.",
        }));
      }
    }
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("el token del enlace lo genera la base de datos, nunca el navegador", () => {
    const share = FUNCIONES.filter((f) => f.nombre === "share_calendar").pop();
    expect(share, "no existe share_calendar").toBeTruthy();
    expect(
      share.cuerpo,
      fallo({
        que: "share_calendar no genera el token con gen_random_bytes",
        donde: share.archivo,
        porque: "Un token elegido fuera de la base de datos es un token adivinable, y el enlace de aprobación es todo lo que protege el calendario.",
        arreglo: "v_token := encode(extensions.gen_random_bytes(24), 'hex');",
      }),
    ).toMatch(/gen_random_bytes\(\s*(\d+)\s*\)/);
    const bytes = Number(share.cuerpo.match(/gen_random_bytes\(\s*(\d+)\s*\)/)[1]);
    expect(bytes, "el token tiene menos de 24 bytes de entropía").toBeGreaterThanOrEqual(24);
  });

  it("las entradas del cliente final llegan acotadas a la tabla", () => {
    const submit = FUNCIONES.filter((f) => f.nombre === "submit_approval").pop();
    expect(submit).toBeTruthy();
    expect(submit.cuerpo, "submit_approval no acota el texto que inserta").toMatch(/left\(/);
    expect(
      submit.cuerpo,
      fallo({
        que: "submit_approval no comprueba que la publicación pertenezca al calendario",
        donde: submit.archivo,
        porque: "Sin eso, cualquiera con el enlace siembra filas para identificadores que no existen.",
        arreglo: "Comprueba con jsonb_array_elements que el p_post_id está en days o en visual_references.",
      }),
    ).toMatch(/no pertenece a este calendario/);
  });
});

describe("orden y forma de las migraciones", () => {
  it("cada migración tiene una marca de tiempo única y ordenable", () => {
    const nombres = esquema().map((m) => m.archivo.split("/").pop());
    const marcas = nombres.map((n) => n.match(/^(\d{14})_/)?.[1]);
    expect(marcas.filter(Boolean), `alguna migración no empieza por 14 dígitos: ${nombres.join(", ")}`)
      .toHaveLength(nombres.length);
    expect(new Set(marcas).size, "hay dos migraciones con la misma marca de tiempo").toBe(marcas.length);
    expect([...marcas].sort(), "los nombres no ordenan igual que las marcas").toEqual(marcas);
  });

  it("ninguna migración destruye datos sin decirlo", () => {
    const peligrosas = [];
    for (const { archivo, sql } of esquema()) {
      for (const m of sql.matchAll(/\b(drop\s+table|truncate)\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
        peligrosas.push(`${archivo}: ${m[1]} ${m[2]}`);
      }
    }
    expect(
      peligrosas,
      fallo({
        que: "una migración borra tablas o datos",
        donde: peligrosas.join(", "),
        porque: "Las migraciones se aplican sobre producción: un drop aquí es pérdida de datos del cliente, sin vuelta atrás.",
        arreglo: "Si de verdad hace falta, hazlo en una migración aparte y anótalo en DEPLOY.md antes de aplicarla.",
      }),
    ).toEqual([]);
  });

  it("las tablas que la agencia consulta se crean con su índice de acceso", () => {
    // clients y calendars se leen enteras al arrancar, filtradas por RLS
    // sobre owner_id: sin índice, cada carga del panel escanea la tabla.
    const idx = indices();
    for (const tabla of ["clients", "calendars"]) {
      expect(
        idx.some((i) => i.tabla === tabla && i.columnas.includes("owner_id")),
        fallo({
          que: `${tabla} no tiene índice por owner_id`,
          donde: "supabase/migrations/",
          porque: "Es la columna por la que filtra RLS en cada consulta del panel.",
          arreglo: `create index if not exists ${tabla}_owner_id_idx on public.${tabla} (owner_id);`,
        }),
      ).toBe(true);
    }
  });
});
