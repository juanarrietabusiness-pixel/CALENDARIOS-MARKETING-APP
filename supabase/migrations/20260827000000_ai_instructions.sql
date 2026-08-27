-- Instrucciones para la IA por cliente
--
-- Campo de texto libre donde la agencia escribe reglas que la IA debe
-- respetar siempre al generar contenido para este cliente. Se inyecta en
-- todos los prompts como bloque de instrucciones obligatorias.

alter table public.clients
  add column if not exists ai_instructions text not null default '';
