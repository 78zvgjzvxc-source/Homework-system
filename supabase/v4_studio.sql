-- HoneyButter v4: file studio, annotations, focus room, check-ins, and semantic-ready search.
-- Run once after v3_advanced.sql in Supabase SQL Editor.

create extension if not exists vector with schema extensions;

create table if not exists public.workspace_files (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_key text not null check (owner_key in ('me', 'partner')),
  name text not null,
  mime_type text not null default 'application/octet-stream',
  extension text not null default '',
  size_bytes bigint not null default 0,
  storage_path text,
  extracted_content text not null default '',
  edited_content text,
  visibility text not null default 'shared' check (visibility in ('private', 'shared')),
  course_id text references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.file_highlights (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id text not null references public.workspace_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_text text not null,
  note text not null default '',
  color text not null default 'yellow',
  start_offset integer,
  end_offset integer,
  created_at timestamptz not null default now()
);

create table if not exists public.focus_sessions (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_key text not null check (owner_key in ('me', 'partner')),
  label text not null default 'Focus session',
  course_id text references public.courses(id) on delete set null,
  planned_minutes integer not null default 25,
  completed_minutes integer not null default 0,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  started_at timestamptz not null,
  ended_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_key text not null check (owner_key in ('me', 'partner')),
  mood text not null default 'good',
  availability text not null default 'available',
  message text not null default '',
  checkin_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, user_id, checkin_date)
);

-- Embeddings can be filled by a future background indexer without changing the file model.
create table if not exists public.memory_embeddings (
  note_id text primary key references public.notes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  embedding extensions.vector(1536),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_files_workspace_idx on public.workspace_files(workspace_id, updated_at desc);
create index if not exists file_highlights_file_idx on public.file_highlights(file_id, created_at desc);
create index if not exists focus_sessions_workspace_idx on public.focus_sessions(workspace_id, started_at desc);
create index if not exists checkins_workspace_date_idx on public.checkins(workspace_id, checkin_date desc);

alter table public.workspace_files enable row level security;
alter table public.file_highlights enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.checkins enable row level security;
alter table public.memory_embeddings enable row level security;

drop policy if exists "members read accessible files" on public.workspace_files;
create policy "members read accessible files" on public.workspace_files for select to authenticated
using (public.is_kin_workspace_member(workspace_id) and (visibility = 'shared' or owner_id = auth.uid()));
drop policy if exists "members add owned files" on public.workspace_files;
create policy "members add owned files" on public.workspace_files for insert to authenticated
with check (public.is_kin_workspace_member(workspace_id) and owner_id = auth.uid());
drop policy if exists "owners update files" on public.workspace_files;
create policy "owners update files" on public.workspace_files for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_kin_workspace_member(workspace_id));
drop policy if exists "owners delete files" on public.workspace_files;
create policy "owners delete files" on public.workspace_files for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members read accessible highlights" on public.file_highlights;
create policy "members read accessible highlights" on public.file_highlights for select to authenticated
using (public.is_kin_workspace_member(workspace_id) and exists (
  select 1 from public.workspace_files f where f.id = file_id and (f.visibility = 'shared' or f.owner_id = auth.uid())
));
drop policy if exists "members add highlights" on public.file_highlights;
create policy "members add highlights" on public.file_highlights for insert to authenticated
with check (
  public.is_kin_workspace_member(workspace_id) and user_id = auth.uid() and exists (
    select 1 from public.workspace_files f where f.id = file_id and (f.visibility = 'shared' or f.owner_id = auth.uid())
  )
);
drop policy if exists "authors update highlights" on public.file_highlights;
create policy "authors update highlights" on public.file_highlights for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "authors delete highlights" on public.file_highlights;
create policy "authors delete highlights" on public.file_highlights for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members read focus sessions" on public.focus_sessions;
create policy "members read focus sessions" on public.focus_sessions for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add own focus sessions" on public.focus_sessions;
create policy "members add own focus sessions" on public.focus_sessions for insert to authenticated with check (public.is_kin_workspace_member(workspace_id) and user_id = auth.uid());
drop policy if exists "owners update focus sessions" on public.focus_sessions;
create policy "owners update focus sessions" on public.focus_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "owners delete focus sessions" on public.focus_sessions;
create policy "owners delete focus sessions" on public.focus_sessions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members read checkins" on public.checkins;
create policy "members read checkins" on public.checkins for select to authenticated using (public.is_kin_workspace_member(workspace_id));
drop policy if exists "members add own checkins" on public.checkins;
create policy "members add own checkins" on public.checkins for insert to authenticated with check (public.is_kin_workspace_member(workspace_id) and user_id = auth.uid());
drop policy if exists "owners update checkins" on public.checkins;
create policy "owners update checkins" on public.checkins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members read accessible embeddings" on public.memory_embeddings;
create policy "members read accessible embeddings" on public.memory_embeddings for select to authenticated using (
  public.is_kin_workspace_member(workspace_id) and (owner_id is null or owner_id = auth.uid())
);
drop policy if exists "owners manage embeddings" on public.memory_embeddings;
create policy "owners manage embeddings" on public.memory_embeddings for all to authenticated
using (owner_id is null or owner_id = auth.uid())
with check (public.is_kin_workspace_member(workspace_id) and (owner_id is null or owner_id = auth.uid()));

