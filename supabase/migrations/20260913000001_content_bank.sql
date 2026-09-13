-- Banco de contenido por cliente
create table public.content_bank (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  file_path text not null,
  file_name text not null,
  file_type text not null default 'image' check (file_type in ('image', 'video')),
  description text not null default '',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.content_bank enable row level security;

create policy "Owner can do everything with content bank"
  on public.content_bank for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Bucket de almacenamiento
insert into storage.buckets (id, name, public)
values ('content-bank', 'content-bank', false)
on conflict (id) do nothing;

-- Políticas de storage: el dueño puede subir, leer y borrar
create policy "Authenticated users can upload to content-bank"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'content-bank');

create policy "Authenticated users can read own content-bank"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'content-bank');

create policy "Authenticated users can delete own content-bank"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'content-bank');
