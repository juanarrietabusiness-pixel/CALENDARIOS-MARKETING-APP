# Un cerebro por cliente

Estado a 2026-09-29. Fases 0 y 1 y la **visualización 3D** implementadas; lo demás,
pendiente y con las decisiones que hacen falta.

---

## El problema, con números

Lo que la IA de la aplicación sabía de un cliente era **una foto**: el ADN se leía
una vez del repositorio `Agencia_Workspace`, se guardaba entero en la ficha
(`clients.github_context`) y viajaba completo en cada llamada.

| Síntoma | Evidencia |
|---|---|
| Gastaba mucho | El ADN de Dcasa (≈98 000 caracteres leídos, ≈25 000 tokens) entraba en **cada tanda de seis publicaciones**, 10–15 veces al mes, sin caché: `cachedBlock()` existía y nadie lo llamaba, y `docs/auditoria-conexion-adn.md` decía lo contrario. |
| No leía en vivo | `loadADN` devolvía `githubContext` si no estaba vacío y nadie pasaba `forzar`: un precio cambiado en el repositorio (Baby Caleb cambió los suyos el 29-sep) no llegaba nunca a la generación. |
| Mandaba lo que no sirve | Entre un 31 % y un 48 % de ese ADN es la capa de **maquetación para Meta AI** (plantillas, escala, bloque de estilo, negativos…), que escribir un caption no necesita. |
| Le mentía al modelo | El asistente de planificación le decía «este cliente no tiene ADN conectado» a clientes que sí lo tienen. |
| No recordaba nada del cliente | Las aprobaciones, los rechazos con motivo, las notas del equipo y las ideas ya publicadas no volvían a ningún prompt. |
| Filtraba lo que no debía | El ADN de Baby Caleb lleva costos y márgenes marcados «no se dicen al cliente», y viajaban en cada prompt de texto. |

## La decisión (de la agencia, 2026-09-29)

1. **El cerebro manda; la Workspace queda como copia de seguridad.** Un cerebro
   **por cliente**, en D1 y R2, con el algoritmo de Agents Office.
2. **Se llena una vez con un botón y una pasada de IA**; de ahí en adelante se le
   añaden documentos, archivos y notas, y se pueden filtrar y borrar.
3. **Primero lo que baja el gasto.** La visualización (el cerebro 3D de Agents
   Office) va en la **segunda entrega**.
4. El motor es una **copia** de `knowledge.mjs` y `memory.mjs` dentro del
   calendario, con un test de paridad, y no un paquete compartido (no hay
   monorepo todavía).

## Cómo funciona

```
Workspace (GitHub) ──importar──▶ cerebro_notas (D1) ──índice──▶ cerebro/<cliente>/indice.json (R2)
                                     ▲    │
        añadir nota / subir texto ───┘    └── ficha técnica + cifras  (la IA, una vez)
                                                   │
                     ┌─────────────────────────────┴───────────────────────────┐
                     ▼                                                         ▼
        generación (ideas, guiones, captions)                    asistente y Claude (MCP)
        estable y cacheado: ficha + cifras                       ficha + cifras, y buscar_cerebro
        por tanda: los pasajes que esa tanda pide                para el detalle
```

**Notas.** Cortas (400–3 500 caracteres), con título y tipo. Un archivo del
repositorio se parte **por encabezados, sin pasar por un modelo**: no puede
resumir mal ni perder una regla. Tipos: `ficha`, `cifras`, `marca`,
`maquetacion`, `documento`, `nota`, `decision`, `borrador`.

**Interna.** Un candado aparte del tipo: la ve el equipo y el asistente, pero
**nunca** entra en lo que se escribe para publicar. Al importar se marcan solas
las secciones cuyo título habla de economía unitaria, márgenes, proveedores,
«landed cost», roadmap, inversionistas o «reglas operativas»; las que sólo lo mencionan en el cuerpo se devuelven en `revisar`
(un precio de venta puede vivir junto a un costo, y ocultarlo dejaría al modelo
sin precio).

**Ficha técnica y cifras.** Una sola llamada a la IA, con las notas de marca
delante (sin internas, sin maquetación, sin su ficha anterior), escribe la ficha
(quién es, qué vende, cómo habla, a quién, límites, contacto, qué falta) y las
cifras vigentes. Cita sus notas con `[[ruta]]`: esos enlaces son las aristas del
grafo, que en el ADN original no existían (0 enlaces, 0 fechas). **Lo que una
persona corrige a mano manda**: no se pisa salvo con `forzar`.

**Frescura.** Ya no depende de sincronizar: el cerebro es la fuente. «Actualizar
lo que cambió» trae de nuevo los archivos del repositorio cuyo SHA cambió, sin
pisar lo corregido a mano ni lo marcado interno.

