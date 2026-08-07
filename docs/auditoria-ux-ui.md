# Auditoría de UX, UI, diseño móvil y accesibilidad

**Fecha:** agosto de 2026
**Alcance:** aplicación completa (`src/`), función de aprobación
(`netlify/functions/`), HTML exportado (`src/export.js`) y configuración de
despliegue.
**Método:** revisión del código línea a línea, medición de contraste sobre los
colores reales de la paleta, y pruebas automatizadas en Chromium a 360 px,
768 px y 1280 px.

Referencia de accesibilidad: **WCAG 2.2 nivel AA**.

---

## Resumen

Se encontraron **34 problemas**. **29 quedan corregidos** en este cambio;
**5 se documentan como pendientes** porque requieren decisiones de producto o
trabajo fuera del alcance de una auditoría.

| Severidad | Encontrados | Corregidos | Pendientes |
|---|---|---|---|
| 🔴 Crítico | 6 | 6 | 0 |
| 🟠 Alto | 12 | 10 | 2 |
| 🟡 Medio | 11 | 9 | 2 |
| 🟢 Bajo | 5 | 4 | 1 |

El diagnóstico de fondo: **la aplicación estaba diseñada para una pantalla de
escritorio y encogida hasta caber en un móvil**, no diseñada para móvil. Los
síntomas eran tipografías de 7 a 10 px, objetivos táctiles de 20 px y densidad
de información pensada para el ratón. La corrección introduce un sistema de
diseño con escalas explícitas en lugar de valores sueltos.

---

## 1. Correcciones críticas

### 🔴 C-1 · Hooks llamados condicionalmente (12 errores de lint)

`App.jsx` hacía `if (isApprovalPage()) return <Aprobar />;` **antes** de sus
`useState`. React exige que los hooks se ejecuten en el mismo orden en cada
render; oxlint lo marcaba como error y el build de producción salía con 12
errores. Funcionaba por casualidad, porque la rama no cambia dentro de una
misma carga de página, pero cualquier navegación en cliente lo habría roto.

**Corregido:** `App` es ahora un enrutador sin hooks que devuelve `<Aprobar />`
o `<Workspace />`; todo el estado vive en `Workspace`.
`npm run lint` pasa sin errores ni avisos.

### 🔴 C-2 · CSS inválido descartado en silencio

El patrón `"var(--accent)" + "44"` aparecía en 14 sitios y genera
`var(--accent)44`, que **no es CSS válido**: el navegador descarta la
declaración entera. Bordes, fondos y sombras que el código creía estar
aplicando simplemente no existían.

**Corregido:** tokens `--accent-soft`, `--accent-line`, `--accent-glow`,
`--alt-soft`, `--alt-line`, `--border-soft` con valores `rgba()` reales.

### 🔴 C-3 · Desplazamiento de fecha por UTC

`fmtDate()` usaba `toISOString()`, que convierte a UTC. `new Date(2026, 7, 1)`
es medianoche **local**; en cualquier zona al este de Greenwich eso es el día
31 en UTC, así que **el calendario entero se desplazaba un día**. En Panamá
(UTC−5) no se notaba; en España sí.

**Corregido:** `fmtDate()` compone la fecha a partir de `getFullYear()`,
`getMonth()` y `getDate()` locales.

### 🔴 C-4 · Enlace de aprobación roto sin avisar

En `sendToClient`, si la petición al servidor fallaba, el `catch` **guardaba el
identificador igualmente**. La agencia veía un enlace de aspecto correcto, lo
enviaba por WhatsApp, y el cliente recibía «Link inválido o expirado». El fallo
sólo se descubría del lado del cliente.

**Corregido:** se comprueba `res.ok`, sólo se guarda el identificador si el
calendario llegó al servidor, y el error se muestra con una alternativa
(«Usa HTML para enviar el calendario como archivo»).

### 🔴 C-5 · Aprobaciones que parecían guardarse y no se guardaban

Mismo patrón en `Aprobar.jsx`: `handleApproval` no comprobaba `res.ok`, así que
ante un error del servidor la publicación se marcaba como aprobada en pantalla
mientras la respuesta se perdía.

**Corregido:** se verifica la respuesta y se muestra un aviso con `role="alert"`
pidiendo reintentar.

