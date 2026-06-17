-- ============================================================
-- 05_harden_functions.sql : 함수 보안 하드닝
-- - 모든 함수에 search_path 고정 (SECURITY DEFINER 하이재킹 방지)
-- - 내부 헬퍼(_notify*)는 클라이언트 직접 호출 차단
-- - RPC 는 anon/public 제거, authenticated 만 허용
-- (Supabase database-linter 0011/0028/0029 대응)
-- ============================================================

alter function set_updated_at()                      set search_path = public, pg_temp;
alter function current_org_id()                      set search_path = public, pg_temp;
alter function is_admin()                            set search_path = public, pg_temp;
alter function is_active()                           set search_path = public, pg_temp;
alter function _notify(uuid,text,uuid,text)          set search_path = public, pg_temp;
alter function _notify_lender(uuid,text,text)        set search_path = public, pg_temp;
alter function request_loan(uuid,int,date,text,date) set search_path = public, pg_temp;
alter function approve_loan(uuid)                    set search_path = public, pg_temp;
alter function reject_loan(uuid,text)                set search_path = public, pg_temp;
alter function pickup_loan(uuid,jsonb,text)          set search_path = public, pg_temp;
alter function request_return(uuid)                  set search_path = public, pg_temp;
alter function return_loan(uuid,int,jsonb,text,inspection_status,text) set search_path = public, pg_temp;
alter function mark_overdue_loans()                  set search_path = public, pg_temp;

-- 내부 헬퍼: 클라이언트 직접 호출 불가(다른 definer 함수는 소유자 권한으로 내부 호출 가능)
revoke execute on function _notify(uuid,text,uuid,text)   from public, anon, authenticated;
revoke execute on function _notify_lender(uuid,text,text) from public, anon, authenticated;

-- RPC: anon/public 제거
revoke execute on function request_loan(uuid,int,date,text,date) from public, anon;
revoke execute on function approve_loan(uuid)                    from public, anon;
revoke execute on function reject_loan(uuid,text)                from public, anon;
revoke execute on function pickup_loan(uuid,jsonb,text)          from public, anon;
revoke execute on function request_return(uuid)                  from public, anon;
revoke execute on function return_loan(uuid,int,jsonb,text,inspection_status,text) from public, anon;
revoke execute on function mark_overdue_loans()                  from public, anon;
