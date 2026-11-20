create type public.app_role as enum ('diretor','chefia','intendencia','servidor');
create type public.audit_action as enum ('CREATE','UPDATE','DELETE','AUTHORIZE','CANCEL');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text not null default '',
  matricula text,
  cargo text,
  email text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_role text,
  action public.audit_action not null,
  entity text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
grant select on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

-- Role helpers
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Privileged profiles require a verified 2FA session (aal2)
create or replace function public.is_aal2()
returns boolean language sql stable as $$
  select coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
$$;

create or replace function public.is_diretor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'diretor') and public.is_aal2()
$$;

create or replace function public.is_intendencia()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'intendencia') and public.is_aal2()
$$;

create or replace function public.is_chefia()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'chefia')
$$;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.user_roles where user_id = auth.uid()
  order by case role when 'diretor' then 1 when 'intendencia' then 2 when 'chefia' then 3 else 4 end
  limit 1
$$;

-- Policies: profiles
create policy "Own profile readable" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Diretor reads all profiles" on public.profiles for select to authenticated using (public.is_diretor());
create policy "Chefia reads all profiles" on public.profiles for select to authenticated using (public.is_chefia());
create policy "Diretor updates profiles" on public.profiles for update to authenticated using (public.is_diretor()) with check (public.is_diretor());

-- Policies: user_roles
create policy "Own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "Diretor reads all roles" on public.user_roles for select to authenticated using (public.is_diretor());

-- Policies: audit_logs (read only for Diretor; no insert/update/delete policies for anyone)
create policy "Diretor reads audit" on public.audit_logs for select to authenticated using (public.is_diretor());

-- Immutable audit: block update/delete even for service role
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs é somente-inclusão (append-only)';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
for each row execute function public.audit_logs_immutable();

-- Generic audit trigger
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action public.audit_action;
  v_id text;
begin
  if tg_op = 'INSERT' then v_action := 'CREATE'; v_id := (to_jsonb(new)->>'id');
  elsif tg_op = 'UPDATE' then v_action := 'UPDATE'; v_id := (to_jsonb(new)->>'id');
  else v_action := 'DELETE'; v_id := (to_jsonb(old)->>'id');
  end if;
  insert into public.audit_logs(user_id, user_role, action, entity, entity_id, old_data, new_data)
  values (auth.uid(), public.current_role_name(), v_action, tg_table_name, v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_profiles after insert or update or delete on public.profiles
for each row execute function public.audit_trigger();
create trigger audit_user_roles after insert or update or delete on public.user_roles
for each row execute function public.audit_trigger();

-- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

-- Profile creation on new auth user (no privileges derived from metadata)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, nome_completo, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome_completo',''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;