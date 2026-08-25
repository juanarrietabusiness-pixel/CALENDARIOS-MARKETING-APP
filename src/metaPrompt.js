// ============================================================
// Prompt maestro para Meta AI
//
// Meta AI hace dos cosas: genera los fondos y monta el HTML. No escribe
// una sola palabra de la marca. Esa división de trabajo es el estándar de
// la agencia (`00_Estandares_Agencia/formato_prompt_maestro_meta_ai.md`)
// y aquí está escrita en código.
//
// ---- Por qué esto se ensambla en JavaScript y no lo redacta la IA ----
//
// Las siete secciones del prompt son siempre las mismas y en el mismo
// orden. Las que fijan la retícula, la escala, el bloque de estilo, los
// negativos y el contrato del HTML son literales: si un modelo las
// reescribe «mejor», deja de ser el prompt que funciona. Así que la IA
// escribe SÓLO la sección 6 —las piezas, con sus titulares, sus cortes de
// línea y su acento— y el resto se copia de la receta del cliente sin
// pasar por ningún modelo.
//
// La receta sale de `01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md` del
// cliente, en su repositorio. El repositorio manda; esto sólo lo formatea.
// ============================================================

/** Los tres modos del estándar. Cambia qué es «una pieza» y cómo se agrupan. */
export const MODOS_META = {
  lote:     { label: "Lote del mes",  piezas: "10 a 12", descripcion: "una por pieza", hashtags: "por pieza", numerador: false },
  semana:   { label: "Semana",        piezas: "4 a 5",   descripcion: "una por pieza", hashtags: "por pieza", numerador: false },
  carrusel: { label: "Carrusel",      piezas: "4 a 10",  descripcion: "una sola para el conjunto", hashtags: "un solo juego al final", numerador: true },
};

const LIENZO_POR_DEFECTO = { ancho: 1080, alto: 1350 };

import { componerPieza } from "./lib/componer";

// Se reexporta para que el diálogo pueda enseñar lo que la composición
// encontró —un titular que no cabe, uno que bajó de cuerpo— antes de que el
// humano pegue el prompt en Meta AI.
export { avisosDeComposicion } from "./lib/componer";

const lista = (xs, vacio = "—") =>
  Array.isArray(xs) && xs.length ? xs.map((x) => `· ${x}`).join("\n") : vacio;

const bloque = (texto) => (texto ? String(texto).trim() : "");

/**
 * Sección 1 · Qué eres y qué no haces.
 *
 * Va la primera y se repite entera en la 7. No es redundancia: en un
 * prompt largo, una sola mención se le olvida a la mitad.
 */
