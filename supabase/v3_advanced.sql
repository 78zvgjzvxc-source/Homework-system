-- HoneyButter v3 migration: courses, workload planning, document metadata, and activity history.
-- Run after v2_two_people.sql in Supabase SQL Editor.

create table if not exists public.courses (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_key text not null check (owner_key in ('me', 'partner', 'both')),
  code text not null,
  title text not null,
  lecturer text not null default '',
  color text not null default 'blue',
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists course_id text references public.courses(id) on delete set null;
alter table public.tasks add column if not exists estimated_minutes integer not null default 60;
alter table public.notes add column if not exists source_name text;

create index if not exists courses_workspace_idx on public.courses(workspace_id, owner_key);
create index if not exists activities_workspace_idx on public.activities(workspace_id, created_at desc);
create index if not exists tasks_course_idx on public.tasks(course_id);

alter table public.courses enable row level security;
alter table public.activities enable row level security;

drop policy if exists "members read courses" on public.courses;
create policy "members read courses" on public.courses for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add courses" on public.courses;
create policy "members add courses" on public.courses for insert to authenticated with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members update courses" on public.courses;
create policy "members update courses" on public.courses for update to authenticated using (public.is_kin_workspace_member(workspace_id)) with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members delete courses" on public.courses;
create policy "members delete courses" on public.courses for delete to authenticated using (public.is_kin_workspace_member(workspace_id));

drop policy if exists "members read activities" on public.activities;
create policy "members read activities" on public.activities for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add activities" on public.activities;
create policy "members add activities" on public.activities for insert to authenticated with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members update activities" on public.activities;
create policy "members update activities" on public.activities for update to authenticated using (public.is_kin_workspace_member(workspace_id)) with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members delete activities" on public.activities;
create policy "members delete activities" on public.activities for delete to authenticated using (public.is_kin_workspace_member(workspace_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courses') then
    alter publication supabase_realtime add table public.courses;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activities') then
    alter publication supabase_realtime add table public.activities;
  end if;
end $$;
