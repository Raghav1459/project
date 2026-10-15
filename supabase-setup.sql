-- Run this in Supabase SQL Editor after creating a project.
-- Complaint details are public; contact emails are kept in a separate admin-only table.
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 70),
  park text not null check (char_length(park) between 1 and 120),
  location text not null default '',
  category text not null check (category in ('Pathways','Playground','Greenery','Cleanliness','Facilities','Other')),
  description text not null check (char_length(description) between 1 and 500),
  status text not null default 'Open' check (status in ('Open','In progress','Resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.complaint_contacts (
  complaint_id uuid primary key references public.complaints(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.complaints enable row level security;
alter table public.complaint_contacts enable row level security;
alter table public.admin_users enable row level security;

revoke all on public.complaints, public.complaint_contacts, public.admin_users from anon, authenticated;
grant select, insert on public.complaints to anon, authenticated;
grant update on public.complaints to authenticated;
grant insert on public.complaint_contacts to anon, authenticated;
grant select on public.complaint_contacts to authenticated;

drop policy if exists "Anyone can read public complaint details" on public.complaints;
create policy "Anyone can read public complaint details"
  on public.complaints for select to anon, authenticated using (true);
drop policy if exists "Anyone can submit a complaint" on public.complaints;
create policy "Anyone can submit a complaint"
  on public.complaints for insert to anon, authenticated with check (true);
drop policy if exists "Admins can update complaints" on public.complaints;
create policy "Admins can update complaints"
  on public.complaints for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Visitors can submit contact for a complaint" on public.complaint_contacts;
create policy "Visitors can submit contact for a complaint"
  on public.complaint_contacts for insert to anon, authenticated with check (true);
drop policy if exists "Only admins can read contact details" on public.complaint_contacts;
create policy "Only admins can read contact details"
  on public.complaint_contacts for select to authenticated using ((select public.is_admin()));

-- No direct table access is granted for admin_users. The is_admin() function checks it securely.
