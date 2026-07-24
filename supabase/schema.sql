-- ApplyBoard Supabase schema
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create table if not exists public.applications (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.resumes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.job_resources (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.applications enable row level security;
alter table public.resumes enable row level security;
alter table public.job_resources enable row level security;

revoke all on public.applications from anon;
revoke all on public.resumes from anon;
revoke all on public.job_resources from anon;

grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, update, delete on public.resumes to authenticated;
grant select, insert, update, delete on public.job_resources to authenticated;

drop policy if exists "applications_select_own" on public.applications;
drop policy if exists "applications_insert_own" on public.applications;
drop policy if exists "applications_update_own" on public.applications;
drop policy if exists "applications_delete_own" on public.applications;

create policy "applications_select_own"
on public.applications for select to authenticated
using ((select auth.uid()) = user_id);

create policy "applications_insert_own"
on public.applications for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "applications_update_own"
on public.applications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "applications_delete_own"
on public.applications for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "resumes_select_own" on public.resumes;
drop policy if exists "resumes_insert_own" on public.resumes;
drop policy if exists "resumes_update_own" on public.resumes;
drop policy if exists "resumes_delete_own" on public.resumes;

create policy "resumes_select_own"
on public.resumes for select to authenticated
using ((select auth.uid()) = user_id);

create policy "resumes_insert_own"
on public.resumes for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "resumes_update_own"
on public.resumes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "resumes_delete_own"
on public.resumes for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "job_resources_select_own" on public.job_resources;
drop policy if exists "job_resources_insert_own" on public.job_resources;
drop policy if exists "job_resources_update_own" on public.job_resources;
drop policy if exists "job_resources_delete_own" on public.job_resources;

create policy "job_resources_select_own"
on public.job_resources for select to authenticated
using ((select auth.uid()) = user_id);

create policy "job_resources_insert_own"
on public.job_resources for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "job_resources_update_own"
on public.job_resources for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "job_resources_delete_own"
on public.job_resources for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('resumes', 'resumes', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = 10485760;

drop policy if exists "resume_files_select_own" on storage.objects;
drop policy if exists "resume_files_insert_own" on storage.objects;
drop policy if exists "resume_files_update_own" on storage.objects;
drop policy if exists "resume_files_delete_own" on storage.objects;

create policy "resume_files_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "resume_files_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "resume_files_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "resume_files_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'applications'
  ) then
    alter publication supabase_realtime add table public.applications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'resumes'
  ) then
    alter publication supabase_realtime add table public.resumes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_resources'
  ) then
    alter publication supabase_realtime add table public.job_resources;
  end if;
end
$$;
