-- ============================================================
-- Los permisos que Meta concedió DE VERDAD al token
--
-- Marcar un permiso en la app de Meta no lo mete en el token: tiene que
-- estar en la configuración de «Inicio de sesión con Facebook para
-- empresas» y volver a conectar. Sin guardar lo concedido (/me/permissions)
-- no había forma de saber cuál de las dos cosas faltaba, y el aviso de la
-- última medición seguía saliendo igual después de reconectar.
-- ============================================================

alter table integracion_meta add column permisos text check (permisos is null or json_valid(permisos));
