-- ============================================================
-- 11_profile_and_self_update_fix.sql
-- - 보안: 자기 권한 상승 차단 (app_users 본인 직접 UPDATE 제거)
-- - 본인 프로필(이름·연락처) 갱신 RPC
-- - 익명 가입용 협력사 목록 RPC
-- - register_user 에 소속(org_id) 추가
-- ============================================================

drop policy if exists users_self_update on app_users;

create or replace function update_my_profile(p_name text, p_phone text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception '로그인 필요'; end if;
  update app_users
     set name  = coalesce(nullif(trim(p_name), ''), name),
         phone = nullif(trim(p_phone), '')
   where id = auth.uid();
end $$;
revoke execute on function update_my_profile(text,text) from public, anon;
grant execute on function update_my_profile(text,text) to authenticated;

create or replace function list_orgs_public()
returns table(id uuid, name text) language sql security definer
set search_path = public, pg_temp as $$
  select id, name from organizations order by name;
$$;
revoke execute on function list_orgs_public() from public;
grant execute on function list_orgs_public() to anon, authenticated;

drop function if exists register_user(text, text, text);
create or replace function register_user(p_id text, p_pw text, p_name text, p_org_id uuid)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_email text; v_uid uuid := gen_random_uuid();
begin
  p_id := lower(trim(p_id));
  if p_id !~ '^[a-z0-9._]{3,30}$' then raise exception 'INVALID_ID'; end if;
  if length(coalesce(p_pw,'')) < 4 then raise exception 'SHORT_PW'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'NO_NAME'; end if;
  if p_org_id is null or not exists(select 1 from organizations where id = p_org_id) then
    raise exception 'NO_ORG'; end if;
  v_email := p_id || '@safeshare.app';
  if exists(select 1 from auth.users where email = v_email) then raise exception 'DUP_ID'; end if;

  insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change, email_change_token_new,
     email_change_token_current, reauthentication_token)
  values(v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     v_email, crypt(p_pw, gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '','','','','','');
  insert into auth.identities(provider_id, user_id, identity_data, provider,
     last_sign_in_at, created_at, updated_at)
  values(v_uid::text, v_uid,
     jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now());
  insert into app_users(id, name, status, role, org_id)
  values (v_uid, trim(p_name), 'pending', 'member', p_org_id);
  return 'ok';
end $$;
revoke execute on function register_user(text,text,text,uuid) from public;
grant execute on function register_user(text,text,text,uuid) to anon, authenticated;
