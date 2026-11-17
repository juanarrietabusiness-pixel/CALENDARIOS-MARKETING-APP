import { describe, it, expect } from "vitest";
import { validarGuion } from "../../src/lib/videoEscenas.js";
import { CAMPOS_ESCENA } from "../../worker/lib/videosProyectos.js";

// ============================================================
// editar_escena («id» + «cambiar») tiene su propia lista de campos: la `camara` del movimiento gráfico entró en el
// formato y editar_escena la rechazaba («no se cambia así»). Todo campo que el formato guarda en una escena se puede
// cambiar sin mandarla entera.
// ============================================================

describe("editar_escena puede cambiar todo lo que el formato guarda en una escena", () => {
  it("cada campo de una escena validada (salvo el id) está en CAMPOS_ESCENA", () => {
    const { guion, errores } = validarGuion({
      version: 1, formatos: ["9:16"],
      escenas: [
        { id: "a", tipo: "dato", habla: "", pausa: 3, camara: "acercar", maquetacion: "exacta", fondo: { tipo: "malla" }, transicion: { tipo: "empuje", dir: "izq" }, capas: [] },
        { id: "b", tipo: "cierre", habla: "", pausa: 3, capas: [] },
      ],
    });
    expect(errores).toEqual([]);
    const campos = new Set(guion.escenas.flatMap((e) => Object.keys(e)));
    campos.delete("id");
    for (const campo of campos) expect(CAMPOS_ESCENA, `«${campo}»`).toContain(campo);
  });
});
