# Protección de `main`

El objetivo es corto: **si las pruebas no pasan, no se mergea.**

Los tests ya están; esto es lo que los hace obligatorios. Sin la
protección, `npm run verificar` es una recomendación que se puede saltar
con prisa, que es exactamente como se mergeó el arreglo a medias que dio
origen a CI.

## Ponerla

Una de las dos, dan el mismo resultado.

### Con el script

```bash
GITHUB_TOKEN=... ./scripts/proteger-main.sh
```

El token necesita permiso de administración sobre el repositorio: uno
clásico con el ámbito `repo`, o uno *fine-grained* con **Administration:
Read and write**. Se genera en
<https://github.com/settings/tokens>.

El script es idempotente: si el ruleset ya existe, lo actualiza.

### A mano

**Settings → Rules → Rulesets → New branch ruleset**

| Campo | Valor |
|---|---|
| Ruleset name | `main protegida: sin CI en verde no se mergea` |
| Enforcement status | **Active** |
| Bypass list | *vacía* |
| Target branches | Add target → **Include default branch** |

Y marca:

- ☑ **Restrict deletions**
- ☑ **Block force pushes**
- ☑ **Require a pull request before merging**
  - Required approvals: **0**
- ☑ **Require status checks to pass**
  - ☑ Require branches to be up to date before merging
  - Add checks → escribe `verificar` → elígelo (el de **GitHub Actions**)

## Qué queda bloqueado

| Intento | Qué pasa |
|---|---|
| `git push origin main` | Rechazado. Todo entra por pull request. |
| Mergear con CI en rojo | El botón queda bloqueado. |
| Mergear con CI aún corriendo | Bloqueado hasta que termine. |
| Mergear con la rama desfasada | Bloqueado: hay que actualizar primero, para que lo que se probó sea lo que entra. |
| `git push --force` a main | Rechazado. |
| Borrar main | Rechazado. |

## Por qué 0 aprobaciones

Este repositorio lo lleva una persona, y GitHub no deja aprobar el propio
pull request. Con una aprobación obligatoria no se podría mergear nunca.

Lo que bloquea aquí son **las pruebas**, no las personas. Si algún día
entra alguien más al repositorio, sube ese número a 1 en el mismo sitio.

## El nombre del check

`verificar` es el nombre del job en `.github/workflows/ci.yml`. Los dos
tienen que decir lo mismo:

- Si renombras el job, el ruleset se queda esperando un check que ya no
  existe y **nada se puede mergear**.
- Si renombras sólo el ruleset, deja de comprobar nada y **todo se puede
  mergear**.

El segundo caso es el peligroso, porque no se nota.

## Si algo se atasca

Un check requerido que nunca reporta deja los pull requests bloqueados
para siempre. Para salir:

**Settings → Rules → Rulesets →** abre el ruleset **→ Enforcement status:
Disabled**.

Arregla el workflow, y vuelve a ponerlo en **Active**. No hace falta
borrar nada.

## Lo que la protección NO cubre

Las migraciones de Supabase. CI comprueba que el SQL del repositorio está
bien escrito; no que esté aplicado. Eso lo mira el workflow de
infraestructura, que corre cada mañana:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run test:infra
```