function seccionUno(receta, modo, piezas) {
  const n = piezas.length;
  const { ancho, alto } = receta.lienzo || LIENZO_POR_DEFECTO;
  const esCarrusel = modo === "carrusel";

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · QUÉ ERES Y QUÉ NO HACES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tienes exactamente dos trabajos:

1. Generar ${n} fondos, uno por pieza, siguiendo el prompt de fondo que
   cada una trae escrito. Ningún fondo lleva una sola letra dentro.
2. Devolver UN documento HTML donde las ${n} piezas se ven ya compuestas
   y se pueden descargar en PNG a ${ancho}×${alto} exactos.

No escribas, no redactes, no completes, no acortes, no traduzcas y no
"mejores" ningún texto. Todo el texto de este documento ya está escrito
más abajo. Cópialo carácter por carácter, con sus tildes, sus eñes y sus
puntos finales. Si algo te parece incompleto, déjalo como está: está así
a propósito.

No añadas ninguna cifra, porcentaje, estadística, plazo, testimonio ni
beneficio que no esté escrito literalmente en este documento.

No cambies el orden de las piezas, no añadas una pieza más, no añadas
hashtags y no añadas emojis en ningún sitio.

No generes ningún logotipo: ni el de la marca, ni el de una red social,
ni el de un tercero. El logo de la marca lo carga el humano en el propio
documento; tú sólo dejas el hueco y lo compones. Está en la sección 3.
${receta.productoFisico ? `
Y una prohibición más, porque esta marca vende producto físico: no
generes el producto, ni clientes, ni entregas. Dibujar el producto y
ponerle un precio al lado es anunciar algo que la tienda quizá no tiene.
` : ""}${esCarrusel ? `
Las ${n} diapositivas son UN SOLO CARRUSEL, en orden, con una sola
descripción para todo el conjunto. No cambies el orden de las
diapositivas, no añadas una más, no añadas hashtags y no añadas emojis
en ningún sitio. Todas llevan numerador (01/${String(n).padStart(2, "0")} … ) y el mismo
anclaje: el anclaje no salta de una diapositiva a otra.
` : ""}`;
}

/** Sección 2 · El sistema visual. Todo sale de la receta del cliente. */
function seccionDos(receta) {
  const { ancho, alto } = receta.lienzo || LIENZO_POR_DEFECTO;

  const colores = (receta.colores || [])
    .map((c) => `· ${c.hex}${c.nombre ? ` — ${c.nombre}` : ""}: ${c.rol}`)
    .join("\n");

  const prohibidos = (receta.coloresProhibidos || [])
    .map((c) => `· ${typeof c === "string" ? c : `${c.hex || c.nombre}${c.porque ? ` — ${c.porque}` : ""}`}`)
    .join("\n");

  const familias = (receta.fuentes?.familias || [])
    .map((f) => `· ${f.nombre}${f.pesos ? ` (${f.pesos})` : ""} — ${f.rol}. No la uses para nada más.`)
    .join("\n");

  const escala = (receta.escala || [])
    .map((e) => {
      const partes = [`${e.px} px`];
      if (e.interlinea) partes.push(`interlínea ${e.interlinea}`);
      if (e.tracking) partes.push(`tracking ${e.tracking}`);
      if (e.mayusculas) partes.push("MAYÚSCULAS");
      return `· ${e.elemento}: ${partes.join(", ")}`;
    })
    .join("\n");

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · EL SISTEMA VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LOS COLORES Y SU PAPEL
${colores || "—"}

COLORES QUE NO PUEDEN APARECER, tampoco en la interfaz del documento:
${prohibidos || "—"}
${(receta.combinacionesProhibidas || []).length ? `
COMBINACIONES QUE NO SE LEEN Y NO SE USAN NUNCA:
${lista(receta.combinacionesProhibidas)}

Busca esa combinación en tu propio código y corrígela. Se ve "bien" en la
pantalla de quien la montó y no se lee en el teléfono de quien la recibe.
` : ""}
LAS FAMILIAS TIPOGRÁFICAS Y SU PAPEL CERRADO
${familias || "—"}
${(receta.fuentesProhibidas || []).length ? `
No las sustituyas por estas, aunque te parezcan iguales:
${lista(receta.fuentesProhibidas)}
` : ""}
LA RETÍCULA, en píxeles sobre ${ancho}×${alto}
${bloque(receta.reticula?.texto) || "—"}

Nada de "arriba", "centrado" o "un poco más abajo": todo va en píxeles.
Si un elemento se posiciona por su BASE y no por su borde superior, está
dicho pieza por pieza y se respeta.

EL ANCLAJE
${bloque(receta.anclaje) || "—"}

EL ORDEN DENTRO DEL BLOQUE DE TEXTO — el mismo en todas las piezas:
${(receta.ordenBloque || []).map((x, i) => `${i + 1}. ${x}`).join("\n") || "—"}

LA ESCALA COMPLETA
${escala || "—"}

El tamaño del titular ya está decidido pieza por pieza. No lo recalcules,
no lo ajustes para que "cuadre mejor", no lo reduzcas para que quepa: los
cortes de línea ya están escritos y con ellos cabe.

LA REGLA DEL ACENTO
${bloque(receta.acento?.regla) || "Hay un solo acento por titular."}

Los corchetes ⟦ ⟧ son marcas para ti: NO se imprimen, no aparecen en el
lienzo, no aparecen en el PNG. Solo dicen dónde empieza y dónde termina
el acento. Todo lo que quede fuera de ellos va en el color base.
El tramo puede cruzar un salto de línea. Cuando lo hace, sigue siendo un
solo tramo.
${receta.velo ? `
EL VELO
${bloque(receta.velo)}

Ninguna caja detrás del texto. Ni tarjeta, ni franja, ni rectángulo
semitransparente, ni sombra sobre las letras. El contraste lo pone el velo,
que es continuo y no tiene borde. Una caja detrás de un titular es la señal
más rápida de que la pieza se maquetó sin sistema.

Y si con el velo puesto el titular todavía compite con la imagen, EL FONDO
ESTÁ MAL GENERADO: se regenera pidiendo que el detalle se apague antes de
llegar al carril del texto. No se sube el velo hasta tapar la imagen.
` : ""}
LA INTERLÍNEA DEL TITULAR NO ES UN NÚMERO: ES UNA CUENTA
${interlineado(receta)}

DÓNDE SE ANCLA EL BLOQUE — sobre la versalita, no sobre la tinta
El tope del bloque es el TOPE DE VERSALITA de la primera línea, y la base es
la LÍNEA BASE de la última. Nunca la caja de tinta.
Si se midieran sobre la tinta, una pieza cuyo titular empieza con tilde
caería respecto de otra que no la lleva, y dos piezas del mismo mes no
cuadrarían. La tilde de la primera línea vive en el aire de encima.

Y NO LO RECORTES
Con la interlínea por debajo de 1, la tinta de la primera línea sale por
encima de su propia caja de línea. Cualquier recorte sobre el bloque de
texto —una caja de alto fijo que corte lo que sobra, un overflow:hidden— le
rasura la tilde a la primera línea. El bloque no lleva recorte de ningún tipo.

LOS CORTES DE LÍNEA SE ESCRIBEN, NO SE CALCULAN
Cada titular llega con sus saltos ya decididos. Son saltos duros: no dejes
que el navegador reparta las palabras por su cuenta. Y están cortados por
unidad de sentido, con estas tres reglas:

1. Una unidad de sentido por línea. Sujeto, o verbo con su objeto, o el
   remate. No se parte un sustantivo de su adjetivo.
2. Sin líneas huérfanas, salvo que la huérfana sea el remate. Una
   preposición sola nunca.
3. La última línea lleva el punto. El titular de esta marca termina.`;
}

