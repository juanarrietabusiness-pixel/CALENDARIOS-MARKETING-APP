---
name: arreglar-despliegue
description: Corregir fallos de los tests de despliegue de este repositorio (tests/despliegue/). Úsala cuando CI falle en el job «verificar», cuando aparezca un informe-despliegue.md con casos en rojo, o cuando alguien pida arreglar la CSP, las cabeceras de Netlify, las políticas RLS, el presupuesto de bundle o la paridad entre supabase/functions y el workflow de despliegue.
---

# Arreglar los tests de despliegue

Estos tests no comprueban que la aplicación funcione: comprueban que lo
que se despliega es lo que se cree que se despliega. Cuando uno falla, el
mensaje ya trae el arreglo. Léelo antes de investigar por tu cuenta.

## Lo primero

```bash
npm run verificar
```

Es la secuencia completa: lint, tests, build con variables, tests de
bundle. Es exactamente lo que corre CI, así que si pasa en local, pasa
allí.

Cada fallo se imprime con este formato:

```
  ✗ qué regla se incumple
    dónde:   archivo:línea
    porqué:  qué se rompe en producción
    arreglo: la corrección concreta
```

**El campo `arreglo` es la instrucción.** No hace falta volver a auditar
nada. Si CI ya falló, el mismo contenido está en `informe-despliegue.md`
(artefacto del job, y comentario en el pull request).

## Lo que NO hay que hacer

- **No relajes el test para que pase.** Cada caso corresponde a un fallo
  que ya ocurrió en producción; están documentados en `CLAUDE.md`. Subir
  un presupuesto, quitar una directiva de la CSP o borrar una aserción
  hace desaparecer el aviso, no el problema.
- **No toques `tests/utils/`** para esquivar un fallo. Si crees que un
  test tiene un falso positivo, míralo: varios ya se ajustaron para
  distinguir una mención de un uso real (por ejemplo, la interfaz habla
  de `GITHUB_TOKEN` en un texto de ayuda, y eso no es una fuga). Si de
  verdad lo es, acota la regla y explica por qué en un comentario.
- **No subas el presupuesto de bundle sin mirar qué entró.** El número
  está con holgura sobre la medida real; que se pase significa que algo
  nuevo pesa.

## Los fallos y su arreglo

### «no es un build sin variables VITE_»

El dist que se está midiendo es de media aplicación. Construye con:

```bash
npm run build:verificado
```

No es un problema del test: sin las variables, Vite resuelve
`isSupabaseEnabled` a false en tiempo de compilación y rollup elimina el
panel entero.

### «la función X no se despliega nunca»

Hay una carpeta en `supabase/functions/` que no está en
`.github/workflows/desplegar-funciones.yml`. Añade su paso. En
producción está corriendo lo último que alguien subió a mano.

### «la política de storage sólo comprueba el bucket»

Una política de `storage.objects` cuya única condición es `bucket_id`.
Toda sesión autenticada alcanza los archivos de todos. Acota por
`owner = (select auth.uid())`. Escribe una migración nueva; no edites
una ya aplicada.

### «llama a auth.uid() por fila»

Envuélvela: `(select auth.uid())`. Migración nueva.

### «connect-src permite llamar a …»

Una clave ha vuelto al navegador. Busca la llamada en `src/`, muévela a
una Edge Function y quita el origen de la CSP en `netlify.toml`.

### «CI usa Node X y Netlify construye con Node Y»

Iguala los dos números. `node-version` en `ci.yml` y `NODE_VERSION` en
`netlify.toml`.

### «el servidor manda “X” y nadie lo recoge»

Lo emite `tests/despliegue/tiempo-real.test.js`. Has añadido un
`difundir({ tipo: "X", … })` en el Worker y no hay un `case "X"` en el
escuchador de `src/App.jsx`. No falla nada en producción: la escritura
entra en D1, la respuesta es 200, y la otra persona sigue viendo lo de
antes hasta que recargue.

Añade el caso. Si lo que cambia lo carga un panel por su cuenta —tareas,
banco, equipo—, basta con `setPulso((n) => n + 1)`: ese panel lleva
`pulso` en las dependencias de su efecto y vuelve a leer.

### «no se difunde “X”»

Al revés: hay una escritura en `worker/rutas/datos.js` sin su aviso.
Pon el `difundir()` **pegado** a la escritura, no al final de la función,
y con la firma: `firma(ctx.usuario, req)`. El `req` no es decorativo:
lleva el id de la pestaña, que es lo que evita que quien guardó se aplique
su propio eco encima de lo que estaba escribiendo.

### «el cliente o el calendario seleccionados vuelven a ser estado»

Alguien ha metido un `useState` para `selectedClientId` o
`selectedCalId`. Esos dos salen de la dirección (`src/lib/rutas.js`):
derívalos con `porRuta()` y cambia de sitio con `navegar()`. Si vuelven a
ser estado, recargar devuelve al inicio y un enlace compartido deja de
abrir lo mismo que veía quien lo mandó.

## Migraciones: escribir no es aplicar

Los tests de `migraciones.test.js` leen el SQL del repositorio. Que pasen
significa que la corrección **está escrita**, no que esté aplicada. Para
lo aplicado están los tests en vivo:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run test:infra
```

Si el estático pasa y el de infraestructura falla con el mismo motivo, la
migración está pendiente de aplicar.

## Antes de dar nada por terminado

```bash
npm run verificar
```

Sin errores **ni avisos** en el lint, y con los tests de bundle en verde.
