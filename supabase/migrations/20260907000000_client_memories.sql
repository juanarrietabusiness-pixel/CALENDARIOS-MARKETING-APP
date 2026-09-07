-- Memorias persistentes del asistente por cliente.
-- Cada memoria es una frase corta que el asistente decide guardar
-- cuando el usuario confirma una preferencia o dato recurrente.

create table if not exists public.client_memories (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  owner_id    uuid not null default auth.uid(),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index idx_memories_client on public.client_memories(client_id, created_at);

alter table public.client_memories enable row level security;

create policy "El propietario gestiona sus memorias"
  on public.client_memories
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
