# Puesta en producción — Cloudflare

Un solo Worker sirve la aplicación y la API en el mismo origen. Los datos
viven en D1 y las imágenes en R2.

El plan completo de la migración, con lo medido y lo que costó, está en
[`docs/migracion-cloudflare.md`](docs/migracion-cloudflare.md).

---

## Lo que hay que tener

| Recurso | Nombre | Para qué |
|---|---|---|
| Worker | `calendarios` | La aplicación y la API |
| D1 | `calendarios-db` | Clientes, calendarios, aprobaciones, tareas |
| R2 | `juancito-contenido` | Logos, imágenes de publicación, banco |

**Workers Paid** ($5/mes). No es por el precio: el plan gratuito da 10 ms de
CPU por invocación y 50 consultas de D1, y aquí se serializan objetos de
medio mega.

---

## 1. Crear los recursos

```bash
npx wrangler d1 create calendarios-db
npx wrangler r2 bucket create juancito-contenido
```

El `database_id` que devuelve el primero va a `wrangler.jsonc`. Si no
coincide, el Worker despliega bien y falla en la primera consulta.

## 2. Aplicar el esquema

```bash
npx wrangler d1 migrations apply calendarios-db --remote
```

El esquema está en `migraciones/d1/`. Sale de la **introspección de la base
que había en producción**, no de reproducir el SQL antiguo: los dos no
coincidían.

## 3. Poner los secretos

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GROQ_API_KEY      # opcional
```

Nunca en `wrangler.jsonc`: ese fichero se versiona. Lo que sí va en sus
`vars` son nombres de modelo y políticas, que no abren nada.

## 4. Dar de alta al administrador

```bash
ADMIN_EMAIL=tu@correo ADMIN_PASSWORD=unaContraseñaLarga npm run sembrar
```

Es idempotente: si el usuario ya existe, le pone la contraseña actual. Sirve
para el alta y para recuperar el acceso.

**No es un endpoint.** Antes lo era —`/api/admin-seed`, protegido con un
token— y por eso hacía falta protegerlo: un endpoint que crea
administradores y queda abierto por un despiste entrega el panel entero.
Ahora corre en local contra `wrangler` y no hay nada expuesto.

La contraseña se guarda como PBKDF2-SHA256 con 210.000 iteraciones. Si
cambias ese número en `worker/lib/sesion.js`, cámbialo también en
`scripts/sembrar-admin.mjs`: si divergen, nadie entra.

## 5. Desplegar

```bash
npm run deploy
```

O por CI: un push a `main` dispara `.github/workflows/desplegar.yml`, que
necesita dos secretos del repositorio:

- `CLOUDFLARE_API_TOKEN` — con permiso para editar Workers, D1 y R2
- `CLOUDFLARE_ACCOUNT_ID`

El workflow aplica las migraciones **antes** que el código. Al revés, el
Worker nuevo pide columnas que la base todavía no tiene.

## 6. Comprobar que llegó

```bash
SITIO_URL=https://tu-dominio npm run test:infra
```

Comprueba lo que no se ve mirando la pantalla: que las cabeceras de
seguridad lleguen de verdad, que la CSP publicada no deje hablar con
Supabase ni con ningún proveedor de IA, que `/api/yo` responda **401 y no
404** —un 404 ahí significa que el Worker no atiende `/api/*` y toda la API
está muerta aunque el sitio se vea—, y que no haya Workers desplegados que
nadie declara.

---

## Migrar los datos desde Supabase

Si vienes del despliegue anterior, el utillaje está en
[`scripts/migracion/`](scripts/migracion/README.md):

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/migracion/volcar.mjs
node scripts/migracion/importar.mjs --ensayo     # convierte y mide, no escribe
node scripts/migracion/importar.mjs              # de verdad
```

Dos cosas que el importador hace y no son opcionales: **parámetros ligados
siempre** —D1 corta la sentencia a 100 kB y un calendario ocupaba cinco
veces eso— y **orden de inserción**, porque D1 aplica las claves ajenas.

Los testigos de compartición se migran tal cual. Si se regeneraran, todos
los enlaces que los clientes ya tienen en su correo dejarían de abrirse.

---

## Desarrollo en local

```bash
npm run dev          # sólo la interfaz; /api/* no va a ninguna parte
npm run dev:worker   # aplicación + API sobre el runtime real, con D1 y R2 locales
```

Para sembrar el administrador en la base local: `npm run sembrar -- --local`.

---

## Marcha atrás

Mientras el DNS no apunte al Worker, el despliegue anterior sigue siendo la
producción y esto es un ensayo. Después del DNS, la vuelta cuesta lo que se
haya escrito desde el corte.

El proyecto de Supabase se deja **pausado, no borrado**, un mes: uno pausado
conserva los datos; uno borrado, no.
