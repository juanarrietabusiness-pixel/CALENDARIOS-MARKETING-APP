// ============================================================
// La VERSIÓN del kit de edición (kit-edicion/) y la HUELLA de lo que lleva dentro
//
// La escribe `npm run kit:huella` (scripts/kit-edicion/empaquetar.mjs): si cambia cualquier archivo del kit —o de la
// lógica pura que lleva copiada (el corte, la música, el plan, el oficio, el catálogo de efectos)— la huella deja de casar,
// el build y un test fallan, y hay que subir `version` aquí y volver a correr `npm run kit:huella`. Así el número que ve
// Claude (`kit_edicion`, el acta) dice de verdad con qué se editó un video.
// ============================================================

export const KIT_EDICION = Object.freeze({ version: "0.3.0", huella: "fc7f1e0bbf9ba854" });
