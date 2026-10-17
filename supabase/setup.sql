-- =========================================================
-- Fraser Marine Sales: boats-for-sale database
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Before running, change the email on the line marked  <-- YOUR EMAIL
-- =========================================================

-- Who is allowed to manage listings (only emails in this table can add/edit/delete)
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;   -- no policies: nobody can read or change it through the API

insert into public.admins (email) values ('you@example.com')   -- <-- YOUR EMAIL (the one you'll log in with)
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- The boats
create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,
  status      text not null default 'draft' check (status in ('draft', 'for_sale', 'under_offer', 'sold')),
  price       numeric,
  price_label text,          -- e.g. "Offers over", "POA" (optional)
  year        int,
  make        text,
  model       text,
  length_m    numeric,
  engine      text,
  engine_hours int,
  location    text,
  description text,
  photos      text[] not null default '{}',   -- public photo URLs, first one is the cover
  sort        int not null default 0
);
alter table public.listings enable row level security;

drop policy if exists "Anyone can see published boats" on public.listings;
create policy "Anyone can see published boats" on public.listings
  for select to anon, authenticated
  using (status <> 'draft' or public.is_admin());

drop policy if exists "Admin can add boats" on public.listings;
create policy "Admin can add boats" on public.listings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "Admin can edit boats" on public.listings;
create policy "Admin can edit boats" on public.listings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin can delete boats" on public.listings;
create policy "Admin can delete boats" on public.listings
  for delete to authenticated using (public.is_admin());

-- Photos: a public bucket anyone can view, only the admin can upload/replace/delete
insert into storage.buckets (id, name, public)
values ('boat-photos', 'boat-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Admin can upload boat photos" on storage.objects;
create policy "Admin can upload boat photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'boat-photos' and public.is_admin());

drop policy if exists "Admin can update boat photos" on storage.objects;
create policy "Admin can update boat photos" on storage.objects
  for update to authenticated using (bucket_id = 'boat-photos' and public.is_admin());

drop policy if exists "Admin can delete boat photos" on storage.objects;
create policy "Admin can delete boat photos" on storage.objects
  for delete to authenticated using (bucket_id = 'boat-photos' and public.is_admin());