/**
 * La cuenta de la interlínea, con los valores medidos de la familia.
 *
 * Es lo que más rompe una pieza en español sin que nadie sepa nombrarlo: la
 * tilde de una Á y el trazo de una Ñ se comen la línea de arriba cuando la
 * interlínea baja de 1. Los valores no son de gusto ni se copian de otra
 * marca: son exactamente lo que sobresale la tinta de ESA familia, y por eso
 * viven en la receta del cliente y no aquí.
 */
function interlineado(receta) {
  const i = receta.interlineado;
  if (!i) {
    return `Los cortes y la interlínea de cada titular vienen ya decididos. No los
recalcules.`;
  }

  const sup = Object.entries(i.holguraSuperior || {})
    .map(([chars, v]) => `· Si la línea de ABAJO lleva  ${chars}   →  suma ${v}`)
    .join("\n");
  const inf = Object.entries(i.holguraInferior || {})
    .map(([chars, v]) => `· Si la línea de ARRIBA lleva ${chars}  →  suma ${v}`)
    .join("\n");

  return `${i.formula || "avance(n → n+1) = base + holguraSuperior(línea n+1) + holguraInferior(línea n)"}

La interlínea base es la de su tamaño, la que dice la escala de arriba, y NO
se aplica igual a todas las líneas:

${sup}
${inf}

Las dos se suman cuando coinciden. Una línea con tilde debajo de otra que
termina en coma lleva las dos holguras.

SE CALCULA PARA CADA PAR DE LÍNEAS CONSECUTIVAS, SIN EXCEPCIÓN. No sólo para
el primer par que se note. Un titular de cuatro líneas con tilde en la 2 y
eñe en la 3 lleva DOS holguras distintas, una en cada par. El error más caro
aquí no es olvidar la fórmula: es aplicarla al primer par y dejar el resto
del bloque en la interlínea base, como si ya estuviera resuelto. Recorre las
N líneas del titular una por una, del primer par al último.

En HTML esa holgura es un margen superior en «em» sobre la línea que la
necesita, con la interlínea base puesta en el bloque. En el lienzo de
exportación es ese mismo valor sumado al avance vertical de esa línea.

Cada holgura es exactamente lo que sobresale la tinta, ni un punto más: el
hueco óptico que queda es el mismo que ya había entre dos líneas sin tilde,
así que el bloque se sigue viendo igual de apretado. NO subas la interlínea
de todas las líneas para arreglarlo: eso afloja el bloque entero para
resolver dos líneas, y deja de ser el titular de esta marca.

${i.seAplicaA ? `Dónde NO se toca: ${i.seAplicaA}` : ""}`;
}

/**
 * Sección 3 · El contrato del HTML.
 *
 * Aquí vive la decisión que separa este sistema del de una marca con logo
 * vectorial: los clientes de la agencia tienen logos 3D y rasterizados que
 * ningún modelo reproduce. Así que el logo no se describe, no se redibuja
 * y no se genera — se carga desde el disco y se compone.
 */
