// ============================================================
// «¿Qué es cada cosa?»: el glosario de la aplicación (puro)
//
// No había recorrido inicial ni ayuda, y la aplicación tiene muchos nombres propios: Diseñar no es Corregir, ni Otra
// versión es Recrear con mi marca. Aquí está cada uno con lo que hace y DÓNDE está, en las palabras que ve la agencia.
// Lo abre «¿Qué es cada cosa?» del menú de la cuenta (components/Glosario.jsx, en su chunk).
//
// Un nombre que cambie en la pantalla tiene que cambiar aquí: un test comprueba que estén los de los botones principales.
// ============================================================

export const GLOSARIO = Object.freeze([
  {
    grupo: "El mes",
    terminos: [
      { termino: "Preparar el mes", que: "El asistente del mes: de la estrategia al envío en cinco pasos (estrategia, plan, ideas, diseñar, revisar y enviar). Lo hecho queda guardado en el calendario y lo retoma cualquiera del equipo.", donde: "El botón «Preparar el mes» del calendario de cada cliente." },
      { termino: "Planificar a mano", que: "Llenar el mes día por día, con plantillas propias, en vez de dejar que el asistente proponga el plan.", donde: "Dentro de «Preparar el mes», en el paso Plan → «Otras formas de planificar»." },
      { termino: "Plan semanal", que: "Lo que sale cada día de la semana (formato, tipo, hora y una nota fija), igual todos los meses. El asistente del mes y la IA lo siguen.", donde: "Marca → Plan semanal, o la barra de los días encima del mes." },
      { termino: "Ver el mes", que: "Cómo se verá el perfil con lo del mes —la cuadrícula, el feed y lo que falta— y programar de una vez lo que ya está listo.", donde: "El botón «Ver el mes» del calendario." },
      { termino: "Enviar al cliente", que: "El enlace que el cliente abre en su teléfono para aprobar o pedir cambios, y el mensaje para mandárselo. Para ese mes, el enlace es siempre el mismo.", donde: "El botón «Enviar al cliente» del calendario." },
      { termino: "Revisión interna", que: "Con ella encendida, el cliente sólo ve lo que el equipo ya dio por bueno.", donde: "La ficha del cliente (el lápiz junto a su nombre)." },
    ],
  },
  {
    grupo: "Crear piezas",
    terminos: [
      { termino: "Diseñar", que: "Crear la imagen, el carrusel o el reel de una publicación con el director: escribe la ficha de diseño con la marca del cliente y la pieza sale revisada.", donde: "La pestaña Pieza de cada publicación, o Crear → «¿Qué quieres crear?»." },
      { termino: "Director", que: "El asistente que diseña. Antes de cada pieza lee el kit, el catálogo y lo que la agencia suele corregir.", donde: "Crear → «¿Qué quieres crear?» y la pestaña «Director (diseño)» del asistente." },
      { termino: "Otra versión", que: "La misma información con otra composición. La de antes queda en la galería y se puede deshacer.", donde: "Junto a cada imagen de una publicación, y en la galería." },
      { termino: "Corregir", que: "Cambiar algo de la MISMA imagen con una indicación («el titular más arriba»), sin crearla otra vez desde cero.", donde: "Junto a cada imagen de una publicación, y en la galería." },
      { termino: "Recrear con mi marca", que: "Tomar la idea de algo que funciona en OTRA cuenta y hacer una versión propia con la marca del cliente. Nunca se copian su marca, su texto ni su producto.", donde: "Las referencias de una publicación y Crear → Galería → Avanzado; en Lo mejor se llama «Recrear para…»." },
      { termino: "Muchas piezas de una vez", que: "Producir varias piezas seguidas: anuncios por niveles, por tipo de contenido o el mes completo. Siguen creándose aunque se cierre la aplicación.", donde: "Crear → Galería → Avanzado." },
      { termino: "Galería", que: "Todo lo que se crea o se sube para un cliente, con sus versiones apiladas.", donde: "Crear → Galería." },
      { termino: "Poner en una publicación", que: "Llevar una pieza de la galería —o un carrusel entero, en su orden— a una publicación de cualquier mes.", donde: "En la galería, al abrir una pieza o un carrusel." },
      { termino: "«Me gusta»", que: "Marcar las piezas que gustan: el director las mira para aprender el gusto de la agencia.", donde: "En la galería, en cada pieza." },
    ],
  },
  {
    grupo: "Ideas y referencias",
    terminos: [
      { termino: "Guardar referencia", que: "Guardar el enlace de un video o una publicación que inspira, con su empresa o como general.", donde: "«Enlace» en el teléfono, la cabecera, o «Compartir» desde Instagram o TikTok." },
      { termino: "Banco de ideas", que: "Las ideas y referencias guardadas. Las generales (sin empresa) salen en el banco de todos los clientes.", donde: "«Ideas» en el calendario y Referencias → Ideas." },
      { termino: "Lo mejor", que: "Lo que mejor está funcionando ahora —la competencia, las cuentas que inspiran, los anuncios y lo propio— para recrearlo.", donde: "«Lo mejor» en el menú, y Referencias → Lo mejor de cada cliente." },
    ],
  },
  {
    grupo: "La marca",
    terminos: [
      { termino: "Kit de marca", que: "Paleta, letra, estilo, logo, plantillas, personajes y voz del cliente. Va en cada pieza que se crea.", donde: "Marca → Kit y voz." },
      { termino: "Semáforo del kit", que: "Lo que le falta a un cliente para que el diseño salga bien, en verde, ámbar o rojo, cada cosa con su arreglo.", donde: "Arriba de la pestaña Marca." },
      { termino: "Primeros pasos", que: "La lista corta de lo que conviene dejar listo al empezar con un cliente. Desaparece cuando todo está hecho.", donde: "Arriba de la página de cada cliente." },
      { termino: "Cerebro", que: "Todo lo que se sabe de un cliente, en notas: lo que vende, sus precios, cómo habla y lo que no se dice. La IA lo lee antes de escribir.", donde: "Marca → Cerebro." },
      { termino: "Ficha técnica", que: "El resumen de lo esencial del cliente que la IA lee en TODO lo que escribe. Se prepara con IA a partir de las notas del cerebro.", donde: "Marca → Cerebro." },
      { termino: "Estudio de mercado", que: "El catálogo con sus precios, a quién se le vende, qué le duele y qué desea, la competencia y las 7 maletas de cada producto. Hasta aprobarlo, la IA no lo usa.", donde: "Marca → Cerebro → Estudio de mercado." },
      { termino: "Las 7 maletas", que: "Lo que hay que tener de cada producto antes de anunciarlo: público, problema, solución, diferenciales, testimonios, objeciones y garantía. Si falta una, no se lanza.", donde: "En el estudio de mercado, producto por producto." },
    ],
  },
  {
    grupo: "Publicar",
    terminos: [
      { termino: "Producción", que: "Lo aprobado que falta programar, las ideas aprobadas que falta producir y la cola: lo que sale, lo que salió y lo que falló.", donde: "«Producción» en el menú." },
      { termino: "Programar al aprobar", que: "Con él encendido, lo que el cliente aprueba como pieza final entra solo en la cola de publicación.", donde: "La barra de publicar, debajo del calendario." },
      { termino: "La publico yo", que: "Para lo que la aplicación no puede publicar sola (la música de Instagram, los stickers): llega un aviso a la hora y se publica desde el teléfono.", donde: "«¿Cuándo sale?» en la pestaña Publicar de cada publicación." },
      { termino: "Historias automáticas", que: "Lo ya publicado vuelve como historia, con diseños distintos, sólo mientras siga vigente.", donde: "Producción, más abajo." },
      { termino: "Bandeja", que: "Los comentarios y mensajes de Facebook e Instagram de los clientes con la bandeja encendida, para responder desde aquí.", donde: "«Bandeja» en el menú." },
    ],
  },
  {
    grupo: "Anuncios",
    terminos: [
      { termino: "Va a pauta", que: "Una publicación que se va a pagar en Meta. Su texto se escribe como anuncio (en el Ads Manager ya no se cambia) y lleva sus textos de anuncio aparte.", donde: "«Se va a pautar» en la pestaña Idea de cada publicación." },
      { termino: "Número mágico", que: "Lo máximo que puede costar un resultado (una conversación, una venta) para que el negocio gane. Sale de los números del negocio del cliente.", donde: "Marca → Números del negocio." },
      { termino: "Plan de campañas", que: "Las campañas del mes con su presupuesto, sus públicos, qué pieza va en cada anuncio y sus textos, para montarlas en el Ads Manager.", donde: "Anuncios → Plan de campañas." },
      { termino: "Revisión 3Q", que: "La revisión de lo que corre en el Ads Manager: cuánto cuesta cada resultado, por qué y qué hacer con cada campaña.", donde: "Resultados → Anuncios de cada cliente." },
      { termino: "Niveles de consciencia", que: "Cuánto sabe quien ve la pieza: desde que no sabe que tiene el problema hasta que está listo para comprar. A cada nivel se le habla distinto.", donde: "En el estudio de mercado y en cada publicación que va a pauta." },
    ],
  },
  {
    grupo: "La IA",
    terminos: [
      { termino: "Crear imágenes sin preguntar", que: "Un tope por pedido: las imágenes que cuestan menos se crean sin el segundo «sí». Lo fija quien administra.", donde: "Ajustes → IA." },
      { termino: "Conectar Claude", que: "Usar Claude (claude.ai o el teléfono) con las herramientas del calendario: ve los clientes, escribe con el método de la agencia y diseña, siempre con tu permiso.", donde: "Ajustes → Claude." },
    ],
  },
]);

const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Los grupos con los términos que casan con `texto` (sin tildes ni mayúsculas, en el nombre o en lo que hace). Pura. */
export function filtrarGlosario(texto = "", glosario = GLOSARIO) {
  const q = normalizar(texto);
  if (!q) return glosario;
  return glosario
    .map((g) => ({ ...g, terminos: g.terminos.filter((t) => normalizar(`${t.termino} ${t.que}`).includes(q)) }))
    .filter((g) => g.terminos.length);
}
