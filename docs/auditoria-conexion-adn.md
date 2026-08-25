# Auditoría · La conexión con Agencia_Workspace

Fecha: 2026-08-25. Alcance: cómo la aplicación lee el ADN de los clientes
desde GitHub, qué llega al modelo y qué se pierde por el camino.

---

## El hallazgo, en una frase

**De los clientes que tienen el ADN más completo llegaba al modelo el 20 %.**
El resto lo cortaba la función de lectura sin decirlo.

| Cliente | Caracteres de ADN | Llegaban | |
|---|---|---|---|
| Juancito Ads | 58 407 | 12 000 | **20 %** |
| Dcasa | 50 807 | 12 000 | **23 %** |
| Baby Caleb | 24 900 | 8 499 | 34 % |
| Feria del lente | 20 380 | 9 000 | 44 % |
| 57Dmc | 8 897 | 5 072 | 57 % |
| Fotosonido | 2 498 | 2 498 | 100 % |

La correlación es la peor posible: **cuanto mejor documentado está un
cliente, menos de su ADN llegaba.** Fotosonido pasaba entero porque su ADN
es una plantilla sin rellenar.

---

## Las siete causas

### 1. El corte a 3000 caracteres por archivo

`MAX_CHARS_PER_FILE = 3000` en `github-adn/index.ts`. El
`05_prompt_maestro_meta_ai.md` de Dcasa tiene 26 954 caracteres: se leían
los 3000 primeros, que son la introducción. **El formato de entrega, las
cuatro plantillas, la escala, el bloque de estilo, los negativos y el
contrato del HTML no cruzaban nunca.** El corte caía dentro de una tabla, a
mitad de una fila.

### 2. Sólo dos carpetas, sin recorrer el árbol

`const paths = basePath ? [basePath, ${basePath}/adn] : ...`. La carpeta de
un cliente en Agencia_Workspace (`Dcasa/`) sólo contiene subcarpetas
`01`–`06`, así que apuntando ahí **no llegaba ni un archivo**. Había que
apuntar a mano a `Dcasa/01_ADN_y_Memoria`, y aun así quedaban fuera
`03_Redes_Sociales/Calendarios_Aprobados/` —lo ya publicado, que el estándar
manda revisar para no repetir— y `Assets_Visuales_Base/`.

### 3. Los `.json` no se leían

El filtro era `/\.(md|txt)$/i`. El `03_diccionario_seo.json` de cada cliente
quedaba fuera entero.

### 4. Cinco archivos como tope, sin prioridad

`MAX_FILES = 5`, servidos en orden alfabético. Con seis archivos, el sexto
desaparecía en silencio, sin que importara si era el que definía la marca.

### 5. El ADN entraba como «contexto adicional»

`buildClientContext()` ponía primero la ficha de la aplicación —nueve campos
cortos que alguien tecleó una vez— y el ADN del repositorio al final, bajo el
título `CONTEXTO ADICIONAL DEL CLIENTE`. **El modelo leía como accesorio lo
que el orquestador define como fuente de verdad**, y como autoritativo un
resumen de trece cadenas.

### 6. El ADN se congelaba en la primera lectura

`client.githubContext || (leer de GitHub)`: una vez cacheado, ganaba siempre.
Un cambio en el repositorio no llegaba nunca a la aplicación.

### 7. El modelo y el tope de tokens

`claude-haiku-4-5` para todo y `MAX_TOKENS_CAP = 4096`. Suficiente para un
caption; insuficiente para un prompt maestro, que se cortaba a media pieza
sin que el navegador pudiera distinguirlo de una respuesta terminada.

---

## Qué se cambió

| Antes | Ahora |
|---|---|
| 3000 caracteres por archivo | Presupuesto de 200 000 repartido por prioridad: la receta y las guías de marca entran completas |
| Dos carpetas fijas | El árbol entero en una llamada (`git/trees?recursive=1`), hasta 3 niveles |
| `.md` y `.txt` | `.md`, `.txt`, `.json`, `.yml` |
| 5 archivos alfabéticos | 40 archivos por prioridad declarada |
| Truncado silencioso | Cada archivo reporta si se recortó; la interfaz lo dice |
| ADN al final, como «adicional» | ADN primero, con la jerarquía de autoridad escrita |
| Caché eterno | `loadADN(client, { forzar })` y recompilación por SHA del archivo de origen |
| Haiku para todo, 4096 tokens | Dos niveles (`rapido` / `calidad`), 32 000 tokens, y aviso si la respuesta se cortó |
| Sin caché de prompt | El ADN va marcado con `cache_control`: se paga una vez por tanda |

---

## Lo que sigue pendiente

- **`57Dmc` y `Fotosonido` no pueden generar prompt maestro todavía.** El
  primero tiene los HEX como estimación visual (marcados ⏳ en su ADN); el
  segundo tiene el ADN sin extraer. Escribirles la receta sería inventar la
  identidad de marca, que es la regla que el orquestador pone primero.
  La aplicación lo dice en pantalla, con la lista de lo que falta y de qué
  archivo tendría que salir.
- **Ningún cliente tiene el logo en `Assets_Visuales_Base/`** salvo Dcasa. Sin
  archivo, el HTML de Meta AI se entrega igual y el humano lo carga al
  abrirlo; con archivo en la ficha del cliente, la aplicación ofrece la línea
  en base64 para pegarla y que salga ya compuesto.
