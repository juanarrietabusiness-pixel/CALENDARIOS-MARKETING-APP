-- ============================================================
-- El presupuesto de la IA y un consumo que lo cuente todo
--
-- El saldo de Anthropic se acabó sin que nadie lo viera venir: el
-- contador existía, pero escondido al fondo de Equipo, sin tope y sin
-- contar ni las búsquedas web ni lo que se paga a Google.
--
--   1. ajustes_espacio:
--        · presupuesto_usd: el tope del mes en dólares (0 = sin tope).
--        · al_limite: qué pasa al llegar —«avisar», «bajar» (Sonnet en
--          nivel Bajo) o «detener»—.
--        · ia_razonamiento_chat: el nivel del asistente, si se quiere
--          distinto del de la escritura (null = el mismo).
--   2. consumo_ia:
--        · proveedor: «anthropic» o «gemini».
--        · client_id: de qué cliente fue la llamada, si se sabe. Sin
--          clave foránea a propósito: el apunte de un cliente borrado
--          sigue siendo dinero gastado.
--        · busquedas: búsquedas web de la llamada (US$10 por cada 1.000).
--        · dia: la fecha en Panamá, para la gráfica por día.
-- ============================================================

pragma foreign_keys = on;

alter table ajustes_espacio add column presupuesto_usd real not null default 30
  check (presupuesto_usd >= 0);
alter table ajustes_espacio add column al_limite text not null default 'avisar'
  check (al_limite in ('avisar','bajar','detener'));
alter table ajustes_espacio add column ia_razonamiento_chat text
  check (ia_razonamiento_chat is null or ia_razonamiento_chat in ('bajo','medio','alto','maximo'));

alter table consumo_ia add column proveedor text not null default 'anthropic';
alter table consumo_ia add column client_id text;
alter table consumo_ia add column busquedas integer not null default 0;
alter table consumo_ia add column dia text not null default '';

create index if not exists consumo_ia_dia on consumo_ia(owner_id, dia);
