# Propuesta: trabajar en equipo, delegar y saber quién hace qué

> Estado: **implementada** (las tres fases), con estas decisiones tomadas
> por defecto: la revisión interna se enciende por cliente; los avisos
> fuera de la aplicación son las notificaciones del navegador (correo y
> WhatsApp necesitan un proveedor que no hay); «Publicar ahora» y borrar
> clientes o calendarios quedan para quien administra. Ver CLAUDE.md →
> Trampas, y `tests/migracion/trabajo.test.js`.

La aplicación nació para una sola persona y creció a «un espacio con
varias personas dentro»: invitaciones, papeles (`admin` / `editor`),
presencia en vivo y «X está editando». Eso resuelve **estar** juntos, pero
no **trabajar** juntos: repartir, saber qué le toca a cada uno, revisar
antes de que lo vea el cliente y enterarse de lo que pasó sin estar
conectado.

## Lo que falla hoy

### 1. Delegar: las publicaciones no tienen dueño

- Una publicación no tiene **responsable**. No hay forma de decir «el reel
  del sábado lo diseña Bruno y el texto lo escribe Ana».
- Tampoco tiene **etapa de producción**: sólo el estado de aprobación del
  cliente (pendiente / aprobada / cambios). No se distingue «falta el
  diseño» de «el diseño está listo, falta revisarlo».
- Las **tareas** y las **publicaciones** son mundos aparte: una tarea
  «Diseñar reel de otoño» no apunta a la publicación, y terminarla no
  cambia nada en el calendario.

### 2. Asignar tareas es escribir un nombre a mano

- `assigned_to` es **texto libre**, no una persona del equipo
  (`CampoResponsable.jsx`, tabla `responsables`). Un nombre mal escrito
  crea un «responsable» nuevo, y la lista se llena usándola.
- «Sólo las mías» compara ese texto con **el nombre que la persona se puso**
  (`Tareas.jsx`). Si alguien cambia su nombre en Equipo, sus tareas dejan
  de ser «suyas» sin que nada lo avise.
- Asignar no **avisa** a nadie: la persona se entera si abre Mi día.

### 3. Nadie se entera de lo que pasa si no está conectado

- Los avisos viajan por el socket en vivo: si estás desconectado cuando el
  cliente aprueba, pide cambios o una publicación falla, sólo lo ves si
  entras y miras en el sitio correcto. No hay **bandeja de avisos** ni
  correo ni notificación al teléfono.
- No hay **menciones**: no se puede escribir «@Bruno, cambia la foto» y que
  le llegue.

### 4. Las conversaciones internas no existen

- La **nota interna** de una publicación es UN campo de texto: el último
  que escribe pisa lo anterior, no dice quién lo escribió ni cuándo.
- Con el cliente sí hay hilo (`ConversacionCliente`), con nombre. Entre el
  equipo, no.

### 5. No hay historial de quién cambió qué

- Cada cambio lleva su firma para el tiempo real (`por`), y la cola guarda
  `creado_por`, pero **nada de eso se enseña**. «¿Quién movió esta
  publicación al martes?» o «¿quién la programó?» no tienen respuesta en
  pantalla.

### 6. No hay revisión interna antes del cliente

- Lo que alguien del equipo escribe puede enviarse al cliente sin que lo
  revise nadie. En una agencia con personas nuevas, eso es el mayor riesgo
  de calidad: el cliente es quien descubre el error.

### 7. Los papeles son dos y casi iguales

- `editor` puede hacer casi todo lo que hace `admin`: **borrar clientes y
  calendarios enteros**, publicar ya en la cuenta del cliente, cancelar la
  cola. Sólo no puede invitar, ni tocar la IA, ni conectar Drive.
- No hay acceso **por cliente** (un freelance que sólo lleve Café Luna ve
  toda la agencia) ni papel de **sólo lectura** (un practicante, un
  director que sólo quiere mirar).

### 8. No se ve la carga de cada persona

- No hay una vista de «qué tiene cada uno esta semana». El foco del día
  (`lib/foco.js`) vive en el navegador y sólo lo ven los demás mientras la
  persona está conectada.

