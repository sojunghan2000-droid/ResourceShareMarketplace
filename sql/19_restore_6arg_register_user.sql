-- 19_restore_6arg_register_user.sql
-- 배경: 15_signup_no_join_code.sql(React 주Go받Go용)이 6-arg register_user 를 drop 하면서
--       Streamlit 운영 앱(core/auth.py 의 6-arg + p_join_code 호출)의 가입이 깨졌다.
-- 조치: Streamlit 유지 정책에 따라 13_org_join_codes 의 6-arg register_user 를 복원한다.
--       React용 5-arg register_user(15번)와 함수 오버로드로 공존한다.

create or replace function register_user(
  p_id text, p_pw text, p_name text, p_org_id uuid, p_email text, p_join_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_login_email text; v_uid uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
begin
  p_id := lower(trim(p_id));
  if p_id !~ '^[a-z0-9._]{3,30}$' then raise exception 'INVALID_ID'; end if;
  if length(coalesce(p_pw,'')) < 4 then raise exception 'SHORT_PW'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'NO_NAME'; end if;
  if p_org_id is null or not exists(select 1 from organizations where id = p_org_id) then
    raise exception 'NO_ORG'; end if;
  if not exists(select 1 from organization_codes where org_id = p_org_id and code = trim(coalesce(p_join_code,''))) then
    raise exception 'BAD_CODE'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'BAD_EMAIL'; end if;
  if v_email ~* '@samsung\.com$' or v_email ~* '\.samsung\.com$' then raise exception 'KNOX_BLOCKED'; end if;

  v_login_email := p_id || '@safeshare.app';
  if exists(select 1 from auth.users where email = v_login_email) then raise exception 'DUP_ID'; end if;

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
  values (v_uid, trim(p_name), 'active', 'member', p_org_id, v_email);
  return 'ok';
end $$;

revoke all on function register_user(text,text,text,uuid,text,text) from public;
grant execute on function register_user(text,text,text,uuid,text,text) to anon, authenticated;
