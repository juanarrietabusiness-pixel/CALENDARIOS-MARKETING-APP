# Despliegue: Netlify + Supabase

Guía para poner la aplicación en producción. Está escrita para hacerse
conversando con Claude a través de los MCP de Netlify y Supabase, pero cada
paso incluye también la alternativa manual.

**Estado actual del repositorio:** todo lo que sigue está ya preparado. No hay
que escribir código para desplegar; sólo conectar cuentas y pegar variables.

---

## 0. Antes de empezar

Necesitas tres cosas:

| Qué | Dónde se consigue |
|---|---|
| Cuenta de Netlify | netlify.com |
| Proyecto de Supabase | supabase.com → New project |
| Tokens de acceso para los MCP | ver paso 1 |

La aplicación **funciona sin Supabase**: los datos se guardan en el navegador
(`localStorage`). Supabase añade persistencia real, acceso desde varios
dispositivos y aprobaciones fiables. Puedes desplegar primero en Netlify y
conectar Supabase después.

---

## 1. Conectar los MCP

El repositorio incluye `.mcp.json` con los dos servidores ya declarados.
Sólo hay que exportar los tokens antes de abrir Claude Code:

```bash
# Netlify → User settings → Applications → Personal access tokens
export NETLIFY_AUTH_TOKEN="nfp_..."

# Supabase → Account → Access Tokens
export SUPABASE_ACCESS_TOKEN="sbp_..."

# El "Project ref": lo ves en la URL del proyecto
# https://supabase.com/dashboard/project/AQUI_VA_EL_REF
export SUPABASE_PROJECT_REF="abcdefghijklmnop"
```

Al abrir Claude Code en el repositorio, pedirá aprobación para los servidores.
Compruébalo con `/mcp`.

> El MCP de Supabase está declarado **en modo sólo lectura** (`--read-only`).
> Es lo correcto para el día a día: Claude puede inspeccionar el esquema y
> consultar datos, pero no puede borrar tablas por error. Para aplicar las
> migraciones del paso 2 usa el CLI o quita esa bandera a conciencia.

---

## 2. Crear el esquema en Supabase

La migración está en `supabase/migrations/20260101000000_init.sql`. Crea tres
tablas (`clients`, `calendars`, `approvals`), activa RLS en todas y define una
función `get_shared_calendar` para la página pública de aprobación.

**Con el CLI** (recomendado, deja historial de migraciones):

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push
```

**Desde el panel:** copia el contenido del archivo en
*SQL Editor → New query* y ejecútalo. Es idempotente (`if not exists`,
`drop policy if exists`), así que se puede volver a lanzar sin romper nada.

**Verificación:** en *Table editor* deben aparecer las tres tablas, y en
*Authentication → Policies* cada una debe mostrar «RLS enabled».
Si alguna aparece sin RLS, **no sigas**: cualquiera con la clave anónima
podría leer todos los clientes.

---

## 3. Desplegar en Netlify

**Con el MCP**, pídele a Claude algo como:

> Crea un sitio en Netlify a partir de este repositorio, con la rama `main`
> como rama de producción, y despliégalo.

**Manualmente:** *Add new site → Import an existing project → GitHub* y elige
este repositorio. La configuración de build ya viene en `netlify.toml`:

- Comando: `npm run build`
- Carpeta publicada: `dist`
- Funciones: `netlify/functions`

No hace falta tocar nada en la interfaz.

---

## 4. Variables de entorno

En *Site configuration → Environment variables* (o pidiéndoselo al MCP de
Netlify). Los valores están en Supabase → *Project Settings → API*:

| Variable | Valor | Ámbito |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | Navegador |
| `VITE_SUPABASE_ANON_KEY` | Clave `anon` / `public` | Navegador |
| `SUPABASE_URL` | El mismo Project URL | Servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` | Servidor |

⚠️ **La regla que no se puede romper:** todo lo que empieza por `VITE_` se
incrusta en el JavaScript que descarga el navegador. La clave `service_role`
ignora RLS y da acceso total al proyecto: **nunca** debe llevar el prefijo
`VITE_`. Si se filtra, revócala inmediatamente en Supabase.

Tras añadirlas hay que **volver a desplegar** para que el build las recoja.

---

## 5. Comprobar que funciona

1. Abre el sitio. Debe cargar sin errores en consola.
2. Crea un cliente y un calendario.
3. Pulsa **🔗 Enviar** → se genera el enlace de aprobación.
4. Abre ese enlace en una ventana privada: debe verse el calendario y permitir
   aprobar. Si dice «Enlace inválido o caducado», la función no está
   guardando: revisa los registros en *Netlify → Functions → approval*.
5. Vuelve a la aplicación y pulsa **Sincronizar**: deben aparecer las
   respuestas.

---

## 6. Lo que queda pendiente (decisión del propietario)

El esquema, el cliente de Supabase (`src/lib/supabase.js`) y los conversores
entre formatos están listos, pero **la aplicación sigue leyendo y escribiendo
en `localStorage`**. Completar la migración requiere dos decisiones que no se
pueden tomar sin ti:

1. **Autenticación.** ¿Cómo entran los usuarios? Supabase ofrece enlace mágico
   por correo, contraseña, o proveedores (Google…). Sin `auth.uid()` las
   políticas RLS del esquema no dejan escribir nada, que es justo lo que se
   busca.

2. **Qué pasa con los datos que ya existen** en el navegador de quien ya usa
   la aplicación: importarlos al iniciar sesión por primera vez, o empezar de
   cero.

Cuando las tengas decididas, el trabajo restante es: añadir la pantalla de
inicio de sesión, sustituir las llamadas a `lsGet`/`lsSet` de `App.jsx` por
consultas a Supabase usando los conversores ya escritos, y añadir un indicador
de sincronización. La función de aprobación ya usa Supabase cuando está
configurada, así que esa parte no hay que tocarla.

Mientras tanto el sistema es coherente: los datos de trabajo viven en el
navegador y se respaldan con **Exportar** (menú ☰ → Copia de seguridad).

---

## Notas de seguridad conocidas

Ver `docs/auditoria-ux-ui.md` para el detalle. En resumen:

- **La clave de IA se guarda en el navegador** y las llamadas salen desde él.
  Quien tenga acceso al dispositivo puede leerla. Usa claves con límite de
  gasto. Moverlo a una función de Netlify es la solución definitiva.
- **El token de GitHub por cliente** se guarda igual y además se incluye en el
  JSON exportado. Usa tokens de sólo lectura.
- **El enlace de aprobación no lleva contraseña**: quien lo tenga puede ver y
  responder ese calendario. Es intencionado (el cliente no debe crear cuenta),
  pero conviene saberlo antes de compartirlo por canales públicos.
- `npm audit` reporta un aviso de severidad alta en `image-size`, dependencia
  transitiva de `@netlify/blobs`. Afecta a analizadores de imagen ICNS/JXL/HEIF
  que este proyecto nunca invoca. Se resolverá cuando Netlify publique la
  actualización; forzar el arreglo degradaría `@netlify/blobs` a una versión
  incompatible.