## La propuesta, en tres fases

Cada fase se sostiene sola: se puede parar después de cualquiera.

### Fase 1 — Dueños y avisos (lo más urgente, poco código)

1. **Responsable = persona del equipo**, no un texto. El selector de
   «Asignar a» lista los miembros (`memberships`), con su color y avatar.
   Se guarda el `user_id`; el nombre se lee al pintar, así que cambiarse el
   nombre ya no rompe «las mías». Los nombres viejos en texto se casan con
   un miembro por nombre una sola vez, y los que no casen se quedan como
   están.
2. **Responsable en cada publicación**: un avatar en el panel («Lo lleva:
   Bruno») y en el chip del mes. Filtro «Mías» en el calendario.
3. **Bandeja de avisos** (campana en la cabecera, con número): te asignaron
   algo, el cliente aprobó / pidió cambios en algo tuyo, algo tuyo falló al
   publicar, te mencionaron. Se guarda en D1, así que llega aunque no
   estuvieras conectado. Tabla nueva `avisos` (quién, qué, enlace, leído).
4. **Nota interna → hilo del equipo**: mensajes con autor y hora, igual que
   la conversación con el cliente pero privada, con **@menciones** que
   generan aviso.

### Fase 2 — El flujo de producción

5. **Etapas de una publicación**, visibles y con dueño:
   `Idea → En producción → Revisión interna → Con el cliente → Aprobada →
   Programada → Publicada`. Las tres últimas ya existen; se añaden las del
   medio. Cada etapa puede tener su responsable (quien diseña no es quien
   revisa).
6. **Revisión interna** opcional por cliente: «Enviar al cliente» sólo
   manda lo que pasó la revisión. Quien revisa aprueba o devuelve con un
   comentario (que es un mensaje del hilo del punto 4).
7. **Tablero por etapas** (vista Kanban) de la semana, filtrable por
   persona y por cliente: arrastrar una tarjeta de «En producción» a
   «Revisión» es cambiar la etapa.
8. **Tareas ligadas a publicaciones**: crear una tarea desde la
   publicación («Diseñar esto para el jueves») y ver sus tareas dentro del
   panel. Terminar la tarea de diseño mueve la publicación a revisión.

### Fase 3 — Control y visibilidad

9. **Historial por publicación**: «Ana cambió el texto · hace 2 h»,
   «Bruno la programó para el sáb 10». Se escribe donde ya se firma el
   cambio para el tiempo real.
10. **Papeles más finos**: `admin`, `editor`, `colaborador` (sólo los
    clientes que se le asignen) y `lectura`. Borrar clientes y calendarios,
    y «Publicar ahora», pasan a ser de `admin` (o se le da permiso
    expreso). La capa de acceso (`worker/lib/acceso.js`) es el sitio donde
    se aplica, igual que hoy acota por espacio.
11. **Carga del equipo**: una vista con cuántas publicaciones y tareas
    tiene cada persona por día de la semana, y quién está atrasado.
12. **Avisos fuera de la aplicación**: correo con el resumen del día y, si
    se quiere, WhatsApp o notificación del navegador para lo urgente (algo
    falló al publicar, el cliente pidió cambios en algo que sale hoy).

## Por dónde empezaría

Fase 1 entera, en este orden: **responsable como persona (1 y 2)**, luego
**bandeja de avisos (3)**, luego **hilo con menciones (4)**. Es lo que
convierte «estamos todos dentro» en «cada uno sabe qué le toca y se
entera cuando algo suyo cambia», y no obliga a nadie a aprender un flujo
nuevo. Las fases 2 y 3 tienen sentido cuando el equipo pase de tres o
cuatro personas, o cuando entre alguien de fuera.

## Decisiones que tiene que tomar la agencia

- ¿Cuántas personas va a haber en el equipo en seis meses, y habrá
  freelances que sólo lleven algunos clientes? Decide si la fase 3 (papeles
  por cliente) es urgente o no.
- ¿La revisión interna es obligatoria para todos, o sólo para quien entra
  nuevo?
- ¿Los avisos fuera de la aplicación por correo, por WhatsApp, o sólo
  dentro?
