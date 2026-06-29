-- 15_signup_no_join_code.sql
-- 가입 마찰 제거: register_user 에서 협력사 코드(BAD_CODE) 검증 삭제(5-arg 재정의).
-- 가입 승인 토글: app_settings.signup_requires_approval (기본 false = 즉시 active).
-- organization_codes 테이블/6-arg 함수는 롤백 여지로 남겨둠(즉시 drop 안 함).
--
-- 주의(번호 15): 이 로컬 worktree의 sql/ 는 07 까지만 보유하나, 배포 소스(safeshare-repo)는
-- organization_codes·6-arg register_user·reissue_org_code 를 추가한 08~14 마이그레이션을 이미
-- 적용한 상태다. 따라서 이 파일은 "배포된 스키마" 기준으로 작성됐고, 배포 시 safeshare-repo/sql/15_*
-- 로 복사 후 push 한다(메모리 reference_safeshare_deployment 절차).

-- 1) 설정 테이블 ----------------------------------------------------------
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

drop policy if exists as_read on app_settings;
create policy as_read on app_settings for select to authenticated using (true);

drop policy if exists as_write on app_settings;
create policy as_write on app_settings for all to authenticated
  using (is_admin()) with check (is_admin());

insert into app_settings(key, value)
values ('signup_requires_approval', 'false'::jsonb)
on conflict (key) do nothing;

-- 2) register_user 5-arg: 코드 검증 제거 + 승인 토글 반영 ----------------
create or replace function register_user(
  p_id text, p_pw text, p_name text, p_org_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_login_email text; v_uid uuid := gen_random_uuid();
        v_email text := lower(trim(p_email)); v_status text;
begin
  p_id := lower(trim(p_id));
  if p_id !~ '^[a-z0-9._]{3,30}$' then raise exception 'INVALID_ID'; end if;
  if length(coalesce(p_pw,'')) < 4 then raise exception 'SHORT_PW'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'NO_NAME'; end if;
  if p_org_id is null or not exists(select 1 from organizations where id = p_org_id) then
    raise exception 'NO_ORG'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'BAD_EMAIL'; end if;
  if v_email ~* '@samsung\.com$' or v_email ~* '\.samsung\.com$' then raise exception 'KNOX_BLOCKED'; end if;

  v_login_email := p_id || '@safeshare.app';
  if exists(select 1 from auth.users where email = v_login_email) then raise exception 'DUP_ID'; end if;

  v_status := case
    when exists(select 1 from app_settings where key='signup_requires_approval' and value = 'true'::jsonb)
    then 'pending' else 'active' end;

  insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change, email_change_token_new,
     email_change_token_current, reauthentication_token)
  values(v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     v_login_email, crypt(p_pw, gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '','','','','','');
  insert into auth.identities(provider_id, user_id, identity_data, provider,
     last_sign_in_at, created_at, updated_at)
  values(v_uid::text, v_uid,
     jsonb_build_object('sub', v_uid::text, 'email', v_login_email, 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now());
  insert into app_users(id, name, status, role, org_id, contact_email)
  values (v_uid, trim(p_name), v_status::user_status, 'member'::user_role, p_org_id, v_email);
  return 'ok';
end $$;

-- 3) 권한: 6-arg 정리, 5-arg 노출 --------------------------------------
drop function if exists register_user(text,text,text,uuid,text,text);
revoke all on function register_user(text,text,text,uuid,text) from public;
grant execute on function register_user(text,text,text,uuid,text) to anon, authenticated;
