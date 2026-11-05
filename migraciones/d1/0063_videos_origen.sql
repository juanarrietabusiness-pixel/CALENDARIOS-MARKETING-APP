-- ============================================================
-- De dónde sale un video animado: `videos_proyectos.origen`
--
-- «Montarlo aquí» vuelve los clips de un reel por planos (un ENCARGO del
-- Estudio, worker/lib/estudio/encargoReel.js) en un proyecto de video animado
-- con la voz, el texto, los subtítulos y el logo. `origen` (JSON) dice de qué
-- reel salió: { tipo: "reel", encargoId }. Lo usa el render para poner el mp4
-- en el SITIO del video crudo de ese reel en la publicación (y no al lado), y
-- la pantalla para volver al reel.
--
-- Nada de lo que hay se toca: una columna con valor por defecto.
-- ============================================================

alter table videos_proyectos add column origen text not null default '{}' check (json_valid(origen));
