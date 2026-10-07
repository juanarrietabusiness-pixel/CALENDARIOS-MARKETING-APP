-- ============================================================
-- El inventario del catálogo, por cliente
--
-- Un interruptor en la fila del estudio de mercado de cada cliente: con él
-- encendido, cada producto del catálogo lleva su disponibilidad (mucho,
-- normal, poco, agotado), hasta cuándo vale su oferta y su diferenciador, y
-- el plan del mes los usa (lo agotado no sale; lo que tiene poco, al
-- principio del mes; lo que tiene mucho, más veces). Apagado —que es lo de
-- siempre—, nada de eso existe: sólo para los clientes que lo necesitan.
-- Los campos van dentro del JSON de `catalogo`: aquí sólo el interruptor.
-- ============================================================

alter table mercado_clientes add column inventario integer not null default 0 check (inventario in (0, 1));
