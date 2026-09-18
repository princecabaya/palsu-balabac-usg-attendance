-- Public USG website content management.
-- Run after the attendance portal migrations.

begin;

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 180),
  category text not null default 'Announcement',
  summary text,
  body text not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 180),
  description text,
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_published boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_event_time_order check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.site_officers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position text not null,
  program text,
  photo_url text,
  display_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'Ongoing',
  accomplishment text,
  is_published boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Public document',
  description text,
  file_url text not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare table_name text;
begin
  foreach table_name in array array['site_announcements', 'site_events', 'site_officers', 'site_projects', 'site_documents'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_public_read', table_name);
    execute format('create policy %I on public.%I for select to anon using (is_published)', table_name || '_public_read', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_read', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (is_published or public.is_admin())', table_name || '_authenticated_read', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', table_name || '_admin_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', table_name || '_admin_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', table_name || '_admin_delete', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
    execute format('grant insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end;
$$;

drop trigger if exists site_announcements_touch_updated_at on public.site_announcements;
create trigger site_announcements_touch_updated_at before update on public.site_announcements for each row execute function public.touch_updated_at();
drop trigger if exists site_events_touch_updated_at on public.site_events;
create trigger site_events_touch_updated_at before update on public.site_events for each row execute function public.touch_updated_at();
drop trigger if exists site_officers_touch_updated_at on public.site_officers;
create trigger site_officers_touch_updated_at before update on public.site_officers for each row execute function public.touch_updated_at();
drop trigger if exists site_projects_touch_updated_at on public.site_projects;
create trigger site_projects_touch_updated_at before update on public.site_projects for each row execute function public.touch_updated_at();
drop trigger if exists site_documents_touch_updated_at on public.site_documents;
create trigger site_documents_touch_updated_at before update on public.site_documents for each row execute function public.touch_updated_at();

commit;
