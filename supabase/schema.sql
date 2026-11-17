-- FBSS Comms Calendar: database setup
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- Safe to run more than once.

-- ---------- people ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  color text not null default '#5F7478',
  role text not null default 'editor' check (role in ('admin','editor')),
  created_at timestamptz not null default now()
);

-- every new login gets a profile row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare palette text[] := array['#91412D','#B47E3D','#6E7358','#5F7478','#414A55','#7A5232','#A35A43','#4F6B4A'];
begin
  insert into public.profiles (id, email, full_name, color)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          palette[1 + floor(random()*array_length(palette,1))::int])
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- backfill anyone created before this script ran
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)) from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- only admins can change roles
create or replace function public.set_member_role(member uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change roles'; end if;
  if new_role not in ('admin','editor') then raise exception 'Unknown role'; end if;
  if member = auth.uid() and new_role <> 'admin' then raise exception 'You cannot remove your own admin role'; end if;
  update public.profiles set role = new_role where id = member;
end $$;

-- ---------- settings (one row) ----------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ---------- campaigns ----------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New campaign',
  start_date date, start_time time,
  end_date date, end_time time,
  ad_start date, ad_end date,
  location text not null default '',
  description text not null default '',
  ministry text not null default '',
  link text not null default '',
  color text not null default '#91412D',
  cover_path text not null default '',
  files jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- destinations (each scheduled placement) ----------
create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  channel_id text not null,
  publish_date date, publish_time time,
  assignee_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','review','approved','scheduled','posted')),
  headline text not null default '',
  copy text not null default '',
  notes text not null default '',
  image_paths jsonb not null default '[]'::jsonb,
  auto_publish boolean not null default false,
  publish_lock timestamptz,
  published_at timestamptz,
  external_url text not null default '',
  publish_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists destinations_campaign_idx on public.destinations(campaign_id);
create index if not exists destinations_autopub_idx on public.destinations(publish_date) where auto_publish and published_at is null;

-- ---------- Facebook / Instagram connection (server only) ----------
create table if not exists public.social_accounts (
  id int primary key default 1 check (id = 1),
  page_id text not null,
  page_name text not null default '',
  page_token text not null,
  ig_user_id text not null default '',
  ig_username text not null default '',
  connected_by uuid,
  updated_at timestamptz not null default now()
);

-- ---------- timestamps ----------
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns for each row execute function public.touch();
drop trigger if exists destinations_touch on public.destinations;
create trigger destinations_touch before update on public.destinations for each row execute function public.touch();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.campaigns enable row level security;
alter table public.destinations enable row level security;
alter table public.social_accounts enable row level security;  -- no policies: only server functions can read it

drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
revoke update on public.profiles from authenticated;
grant update (full_name, color) on public.profiles to authenticated;

drop policy if exists "staff read settings" on public.app_settings;
create policy "staff read settings" on public.app_settings for select to authenticated using (true);
drop policy if exists "staff update settings" on public.app_settings;
create policy "staff update settings" on public.app_settings for update to authenticated using (true) with check (true);

drop policy if exists "staff all campaigns" on public.campaigns;
create policy "staff all campaigns" on public.campaigns for all to authenticated using (true) with check (true);
drop policy if exists "staff all destinations" on public.destinations;
create policy "staff all destinations" on public.destinations for all to authenticated using (true) with check (true);

-- ---------- file storage ----------
-- Public bucket: anyone with a file's exact link can view it (Instagram needs public image links).
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "staff upload files" on storage.objects;
create policy "staff upload files" on storage.objects for insert to authenticated with check (bucket_id = 'files');
drop policy if exists "staff update files" on storage.objects;
create policy "staff update files" on storage.objects for update to authenticated using (bucket_id = 'files');
drop policy if exists "staff delete files" on storage.objects;
create policy "staff delete files" on storage.objects for delete to authenticated using (bucket_id = 'files');
drop policy if exists "staff read files" on storage.objects;
create policy "staff read files" on storage.objects for select to authenticated using (bucket_id = 'files');

-- ---------- live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.campaigns; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.destinations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- Update 2: assignment due dates + email tracking, communication requests
-- (safe to run again; running this whole file again is fine)
-- =====================================================================
alter table public.destinations add column if not exists due_date date;
alter table public.destinations add column if not exists assigned_notified uuid;     -- last person emailed about this assignment
alter table public.destinations add column if not exists due_reminded_on date;       -- day the due-date reminder went out
create index if not exists destinations_due_idx on public.destinations(due_date) where assignee_id is not null;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new' check (status in ('new','approved','declined')),
  requester_name text not null,
  requester_email text not null,
  ministry text not null default '',
  phone text not null default '',
  title text not null,
  start_date date, end_date date,
  start_time time, end_time time,
  location text not null default '',
  description text not null default '',
  channel_ids jsonb not null default '[]'::jsonb,
  not_sure boolean not null default false,
  files jsonb not null default '[]'::jsonb,
  decision_note text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.requests enable row level security;
-- The public form submits through a server function, so only signed-in staff touch this table directly.
drop policy if exists "staff read requests" on public.requests;
create policy "staff read requests" on public.requests for select to authenticated using (true);
drop policy if exists "staff update requests" on public.requests;
create policy "staff update requests" on public.requests for update to authenticated using (true) with check (true);
drop policy if exists "staff delete requests" on public.requests;
create policy "staff delete requests" on public.requests for delete to authenticated using (true);

do $$ begin
  begin alter publication supabase_realtime add table public.requests; exception when duplicate_object then null; end;
end $$;
