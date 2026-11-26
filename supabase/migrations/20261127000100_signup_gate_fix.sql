-- Korrektur: in einer security-definer-Funktion ist current_user der Besitzer (postgres).
-- Wer wirklich anlegt, steht in session_user (Anmeldung = supabase_auth_admin).
create or replace function public.enforce_signup_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if session_user = 'supabase_auth_admin' and not coalesce(public.signup_open(), false) then
    raise exception 'signup_closed';
  end if;
  return new;
end $$;