function seccionTres(receta, modo, piezas) {
  const n = piezas.length;
  const esCarrusel = modo === "carrusel";
  const { ancho, alto } = receta.lienzo || LIENZO_POR_DEFECTO;
  const logo = receta.logo || {};
  const proporcion = logo.proporcion || "la del archivo, sin deformar";
  const anchoLogo = logo.ancho || 360;

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · EL CONTRATO DEL HTML
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LAS FUENTES
Cárgalas desde Google Fonts con esta URL exacta:
${receta.fuentes?.url || "—"}

Sin esas fuentes todo lo demás da igual: el navegador cae a una del
sistema y la pieza deja de ser de la marca.

EL LIENZO
Cada pieza se maqueta a ${ancho}×${alto} exactos y se exporta a ${ancho}×${alto}
exactos. Sin librerías externas: fondo, logo y texto se dibujan sobre un
<canvas>.

EL LOGO — ES UN ARCHIVO, NO UN DIBUJO
Esta es la parte que más se rompe, así que va entera.

No generes el logo. No lo redibujes. No lo describas con formas. No lo
aproximes. No lo sustituyas por texto con la tipografía de la marca. El
logo de esta marca es una imagen que el humano tiene en su disco.

El documento lleva, ARRIBA DEL TODO y una sola vez para las ${n} piezas:

  <input type="file" id="logoMarca" accept="image/png,image/svg+xml,image/*">

junto a un texto que diga: «Logo de la marca — cárgalo una vez y se
aplica a las ${n} piezas.» Al elegir el archivo se lee con FileReader, se
guarda en un Image() y se dibuja en TODAS las piezas a la vez, en la vista
previa y en el PNG exportado.

Además, justo encima del script, deja esta constante tal cual:

  const LOGO_MARCA = ""; // la agencia puede pegar aquí el data:image/...;base64

Si LOGO_MARCA trae contenido, se usa ese y el selector de archivo queda
como reemplazo opcional. Si está vacío, manda el archivo que cargue el
humano. Nada de esto sale del navegador: el archivo se lee con FileReader
y se dibuja en el <canvas>. No se sube a ningún sitio.

Cómo se compone el logo, y ninguna de estas cinco es cuestión de gusto:

1. Proporción intocable: ${proporcion}. Calcula el alto a partir del ancho
   con la proporción real del archivo cargado (naturalWidth / naturalHeight).
   Nunca lo metas en un cuadrado ni lo estires para que llene una caja.
2. Caja: ${anchoLogo} px de ancho, ${logo.posicion || "esquina inferior derecha"}.
   ${logo.ancla ? `Se posiciona por ${logo.ancla}.` : ""}
3. Espacio de resguardo: ${logo.resguardo || "al menos un 18 % de su alto libre por los cuatro lados"}.
   Nada de texto ni de borde de foto dentro de esa franja.
4. Nunca se recolorea, ni se pone en blanco y negro, ni se le baja la
   opacidad, ni se le añade sombra, borde o marco. Es un archivo del
   cliente: cualquier retoque se ve.
5. ${logo.sobreFondo || "Va sobre una zona limpia del fondo. Sobre una zona con detalle desaparece."}
${(logo.reglas || []).length ? `\n${lista(logo.reglas)}\n` : ""}
MIENTRAS NO HAYA LOGO CARGADO:
La zona del logo muestra un rectángulo punteado con el texto «LOGO DE LA
MARCA — cárgalo arriba» y **el botón de descarga de esa pieza avisa y NO
exporta**. Un PNG con el rectángulo de "cárgalo aquí" dentro se publica
por error una de cada tres veces; por eso el botón bloquea en vez de
avisar y dejar pasar.
${receta.fotoReal ? `
EL HUECO PARA LA FOTO REAL
Las piezas marcadas con FOTO REAL en la sección 6 llevan además su propio
<input type="file" accept="image/*">. Al elegir una foto del disco se
dibuja en la zona de imagen de esa pieza, ajustada con object-fit: cover,
y queda incluida en el PNG. Mientras no se cargue nada, esa zona muestra
un rectángulo con el texto «FOTO REAL — cárgala aquí», y el botón de
descarga de esa pieza tampoco exporta.
` : ""}
${esCarrusel ? `EL CARRUSEL SE MONTA COMO UNA TIRA, NO COMO ${n} PIEZAS SEGUIDAS
Un carrusel es una pieza larga cortada. El documento tiene que dejar ver las
dos cosas, y en este orden:

1. Primero LA TIRA: las ${n} diapositivas en fila, pegadas por el borde, sin
   ninguna separación, margen ni borde entre ellas, reducidas para que
   quepan a lo ancho. Es la única vista donde se ven las costuras.
2. Debajo, cada diapositiva por separado, a su tamaño de vista previa y con
   su botón de descarga.

El fondo del carrusel es UNA sola imagen panorámica que cubre ${ancho * n}×${alto}.
La diapositiva k NO lleva su propia imagen: lleva la panorámica entera
desplazada −${ancho}·k. En la vista previa eso es background-position; en el
lienzo de exportación es la misma imagen dibujada con ese desplazamiento.

El velo es vertical y con exactamente los mismos valores en las ${n}
diapositivas. El brillo de la imagen es exactamente el mismo número en las
${n}. Si cambia entre diapositivas, aparece un escalón en cada costura.

El antetítulo, el anclaje del bloque de texto y el tamaño del titular no
cambian entre diapositivas salvo que el texto de cada una lo diga.

Por qué la tira va primero: una diapositiva suelta puede estar perfecta y
romper el carrusel. Un escalón de brillo o un punto focal partido por la
mitad sólo se ven con las ${n} pegadas. Si el documento no las enseña juntas,
ese fallo llega a la publicación.

` : ""}CADA PIEZA Y SU DESCARGA
· Un botón por pieza, que la descarga en PNG a tamaño real.
· Un botón que descargue las ${n}, con los nombres numerados:
  ${receta.slug || "marca"}-01.png … ${receta.slug || "marca"}-${String(n).padStart(2, "0")}.png
· Debajo de cada pieza, en texto seleccionable y copiable: su descripción,
  sus hashtags${modo === "carrusel" ? " (los del conjunto, una sola vez al final)" : ""}, su guion si lo lleva, y el prompt del fondo por si
  hay que regenerar la imagen.

LA REGLA DEL EXPORTADOR — el fallo más caro, y falla en silencio
La vista previa se ve perfecta y el PNG sale roto. La causa casi siempre
es la misma: el <canvas> vuelve a maquetar el texto por su cuenta en vez
de leer dónde quedó.

· Maqueta cada línea del titular como su propio elemento en el HTML.
· Al exportar, lee la posición Y de CADA elemento ya maquetado con
  getBoundingClientRect() u offsetTop, y dibuja en esa Y.
· No estimes multiplicando líneas por interlínea, no vuelvas a partir la
  bajada con otro ancho, no recalcules dónde empieza el bloque.
· Espera a que las fuentes estén listas —await document.fonts.ready— ANTES
  de medir nada y ANTES de exportar. Si mides con la fuente de reserva,
  todo lo demás queda mal colocado.
· Espera también a que el logo esté decodificado —await img.decode()—
  antes de dibujarlo. Un logo a medio cargar sale en blanco en el PNG y
  perfecto en la vista previa.

Con el canvas leyendo del DOM, casi todas las trampas de abajo dejan de
poder ocurrir. Aun así van escritas, porque cada una es un fallo observado:

1. ctx.letterSpacing NO se reinicia al cambiar ctx.font. Si lo usas para
   el tracking del wordmark o del antetítulo, ponlo a '0px' inmediatamente
   después de dibujarlo. Si no, el tracking se filtra al titular y el
   titular se sale del lienzo.
2. Fija ctx.textBaseline='top' antes de dibujar. Una interlínea menor que
   1 sube la primera línea por encima del borde del bloque: por eso la Y
   se lee del elemento, no se supone.
3. Mide el alto real del bloque con getBoundingClientRect() del elemento
   ya maquetado. No lo estimes: el anclaje al centro óptico se descuadra
   respecto a lo que se ve.
4. Los elementos que se posicionan por su BASE (logo, bandas, placas) se
   dibujan por su base. Colocarlos por el borde superior los deja fuera
   del lienzo o comidos por el margen.
5. Un botón que lanza muchas descargas seguidas lo bloquea el navegador a
   la tercera. Sepáralas con una pausa de unos 300 ms y avisa de que hay
   que permitirlas, o agrúpalas en un ZIP de verdad.
6. El avance vertical entre líneas del titular NO es líneas × interlínea.
   Lleva la holgura de las tildes sumada línea a línea (sección 2). Acumula
   el avance real; si lo calculas multiplicando, el PNG sale con las líneas
   comidas aunque la vista previa esté bien, o al revés.${esCarrusel ? `
7. El fondo de cada diapositiva es un TROZO de una sola imagen. Se dibuja la
   panorámica entera desplazada −${ancho}·k, no una imagen por diapositiva. Si
   recortas y reescalas cada trozo por separado, los redondeos dejan una
   línea de costura de uno o dos píxeles en cada corte.` : ""}
${(receta.trampasPropias || []).length ? `\nY estas, propias de esta marca:\n${lista(receta.trampasPropias)}\n` : ""}
LA INTERFAZ DEL DOCUMENTO
${bloque(receta.interfaz) || "Sobria y con los colores de la marca. Ningún color fuera de la paleta, tampoco aquí."}`;
}

/** Sección 4 · El bloque de estilo. Literal, una vez, idéntico para todas. */
function seccionCuatro(receta) {
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · EL BLOQUE DE ESTILO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este párrafo se aplica a TODOS los fondos del lote, idéntico, sin
variaciones y sin adaptarlo pieza por pieza. Es lo que hace que las
imágenes se vean de la misma marca:

${bloque(receta.bloqueEstilo) || "—"}`;
}

