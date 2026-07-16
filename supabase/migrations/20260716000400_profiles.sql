-- ===========================================================================
-- O-91 — profiles (organizer / member accounts)
--
-- `profiles` extends auth.users with app-facing account data (display name, and
-- later the Alden index). A trigger auto-creates a profile row the moment a
-- REAL account signs up. Anonymous players (signInAnonymously, the O-92 join
-- flow) get NO profile — they're roster slots, not accounts — so we skip them.
--
-- Depends on: Supabase Auth (auth.users). Enable Email auth in the dashboard
-- (or config.toml) so organizers can sign up.
-- ===========================================================================

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user reads and edits only their own profile. (Broaden to a public
-- display-name read later if leaderboards need it; today the leaderboard shows
-- organizer-entered event_players.name, so own-only is enough.)
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, update on public.profiles to authenticated;

-- Auto-provision a profile for every new NON-anonymous account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;  -- anonymous player: roster slot only, no profile
  end if;
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
