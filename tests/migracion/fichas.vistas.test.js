import { describe, it, expect } from "vitest";
import { limpiarVistas, limpiarEspeciales } from "../../worker/lib/estudio/fichas.js";

const crudo = { media_type: "image/jpeg", data: "QUJDRA==" };

describe("las vistas del director", () => {
  it("una vista ya limpia (lo que guarda un encargo) vale igual al volver a limpiarla", () => {
    const una = limpiarVistas([crudo]);
    expect(una).toHaveLength(1);
    // El encargo guarda los bloques y el director los vuelve a limpiar: antes los descartaba todos.
    expect(limpiarVistas(una)).toEqual(una);
  });

  it("sigue descartando lo que no es una imagen de verdad", () => {
    expect(limpiarVistas([{ type: "image", source: { type: "base64", media_type: "text/html", data: "PGI+" } }])).toEqual([]);
    expect(limpiarVistas([{ media_type: "image/png", data: "no es base64 <script>" }])).toEqual([]);
  });

  it("las especiales conservan su papel", () => {
    expect(limpiarEspeciales([{ ...crudo, papel: "inspiracion" }]).papeles).toEqual(["inspiracion"]);
  });
});
