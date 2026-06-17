-- 13_org_join_codes.sql
-- 협력사별 4자리 가입 코드. 회원가입 시 해당 협력사의 코드를 입력해야 가입 가능.
--  · 삼성물산(원청/owner) = 9999 고정
--  · 협력사 = 임의 4자리(관리자가 확인·공유, 재발급 가능)
-- 코드는 관리자만 조회/관리(RLS), 비관리자·익명에 노출 금지.

-- 1) 코드 테이블 -----------------------------------------------------------
create table if not exists organization_codes (
  org_id     uuid primary key references organizations(id) on delete cascade,
  code       text not null,
  updated_at timestamptz not null default now()
);

alter table organization_codes enable row level security;

drop policy if exists oc_admin on organization_codes;
create policy oc_admin on organization_codes
  to authenticated
  using (is_admin()) with check (is_admin());

-- 2) 백필: 원청/삼성물산 = 9999, 그 외 임의 4자리 ------------------------
insert into organization_codes(org_id, code)
select id,
       case when type = 'owner' or name like '원청%' or name = '삼성물산'
            then '9999'
            else lpad((floor(random()*10000))::int::text, 4, '0')
       end
from organizations
on conflict (org_id) do nothing;

-- 원청 → 삼성물산 개명 케이스 보정(백필 시 9999 누락 방지)
update organization_codes set code = '9999'
where org_id in (select id from organizations where name = '삼성물산' or type = 'owner');

-- 3) 코드 재발급(관리자 전용). 신규 협력사 코드 생성에도 사용. ----------
create or replace function reissue_org_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v text;
begin
  if not is_admin() then raise exception '관리자만 가능'; end if;
  v := lpad((floor(random()*10000))::int::text, 4, '0');
  insert into organization_codes(org_id, code) values (p_org, v)
    on conflict (org_id) do update set code = v, updated_at = now();
  return v;
end $$;

revoke all on function reissue_org_code(uuid) from public, anon;
grant execute on function reissue_org_code(uuid) to authenticated;

-- 4) register_user 6-arg: 가입 코드 검증 추가 ----------------------------
--    (10_auth_id_system / 12_signup_revision 의 register_user 를 대체)
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
