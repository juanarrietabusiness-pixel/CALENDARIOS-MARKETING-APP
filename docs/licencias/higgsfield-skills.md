# Higgsfield AI Skills — lo que se adaptó y su licencia

Algunas recetas del calendario adaptan el MÉTODO publicado por Higgsfield en sus skills para agentes
(<https://github.com/higgsfield-ai/skills>, versión 0.14.0, octubre de 2026). Ningún archivo suyo se copia
tal cual: se tomaron reglas y procedimientos, escritos aquí con palabras propias y ajustados a los motores
que usa la agencia (Kie, Google, Meta). Lo que Higgsfield guarda en su servidor (los presets de Marketing
Studio, el «prompt enhancer» de fotos de producto y de fichas de tienda, Virality Predictor, Soul ID) no está
en esos archivos y no se ha adaptado.

| Receta del calendario | De qué skill | Qué se tomó |
|---|---|---|
| «Video del producto» (`src/lib/videoProducto.js`) | `higgsfield-generate` (`references/prompt-engineering.md`), `higgsfield-faceless-video` | Con imagen inicial se describe el movimiento y no lo que ya se ve; prompts cortos; decir lo que sí debe salir; bloques de 10 s con su locución de ~26–30 palabras |

## Licencia original

```
MIT License

Copyright (c) 2026 Higgsfield AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