## Lo medido

Con el ADN real de `Agencia_Workspace`:

| | antes | Fase 0 | cerebro |
|---|---|---|---|
| ADN de Dcasa en una llamada | ≈25 000 tokens | ≈13 700 | — |
| **Una tanda de guiones de Dcasa, entera** | ≈25 000 tokens | ≈14 500 | **≈3 600** |
| … de los que se cachean | 0 | ≈14 000 | ≈1 560 |

La ficha usada en esa medida es una **estimación** (las primeras 3 500 letras del
canon); la real la escribe la IA y hay que revisarla la primera vez. El ahorro
de la Fase 0 va de −31 % (Baby Caleb) a −48 % (Rofer) sobre el ADN; los clientes
sin receta no cambian.

Indexar un cliente entero cuesta 9–30 ms y el índice pesa 150–210 KB.

## Qué se hizo

| | |
|---|---|
| **Fase 0** | Caché de prompt en la generación, sin la maquetación al escribir texto, sin el aviso falso de «sin ADN». |
| **1A** | Motor portado (`worker/lib/cerebro/conocimiento.js`, `memoria.js`), puro y por cliente, con 22 casos de paridad contra Agents Office sobre el ADN real de cinco clientes (se comprobó que fallan si se altera BM25). |
| **1B** | `cerebro_notas` (migración 0024), índice por cliente en R2 (fuera de `clientes/`), rutas `/api/cerebro`. |
| **1C** | Llenar desde el repositorio, sin recortes, idempotente y sin pisar lo corregido a mano. |
| **1D** | La generación usa el cerebro (con vuelta al ADN de la ficha si no hay); la IA escribe la ficha y las cifras. |
| **1E** | La pestaña **Cerebro** (`/cliente/<slug>/cerebro`). |
| **1F** | `buscar_cerebro` para el asistente y para Claude por MCP; el chat recibe ficha + cifras en vez del volcado. |
| **2ª entrega** | El **mapa 3D** del cerebro (pestaña Cerebro → «Mapa 3D»): cada nota una neurona, cada conexión una sinapsis, dentro de un cerebro con lóbulos y hemisferios. Filtra por región, busca (título y texto), enseña internas, vuela a la nota elegida y lanza señales por sus sinapsis. |

## Lo que se aprendió construyéndolo

- **Fuga real cazada por un test con datos reales:** una sección de reglas
  operativas de importación de Baby Caleb («Landed cost = producto + flete…») entraba
  a los textos como si fuera marca. Ahora el título «Reglas operativas» la marca
  interna. (La primera versión marcaba por «operativo», «importación» o «costo»
  sueltos; la revisión vio que escondía datos públicos como «Costo de envío» y
  la lista se estrechó: ocultar de más es un fallo mudo.)
- **Un bug propio:** editar una nota importada le borraba el origen y el archivo, y
  la siguiente importación ya no la reconocía. Ahora el `PUT` los conserva.
- **Una regresión propia de la Fase 0:** el chat perdió la maquetación
  (`buildChatSystemPrompt` también pasa por `buildClientContext`). Corregido, con test.
- **Los informes `[MOCK]` del agente diario** salían entre los primeros resultados de
  una búsqueda de precios. Ahora son `borrador` internos, pesan un 0,4 y nunca llegan
  a un texto.

## Lo que encontró la revisión, y cómo se corrigió

Una revisión independiente del código encontró diez problemas reales. Todos
corregidos, con su caso de prueba:

| Problema | Arreglo |
|---|---|
| `buscar` no devolvía la ficha ni las cifras, y para Claude por MCP y el buscador de la pestaña no hay otro camino | Sólo `contexto()` las aparta; `buscar()` las trata como cualquier nota |
| El chat pedía `loadADN` en cada mensaje: con un cliente sin ADN guardado, releía GitHub cada vez | `adnParaElChat()`: sólo mira el cerebro, lo recuerda un minuto y la pestaña Cerebro lo suelta al cambiar algo |
| Dos escrituras a la vez dejaban el índice de R2 sin una nota, en silencio | El índice guarda la versión de cada nota y `cargarIndice()` la compara con D1: si no coincide, reconstruye |
| Un cerebro con notas pero sin ficha sustituía el ADN de la ficha por unos pasajes sueltos | `usaElCerebro()`: sin ficha se sigue con el ADN guardado; la pestaña lo dice |
| La importación descargaba los archivos cambiados aunque no fuera a pisarlos, y borraba con una consulta por archivo | No se descargan sin «Actualizar»; un solo borrado por tanda |
| Cada edición recalculaba el grafo entero (3–9 ms de CPU) | Se deja pendiente y lo calcula, una vez, quien lo pide |
| «Preparar ficha» reemplazaba una nota ajena que se llamara igual | Sólo reemplaza las suyas (`origen: "ia"`); la nueva toma otra ruta |
| «Interna» por título era demasiado ancha: escondía «Costo de envío» | Lista estrecha; lo demás se avisa en `revisar` |
| Borrar un cliente dejaba su índice —con las notas internas— en R2 | Se borra con el cliente |
| Listar y crear leían el texto de las 400 notas | `resumen` y `caracteres` se guardan al escribir; la lista usa columnas concretas |

