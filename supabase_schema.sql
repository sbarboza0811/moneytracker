-- MoneyTracker em projeto Supabase PRÓPRIO, nunca no TestoTracker
create table if not exists public.moneytracker_snapshots (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.moneytracker_snapshots enable row level security;
revoke all on table public.moneytracker_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.moneytracker_snapshots to authenticated;
create policy mt_read on public.moneytracker_snapshots for select to authenticated using ((select auth.uid())=user_id);
create policy mt_insert on public.moneytracker_snapshots for insert to authenticated with check ((select auth.uid())=user_id);
create policy mt_update on public.moneytracker_snapshots for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy mt_delete on public.moneytracker_snapshots for delete to authenticated using ((select auth.uid())=user_id);
