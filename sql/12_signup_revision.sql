-- ============================================================
-- 12_signup_revision.sql
-- - 이메일 수집 컬럼 + 시스템 관리자 플래그
-- - 가입: 이메일 수집 + Knox(@samsung.com) 차단 + 즉시 active (승인 폐지)
-- - admin_set_password 권한을 is_admin → is_sysadmin 으로 상향
-- ============================================================

alter table app_users add column if not exists contact_email text;
alter table app_users add column if not exists is_sysadmin boolean not null default false;

create or replace function is_sysadmin() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from app_users
                where id = auth.uid() and is_sysadmin = true and status = 'active');
$$;
revoke execute on function is_sysadmin() from public;
grant execute on function is_sysadmin() to authenticated;

-- 운영자(원청) 계정을 시스템 관리자로 (배포 환경에 맞게 조정)
update app_users set is_sysadmin = true
where id in (select id from auth.users where email in ('admin@safeshare.app','sojunghan2000@gmail.com'));

-- 가입: 이메일 + Knox 차단 + 즉시 active
drop function if exists register_user(text, text, text, uuid);
create or replace function register_user(p_id text, p_pw text, p_name text, p_org_id uuid, p_email text)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_login_email text; v_uid uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
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
revoke execute on function register_user(text,text,text,uuid,text) from public;
grant execute on function register_user(text,text,text,uuid,text) to anon, authenticated;

create or replace function admin_set_password(p_user uuid, p_pw text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not is_sysadmin() then raise exception '시스템 관리자만 가능'; end if;
  if length(coalesce(p_pw,'')) < 4 then raise exception 'SHORT_PW'; end if;
  update auth.users set encrypted_password = crypt(p_pw, gen_salt('bf')), updated_at = now()
   where id = p_user;
end $$;