## Pendiente, y lo que hay que decidir

1. **Memoria de decisiones (Fase 2).** Lo que el cliente aprueba, rechaza (con
   motivo) o comenta, y lo que el equipo corrige, debería volver al cerebro como
   notas de tipo `decision` y alimentar `reinforce()` (ya portado): aprobado = 1,
   cambios pedidos resta, rechazado = 0. El **silencio no cuenta como éxito**
   (en Agents Office sí, y vale 0,75). Decidir: ¿qué señales cuentan, y desde
   cuándo?
2. **Visualización: hecha, con dos cosas que decidir después.** Se dibuja en un lienzo
   2D propio y no con three.js: 144 kB comprimidos habrían obligado a subir el tope de
   peso, para dibujar decenas de notas. El chunk pesa unos 12 kB y un caso del test de
   bundle vigila que siga así. Lo que **no** está: las **sinapsis que aprenden** (el
   dorado de Agents Office) dependen de la memoria de decisiones (punto 1), y la
   **vista de miles de notas** (WebGL) no hace falta con los clientes de hoy: el mapa
   corre a unos 50 cuadros por segundo con 300 notas y 900 enlaces incluso en un
   navegador sin GPU. Y una observación: el ADN de las agencias trae 0 `[[enlaces]]`, así
   que el mapa depende de que la ficha técnica que escribe la IA cite las notas; sin
   ella se ve casi como una lista, y la pantalla lo avisa.
3. **PDF, Word y Excel.** Agents Office los convierte con librerías de su PC que no
   corren en un Worker. Opciones: convertir en el navegador (carga perezosa) o
   aceptar sólo texto. Hoy sólo se sube `.md`, `.txt`, `.csv` y `.json`, y lo demás se
   rechaza diciendo por qué.
4. **Volver a escribir en la Workspace.** El cerebro no exporta al repositorio. Si
   se quiere mantener como copia al día, hace falta permiso de escritura y una
   decisión sobre conflictos.
5. **Estudio de imágenes/video de Agents Office** (73 modelos frente a uno).
   Portable por fases, no llamando a la oficina por HTTP (escucha sólo en localhost y
   sin login).
6. **Meta (Muse Spark) como proveedor de IA.** Piloto sólo para textos, con una
   columna `ia_proveedor` sin CHECK. Necesita una key de la API de Meta y
   comprobar su compatibilidad con la API de Anthropic, que no se pudo verificar.
7. **Puente con Agents Office.** El MCP del calendario se puede enchufar a sus
   agentes, pero **antes hay que corregir su guardián de seguridad**: `safety.kindOf`
   clasifica como *lectura* 7 de las 10 herramientas de escritura del calendario
   (`programar_publicacion`, `mover_publicacion`, `programar_lo_aprobado`…), así que
   un agente podría programar en Instagram sin pedir el OK del dueño.

## Riesgos y cosas a vigilar

- **La ficha la escribe una IA.** Puede omitir una regla. Se revisa la primera vez, se
  edita en la pestaña, y lo editado manda.
- **Cada tanda hace una petición más** (los pasajes). Es una lectura de R2 y unos
  milisegundos de búsqueda; si molestara, se puede pedir una vez por generación.
- **Importar no es atómico:** al actualizar, se borran las notas sin tocar (una sola
  tanda para todos los archivos) y luego se insertan las nuevas. Un fallo entre las dos deja el archivo a medias; volver a
  pulsar «Actualizar» lo repara. D1 no ofrece una transacción entre `borrarVarios` y
  `guardarVarios`.
- **Plan gratuito de Workers.** Una importación son 41 peticiones de salida (el árbol
  y 40 archivos) y unas decenas de consultas a D1. Si la cuenta es de pago, sobra.
- **El repositorio se irá quedando viejo** para quien lo lea directamente (sesiones de
  Claude Code sobre ese repo, `verificar.mjs`, los tests de recetas). Es la
  consecuencia de que el cerebro mande.
- **Por qué no se copió Agents Office entero:** no separa clientes (un índice
  compartido pisa los nueve `01_brand_guidelines.md` en silencio) y guarda en
  archivos de un PC, sin permisos. Se copió lo que sabe hacer —leer y recordar— y se
  puso encima lo que ya tenía el calendario: D1, R2, dueño y cliente por fila.
