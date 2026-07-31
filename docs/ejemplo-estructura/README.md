# Estructura de repositorio para ADN de clientes

Este es un ejemplo de como organizar el repositorio de la agencia para que la app pueda leer el ADN de cada cliente por separado.

## Estructura recomendada

```
mi-agencia/
  clientes/
    feria-del-lente/
      adn.md
    restaurante-panama/
      adn.md
    clinica-dental/
      adn.md
```

## Como usarlo

1. En la app, configura el **Repositorio GitHub** con la URL del repo de la agencia:
   `https://github.com/tu-usuario/mi-agencia`

2. En **Carpeta del cliente**, escribe la ruta de la carpeta del cliente:
   `clientes/feria-del-lente`

3. La app leera SOLO los archivos dentro de esa carpeta.

## Atajo con URL completa

Tambien puedes pegar la URL completa de la carpeta en GitHub:

```
https://github.com/tu-usuario/mi-agencia/tree/main/clientes/feria-del-lente
```

La app detectara automaticamente el repositorio y la carpeta.

## Archivo adn.md

Cada carpeta de cliente debe tener un archivo `adn.md` con la informacion del cliente.
Ver el ejemplo en `clientes/feria-del-lente/adn.md`.
