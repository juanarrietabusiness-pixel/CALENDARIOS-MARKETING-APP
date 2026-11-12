-- ============================================================
-- Historias automáticas: la VIGENCIA de cada pieza
--
-- En noviembre salían historias que decían «octubre», promociones del mes
-- anterior y felicitaciones de días que ya pasaron. Ahora ninguna pieza sale
-- sin una vigencia que llegue a su día (src/lib/vigenciaHistorias.js):
--   · `vigencia`: sin_revisar (NO sale) · siempre · hasta (`vigente_hasta`) · nunca.
--   · `vigencia_por`: quién lo decidió (reglas, ia, persona). Lo de una persona
--     no lo vuelve a tocar la revisión.
--   · `revision_intento_at` / `revision_error`: la última vez que la IA no pudo
--     revisarla (el cron no la vuelve a intentar cada minuto).
-- Las piezas de antes quedan «sin_revisar»: no sale ninguna hasta que se revisa.
-- ============================================================

alter table historias_auto_piezas add column vigencia text not null default 'sin_revisar' check (vigencia in ('sin_revisar', 'siempre', 'hasta', 'nunca'));
alter table historias_auto_piezas add column vigente_hasta text;
alter table historias_auto_piezas add column vigencia_motivo text not null default '';
alter table historias_auto_piezas add column vigencia_por text not null default '';
alter table historias_auto_piezas add column revision_intento_at text;
alter table historias_auto_piezas add column revision_error text not null default '';
create index if not exists historias_auto_piezas_vigencia on historias_auto_piezas(vigencia, client_id);
