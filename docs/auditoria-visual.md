# Auditoría visual y plan de rediseño

**Fecha:** agosto de 2026
**Alcance:** lenguaje visual, jerarquía, densidad y composición.

Este documento es distinto de `auditoria-ux-ui.md`. Aquel corrigió lo que
estaba **mal** (texto de 7 px, contraste de 2:1, zonas táctiles de 20 px).
Este trata de lo que está **sin diseñar**: proporción, jerarquía, ritmo y
sistema. Una interfaz puede cumplir todas las normas de accesibilidad y aun
así parecer improvisada, que es exactamente el caso de partida.

---

## Diagnóstico en una frase

La aplicación no tiene un lenguaje visual: tiene una acumulación de decisiones
tomadas de una en una. Cada pantalla se resolvió por separado, y el resultado
es que **nada está relacionado con nada**: ni las proporciones, ni los pesos,
ni los iconos, ni la densidad.

Los tres síntomas más visibles:

1. **El escritorio es un móvil estirado.** No hay diseño para pantalla grande.
2. **Los iconos son emoji del sistema operativo.** No es un set, es lo que
   había a mano.
3. **Todo pesa lo mismo.** Sin jerarquía, el ojo no sabe dónde mirar.

---

## Hallazgos

### 🔴 D-1 · Cuatro bloques de identidad apilados que repiten lo mismo

En escritorio, los primeros **420 px de alto** de la pantalla contienen:

| Bloque | Contenido |
|---|---|
| Cabecera | «Feria del Lente» · «Calendarios» |
| Tarjeta de cliente | «Feria del Lente» · «Óptica · @feriadellente» · ✏️ |
| Pestaña | «Agosto 2026» |
| Banner de campaña | «Agosto 2026» · «Agosto 2026 · Regreso a Clases» · 4 iconos |

El nombre del cliente aparece **dos veces**. «Agosto 2026», **tres veces**.
La única información nueva en 420 px es «Óptica», «@feriadellente» y
«Regreso a Clases»: tres datos que caben en una línea.

Esto no es un problema de espaciado, es de arquitectura: cada bloque se añadió
en un momento distinto sin mirar los que ya estaban.

**Plan:** un único encabezado de página que combine identidad del cliente,
selector de calendario y metadatos, con las acciones alineadas a la derecha.

---

### 🔴 D-2 · No existe diseño para escritorio

A 1280 px la aplicación es exactamente la misma columna del móvil, estirada de
borde a borde. Consecuencias medidas sobre la captura:

- Las filas de día miden **1960 px de ancho** y contienen un chip de fecha de
  40 px y dos líneas de texto corto. Más del 85 % es vacío.
- La barra de progreso cruza 1960 px para representar un 38 %.
- La lista de clientes sigue siendo un cajón modal que tapa la pantalla,
  cuando hay sitio de sobra para tenerla siempre visible.
- Las líneas de texto superan los 150 caracteres. El rango cómodo de lectura
  está entre 45 y 75.

**Plan:** contenedor con ancho máximo, barra lateral permanente a partir de
1024 px, y aprovechar el ancho de las filas para mostrar información que hoy
está escondida (las publicaciones del día).

---

### 🔴 D-3 · Emoji del sistema usados como iconos de interfaz

Inventario: `☰ ✕ ✏️ 📝 📋 🗑️ 💡 ⚙️ ⬇️ ⬆️ 🔗 🔄 ⚡ ✨ 🏢 🕐 📅 📂 ⚠️ 💬` y los
cinco de formato `🖼️ 🎬 📑 ⭕ 🔴`.

Por qué falla, en concreto:

- **Cada uno lo dibuja el sistema operativo.** El mismo botón se ve distinto en
  iPhone, Android, Windows y Mac. No hay control sobre la marca.
- **Pesos ópticos incompatibles.** `✏️` es un lápiz amarillo en diagonal;
  `🗑️` es una papelera gris de rejilla; `📋` y `📝` traen un **fondo blanco de
  papel** que sobre el azul del banner recorta un rectángulo claro.
- **No heredan el color.** Sobre el banner azul, la papelera casi desaparece.
- **`📝` y `✏️` significan lo mismo** para el usuario («editar»), pero abren
  cosas distintas (renombrar vs. editar campaña).
