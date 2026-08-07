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
- **Aprobación del cliente**: se genera un enlace que el cliente abre en su
  móvil para aprobar o pedir cambios, y las respuestas vuelven a la aplicación.
- **Exportación** a HTML autónomo, PDF (impresión) y copia de seguridad JSON.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre http://localhost:5173.

No hace falta configurar nada para empezar: los datos se guardan en el
navegador. La generación con IA requiere una clave propia de
[Groq](https://console.groq.com/keys) o
[Anthropic](https://console.anthropic.com), que se introduce en ⚙️ dentro de la
aplicación.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para comprobar el build |
| `npm run lint` | Análisis estático con oxlint |

## Despliegue

Ver **[DEPLOY.md](DEPLOY.md)** para el procedimiento completo con Netlify y
Supabase, incluida la configuración de los servidores MCP.

Resumen: el repositorio se conecta a Netlify y se despliega con la
configuración de `netlify.toml` sin tocar nada. Supabase es opcional y añade
persistencia real; su esquema está en `supabase/migrations/`.

## Documentación

| Documento | Contenido |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Netlify, Supabase, variables de entorno, MCP |
| [docs/auditoria-ux-ui.md](docs/auditoria-ux-ui.md) | Auditoría de UX, responsive y accesibilidad |
| [docs/auditoria-visual.md](docs/auditoria-visual.md) | Auditoría visual y plan de rediseño (jerarquía, iconos, densidad) |
| [CLAUDE.md](CLAUDE.md) | Convenciones del código y arquitectura |
| [docs/ejemplo-estructura/](docs/ejemplo-estructura/) | Cómo organizar el repositorio de ADN de clientes |

## Stack

React 19 · Vite 8 · Funciones de Netlify · Supabase (opcional) · sin framework
de CSS: sistema de diseño propio en `src/index.css`.

## Privacidad y claves

La clave de IA y los tokens de GitHub se guardan **en el navegador de cada
usuario**, no en un servidor. Eso significa que quien tenga acceso al
dispositivo puede leerlos, y que los tokens de GitHub viajan dentro del archivo
de copia de seguridad que exportes. Usa claves con límite de gasto y tokens de
sólo lectura. El detalle y las alternativas están en la auditoría.
