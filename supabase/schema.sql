-- Kin database schema
-- Run this entire file once in Supabase Dashboard → SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Kin',
  invite_code text not null unique default upper(encode(gen_random_bytes(5), 'hex')),
  name_one text not null default 'Me',
  name_two text not null default 'My person',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  member_slot text not null check (member_slot in ('me', 'partner')),
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.tasks (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '',
  due_date date not null,
  owner_key text not null default 'me' check (owner_key in ('me', 'partner', 'both')),
  category text not null default 'personal',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  content text not null,
  category text not null default 'personal',
  tags text[] not null default '{}',
  owner_id uuid references auth.users(id) on delete set null,
  visibility text not null default 'shared' check (visibility in ('private', 'shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetables (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_key text not null check (owner_key in ('me', 'partner')),
  course_code text not null default '',
  title text not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  location text not null default '',
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists tasks_workspace_idx on public.tasks(workspace_id);
create index if not exists tasks_due_date_idx on public.tasks(workspace_id, due_date);
create index if not exists notes_workspace_idx on public.notes(workspace_id);
create index if not exists timetables_workspace_idx on public.timetables(workspace_id, owner_key, day_of_week);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.timetables enable row level security;

-- SECURITY DEFINER avoids recursive policies on workspace_members.
create or replace function public.is_kin_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_kin_workspace_member(uuid) from public;
grant execute on function public.is_kin_workspace_member(uuid) to authenticated;

drop policy if exists "members read workspaces" on public.workspaces;
create policy "members read workspaces" on public.workspaces for select to authenticated
using (public.is_kin_workspace_member(id));

drop policy if exists "members update workspaces" on public.workspaces;
create policy "members update workspaces" on public.workspaces for update to authenticated
using (public.is_kin_workspace_member(id)) with check (public.is_kin_workspace_member(id));

drop policy if exists "members read memberships" on public.workspace_members;
create policy "members read memberships" on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_kin_workspace_member(workspace_id));

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks" on public.tasks for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add tasks" on public.tasks;
create policy "members add tasks" on public.tasks for insert to authenticated with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members update tasks" on public.tasks;
create policy "members update tasks" on public.tasks for update to authenticated using (public.is_kin_workspace_member(workspace_id)) with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members delete tasks" on public.tasks;
create policy "members delete tasks" on public.tasks for delete to authenticated using (public.is_kin_workspace_member(workspace_id));

drop policy if exists "members read notes" on public.notes;
create policy "members read notes" on public.notes for select to authenticated using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
drop policy if exists "members add notes" on public.notes;
create policy "members add notes" on public.notes for insert to authenticated with check (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
drop policy if exists "members update notes" on public.notes;
create policy "members update notes" on public.notes for update to authenticated using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid()))) with check (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
drop policy if exists "members delete notes" on public.notes;
create policy "members delete notes" on public.notes for delete to authenticated using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));

drop policy if exists "members read timetables" on public.timetables;
create policy "members read timetables" on public.timetables for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add timetables" on public.timetables;
create policy "members add timetables" on public.timetables for insert to authenticated with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members update timetables" on public.timetables;
create policy "members update timetables" on public.timetables for update to authenticated using (public.is_kin_workspace_member(workspace_id)) with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members delete timetables" on public.timetables;
create policy "members delete timetables" on public.timetables for delete to authenticated using (public.is_kin_workspace_member(workspace_id));

-- Authenticated users call this instead of inserting privileged membership rows directly.
create or replace function public.create_kin_workspace(workspace_name text, first_name text, second_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a Kin workspace';
  end if;
  insert into public.workspaces(name, name_one, name_two, created_by)
  values (coalesce(nullif(trim(workspace_name), ''), 'Our Kin'), left(trim(first_name), 30), left(trim(second_name), 30), auth.uid())
  returning id into new_workspace;
  insert into public.workspace_members(workspace_id, user_id, role, member_slot, display_name) values (new_workspace, auth.uid(), 'owner', 'me', left(trim(first_name), 30));
  return new_workspace;
end;
$$;

create or replace function public.join_kin_workspace(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target from public.workspaces where invite_code = upper(trim(code));
  if target is null then raise exception 'Invite code not found'; end if;
  if (select count(*) from public.workspace_members where workspace_id = target) >= 2 then
    raise exception 'This Kin workspace already has two members';
  end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a Kin workspace';
  end if;
  insert into public.workspace_members(workspace_id, user_id, role, member_slot, display_name)
  select target, auth.uid(), 'member', 'partner', name_two from public.workspaces where id = target;
  return target;
end;
$$;

revoke all on function public.create_kin_workspace(text,text,text) from public;
revoke all on function public.join_kin_workspace(text) from public;
grant execute on function public.create_kin_workspace(text,text,text) to authenticated;
grant execute on function public.join_kin_workspace(text) to authenticated;

-- Enable the simple Postgres Changes stream used by this two-person app.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes') then
    alter publication supabase_realtime add table public.notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'timetables') then
    alter publication supabase_realtime add table public.timetables;
  end if;
end $$;

-- V3 advanced study model (kept here so fresh installs need only this schema).
create table if not exists public.courses (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_key text not null check (owner_key in ('me', 'partner', 'both')),
  code text not null, title text not null, lecturer text not null default '',
  color text not null default 'blue', credits integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.activities (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_name text not null, message text not null,
  created_at timestamptz not null default now()
);
alter table public.tasks add column if not exists course_id text references public.courses(id) on delete set null;
alter table public.tasks add column if not exists estimated_minutes integer not null default 60;
alter table public.notes add column if not exists source_name text;
alter table public.courses enable row level security;
alter table public.activities enable row level security;
create index if not exists courses_workspace_idx on public.courses(workspace_id, owner_key);
create index if not exists activities_workspace_idx on public.activities(workspace_id, created_at desc);

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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courses') then alter publication supabase_realtime add table public.courses; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activities') then alter publication supabase_realtime add table public.activities; end if;
end $$;