create or replace function public.match_accessible_memories(
  query_embedding extensions.vector(1536),
  match_workspace uuid,
  match_count integer default 8
)
returns table(note_id text, title text, content text, similarity double precision)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.title, n.content, 1 - (e.embedding <=> query_embedding) as similarity
  from public.memory_embeddings e
  join public.notes n on n.id = e.note_id
  where e.workspace_id = match_workspace and e.embedding is not null
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;
grant execute on function public.match_accessible_memories(extensions.vector, uuid, integer) to authenticated;

-- Collaborators may edit the working text of a shared file without receiving permission
-- to rename, move, privatize, replace, or take ownership of its stored original.
create or replace function public.save_accessible_file_content(file_key text, new_content text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.workspace_files f
  set edited_content = left(coalesce(new_content, ''), 500000), updated_at = now()
  where f.id = file_key
    and public.is_kin_workspace_member(f.workspace_id)
    and (f.visibility = 'shared' or f.owner_id = auth.uid());
  if not found then raise exception 'File is unavailable or private'; end if;
end;
$$;
revoke all on function public.save_accessible_file_content(text, text) from public;
grant execute on function public.save_accessible_file_content(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('honeybutter-files', 'honeybutter-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "members read workspace files" on storage.objects;
create policy "members read workspace files" on storage.objects for select to authenticated using (
  bucket_id = 'honeybutter-files'
  and public.is_kin_workspace_member(((storage.foldername(name))[1])::uuid)
  and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.workspace_files f where f.storage_path = name and f.visibility = 'shared')
  )
);
drop policy if exists "members upload workspace files" on storage.objects;
create policy "members upload workspace files" on storage.objects for insert to authenticated with check (
  bucket_id = 'honeybutter-files' and public.is_kin_workspace_member(((storage.foldername(name))[1])::uuid) and owner_id = auth.uid()::text
);
drop policy if exists "owners update workspace files" on storage.objects;
create policy "owners update workspace files" on storage.objects for update to authenticated using (
  bucket_id = 'honeybutter-files' and owner_id = auth.uid()::text
);
drop policy if exists "owners delete workspace files" on storage.objects;
create policy "owners delete workspace files" on storage.objects for delete to authenticated using (
  bucket_id = 'honeybutter-files' and owner_id = auth.uid()::text
);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_files') then alter publication supabase_realtime add table public.workspace_files; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'file_highlights') then alter publication supabase_realtime add table public.file_highlights; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_sessions') then alter publication supabase_realtime add table public.focus_sessions; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkins') then alter publication supabase_realtime add table public.checkins; end if;
end $$;
