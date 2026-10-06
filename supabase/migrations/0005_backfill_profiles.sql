-- Backfill profiles for users who signed up before 0002 created the trigger.
--
-- `on_auth_user_created` only fires on INSERT into auth.users, so any account
-- that existed before that migration ran has no profile row — and the app treats
-- a missing profile as a missing account. This reconciles the two tables for
-- accounts created in that window.
--
-- Idempotent: the anti-join plus ON CONFLICT means re-running inserts nothing.

insert into public.profiles (id, email)
select u.id, u.email
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;
