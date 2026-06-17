-- ============================================================
-- 08_overdue_reminders.sql : 연체 독촉 알림 일괄 발송 (관리자 전용)
-- ============================================================
create or replace function send_overdue_reminders()
returns int language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_cnt int := 0; r record;
begin
  if not is_admin() then raise exception '관리자만 가능'; end if;
  for r in
    select l.id, l.borrower_user_id, m.name
    from loans l join materials m on m.id = l.material_id
    where l.status = 'OVERDUE'
  loop
    insert into notifications(user_id, type, ref_loan_id, message)
    values (r.borrower_user_id, 'overdue_reminder', r.id,
            format('[독촉] %s 반납 기한이 지났습니다. 즉시 반납해 주세요.', r.name));
    v_cnt := v_cnt + 1;
  end loop;
  return v_cnt;
end $$;

revoke execute on function send_overdue_reminders() from public, anon;
grant execute on function send_overdue_reminders() to authenticated;
