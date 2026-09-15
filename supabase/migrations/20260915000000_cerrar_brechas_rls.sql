-- ============================================================
-- Juancito Ads — Cierre de las brechas que destapó la auditoría
--
-- Tres cosas, todas encontradas por los tests de despliegue y
-- confirmadas contra el proyecto real:
--
--   1. Las políticas del banco de contenido se llamaban «own
--      content-bank» pero su única condición era el nombre del bucket.
--      Cualquier sesión autenticada leía —y BORRABA— los archivos de
--      todos los clientes. Con una sola cuenta de agencia no se nota;
--      con la segunda, es acceso cruzado y borrado ajeno.
--
--   2. Cinco políticas llamaban a `auth.uid()` suelto. Postgres no
--      puede sacar esa llamada del bucle y la ejecuta una vez por fila
--      examinada. Envuelta en un `select` se evalúa una sola vez.
--
--   3. Dos claves ajenas sin índice: cada consulta por cliente recorría
--      la tabla entera, y borrar un cliente forzaba un escaneo completo
--      de sus tareas y de su banco de contenido.
--
-- Y una cuarta, de la lista de avisos de seguridad de Supabase:
-- `rls_auto_enable` es un disparador de eventos y estaba concedido a
-- anon. No es explotable por sí solo —fuera de un evento DDL no hace
-- nada—, pero una función security definer alcanzable sin sesión no
-- tiene por qué estar publicada en la API.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Banco de contenido: cada quien, lo suyo
--
-- Se acota por `owner`, que es la columna que rellena Storage con el
-- uid de quien sube el archivo. La ruta empieza por el id del cliente,
-- no por el del propietario, así que `foldername` no serviría aquí.
--
-- Los objetos que ya existen llevan su `owner` puesto: el cambio no
-- deja ninguno inaccesible.
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can upload to content-bank" on storage.objects;
drop policy if exists "Authenticated users can read own content-bank"  on storage.objects;
drop policy if exists "Authenticated users can delete own content-bank" on storage.objects;

create policy "content-bank: el propietario sube"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'content-bank' and owner = (select auth.uid()));

create policy "content-bank: el propietario lee"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'content-bank' and owner = (select auth.uid()));

create policy "content-bank: el propietario borra"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'content-bank' and owner = (select auth.uid()));

-- ------------------------------------------------------------
-- 2. `auth.uid()` una vez, no por fila
--
-- Se recrean las cinco políticas con la llamada envuelta. Mismo
-- alcance, mismo efecto: sólo cambia cuántas veces se evalúa.
--
-- Van además `to authenticated` en vez de al rol `public`. Con
-- `public`, la política también se evalúa para `anon`; no filtraba
-- nada (para anon `auth.uid()` es null y la condición nunca es cierta),
-- pero deja el alcance escrito en vez de deducido.
-- ------------------------------------------------------------
drop policy if exists "Owner manages their chat messages" on public.chat_messages;
create policy "chat_messages: el propietario gestiona los suyos"
  on public.chat_messages for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "El propietario gestiona sus memorias" on public.client_memories;
create policy "client_memories: el propietario gestiona las suyas"
  on public.client_memories for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner can do everything with tasks" on public.client_tasks;
create policy "client_tasks: el propietario gestiona las suyas"
  on public.client_tasks for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner can do everything with templates" on public.task_templates;
create policy "task_templates: el propietario gestiona las suyas"
  on public.task_templates for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner can do everything with content bank" on public.content_bank;
create policy "content_bank: el propietario gestiona el suyo"
  on public.content_bank for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 3. Índices de las claves ajenas
-- ------------------------------------------------------------
create index if not exists client_tasks_client_id_idx  on public.client_tasks (client_id);
create index if not exists content_bank_client_id_idx  on public.content_bank (client_id);

-- ------------------------------------------------------------
-- 4. `rls_auto_enable` fuera de la API
--
-- Es el disparador que habilita RLS en toda tabla nueva de `public`.
-- Se queda: es la red que evita que la próxima tabla nazca abierta.
-- Lo que se quita es su publicación como endpoint REST.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