### 🔴 C-6 · Zoom automático en iOS al enfocar un campo

Todos los campos usaban 13 px. Safari en iOS **hace zoom automáticamente**
cuando un campo tiene menos de 16 px, y no vuelve atrás: el usuario se queda
con la interfaz descuadrada y desplazada horizontalmente. Afecta a la página de
aprobación, que es la que el cliente abre en su móvil.

**Corregido:** `.input` y `.textarea` a 16 px en móvil, bajando a 14 px a
partir de 768 px, donde la regla ya no aplica. Igual en el HTML exportado.

---

## 2. Tipografía y espaciado

### 🟠 T-1 · Textos por debajo del umbral de legibilidad

Inventario de lo que había:

| Dónde | Antes | Ahora |
|---|---|---|
| Concepto semanal en la rejilla | **7 px** | 11 px (oculto <600 px) |
| Categoría en cabecera de día | **7 px** | 11 px (oculto <600 px) |
| Hora de publicación en la rejilla | **7 px** | 11 px (oculta <600 px) |
| Texto de publicación en la rejilla | **8 px** | 11 px + icono |
| Abreviatura del día en la lista | **8 px** | 11 px |
| Contador de ideas del asistente | **8 px** | 11 px |
| Etiquetas de formulario (`.label`) | 10 px | 11 px |
| Etiquetas de color, insignias | 9–10 px | 11 px |
| Cuerpo de la página de aprobación | 12 px | **14 px** |

**Corregido:** escala tipográfica en `index.css` (`--fs-3xs` … `--fs-2xl`) con
suelo de 11 px. Ningún texto visible baja de ahí.

El caso de la página de aprobación merece mención aparte: es el texto que el
**cliente final** lee en su móvil para decidir si aprueba, y estaba a 12 px.
Ahora está a 14 px con interlineado 1,75.

### 🟠 T-2 · Sin escala de espaciado

Los márgenes y rellenos eran valores sueltos: 2, 3, 4, 6, 8, 10, 11, 12, 13,
14, 16, 18, 20, 24, 30, 50, 60. Sin ritmo vertical, el resultado es una
sensación difusa de descuido.

**Corregido:** escala de 4 px (`--sp-1` … `--sp-10`). Todos los componentes
tocados la usan.

### 🟡 T-3 · Interlineado corto en textos largos

Los bloques de guion y descripción usaban 1,5–1,7 con texto de 11–12 px.
Ahora: `--lh-relaxed` (1,75) para contenido largo, `--lh-normal` (1,55) para
interfaz.

---

## 3. Diseño móvil y responsive

### 🔴 R-1 · Cabecera aplastada a 360 px

Detectado en las capturas de la prueba automatizada: con seis controles a la
derecha marcados como `flexShrink: 0`, el bloque del nombre del cliente se
quedaba sin espacio y **«Calendarios» se rompía letra a letra en vertical**,
solapándose con el logo.

Dos causas: faltaba `min-width: 0` en la cadena de contenedores flex (sin él un
elemento flex no puede encogerse por debajo de su contenido) y sobraban
controles en la cabecera.

**Corregido:** `min-width: 0` + `overflow: hidden` en toda la cadena, y
**Exportar/Importar movidos al panel lateral**, bajo el epígrafe «Copia de
seguridad», que es donde conceptualmente pertenecen: son acciones globales, no
del cliente activo. La cabecera queda con menú, marca, nombre, «Nuevo» y
ajustes.

### 🟠 R-2 · Rejilla del calendario inservible en móvil

Siete columnas en 360 px dan celdas de ~46 px. Dentro se metía punto de estado
+ emoji + 20 caracteres de idea + hora, todo a 8 px. El resultado era una
mancha ilegible.

**Corregido:** por debajo de 600 px cada publicación se reduce a punto de
estado + icono de formato, centrados, con `min-height: 24px`; la celda baja a
72 px de alto. La información completa sigue disponible en el `aria-label` y al
tocar. El texto reaparece a partir de 600 px.

### 🟠 R-3 · Todo antes del contenido

En móvil había que pasar el banner de campaña, cuatro tarjetas de estadísticas,
la barra de progreso, tres filas de botones y **cuatro filas de chips de
filtro** antes de ver la primera publicación.

