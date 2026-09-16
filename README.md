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

`npm run dev` sirve **sólo la interfaz**: las llamadas a `/api/*` no van a
ninguna parte. Para trabajar contra la API de verdad:

```bash
npm run dev:worker
```

que levanta el Worker con D1 y R2 en local. El navegador no necesita
ninguna variable de entorno: la API vive en el mismo origen.

Las claves de IA no se ponen aquí ni en la aplicación: son secretos del
Worker. Ver [DEPLOY.md](DEPLOY.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Sólo la interfaz, con recarga en caliente |
| `npm run dev:worker` | Aplicación + API sobre el runtime real |
| `npm run build` | Build de producción en `dist/` |
| `npm run deploy` | Build y despliegue a Cloudflare |
| `npm run sembrar` | Alta del administrador |
| `npm run lint` | Análisis estático con oxlint |
| `npm run verificar` | Lint + tests + build + bundle (lo mismo que CI) |

## Despliegue

Ver **[DEPLOY.md](DEPLOY.md)** para el procedimiento completo.

Resumen: **un solo Worker** sirve la aplicación y la API en el mismo origen.
Los datos en D1, las imágenes en R2, las claves como secretos del Worker.

Se publica **a través de GitHub Actions**, no conectando Cloudflare al
repositorio: esa integración despliega en cada push sin pasar por los
tests, y bastaría un merge a medias para que llegara a producción. El job
de despliegue corre `npm run verificar` entero antes de publicar.

Generar un lote de publicaciones tarda unos 40 s. Antes eso obligaba a
repartir el despliegue —Netlify cortaba a los 10 s, así que la IA vivía en
Supabase—; en Workers el reloj no tiene límite mientras el cliente siga
conectado, y los cinco minutos son de CPU, que esperar a Anthropic no
consume.

## Documentación

| Documento | Contenido |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Cloudflare: Worker, D1, R2, secretos y el corte |
| [docs/migracion-cloudflare.md](docs/migracion-cloudflare.md) | Cómo se migró desde Supabase + Netlify, y qué se midió |
| [docs/hub-cloudflare.md](docs/hub-cloudflare.md) | El hub donde este calendario es una herramienta más |
| [docs/auditoria-ux-ui.md](docs/auditoria-ux-ui.md) | Auditoría de UX, responsive y accesibilidad |
| [docs/auditoria-visual.md](docs/auditoria-visual.md) | Auditoría visual y plan de rediseño (jerarquía, iconos, densidad) |
| [CLAUDE.md](CLAUDE.md) | Convenciones del código y arquitectura |
| [docs/ejemplo-estructura/](docs/ejemplo-estructura/) | Cómo organizar el repositorio de ADN de clientes |

## Stack

React 19 · Vite 8 · Cloudflare Workers (D1, R2, Static Assets) · sin
dependencias de cliente más allá de React: la API se llama con `fetch` ·
sin framework de CSS: sistema de diseño propio en `src/index.css`.

## Privacidad y claves

**Ninguna clave llega al navegador, y ahora tampoco ninguna variable.** Las
de IA y la de GitHub son secretos del Worker y sólo las usa el servidor. El
bundle no incrusta nada configurable: la API vive en el mismo origen, así
que la CSP puede quedarse en `connect-src 'self'` a secas.

La sesión va en una cookie con prefijo `__Host-`, que es `HttpOnly` —un XSS
no puede leerla— y que el navegador rechaza si llevara `Domain`: vale para
este origen y ningún subdominio la ve.

El enlace que se comparte con el cliente lleva un token de 24 bytes al azar,
sólo da acceso a ese calendario y se puede revocar en cualquier momento.