- **Se cuelan en el texto:** «Configura una API key en ⚙️ ajustes» mezcla un
  pictograma a color dentro de una frase.

**Plan:** un set propio de iconos SVG monocromos, trazo de 1,75 sobre rejilla
de 24, que heredan `currentColor` y se alinean ópticamente.

---

### 🟠 D-4 · Sin jerarquía de acciones

Siete botones en una fila, todos del mismo tamaño y peso, mezclando cuatro
categorías distintas:

| Botón | Qué es en realidad |
|---|---|
| Generar contenido | Acción primaria |
| Calendario | Conmutador de vista |
| 💡 | Alternar un panel |
| PDF · HTML | Exportar |
| 🔗 Enviar | Compartir |
| Diagnóstico | **Herramienta de desarrollo** |

«Diagnóstico» —un visor de registros internos— tiene el mismo peso visual que
la acción principal de la pantalla. Un usuario no técnico no debería verlo.

**Plan:** una barra de herramientas con grupos separados: acción primaria a la
izquierda, conmutador de vista segmentado, y el resto agrupado en un menú de
«más acciones». El diagnóstico se va al menú.

---

### 🟠 D-5 · Tarjetas de estadística desproporcionadas

Cuatro cajas de **490 × 110 px** cada una, con borde de un color distinto
(azul, verde, morado, naranja), para mostrar cuatro números de una o dos
cifras. El arcoíris no codifica nada: «Días» no es naranja por ningún motivo.

Ocupan 110 px de alto en móvil ×2 filas = 220 px antes del contenido.

**Plan:** una tira compacta de una sola línea. El color se reserva para lo que
sí tiene semántica de estado (aprobado = verde, publicado = morado).

---

### 🟠 D-6 · El banner de campaña es un bloque pesado y redundante

Un gradiente azul a sangre completa, de 90 px de alto, cuyo único contenido no
repetido es el nombre de la campaña. Además aloja cuatro botones de icono
flotando sobre el gradiente, donde el contraste es peor.

**Plan:** absorberlo en el encabezado unificado. La campaña pasa a ser una
línea de metadatos, no un bloque.

---

### 🟡 D-7 · Blanco puro sobre casi negro

`--text: #FFFFFF` sobre `--bg: #050D1F` da **19:1**. Cumple de sobra, pero en
pantalla OLED produce halo y fatiga: es el error clásico del modo oscuro
improvisado. Las interfaces oscuras cuidadas se quedan entre 85 % y 92 % de
blanco.

**Plan:** `--text` a `#EAF0F8`, manteniendo >15:1.

---

### 🟡 D-8 · Bordes que compiten con el contenido

`--border: #1E3A6B` es un azul saturado aplicado al 100 % de opacidad en cada
tarjeta, campo y separador. El resultado es una rejilla de líneas azules que
pesa más que el texto que enmarca.

**Plan:** bordes en `rgba` a baja opacidad, con una variante más marcada
reservada para los elementos que de verdad necesitan delimitarse.

---

### 🟡 D-9 · Sin escala de elevación

Sombras y bordes se usan indistintamente para separar planos. Hay `--shadow` y
`--shadow-lg`, pero se aplican sin criterio: la tarjeta de un día tiene sombra
igual que un modal.

**Plan:** tres niveles definidos —superficie plana, tarjeta elevada, capa
flotante— y cada componente asignado a uno.

---

### 🟡 D-10 · Filas de día huecas

En escritorio, cada día es una tarjeta de 1960 × 140 px con un chip de fecha y
dos líneas. Las publicaciones del día están **plegadas**, así que hay que
abrir cada día para ver qué hay dentro, teniendo 1700 px libres al lado.

**Plan:** a partir de 900 px, las publicaciones del día se muestran como chips
en la propia fila, a la derecha.

---

### 🟠 D-11 · El logo de la marca no estaba en ninguna parte

`public/logo.png` se subió al repositorio pero no se usaba: la aplicación
mostraba en su lugar un cuadrado azul con las letras «JA» puestas a mano con
un degradado CSS. El favicon seguía siendo el rayo morado de la plantilla de
Vite, sin relación con la agencia.