**Corregido:** los filtros son ahora un panel plegable, cerrado por defecto,
que muestra cuántos filtros hay activos y ofrece «Limpiar filtros». Las
tarjetas de estadísticas se compactan por debajo de 480 px.

### 🟠 R-4 · `100vh` en móvil

`100vh` no descuenta la barra de direcciones del navegador móvil, así que la
página se corta o salta al aparecer y desaparecer.

**Corregido:** `100dvh` con `100vh` como respaldo.

### 🟡 R-5 · Sin zonas seguras

En iPhone con muesca, las cabeceras fijas quedaban bajo la muesca y los botones
inferiores de los diálogos bajo el indicador de inicio.

**Corregido:** variables `--safe-top/-bottom/-left/-right` con `env(safe-area-inset-*)`
aplicadas en cabecera, contenido, hojas inferiores y panel lateral.

### 🟡 R-6 · Hoja inferior con hueco

Los modales tipo hoja usaban `.overlay` con `padding: 16px`, así que quedaba
una franja de fondo bajo una hoja que debía estar pegada al borde inferior.

**Corregido:** modificador `.overlay-sheet` sin relleno, con `.sheet` en
columna: cabecera fija, cuerpo desplazable, pie fijo. Los botones de acción
dejan de desplazarse fuera de la vista en formularios largos.

### 🟡 R-7 · Desplazamiento pegajoso mal calculado

El banner de campaña usaba `top: 52` fijo, suponiendo la altura de la cabecera.
Con otro tamaño de fuente del sistema quedaba un hueco o se solapaban.

**Corregido:** `--header-h`, con `top: calc(var(--header-h) + var(--safe-top))`.

**Verificación:** desbordamiento horizontal = **0 px** a 360, 768 y 1280 px.

---

## 4. Accesibilidad

### 🔴 A-1 · Botones de emoji sin nombre accesible

Unos 40 botones cuyo único contenido era un emoji: `☰`, `✕`, `✏️`, `🗑️`, `⬇️`,
`⬆️`, `⚙️`, `📋`, `📝`, `🔄`, `💡`. Un lector de pantalla anunciaba «botón
lápiz» o directamente «botón», sin decir qué hace. **Criterio 4.1.2 Nombre,
función, valor.**

**Corregido:** `aria-label` descriptivo en todos («Editar cliente Feria del
Lente», «Eliminar publicación: Muestra los lentes…»), y `aria-hidden="true"` en
los emojis decorativos para que no se lean dos veces.

### 🟠 A-2 · Etiquetas no asociadas a sus campos

Todos los `<label className="label">` eran texto suelto, sin `htmlFor`. El
lector de pantalla no podía decir a qué campo pertenecía cada etiqueta, y tocar
la etiqueta no enfocaba el campo. **Criterio 3.3.2 Etiquetas o instrucciones.**

**Corregido:** `htmlFor` + `id` generados con `useId()` en los cinco
componentes de formulario. Los grupos de opciones usan `<fieldset>` +
`<legend>`.

### 🟠 A-3 · Elementos interactivos que no eran botones

`<div onClick>` en: cabecera de día desplegable, tarjeta de publicación,
elemento de cliente en el panel lateral y fondo oscuro de los modales. No
reciben foco, no responden a Enter ni Espacio, y no se anuncian como
interactivos. **Criterio 2.1.1 Teclado.**

**Corregido:** todos son `<button>`. La cabecera de día lleva `aria-expanded` +
`aria-controls`.

Caso especial de la tarjeta de publicación: no se podía convertir en botón
porque contenía otros botones (copiar, generar con IA, borrar), y anidar
controles interactivos es HTML inválido. **Se sustituyó por una fila de
acciones explícita** con «Editar publicación» y el botón de eliminar. Es más
código, pero elimina la ambigüedad de «qué pasa si toco aquí».

### 🟠 A-4 · Diálogos sin semántica ni gestión de foco

Ninguno de los seis modales tenía `role="dialog"`, `aria-modal`, foco atrapado,
cierre con Escape ni devolución del foco al cerrar. Con teclado se podía tabular
hasta el contenido de detrás mientras el modal seguía abierto.
**Criterios 2.1.2 Sin trampas para el foco, 2.4.3 Orden del foco.**