/** Sección 5 · Los negativos. Literales. */
function seccionCinco(receta, negativosDelLote) {
  const extra = (negativosDelLote || []).length
    ? `\n\nY los propios de este lote:\n\n${negativosDelLote.join(", ")}`
    : "";
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · LOS NEGATIVOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nada de esto puede aparecer en ninguna imagen generada:

${bloque(receta.negativos) || "—"}${extra}`;
}

/**
 * La interlínea de este titular, ya calculada.
 *
 * No es la fórmula: son los números. La skill de PanaClaw lo dice en una
 * línea —«se entrega resuelta, no como regla: si Meta tiene que decidirlo,
 * no lo hace»— y es la diferencia entre un prompt que se ejecuta y uno que
 * se interpreta. El motivo de cada holgura va escrito para que el humano
 * pueda comprobar el resultado sin rehacer la cuenta.
 */
function interlineaResuelta(pieza) {
  const pares = pieza._interlinea;
  if (!pares || !pares.length) return "";

  const filas = pares.map((x) => {
    const px = String(x.avancePx).padStart(4);
    return `  línea ${x.de} → ${x.a}:  ${x.avanceEm.toFixed(2)} em = ${px} px   (${x.porque})`;
  }).join("\n");

  const hayHolgura = pares.some((x) => x.holguraSuperior || x.holguraInferior);

  return `INTERLÍNEA YA RESUELTA — usa estos avances tal cual, NO los recalcules:
${filas}${hayHolgura ? `

Los avances que llevan holgura no son un error de redondeo: son exactamente
lo que sobresale la tinta de esa tilde o esa cola. Si los igualas todos a la
interlínea base, la tilde cae dentro de las letras de la línea de arriba.` : ""}`;
}

/** Sección 6 · Las piezas. Es lo único que escribe la IA. */
function seccionSeis(receta, modo, piezas) {
  const esCarrusel = modo === "carrusel";
  const total = piezas.length;

  const fichas = piezas.map((p, i) => {
    const num = String(p.n ?? i + 1).padStart(2, "0");
    const titular = Array.isArray(p.titular) ? p.titular.join("\n") : String(p.titular || "");
    const lineas = Array.isArray(p.titular) ? p.titular.length : String(p.titular || "").split("\n").length;

    const campos = [
      p.plantilla ? `PLANTILLA: ${p.plantilla}` : "",
      p.formato ? `FORMATO: ${p.formato}` : "",
      p.fecha ? `SE PUBLICA: ${p.fecha}` : "",
      esCarrusel ? `NUMERADOR: ${num}/${String(total).padStart(2, "0")}` : "",
      p.antetitulo ? `ANTETÍTULO: ${p.antetitulo}` : "",
      `TITULAR — ${lineas} línea${lineas === 1 ? "" : "s"}${p._tamano ? `, ${p._tamano.familia || ""} ${p._tamano.px} px` : ""}, cortes exactos:\n${titular}`,
      interlineaResuelta(p),
      p.bajada ? `BAJADA: ${p.bajada}` : "",
      p.cifra ? `CIFRA: ${p.cifra}` : "",
      p.nota ? `NOTA: ${p.nota}` : "",
      p._anclaje
        ? `ANCLAJE: ${p._anclaje.nombre} — ${p._anclaje.donde}`
        : p.anclaje ? `ANCLAJE: ${p.anclaje}` : "",
      p.fotoReal ? "FOTO REAL: sí — esta pieza lleva su propio selector de archivo" : "",
      `PROMPT DEL FONDO:\n${p.promptFondo || "—"}`,
      p.guion ? `GUION (va debajo de la pieza, en texto seleccionable, NO dentro de la imagen):\n${p.guion}` : "",
      esCarrusel ? "" : `DESCRIPCIÓN (va debajo de la pieza, NO dentro de la imagen):\n${p.descripcion || "—"}`,
      esCarrusel ? "" : `HASHTAGS: ${p.hashtags || "—"}`,
    ].filter(Boolean);

    return `── PIEZA ${num} ${"─".repeat(Math.max(0, 46 - num.length))}\n${campos.join("\n\n")}`;
  }).join("\n\n");

  const comun = esCarrusel
    ? `\n\n── UNA SOLA DESCRIPCIÓN PARA EL CARRUSEL ENTERO ──\n\n${piezas[0]?.descripcionConjunto || piezas[0]?.descripcion || "—"}\n\nHASHTAGS (un solo juego, al final):\n${piezas[0]?.hashtagsConjunto || piezas[0]?.hashtags || "—"}`
    : "";

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6 · LAS PIEZAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Son ${total}, en este orden. Todo el texto de aquí abajo ya está escrito:
se copia, no se redacta.

${fichas}${comun}`;
}

