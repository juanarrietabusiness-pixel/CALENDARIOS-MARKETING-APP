import { describe, it, expect } from "vitest";
import {
  variacion, enPanama, serieDiaria, kpis, porFormato, mejoresMomentos, mejoresPublicaciones, resumenCompetencia, numeroCorto,
} from "./resultados.js";

const dia = (fecha, red, seguidores, alcance = 0, extra = {}) => ({ cuentaId: `${red}-1`, red, fecha, seguidores, alcance, vistas: 0, interacciones: 0, visitas: 0, ...extra });
const pub = (publicadaAt, interacciones, tipo = "imagen", red = "instagram") => ({ publicadaAt, interacciones, tipo, red, alcance: interacciones * 10 });

describe("resultados", () => {
  it("variación: null sin base", () => {
    expect(variacion(110, 100)).toBeCloseTo(10);
    expect(variacion(5, 0)).toBeNull();
    expect(variacion(5, null)).toBeNull();
  });

  it("la hora es la de Panamá: las 2:00 UTC del martes son el lunes a las 21:00", () => {
    expect(enPanama("2026-10-06T02:00:00.000Z")).toEqual({ dia: 1, hora: 21, fecha: "2026-10-05" });
  });

  it("la serie suma las cuentas por día y salta las fotos que fallaron", () => {
    const s = serieDiaria([dia("2026-10-01", "instagram", 100, 50), dia("2026-10-01", "facebook", 40, 10), dia("2026-10-02", "instagram", null, 0, { error: "x" })]);
    expect(s).toEqual([{ fecha: "2026-10-01", seguidores: 140, alcance: 60, vistas: 0, interacciones: 0, visitas: 0 }]);
    expect(serieDiaria([dia("2026-10-01", "instagram", 100), dia("2026-10-01", "facebook", 40)], "facebook")[0].seguidores).toBe(40);
  });

  it("las cifras del periodo contra el anterior", () => {
    const serie = [
      dia("2026-09-05", "instagram", 900, 100), dia("2026-09-20", "instagram", 950, 100),
      dia("2026-10-01", "instagram", 1000, 300), dia("2026-10-15", "instagram", 1100, 300),
    ];
    const publicaciones = [pub("2026-10-03T15:00:00Z", 50), pub("2026-10-10T15:00:00Z", 30), pub("2026-09-10T15:00:00Z", 40)];
    const k = kpis({ serie, publicaciones }, { desde: "2026-10-01", hasta: "2026-10-30" });
    expect(k.seguidores).toMatchObject({ valor: 1100, anterior: 1000, ganados: 100 });
    expect(k.alcance).toMatchObject({ valor: 600, anterior: 200 });
    expect(k.interacciones.valor).toBe(80);
    expect(k.interacciones.cambio).toBeCloseTo(100);
    expect(k.publicaciones).toMatchObject({ valor: 2, anterior: 1 });
    expect(k.tasaInteraccion.valor).toBeCloseTo(((50 / 1100) * 100 + (30 / 1100) * 100) / 2);
  });

  it("formatos ordenados por interacción media", () => {
    const f = porFormato([pub("2026-10-01T00:00:00Z", 10), pub("2026-10-01T00:00:00Z", 90, "reel"), pub("2026-10-01T00:00:00Z", 30)]);
    expect(f.map((x) => [x.tipo, x.cantidad, x.interacciones])).toEqual([["reel", 1, 90], ["imagen", 2, 20]]);
  });

  it("los mejores momentos, en día y bloque de Panamá", () => {
    const m = mejoresMomentos([pub("2026-10-06T00:30:00Z", 100), pub("2026-10-06T14:00:00Z", 10)]);
    // 00:30 UTC del martes = lunes 19:30 en Panamá → bloque 18–21.
    expect(m.mejores[0]).toMatchObject({ dia: 1, bloque: 6, media: 100 });
    expect(m.matriz[2][3]).toEqual({ media: 10, cantidad: 1 });
  });

  it("top y competencia", () => {
    expect(mejoresPublicaciones([pub("x", 1), pub("y", 9)], 1)[0].interacciones).toBe(9);
    const c = resumenCompetencia([
      { usuario: "rival", fecha: "2026-10-01", seguidores: 1000, datos: {} },
      { usuario: "Rival", fecha: "2026-10-20", seguidores: 1100, datos: { ultima: "2026-10-19" } },
    ], "2026-10-01");
    expect(c).toHaveLength(1);
    expect(c[0].cambio).toBeCloseTo(10);
  });

  it("números cortos en español", () => {
    expect(numeroCorto(null)).toBe("—");
    expect(numeroCorto(950)).toBe("950");
    expect(numeroCorto(12500)).toBe("12,5 mil");
    expect(numeroCorto(1_250_000)).toBe("1,3 M");
  });
});
