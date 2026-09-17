# Tests

Cuatro grupos, separados porque necesitan cosas distintas.

| Comando | Qué comprueba | Necesita |
|---|---|---|
| `npm test` | Lógica de la aplicación y todo lo que se resuelve leyendo el repositorio | Nada |
| `npm run test:bundle` | El `dist/` construido: peso, caché, minificado | Un build |
| `npm run test:vivo` | Que un cambio de una persona **llega** al socket de la otra | Nada (levanta `wrangler dev`) |
| `npm run test:infra` | El sitio publicado y la cuenta de Cloudflare | Llaves |
| `npm run verificar` | Los cuatro primeros en orden. **Es lo que corre CI** | Nada |

## Qué hay en `tests/vivo/`

El resto de los tests del tiempo real —los 27 de
`despliegue/tiempo-real.test.js`— comprueban que el tiempo real está
**escrito**: que cada evento que emite el servidor tiene su `case` en
`App.jsx`, que toda escritura lleva su `difundir()` pegado, que el
Durable Object usa `acceptWebSocket`. Todo eso leyendo ficheros.

Escrito y que llegue no son lo mismo. En medio están el binding `HUB`
—sin él `difundir()` hace `return` y no se entera nadie—, la ruta
`/api/live`, la cookie que el socket lleva o no lleva, y que las dos
personas caigan en el **mismo** Durable Object. Ninguna de esas cuatro
se ve leyendo un fichero, y las cuatro fallan calladas: la escritura
entra en D1, la respuesta es 200, y la otra persona sigue viendo lo de
antes hasta que recargue.

`colaboracion.test.js` levanta workerd de verdad, mete a dos personas en
un espacio y mira si el cambio de una aparece en el socket de la otra.
Tarda unos trece segundos y no necesita ninguna llave.

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
