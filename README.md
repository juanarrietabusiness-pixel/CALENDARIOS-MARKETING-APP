# Calendarios de Marketing — Juancito Ads

Aplicación web para planificar, generar y aprobar calendarios de contenido de
redes sociales para clientes de una agencia.

## Qué hace

- **Ficha de cliente** con su ADN de marca: descripción, valores, audiencia,
  competencia, estilo de guiones y de locución, hashtags y colores. Puede
  rellenarse automáticamente leyendo un repositorio de GitHub.
- **Asistente de 7 pasos** para montar el calendario del mes: plan de
  publicaciones, fechas señaladas, campaña, conceptos semanales, categorías por
  día, vídeos de referencia e ideas.
- **Generación de contenido con IA** (Anthropic o Groq) por lotes o publicación
  a publicación: guion, descripción y hashtags según el formato.
- **Dos vistas**: lista por días y rejilla mensual, con arrastrar y soltar,
  filtros y banco de ideas reutilizables.
- **Aprobación del cliente**: se genera un enlace de sólo lectura que el
  cliente abre en su móvil para aprobar o pedir cambios. Sus respuestas
  aparecen en el panel **en vivo**, sin recargar ni sincronizar nada. El
  enlace se puede revocar y reactivar cuando quieras.
- **Exportación** a HTML autónomo, PDF (impresión) y copia de seguridad JSON.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre http://localhost:5173.

Hace falta un proyecto de Supabase: la aplicación guarda ahí los clientes y
los calendarios, y el acceso está detrás de un inicio de sesión. Copia
`.env.example` a `.env` y rellena `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY`. Sin ellas el sitio arranca, pero sólo muestra un
aviso de configuración.

Las claves de IA no se ponen aquí ni en la aplicación: viven en los secretos
de Supabase. Ver [DEPLOY.md](DEPLOY.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para comprobar el build |
| `npm run lint` | Análisis estático con oxlint |

## Despliegue

Ver **[DEPLOY.md](DEPLOY.md)** para el procedimiento completo.

Resumen: el sitio y la función de alta del administrador van en Netlify; la
base de datos, la autenticación y las funciones de IA, en Supabase. La IA está
en Supabase porque Netlify corta las peticiones a los 10 s y generar un lote
de publicaciones tarda unos 40 s.

## Documentación

| Documento | Contenido |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Netlify, Supabase, variables de entorno, MCP |
| [docs/auditoria-ux-ui.md](docs/auditoria-ux-ui.md) | Auditoría de UX, responsive y accesibilidad |
| [docs/auditoria-visual.md](docs/auditoria-visual.md) | Auditoría visual y plan de rediseño (jerarquía, iconos, densidad) |
| [CLAUDE.md](CLAUDE.md) | Convenciones del código y arquitectura |
| [docs/ejemplo-estructura/](docs/ejemplo-estructura/) | Cómo organizar el repositorio de ADN de clientes |

## Stack

React 19 · Vite 8 · Supabase (Postgres, Auth, Realtime, Edge Functions) ·
Funciones de Netlify · sin framework de CSS: sistema de diseño propio en
`src/index.css`.

## Privacidad y claves

**Ninguna clave llega al navegador.** Las de IA y la de GitHub están en los
secretos de Supabase y sólo las usan las funciones del servidor; las
credenciales del administrador, en las variables de Netlify. Lo único que se
incrusta en el bundle es la URL del proyecto y la clave anónima de Supabase,
que son públicas por diseño y están respaldadas por políticas RLS.

El enlace que se comparte con el cliente lleva un token de 24 bytes al azar,
sólo da acceso a ese calendario y se puede revocar en cualquier momento.
