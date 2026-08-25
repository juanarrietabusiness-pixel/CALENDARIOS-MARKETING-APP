# Despliegue: Netlify + Supabase

Guía para poner la aplicación en producción.

**Estado del repositorio:** el esquema, las funciones y la aplicación están
listos. No hay que escribir código: sólo conectar cuentas y pegar claves.

---

## 0. Cómo está repartido

```
NAVEGADOR (agencia)              SUPABASE                    NETLIFY
──────────────────               ────────                    ───────
Login ─────────────────────────▶ Auth
Clientes y calendarios ────────▶ Postgres + RLS
Aprobaciones en vivo ◀─────────  Realtime
Generar contenido ─────────────▶ Edge Function `ai`
Leer ADN ──────────────────────▶ Edge Function `github-adn`
                                                             Sitio estático
Alta del administrador ────────────────────────────────────▶ /api/admin-seed

NAVEGADOR (cliente final)
─────────────────
/aprobar?t=<token> ────────────▶ get_shared_calendar / submit_approval
```

**Por qué la IA está en Supabase y no en Netlify.** Netlify corta las
peticiones a los 10 s (26 s en Pro, bajo petición). Un lote de 6
publicaciones con Anthropic tarda unos 40 s, así que se cortaría siempre.
Supabase da 150 s en el plan gratuito, y su límite de 2 s de CPU no aplica
porque esperar al proveedor es E/S asíncrona, no cálculo.

---

## 1. Supabase — ya está hecho

El proyecto **Calendario APP** (`lwkepnrprcyabyhhorrc`) tiene aplicadas las
migraciones de `supabase/migrations/` y desplegadas las dos Edge Functions.

Si partes de un proyecto nuevo:

```bash
npx supabase link --project-ref TU_REF
npx supabase db push
npx supabase functions deploy ai
npx supabase functions deploy github-adn
```

**Comprobación:** en *Table editor* deben verse `clients`, `calendars` y
`approvals`, las tres con «RLS enabled». Si alguna aparece sin RLS, **no
sigas**: cualquiera con la clave anónima podría leer todos los clientes.

### 1.1 Cerrar el registro público

*Authentication → Sign In / Providers → Email* y desactiva
**«Allow new users to sign up»**. La única cuenta debe ser la de la agencia;
si no, cualquiera podría registrarse (aunque RLS le mostraría un panel
vacío, no hay motivo para permitirlo).

### 1.2 Secretos de las Edge Functions

*Project Settings → Edge Functions → Secrets*:

| Secreto | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu clave de Anthropic |
| `GROQ_API_KEY` | tu clave de Groq (opcional si usas Anthropic) |
| `AI_PROVIDER` | `anthropic` o `groq` |
| `GITHUB_TOKEN` | token de sólo lectura para el ADN |
| `AI_MODEL_CALIDAD` | modelo del prompt maestro (opcional) |
| `ALLOWED_ORIGINS` | la URL final del sitio, cuando la tengas |

`AI_MODEL` es opcional: por defecto `claude-haiku-4-5-20251001`, rápido y
barato para generar en lote. Para textos más cuidados en español, ponlo a
`claude-sonnet-5`.

`AI_MODEL_CALIDAD` es el modelo del prompt maestro de Meta AI y de la
compilación de la receta del cliente. Por defecto `claude-sonnet-5`. No
comparte valor con `AI_MODEL` a propósito: los lotes de guiones son muchos y
cortos, y el prompt maestro es uno al mes con los cortes de línea del titular
y la verificación de que ninguna cifra se sale del ADN.

### Sobre `GITHUB_TOKEN`

**No cambia lo que se lee** — un token autenticado devuelve el mismo contenido
que uno anónimo. Lo que cambia es el límite: GitHub da **60 peticiones por hora
y por IP** sin autenticar, y las Edge Functions de Supabase salen por IPs
compartidas, así que ese cupo se agota con lo que gasten otros proyectos. Cada
lectura de ADN cuesta unas 10 peticiones. Con token son 5000 por hora.

**Usa un fine-grained token con el permiso mínimo: repositorios públicos, sólo
lectura.** No uno clásico con scope `repo`, que concede escritura sobre todo.
`github-adn` acepta cualquier URL de repositorio que le pase un usuario
autenticado de la agencia: con un token de sólo-lectura-pública el alcance de
eso es nulo, con uno amplio le estarías dando a la función más poder del que
necesita.

Si alguna carpeta de cliente pasa a privada, hay que ampliar el token a ese
repositorio en concreto, no a todos.

---

## 2. Netlify

El sitio ya está creado:

| | |
|---|---|
| Proyecto | **calendarioapp-juancito** |
| URL | `https://calendarioapp-juancito.netlify.app` |
| Site ID | `f2cf94be-9970-45a4-95f3-2a4dd99f3e9b` |
| Panel | https://app.netlify.com/projects/calendarioapp-juancito |

`calendarioapp` a secas ya estaba ocupado: los subdominios de Netlify son
únicos en toda la plataforma. Con un dominio propio el subdominio deja de
verse.

> **Ojo:** el sitio `juancitoads` de la misma cuenta es otra cosa — la web
> pública de la agencia (repositorio `PAGINA-JUANCITO-ADS`, en Astro). No lo
> toques.

### 2.1 Conectar el repositorio