Además el archivo pesaba **1,3 MB**: un PNG de 2048×2048 con un 18 % de
margen transparente y ruido de alfa (valores de 1 a 12) por todo el lienzo,
que impedía recortarlo automáticamente. Servido tal cual, era ocho veces el
peso de todo el JavaScript de la aplicación.

**Corregido.** Se recorta el margen, se limpia el ruido de alfa y se generan
cuatro derivados con paleta de 256 colores (error medio de 1,1/255, es decir
imperceptible):

| Archivo | Tamaño | Peso |
|---|---|---|
| `public/logo.png` (lockup completo) | 512×576 | 33 KB |
| `src/assets/logo-mark.png` (monograma) | 192×192 | 7 KB |
| `public/favicon-32.png` | 32×32 | 0,8 KB |
| `public/apple-touch-icon.png` | 180×180 | 3,5 KB |
| **Total** | | **45 KB** (−96 %) |

**Un hallazgo de diseño:** el logo **no reduce bien a tamaño de favicon**.
El monograma completo (megáfono + constelación + dos letras entrelazadas) se
convierte en una mancha por debajo de 32px, y el azul de marca no contrasta
contra el fondo oscuro del navegador. La solución aplicada es la estándar
para logos complejos: el favicon usa **sólo las letras «JA» sobre una placa
blanca redondeada**, que se lee a 16px y funciona igual en tema claro y
oscuro. El monograma completo se reserva para 28px en adelante.

También se eliminan `src/assets/hero.png`, `react.svg` y `vite.svg`, restos
de la plantilla de Vite que nadie referenciaba.

### 🟢 D-12 · Radios inconsistentes

Conviven 4, 5, 6, 7, 8, 10, 12, 14, 20 px de radio, a menudo en elementos
anidados donde el hijo tiene más radio que el padre.

**Plan:** tres radios (`--radius-sm` 8, `--radius` 12, `--radius-lg` 16) más
`999px` para píldoras, y la regla de que un hijo nunca supera el radio del
padre.

---

## Plan de mejora, por fases

| Fase | Qué | Por qué primero |
|---|---|---|
| 1 | Fundamentos: color, elevación, radios, sistema de iconos | Todo lo demás depende de ello |
| 2 | Arquitectura: contenedor, barra lateral de escritorio, encabezado unificado | Resuelve D-1 y D-2, los dos críticos |
| 3 | Jerarquía de acciones: barra de herramientas con grupos y menú | Resuelve D-4 |
| 4 | Densidad: tira de estadísticas, filas de día con contenido | Resuelve D-5 y D-10 |

---

## Resultado

Medido con Chromium sobre los mismos datos de ejemplo (un cliente, un
calendario de 31 días con 16 publicaciones), antes y después del cambio:

| Métrica | Antes | Después |
|---|---|---|
| Alto hasta la primera publicación · escritorio 1440 | 629 px | **550 px** |
| Alto hasta la primera publicación · móvil 360 | 881 px | **766 px** |
| Ancho de la columna de contenido · 1440 | 1440 px | **1176 px** |
| Ancho de una fila de día · 1440 | 1414 px | **1126 px** |
| Emoji en la interfaz | 20 distintos | **0** |
| Bloques de encabezado apilados | 4 | **1** |
| Botones en la fila de acciones | 7 iguales | **1 primario + conmutador + 2 + menú** |
| Lista de clientes en escritorio | cajón modal | **barra lateral fija** |

La reducción de altura es menor de lo que sugiere la impresión visual
porque el encabezado unificado es más alto que cada bloque individual que
sustituye. Lo que cambia de verdad es **qué** ocupa ese espacio: antes
eran cuatro repeticiones del mismo nombre; ahora es identidad, selector de
calendario, estadísticas y acciones, todo distinto.

En escritorio el cambio real no es la altura sino el ancho: la fila de día
pasa de 1414 px con un 85 % vacío a 1126 px con las publicaciones del día
visibles a la derecha, sin tener que desplegar nada.

Verificado con las mismas pruebas automatizadas: sin desbordamiento
horizontal a 360, 768 y 1440 px, y sin errores de consola.

**Sin verificar:** los iconos se han dibujado a mano sobre rejilla de 24 y
revisados en captura, pero no se han probado a tamaños menores de 13 px ni
en pantallas sin antialiasing.