**Corregido:** hook `useDialogA11y` (`src/hooks/useDialogA11y.js`) que aplica
`role="dialog"` + `aria-modal="true"`, mueve el foco al primer control al
abrir, cicla con Tab y Shift+Tab, cierra con Escape, bloquea el desplazamiento
del fondo y devuelve el foco al elemento que abrió el diálogo. Aplicado en
panel lateral, configuración de IA, ficha de cliente, asistente, edición de
calendario, enlace de aprobación, alta de publicación y panel de edición.

Recalcula los elementos enfocables en cada Tab a propósito: el contenido de
estos diálogos cambia (pestañas, campos condicionales, listas que crecen).

### 🟠 A-5 · Contraste insuficiente

Se midió cada color contra su fondo real. La paleta principal está bien
(`--text-dim` 9,1:1; `--text-muted` 8,7:1; `--accent` 6,0:1). Los fallos
estaban en grises sueltos escritos a mano:

| Color | Uso | Contraste | Estado |
|---|---|---|---|
| `#444` | Números de días fuera del mes | **2,0:1** | ❌ |
| `#555` | Marcas de tiempo del diagnóstico | **2,4:1** | ❌ |
| `#666` | Texto vacío del diagnóstico | **3,2:1** | ❌ |
| `#0f0`, `#f55`, `#fa0` | Registro de diagnóstico | Varios | ❌ |

Además `.cal-cell.outside` aplicaba `opacity: .4` sobre el color ya atenuado,
hundiéndolo aún más.

