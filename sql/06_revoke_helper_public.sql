-- ============================================================
-- 06_revoke_helper_public.sql : RLS 헬퍼 함수의 anon 노출 제거
-- PUBLIC 기본 EXECUTE 회수 → anon 호출 차단.
-- authenticated 는 RLS 정책 평가에 필요하므로 명시적 grant 유지.
-- ============================================================

revoke execute on function current_org_id() from public;
revoke execute on function is_admin()       from public;
revoke execute on function is_active()      from public;

grant execute on function current_org_id() to authenticated;
grant execute on function is_admin()       to authenticated;
grant execute on function is_active()      to authenticated;
