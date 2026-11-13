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
