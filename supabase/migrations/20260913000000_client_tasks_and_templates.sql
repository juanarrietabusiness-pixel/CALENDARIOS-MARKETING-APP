-- Sistema de tareas por cliente
create table public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  title text not null,
  description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'completed')),
  due_date date,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly')),
  recurrence_day int,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.client_tasks enable row level security;

create policy "Owner can do everything with tasks"
  on public.client_tasks for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Plantillas de tareas obligatorias para clientes nuevos
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  title text not null,
  description text not null default '',
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly')),
  recurrence_day int,
  is_mandatory boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.task_templates enable row level security;

create policy "Owner can do everything with templates"
  on public.task_templates for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
