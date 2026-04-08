create extension if not exists pgcrypto;

create table if not exists public.jotty_app_settings (
  id text primary key default 'global',
  pin_hash text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jotty_notes (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.jotty_app_settings enable row level security;
alter table public.jotty_notes enable row level security;

drop policy if exists "Allow anonymous read jotty app settings" on public.jotty_app_settings;
create policy "Allow anonymous read jotty app settings"
  on public.jotty_app_settings
  for select
  to anon
  using (true);

drop policy if exists "Allow anonymous write jotty app settings" on public.jotty_app_settings;
create policy "Allow anonymous write jotty app settings"
  on public.jotty_app_settings
  for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous update jotty app settings" on public.jotty_app_settings;
create policy "Allow anonymous update jotty app settings"
  on public.jotty_app_settings
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Allow anonymous read jotty notes" on public.jotty_notes;
create policy "Allow anonymous read jotty notes"
  on public.jotty_notes
  for select
  to anon
  using (true);

drop policy if exists "Allow anonymous insert jotty notes" on public.jotty_notes;
create policy "Allow anonymous insert jotty notes"
  on public.jotty_notes
  for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous update jotty notes" on public.jotty_notes;
create policy "Allow anonymous update jotty notes"
  on public.jotty_notes
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Allow anonymous delete jotty notes" on public.jotty_notes;
create policy "Allow anonymous delete jotty notes"
  on public.jotty_notes
  for delete
  to anon
  using (true);
