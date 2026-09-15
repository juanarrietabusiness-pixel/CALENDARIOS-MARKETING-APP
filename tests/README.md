# Tests

Tres grupos, separados porque necesitan cosas distintas.

| Comando | Qué comprueba | Necesita |
|---|---|---|
| `npm test` | Lógica de la aplicación y todo lo que se resuelve leyendo el repositorio | Nada |
| `npm run test:bundle` | El `dist/` construido: peso, caché, minificado | Un build con variables |
| `npm run test:infra` | El proyecto de Supabase y el sitio publicado | Llaves |
| `npm run verificar` | Los tres primeros en orden. **Es lo que corre CI** | Nada |

## Qué hay en `tests/despliegue/`

| Archivo | Qué vigila |
|---|---|
| `plantillas.test.js` | `netlify.toml` (CSP, cabeceras, orden de redirecciones, caché), `index.html`, `vite.config.js`, y que CI use la misma versión de Node que Netlify |
| `secretos.test.js` | Que ninguna clave esté escrita en el repositorio, que el navegador no lea secretos del servidor, y que no se versionen binarios grandes |
| `migraciones.test.js` | RLS por tabla, políticas acotadas al propietario, `search_path` en las `security definer`, revocaciones a `anon`, índices de clave ajena |
| `funciones.test.js` | Que toda Edge Function del repositorio se despliegue, autentique, acote CORS y tamaño, y no filtre errores del proveedor |
| `regresiones.test.js` | Las trampas documentadas en `CLAUDE.md`: fechas en UTC, variables CSS concatenadas, `div` con `onClick`, `alert()`, la barra del chip del mes |
| `rendimiento.bundle.test.js` | Presupuesto de descarga y el canario del *tree-shaking* |
| `infra.live.test.js` | Deriva entre lo desplegado y el repositorio, avisos del proyecto, cabeceras reales del sitio |

## Por qué los fallos se leen así

Cada aserción de despliegue falla con cuatro campos: **qué** se incumple,
**dónde**, **por qué importa** y el **arreglo**. No es decoración: el
informe que sube CI (`informe-despliegue.md`, también comentado en el
pull request) se compone de esos campos, y está pensado para que quien lo
lea —o el agente que lo reciba— pueda corregir sin volver a auditar el
repositorio.

Hay una skill con el procedimiento: `.claude/skills/arreglar-despliegue/`.

## Los 90 casos que se saltan

`recetas.test.js` y `componer.test.js` validan las recetas reales de
`Agencia_Workspace`, que es un checkout aparte. Si no está, se saltan en
vez de fallar. Para ejecutarlos:

```bash
AGENCIA_WORKSPACE=/ruta/al/checkout npm test
```

## Añadir un test de despliegue

Escribe el fallo con `fallo()` de `tests/utils/fallo.js`, y comprueba que
salta: rompe a propósito lo que vigila y mira que falle. Un test que no
se ha visto fallar no vigila nada.
