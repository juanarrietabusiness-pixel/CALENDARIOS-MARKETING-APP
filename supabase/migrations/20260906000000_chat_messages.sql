-- ============================================================
-- Juancito Ads — Chat de IA por cliente
--
-- Tabla para almacenar el historial de conversaciones entre la
-- agencia y el asistente de IA, por cliente.
-- ============================================================

create table public.chat_messages (
  id         uuid        default gen_random_uuid() primary key,
  client_id  uuid        not null references public.clients(id) on delete cascade,
  owner_id   uuid        not null default auth.uid(),
  role       text        not null check (role in ('user', 'assistant')),
  content    text        not null,
  created_at timestamptz default now() not null
);

create index idx_chat_messages_client
  on public.chat_messages(client_id, created_at);

alter table public.chat_messages enable row level security;

create policy "Owner manages their chat messages"
  on public.chat_messages
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
