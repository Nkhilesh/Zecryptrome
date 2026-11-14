-- Run once in this project's Supabase SQL Editor. Existing tables are untouched.
create table if not exists public.zecryptrome_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('income.v1','expenses.v1','savings.v1','loans.v1','scan.history.v1','fuel.presets.v1','dashboard.categories.v1','calendar.filters','theme')),
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.zecryptrome_data enable row level security;
revoke all on public.zecryptrome_data from anon;
grant select, insert, update, delete on public.zecryptrome_data to authenticated;
drop policy if exists "Own account data" on public.zecryptrome_data;
create policy "Own account data" on public.zecryptrome_data
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Household (joint account): two people share one budget.
-- The owner invites a partner with a code; the partner then reads and writes the
-- owner's budget data. Theme, home-page cards and calendar filters stay personal.
-- The partner's own data is kept untouched and comes back if they leave.
-- Run this part once in the Supabase SQL Editor as well. It is safe to run again.
-- ---------------------------------------------------------------------------
create table if not exists public.zecryptrome_households (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  owner_email text,
  partner_id uuid unique references auth.users(id) on delete set null,
  partner_email text,
  invite_code text unique,
  invite_expires timestamptz,
  created_at timestamptz not null default now(),
  check (partner_id is null or partner_id <> owner_id)
);
alter table public.zecryptrome_households enable row level security;
revoke all on public.zecryptrome_households from anon, authenticated;
-- Read-only for members; every change goes through the functions below
grant select on public.zecryptrome_households to authenticated;
drop policy if exists "Members see their household" on public.zecryptrome_households;
create policy "Members see their household" on public.zecryptrome_households
  for select to authenticated
  using ((select auth.uid()) in (owner_id, partner_id));

-- A partner can read and write the owner's shared budget data (not the personal settings)
drop policy if exists "Household partner data" on public.zecryptrome_data;
create policy "Household partner data" on public.zecryptrome_data
  for all to authenticated
  using (key not in ('theme', 'dashboard.categories.v1', 'calendar.filters')
    and exists (select 1 from public.zecryptrome_households h
                where h.owner_id = zecryptrome_data.user_id and h.partner_id = (select auth.uid())))
  with check (key not in ('theme', 'dashboard.categories.v1', 'calendar.filters')
    and exists (select 1 from public.zecryptrome_households h
                where h.owner_id = zecryptrome_data.user_id and h.partner_id = (select auth.uid())));

-- Create (or replace) your invite code. Valid for 7 days.
create or replace function public.zecryptrome_create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_code text;
begin
  if me is null then raise exception 'Please sign in again.'; end if;
  if exists (select 1 from zecryptrome_households where partner_id = me) then
    raise exception 'You are already in a partner''s household. Leave it before inviting someone.'; end if;
  if exists (select 1 from zecryptrome_households where owner_id = me and partner_id is not null) then
    raise exception 'You already share your budget with a partner.'; end if;
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into zecryptrome_households (owner_id, owner_email, invite_code, invite_expires)
  values (me, auth.jwt() ->> 'email', new_code, now() + interval '7 days')
  on conflict (owner_id) do update
    set invite_code = excluded.invite_code, invite_expires = excluded.invite_expires, owner_email = excluded.owner_email;
  return new_code;
end $$;

-- Join a partner's household with their code
create or replace function public.zecryptrome_join_household(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h zecryptrome_households;
begin
  if me is null then raise exception 'Please sign in again.'; end if;
  select * into h from zecryptrome_households
   where invite_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')) and invite_expires > now()
   for update;
  if not found then raise exception 'That invite code is wrong or has expired. Ask your partner for a new one.'; end if;
  if h.owner_id = me then raise exception 'That is your own invite code. Send it to your partner instead.'; end if;
  if h.partner_id is not null then raise exception 'That household already has a partner.'; end if;
  if exists (select 1 from zecryptrome_households where partner_id = me) then
    raise exception 'You are already in a household. Leave it first.'; end if;
  if exists (select 1 from zecryptrome_households where owner_id = me and partner_id is not null) then
    raise exception 'Someone already shares your budget. Remove them first.'; end if;
  delete from zecryptrome_households where owner_id = me; -- your own unused invite
  update zecryptrome_households
     set partner_id = me, partner_email = auth.jwt() ->> 'email', invite_code = null, invite_expires = null
   where owner_id = h.owner_id;
  return h.owner_id;
end $$;

-- Leave a household (partner) or stop sharing / cancel the invite (owner)
create or replace function public.zecryptrome_leave_household()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  delete from zecryptrome_households where owner_id = auth.uid() or partner_id = auth.uid();
end $$;

revoke execute on function public.zecryptrome_create_invite() from public, anon;
revoke execute on function public.zecryptrome_join_household(text) from public, anon;
revoke execute on function public.zecryptrome_leave_household() from public, anon;
grant execute on function public.zecryptrome_create_invite() to authenticated;
grant execute on function public.zecryptrome_join_household(text) to authenticated;
grant execute on function public.zecryptrome_leave_household() to authenticated;

-- ---------------------------------------------------------------------------
-- Delete my account (Settings -> Account settings).
-- Removes the sign-in account; its budget data and household are removed with it
-- (on delete cascade). A partner who had joined this person's household goes back to
-- their own budget. If this person had joined someone else's household, they leave it first.
-- Run this part once in the Supabase SQL Editor as well. It is safe to run again.
-- ---------------------------------------------------------------------------
create or replace function public.zecryptrome_delete_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please sign in again.'; end if;
  delete from public.zecryptrome_households where partner_id = me;
  delete from auth.users where id = me;
end $$;
revoke execute on function public.zecryptrome_delete_account() from public, anon;
grant execute on function public.zecryptrome_delete_account() to authenticated;
