-- ============================================================
-- Las conversaciones de DISEÑO del asistente
--
-- El asistente es también el director creativo de cada cliente, y se puede
-- hablar con él desde la pestaña Estudio («Con el director»). Son las MISMAS
-- conversaciones de siempre (las ve todo el equipo, en el chat y en el
-- Estudio); `tema` sólo dice cuáles se empezaron para diseñar, para que el
-- Estudio enseñe ésas primero y el chat les ponga su etiqueta.
--
--   ''        una conversación cualquiera (todas las de antes)
--   'diseno'  empezada en el Estudio, con el director
-- ============================================================

alter table chat_conversaciones add column tema text not null default '' check (tema in ('', 'diseno'));