Esto hay que hacerlo desde la interfaz: requiere autorizar la aplicación de
GitHub, y no se puede automatizar desde fuera.

*Project configuration → Build & deploy → Continuous deployment → Link
repository* → GitHub → `juanarrietabusiness-pixel/CALENDARIOS-MARKETING-APP`,
rama de producción `main`.

No hay que rellenar el comando ni la carpeta: los toma de `netlify.toml`
(`npm run build`, `dist`, funciones en `netlify/functions`).

### 2.2 Variables de entorno

*Site configuration → Environment variables*. Ya están creadas; las dos
públicas de Supabase con su valor real y el resto con un marcador
`PENDIENTE-…` que hay que sustituir:

| Variable | Valor | Ámbito | Estado |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `https://lwkepnrprcyabyhhorrc.supabase.co` | **Builds** | ✅ puesto |
| `VITE_SUPABASE_ANON_KEY` | clave `anon` / publicable | **Builds** | ✅ puesto |
| `SUPABASE_URL` | la misma URL | Functions | ✅ puesto |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role` | Functions | ⬜ pegar |
| `ADMIN_EMAIL` | tu correo de acceso | Functions | ⬜ pegar |
| `ADMIN_PASSWORD` | tu contraseña (mínimo 12 caracteres) | Functions | ⬜ pegar |
| `ADMIN_SEED_TOKEN` | `openssl rand -hex 32` | Functions | ⬜ pegar |

`SUPABASE_SERVICE_ROLE_KEY` y `ADMIN_PASSWORD` están marcadas como secretas:
se pueden escribir pero no volver a leer, y Netlify aborta el build si su
valor apareciera en los archivos publicados.

> ⚠️ **Las dos `VITE_` tienen que estar disponibles en el build.** Si faltan,
> la aplicación se compila **sin el panel**: el código queda como rama muerta
> y rollup lo elimina, y el sitio sólo muestra un aviso de configuración. Se
> nota en el tamaño del bundle — con panel pesa unos 380 kB, sin él 127 kB.

> ⚠️ **Sólo `VITE_` llega al navegador.** La `service_role`, las claves de IA
> y `ADMIN_PASSWORD` **nunca** deben llevar ese prefijo.

Tras añadirlas hay que **volver a desplegar** para que el build las recoja.

### 2.2 Cerrar el círculo del CORS

Con la URL definitiva del sitio, vuelve a Supabase y pon `ALLOWED_ORIGINS`
con ese valor.

---

## 3. Crear el administrador

Una sola vez, con el sitio ya desplegado:

```bash
curl -X POST https://calendarioapp-juancito.netlify.app/api/admin-seed \
  -H "x-seed-token: EL_VALOR_DE_ADMIN_SEED_TOKEN"
```

Respuesta esperada: `{"ok":true,"creado":true,"email":"…"}`.

Es idempotente: si vuelves a lanzarlo, actualiza la contraseña al valor
actual de `ADMIN_PASSWORD`. Sirve también para recuperar el acceso si la
olvidas.

**Cuando termines, borra `ADMIN_SEED_TOKEN` de Netlify.** Sin esa variable
la función se desactiva sola.

> Alternativa sin curl: *Supabase → Authentication → Add user*, con
> «Auto Confirm User» marcado.

---

## 4. Comprobar que funciona

1. Abre el sitio: debe pedir correo y contraseña. Si en su lugar ves un
   aviso de configuración, faltan las variables `VITE_` en el build.
2. Entra con tus credenciales.
3. Crea un cliente y un calendario. Recarga: deben seguir ahí.
4. Ábrelo en **otro navegador** con la misma cuenta: deben aparecer también.
   Eso confirma que ya no dependes de un solo dispositivo.
5. Genera contenido con IA. En la pestaña **Red** del inspector, la llamada
   debe ir a `…supabase.co/functions/v1/ai` y **nunca** a `api.anthropic.com`.
6. Pulsa **Enviar** → se genera el enlace `…/aprobar?t=…`.
7. Abre ese enlace en una ventana privada: debe verse el calendario y dejar
   aprobar. **Deja las dos ventanas abiertas.**
8. Aprueba algo desde la ventana privada. El panel de la agencia debe
   actualizarse **solo, sin recargar**. Eso es Realtime funcionando.
9. Revoca el enlace desde el panel y recarga la ventana privada: debe decir
   que el enlace es inválido.

---

## 5. Notas de seguridad

- **El enlace de aprobación no lleva contraseña.** Quien lo tenga puede ver y
  responder ese calendario, y sólo ése. Es intencionado: el cliente no debe
  crear cuenta. El token son 24 bytes al azar, así que no se adivina, pero
  conviene saberlo antes de publicarlo en un canal abierto. Se puede revocar
  en cualquier momento desde el panel.
- **Rota las claves de IA que hayas usado antes.** Estuvieron en el navegador
  y en el `localStorage` de cualquier equipo donde se abriera la aplicación.
- **Los datos locales no se borran** al migrar: siguen en `localStorage` bajo
  `jads-data` como red de seguridad. Bórralos a mano cuando compruebes que
  todo está en la nube.
- Las imágenes viajan en base64 dentro de `calendars.days`. Funciona, pero
  para volumen alto lo correcto sería Supabase Storage. Queda pendiente.
