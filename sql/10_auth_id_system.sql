-- ============================================================
-- 10_auth_id_system.sql : ID/PW 인증
-- - register_user : 가입(ID/PW/이름) — auth.users+identities+app_users(pending) 원자 생성, 메일 발송 없음
-- - admin_set_password : 관리자 비밀번호 변경/초기화
-- ⚠️ crypt/gen_salt 은 extensions 스키마 → search_path 에 extensions 포함 필수
-- ============================================================

create or replace function register_user(p_id text, p_pw text, p_name text)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_email text; v_uid uuid := gen_random_uuid();
begin
  p_id := lower(trim(p_id));
  if p_id !~ '^[a-z0-9._]{3,30}$' then raise exception 'INVALID_ID'; end if;
  if length(coalesce(p_pw,'')) < 4 then raise exception 'SHORT_PW'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'NO_NAME'; end if;
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

  insert into app_users(id, name, status, role) values (v_uid, trim(p_name), 'pending', 'member');
  return 'ok';
end $$;
revoke execute on function register_user(text,text,text) from public;
grant execute on function register_user(text,text,text) to anon, authenticated;

create or replace function admin_set_password(p_user uuid, p_pw text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not is_admin() then raise exception '관리자만 가능'; end if;
  if length(coalesce(p_pw,'')) < 4 then raise exception 'SHORT_PW'; end if;
  update auth.users set encrypted_password = crypt(p_pw, gen_salt('bf')), updated_at = now()
   where id = p_user;
end $$;
revoke execute on function admin_set_password(uuid,text) from public, anon;
grant execute on function admin_set_password(uuid,text) to authenticated;
