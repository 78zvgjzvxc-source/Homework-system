-- Kin v2 migration: two identified people, private Brains, and timetables.
-- Run this once in Supabase SQL Editor for an existing Kin database.

alter table public.workspace_members add column if not exists member_slot text;
alter table public.workspace_members add column if not exists display_name text;

update public.workspace_members wm
set member_slot = case when wm.role = 'owner' then 'me' else 'partner' end,
    display_name = case when wm.role = 'owner' then w.name_one else w.name_two end
from public.workspaces w
where w.id = wm.workspace_id and (wm.member_slot is null or wm.display_name is null);

alter table public.workspace_members alter column member_slot set not null;
alter table public.workspace_members alter column display_name set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspace_members_member_slot_check') then
    alter table public.workspace_members add constraint workspace_members_member_slot_check check (member_slot in ('me', 'partner'));
  end if;
end $$;
create unique index if not exists workspace_member_slot_idx on public.workspace_members(workspace_id, member_slot);

alter table public.notes add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.notes add column if not exists visibility text not null default 'shared';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notes_visibility_check') then
    alter table public.notes add constraint notes_visibility_check check (visibility in ('private', 'shared'));
  end if;
end $$;

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
create index if not exists timetables_workspace_idx on public.timetables(workspace_id, owner_key, day_of_week);
alter table public.timetables enable row level security;

drop policy if exists "members read notes" on public.notes;
create policy "members read notes" on public.notes for select to authenticated
using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
drop policy if exists "members add notes" on public.notes;
create policy "members add notes" on public.notes for insert to authenticated
with check (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
drop policy if exists "members update notes" on public.notes;
create policy "members update notes" on public.notes for update to authenticated
using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())))
with check (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
drop policy if exists "members delete notes" on public.notes;
create policy "members delete notes" on public.notes for delete to authenticated
using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = (select auth.uid())));

drop policy if exists "members read timetables" on public.timetables;
create policy "members read timetables" on public.timetables for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add timetables" on public.timetables;
create policy "members add timetables" on public.timetables for insert to authenticated with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members update timetables" on public.timetables;
create policy "members update timetables" on public.timetables for update to authenticated using (public.is_kin_workspace_member(workspace_id)) with check (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members delete timetables" on public.timetables;
create policy "members delete timetables" on public.timetables for delete to authenticated using (public.is_kin_workspace_member(workspace_id));

create or replace function public.create_kin_workspace(workspace_name text, first_name text, second_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then raise exception 'This account already belongs to a Kin workspace'; end if;
  insert into public.workspaces(name, name_one, name_two, created_by)
  values (coalesce(nullif(trim(workspace_name), ''), 'Our Kin'), left(trim(first_name), 30), left(trim(second_name), 30), auth.uid())
  returning id into new_workspace;
  insert into public.workspace_members(workspace_id, user_id, role, member_slot, display_name)
  values (new_workspace, auth.uid(), 'owner', 'me', left(trim(first_name), 30));
  return new_workspace;
end; $$;

create or replace function public.join_kin_workspace(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target from public.workspaces where invite_code = upper(trim(code));
  if target is null then raise exception 'Invite code not found'; end if;
  if (select count(*) from public.workspace_members where workspace_id = target) >= 2 then raise exception 'This Kin workspace already has two members'; end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then raise exception 'This account already belongs to a Kin workspace'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, member_slot, display_name)
  select target, auth.uid(), 'member', 'partner', name_two from public.workspaces where id = target;
  return target;
end; $$;

revoke all on function public.create_kin_workspace(text,text,text) from public;
revoke all on function public.join_kin_workspace(text) from public;
grant execute on function public.create_kin_workspace(text,text,text) to authenticated;
grant execute on function public.join_kin_workspace(text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'timetables') then
    alter publication supabase_realtime add table public.timetables;
  end if;
end $$;