/** Sección 7 · Antes de devolver. La prohibición otra vez, y la lista. */
function seccionSiete(receta, modo, piezas) {
  const n = piezas.length;
  const esCarrusel = modo === "carrusel";
  const { ancho, alto } = receta.lienzo || LIENZO_POR_DEFECTO;

  const tildes = (receta.tildes || []).length
    ? `[ ] ¿Están escritas con su tilde o su eñe, una por una: ${receta.tildes.join(", ")}?`
    : "[ ] ¿Está el texto con todas sus tildes y todas sus eñes?";

  const cifras = (receta.cifrasPermitidas || []).length
    ? `[ ] Las únicas cifras que pueden aparecer son: ${receta.cifrasPermitidas.join(", ")}.\n    ¿Aparece alguna otra? Quítala.`
    : "[ ] ¿Añadiste alguna cifra, dato, testimonio o beneficio que no estuviera\n    escrito? Quítalo.";

  const hashtags = receta.hashtags?.cantidad
    ? `[ ] ¿Tiene cada descripción exactamente ${receta.hashtags.cantidad} hashtags, ${receta.hashtags.donde || "al final"}?`
    : "";

  const emojis = receta.emojis
    ? `[ ] ¿Hay ${receta.emojis.cantidad ?? 0} emojis dentro de las imágenes? Dentro del lienzo no va ninguno.`
    : "";

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7 · ANTES DE DEVOLVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Repito la prohibición entera, porque en un prompt de este tamaño se
olvida a la mitad:

No escribas, no redactes, no completes, no acortes, no traduzcas y no
"mejores" ningún texto. Cópialo carácter por carácter. No añadas ninguna
cifra, porcentaje, estadística, plazo, testimonio ni beneficio que no
esté escrito literalmente aquí. No cambies el orden, no añadas una pieza
más, no añadas hashtags, no añadas emojis. No generes ningún logotipo.

Y ahora recorre esta lista una por una:

[ ] ¿Son ${n} lienzos, en orden, y cada uno mide ${ancho}×${alto} exactos?
[ ] ¿Cada titular tiene los mismos saltos de línea que le puse, sin
    recolocar ni una palabra?
${tildes}
[ ] ¿Hay UN SOLO acento por titular, y coincide exactamente con lo que
    iba entre ⟦ ⟧?
[ ] ¿Se te ha colado algún corchete ⟦ o ⟧ dentro de un lienzo o de un PNG?
[ ] ¿Aparece algún color fuera de la paleta, incluida la interfaz del
    documento?
[ ] ¿Están todas las familias tipográficas en su papel, y ninguna otra?
[ ] ¿El orden dentro del bloque de texto es siempre el mismo?
[ ] ¿Hay alguna caja, tarjeta, franja o sombra detrás del texto que no
    estuviera pedida?
[ ] ¿Algún fondo generado tiene letras, números, iconos o logotipos dentro?
[ ] ¿Asoma alguna forma o resplandor del fondo detrás del logo?
[ ] ¿Dibujaste tú algún logo, en vez de componer el archivo que carga el
    humano? Si lo hiciste, quítalo y deja el hueco.
[ ] ¿Bloquea de verdad la descarga cuando no hay logo cargado?
[ ] Busca las tildes, las eñes y los signos de apertura del titular.
    ¿Cada línea que lleva una tiene su holgura sumada al avance? Y si encima
    de ella hay una Q, un ¿, un ¡ o una coma, ¿está sumada también la de
    abajo?
[ ] Si el titular tiene más de un par de líneas que necesita holgura, ¿está
    calculada en CADA par, o sólo en el primero que se notó?
[ ] Amplía el titular y mira el punto donde una tilde queda debajo de una
    letra. Si se tocan, falta holgura. Si hay un dedo de aire, sobra.
[ ] ¿El bloque de texto va sin recorte, para que la tilde de la primera
    línea no salga rasurada?
[ ] ¿Los cortes de línea respetan las unidades de sentido? ¿Hay alguna línea
    huérfana que no sea el remate?
[ ] ¿El exportador lee las posiciones del DOM ya maquetado, o las
    recalcula?
[ ] ¿El avance entre líneas lo acumulas línea a línea, o lo multiplicas por
    la interlínea? Multiplicarlo se come las tildes en el PNG.
[ ] ¿Esperas a document.fonts.ready antes de medir y antes de exportar?
[ ] ¿Esperas a que el logo esté decodificado antes de dibujarlo?
[ ] ¿Se lee el titular al tamaño de un pulgar? Aléjate y míralo pequeño.
${hashtags}${hashtags ? "\n" : ""}${emojis}${emojis ? "\n" : ""}${cifras}
${(receta.verificacionPropia || []).map((v) => `[ ] ${v}`).join("\n")}
${esCarrusel ? `
Y por ser un carrusel:

[ ] ¿El fondo salió de UNA SOLA imagen cortada, o de ${n} imágenes distintas?
[ ] ¿El anclaje del texto es el mismo en todas?
[ ] ¿El brillo de la imagen es el mismo número en todas?
[ ] ¿El antetítulo es el mismo en todas?
[ ] Lee sólo los tramos acentuados en orden: ¿forman una frase?
[ ] ¿Está el numerador encendido en las ${n}?
[ ] Ponlas en tira, pegadas. ¿Se ve alguna costura? ¿Hay un escalón de
    brillo en algún corte? ¿Hay un punto focal partido por la mitad?
` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LA COMPROBACIÓN QUE HACE EL HUMANO, NO TÚ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Descarga una pieza y ponla al lado de su vista previa. Si no son idénticas,
el exportador está mal — y si está mal en una, está mal en las ${n}.

Un desfase de dos o tres píxeles entre las dos es normal: viene de que el
lienzo posiciona por la caja del tipo y el navegador por la caja de línea.
Por encima de eso, es una de las trampas de la sección 3.`;
}

/**
 * Ensambla el prompt maestro completo.
 *
 * `receta` sale del repositorio del cliente y no se toca aquí.
 * `piezas` es lo único que ha escrito la IA.
 */
export function buildMetaMasterPrompt({ receta, piezas, modo = "lote", tema = "", publico = "", negativosDelLote = [] }) {
  const r = receta || {};
  // El cuerpo, el anclaje y la interlínea se resuelven aquí, no en el
  // prompt: a Meta AI le llega el número, no la cuenta.
  const p = (Array.isArray(piezas) ? piezas : []).map((x) => componerPieza(r, x));
  const m = MODOS_META[modo] ? modo : "lote";

  const cabecera = `PROMPT MAESTRO · ${r.marca || "Marca"} · ${MODOS_META[m].label}
${p.length} piezas${tema ? ` · ${tema}` : ""}${publico ? ` · para ${publico}` : ""}
Generado por el calendario de Juancito Ads. Pégalo entero en Meta AI.

Léelo hasta el final antes de empezar. Son siete secciones y el orden
importa: la primera dice lo que no debes hacer y la última lo repite.`;

  return [
    cabecera,
    seccionUno(r, m, p),
    seccionDos(r),
    seccionTres(r, m, p),
    seccionCuatro(r),
    seccionCinco(r, negativosDelLote),
    seccionSeis(r, m, p),
    seccionSiete(r, m, p),
  ].join("\n\n");
}

/**
 * Lo que falta para poder emitir el prompt.
 *
 * El estándar es explícito: si un dato no está en el ADN, no se usa — se
 * pide. Así que en vez de rellenar el hueco con algo verosímil, se enseña
 * la lista de lo que falta y de dónde tendría que salir.
 */
export function faltantesDeReceta(receta) {
  const r = receta || {};
  const f = [];
  const falta = (cond, que, donde, critico) => { if (cond) f.push({ que, donde, critico }); };

  // Críticos: sin ellos el prompt sale con huecos, y un prompt con huecos es
  // peor que ninguno — Meta AI rellena el hueco improvisando, que es
  // exactamente lo que este sistema existe para impedir.
  falta(!r.fuentes?.url,            "La URL de Google Fonts",              "05_prompt_maestro_meta_ai.md", true);
  falta(!r.reticula?.texto,         "La retícula en píxeles",              "05_prompt_maestro_meta_ai.md", true);
  falta(!(r.escala || []).length,   "La escala tipográfica",               "05_prompt_maestro_meta_ai.md", true);
  falta(!r.bloqueEstilo,            "El bloque de estilo",                 "05_prompt_maestro_meta_ai.md", true);
  falta(!r.negativos,               "Los negativos",                       "05_prompt_maestro_meta_ai.md", true);
  falta(!r.logo?.posicion,          "Dónde va el logo y con qué resguardo", "05_prompt_maestro_meta_ai.md · la firma", true);

  // El resto degrada la pieza, pero no la deja sin sistema visual.
  falta(!r.marca,                          "El nombre de la marca",                    "01_brand_guidelines.md", false);
  falta(!(r.colores || []).length,          "La paleta con el papel de cada color",     "01_brand_guidelines.md · paleta", false);
  falta(!(r.fuentes?.familias || []).length, "Las familias tipográficas y su papel",    "01_brand_guidelines.md · tipografía", false);

  return f;
}

/** Los que impiden emitir el prompt, no sólo empeorarlo. */
export function faltantesCriticos(receta) {
  return faltantesDeReceta(receta).filter((x) => x.critico);
}
