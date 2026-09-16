# Utillaje de la migración a Cloudflare

Tres piezas, en este orden. El plan completo está en
[`docs/migracion-cloudflare.md`](../../docs/migracion-cloudflare.md).

| Fichero | Qué hace | Toca producción |
|---|---|---|
| `volcar.mjs` | Supabase → `datos/*.json` | **No**: sólo lee |
| `convertir.js` | Postgres → D1, puro y probado | No: no hace red |
| `importar.mjs` | `datos/` → D1 + R2 | Sí, salvo con `--ensayo` |

`datos/` está en `.gitignore`. Son clientes reales —nombres, teléfonos,
ADN de marca, logos— y no tienen por qué quedarse en el historial del
repositorio para siempre.

## 1. Volcar

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/migracion/volcar.mjs
```

Deja `datos/*.json` y un `recuentos.json` que es lo que se coteja al
final. Las contraseñas no viajan: en Cloudflare se rehacen con PBKDF2
en la fase 2.

## 2. Ensayar

```bash
node scripts/migracion/importar.mjs --ensayo
```

Convierte, mide y avisa sin escribir nada. Lo que hay que mirar:

- que ningún calendario supere el techo de **2.000.000 bytes** de D1;
- cuántas imágenes saldrían del JSON hacia R2 y cuánto pesan;
- que los recuentos coincidan con `recuentos.json`.

## 3. Importar

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_API_TOKEN=... \
D1_DATABASE_ID=... \
R2_BUCKET=juancito-contenido \
node scripts/migracion/importar.mjs
```

## Lo que ya está comprobado contra una D1 real

No es teoría: se probó sobre `calendarios-db` antes de escribir esto.

| Comprobación | Resultado |
|---|---|
| Un `days` de 500.036 bytes | Entra, `json_valid` = 1, `json_extract` navega dentro |
| Clave ajena inexistente | `FOREIGN KEY constraint failed` — **D1 las aplica** |
| `days` que no es JSON | `CHECK constraint failed: json_valid(days)` |
| `month = 12` | `CHECK constraint failed: month between 0 and 11` |
| Upsert `(calendar_id, post_id)` dos veces | Una fila, gana el último estado |

De ahí salen las dos reglas del importador: **parámetros ligados
siempre** (la sentencia se corta a 100 kB, el valor no) y **orden de
inserción** (`users` → `clients` → `calendars` → el resto).

## Por qué `convertir.js` está separado y probado

Es donde se pierden datos sin que falle nada:

- un `null` de Postgres que llega como la cadena `"null"`;
- un `jsonb` serializado dos veces —`'"[1,2]"'`—, que `json_valid()`
  da por bueno;
- una publicación reescrita entera a la que se le cae el guion;
- una referencia visual que es **un enlace externo** (`type: "link"`) y
  se convierte en clave de R2, apuntando a un objeto que no existe.

Los cuatro tienen su caso en `tests/migracion/convertir.test.js`, que
corre con `npm test` sin necesitar red ni llaves.