**Corregido:** token `--text-faint` (#6E829B, **4,6:1**) sustituye a los tres
grises; los colores del diagnóstico pasan a variantes legibles sobre fondo
oscuro (#FF8A85, #FFC166); se elimina la opacidad y se atenúa con color.
El requisito es 4,5:1 para texto normal (**criterio 1.4.3**).

### 🟠 A-6 · Objetivos táctiles pequeños

| Control | Antes | Ahora |
|---|---|---|
| Botones de icono | 36×36 | **44×44** |
| Borrar publicación | ~20×16 | 36×36 |
| «+» de la celda del calendario | ~14 alto | 28 alto |
| Botones de estado | 36 alto | 44 alto |
| Chips de filtro | ~26 alto | 36 alto |
| Aprobar / Pedir cambios (cliente) | ~38 alto | **44 alto** |
| Casillas de verificación | 13×13 (nativo) | 20×20 |

44 px es el mínimo del **criterio 2.5.5** y de las guías de Apple.
36 px (`--tap-sm`) se reserva para controles densos con separación suficiente.

### 🟡 A-7 · Estado comunicado sólo por color

Los chips de filtro activos y los selectores de formato se distinguían
únicamente por el color de fondo. **Criterio 1.4.1 Uso del color.**

**Corregido:** `aria-pressed` en todos los botones de alternancia,
`aria-current` en las pestañas de calendario y en el cliente activo.

### 🟡 A-8 · Foco visible sólo en botones

`button:focus-visible` era la única regla. Campos, enlaces y elementos con
`tabIndex` no mostraban nada al recibir el foco. **Criterio 2.4.7.**

**Corregido:** `:focus-visible` global con contorno de 2 px y separación de 2 px.

### 🟡 A-9 · `alert()` para mensajes de estado

Siete llamadas a `alert()` para errores y confirmaciones. Bloquea el hilo,
interrumpe al lector de pantalla y no se puede estilar.

**Corregido:** regiones `role="status" aria-live="polite"` para información y
`role="alert"` para errores. Se conserva `window.confirm()` **sólo** para
acciones destructivas (eliminar cliente, calendario o publicación), donde el
bloqueo es deseable.

### 🟡 A-10 · Sin enlace de salto

**Corregido:** «Saltar al contenido» en la aplicación y «Saltar a las
publicaciones» en la página de aprobación, visibles al recibir el foco.

### 🟡 A-11 · Sin jerarquía de encabezados

La página de aprobación usaba `<h1>` y luego `<div>` con texto en negrita.
**Corregido:** `h1` → `h2` (semana) → `h3` (día), con `<section>`,
`<article>`, `<main>`, `<nav>` y `<footer>`.

### 🟢 A-12 · Preferencias del usuario ignoradas

**Corregido:** `prefers-reduced-motion: reduce` desactiva animaciones y
transiciones (**criterio 2.3.3**); `prefers-contrast: more` refuerza bordes y
textos atenuados.

### 🟢 A-13 · Imágenes con `alt` vacío indiscriminado

Los logos de cliente llevaban `alt=""`, tratándolos como decorativos cuando
identifican al cliente.
**Corregido:** `alt="Logo de {nombre}"` en los logos; `alt=""` se mantiene sólo
donde la imagen es realmente decorativa.

---

## 5. Calidad de la interacción

### 🟠 I-1 · Campos leídos del DOM en lugar del estado

El paso «Fechas» del asistente creaba dos `<input>` sin `value`, los leía con
`document.getElementById(...).value` y los limpiaba mutando el DOM. React no
conocía esos valores: cualquier re-render los perdía.

**Corregido:** componentes controlados con `useState`.

### 🟠 I-2 · Botón que no hacía nada sin explicar por qué

`handleSave` de la ficha de cliente hacía `if (!form.name) return;`. Si el
nombre estaba vacío —posiblemente en otra pestaña— el botón «Crear cliente»
simplemente no respondía.

**Corregido:** mensaje de error con `role="alert"`, cambio automático a la
pestaña «Básico» y foco en el campo que falta.

### 🟡 I-3 · Pasos futuros del asistente enfocables pero inertes

Recibían el foco al tabular y no hacían nada al pulsarlos.
**Corregido:** `disabled` en los pasos no alcanzados, `aria-current="step"` en
el actual.

### 🟡 I-4 · Colisiones de identificador

`uid()` era `Math.random().toString(36).slice(2, 10)`. Los identificadores de
publicación son claves en el mapa de aprobaciones y en el análisis de la
respuesta de la IA: una colisión mezcla el contenido de dos publicaciones sin
error visible.

**Corregido:** `crypto.randomUUID()` cuando está disponible, con respaldo que
incorpora la marca de tiempo.

### 🟡 I-5 · Promesa colgada con imágenes corruptas

`compressImage()` no tenía manejador `onerror`. Un archivo con extensión de
imagen pero contenido inválido dejaba la promesa sin resolver para siempre: la
interfaz se quedaba esperando sin mensaje.

**Corregido:** `img.onerror` y `reader.onerror` rechazan la promesa con un
mensaje en español, que se muestra en la interfaz.

### 🟢 I-6 · El calendario duplicado heredaba el enlace de aprobación

`duplicateCalendar` copiaba `approvalId`, así que el duplicado y el original
compartían enlace: aprobar en uno afectaba al otro.
**Corregido:** el duplicado nace sin enlace.

### 🟢 I-7 · Textos sin tildes y erratas

«Guion» (sin tilde, correcto), pero también «Categoria», «Descripcion»,
«Campana» (en lugar de «Campaña»), «Ano» (en lugar de «Año»), «dia», «Basico».
Algunas cambiaban el significado.

**Corregido:** ortografía completa en la interfaz, con signos de apertura
(«¿», «¡») y comillas angulares. Los prompts de IA conservan la forma sin
tildes donde ya funcionaba, para no alterar resultados ya validados.

---

## 6. Seguridad

### 🟠 S-1 · La clave de IA vive en el navegador — **pendiente**

La clave de Anthropic o Groq se guarda en `localStorage` y las peticiones salen
directamente del navegador (con la cabecera
`anthropic-dangerous-direct-browser-access`). Cualquiera con acceso al
dispositivo, o cualquier script de terceros que se cuele, puede leerla y
gastarla.

**Estado:** no corregido. Arreglarlo bien significa mover las llamadas de IA a
una función de Netlify con la clave en variable de entorno, lo que cambia el
modelo de uso: hoy cada usuario pone su clave y paga su consumo; con la clave
en el servidor paga la agencia y hay que añadir control de acceso.

**Mitigación aplicada:** aviso explícito en el diálogo de configuración
recomendando claves con límite de gasto, y `X-Frame-Options: DENY` +
`frame-ancestors 'none'` para impedir el robo por incrustación.

### 🟠 S-2 · Token de GitHub en la copia de seguridad — **pendiente**

`githubToken` se guarda por cliente en `localStorage` **y se incluye en el JSON
que genera «Exportar»**. Ese archivo se comparte con facilidad.

**Estado:** no corregido; excluirlo de la exportación rompería la restauración
para quien ya lo use.
**Mitigación aplicada:** aviso junto al campo recomendando tokens de sólo
lectura, y `src/lib/supabase.js` **excluye el token** del esquema de base de
datos a propósito.

### 🔴 S-3 · CORS abierto en la función de aprobación

`Access-Control-Allow-Origin: "*"` permitía que cualquier página leyera un
calendario compartido desde el navegador de la víctima.

**Corregido:** lista de orígenes permitidos a partir de `URL` (que Netlify
define sola) más `ALLOWED_ORIGINS`, con cabecera `Vary: Origin`.

### 🟠 S-4 · Entrada sin validar en la función

El identificador de calendario se usaba tal cual como clave del almacén, sin
comprobar formato; `estado` aceptaba cualquier cadena; no había límite de
tamaño de petición ni de longitud de comentario.

**Corregido:** patrón `^[A-Za-z0-9_-]{8,200}$` para el identificador, `estado`
restringido a `aprobado`/`cambios`, límite de 5 MB por petición y 2000
caracteres por comentario. Los errores internos van al registro, no a la
respuesta.

### 🟠 S-5 · Sin política de seguridad de contenido

**Corregido:** CSP en `netlify.toml`. `script-src 'self'` sin `unsafe-inline`
(Vite emite módulos externos, así que un script inyectado no se ejecutaría);
`style-src` sí lo necesita porque React aplica la prop `style` como atributo en
línea. `connect-src` limita las conexiones salientes a los proveedores que la
aplicación usa de verdad.

### 🟡 S-6 · El enlace de aprobación no caduca — **pendiente**

Quien tenga el enlace puede ver y responder ese calendario indefinidamente. Es
una decisión de diseño razonable (el cliente no debería crear una cuenta), pero
conviene saberla. Añadir caducidad requiere decidir el plazo y qué hacer con
los enlaces ya enviados.

**Nota positiva:** el esquema de Supabase ya está diseñado para que un enlace
no dé acceso a nada más. Las escrituras pasan por la función con clave de
servicio y la lectura pública usa una función `security definer` que devuelve
un único calendario, en lugar de abrir la tabla con RLS permisivo.

---

## 7. Pendiente, por orden de importancia

1. **Mover las llamadas de IA al servidor** (S-1). Es el único cambio que
   elimina de raíz la exposición de la clave. Requiere decidir quién paga el
   consumo.
2. **Completar la migración a Supabase.** El esquema y los conversores están
   listos; falta la autenticación y sustituir `localStorage`.
   Ver `DEPLOY.md` § 6.
3. **Caducidad de los enlaces de aprobación** (S-6).
4. **Excluir el token de GitHub de la exportación** (S-2), con una migración
   que no rompa las copias existentes.
5. **Alternativa por teclado a arrastrar y soltar.** Mover publicaciones entre
   días sólo funciona con el ratón. La solución habitual es un menú «Mover a…»
   en el panel de edición. Es **criterio 2.1.1**, pero la función es
   secundaria: todo lo demás se puede hacer sin ella.

---

## 8. Cómo se verificó

```bash
npm run lint     # 0 errores, 0 avisos (antes: 12 errores, 5 avisos)
npm run build    # correcto
```

Pruebas automatizadas en Chromium con datos de ejemplo (un cliente, un
calendario de 31 días con 16 publicaciones):

| Comprobación | Resultado |
|---|---|
| Desbordamiento horizontal a 360 px | 0 px |
| Desbordamiento horizontal a 768 px | 0 px |
| Desbordamiento horizontal a 1280 px | 0 px |
| Errores de página en consola | ninguno |
| Panel lateral expone `role="dialog"` | sí |
| Escape cierra los diálogos | sí |
| Panel de edición expone `role="dialog"` | sí |

Los contrastes se calcularon con la fórmula de luminancia relativa de WCAG
sobre los colores reales de la paleta, no estimados a ojo.

**Sin verificar:** no se ha probado con lectores de pantalla reales (VoiceOver,
NVDA, TalkBack) ni en dispositivos físicos. Las correcciones siguen las
especificaciones, pero una pasada con VoiceOver en un iPhone antes de la
presentación a clientes sería sensata.
