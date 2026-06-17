-- ============================================================
-- 03_rpc.sql : 상태 전이 RPC (모두 security definer + 트랜잭션)
-- 원칙: 수량 차감/상태 변경/이력 기록을 한 함수에서 원자적으로.
--       자재 행 FOR UPDATE 잠금으로 동시 신청 경합 방지.
-- 상태머신: REQUESTED → APPROVED → ON_LOAN → RETURN_PENDING → RETURNED
--           (REQUESTED → REJECTED, due 초과 → OVERDUE)
-- 수량 차감 시점: 신청 시 예약 차감 / 거절·반납 시 복원
-- ============================================================

-- 내부 헬퍼: 알림 1건 생성
create or replace function _notify(p_user uuid, p_type text, p_loan uuid, p_msg text)
returns void language sql security definer as $$
  insert into notifications(user_id, type, ref_loan_id, message)
  values (p_user, p_type, p_loan, p_msg);
$$;

-- 내부 헬퍼: 대여 건의 보유측 사용자들에게 알림
create or replace function _notify_lender(p_loan uuid, p_type text, p_msg text)
returns void language plpgsql security definer as $$
declare r record;
begin
  for r in
    select u.id from app_users u
    join loans l on l.lender_org_id = u.org_id
    where l.id = p_loan and u.status = 'active'
  loop
    perform _notify(r.id, p_type, p_loan, p_msg);
  end loop;
end $$;

-- ------------------------------------------------------------
-- ① 신청  (Borrower)
-- ------------------------------------------------------------
create or replace function request_loan(
  p_material_id uuid,
  p_qty         int,
  p_due         date,
  p_purpose     text default null,
  p_pickup      date default null
) returns uuid language plpgsql security definer as $$
declare
  v_loan      uuid;
  v_mat       materials%rowtype;
  v_borrower_org uuid;
begin
  if not is_active() then raise exception '비활성 사용자'; end if;

  select * into v_mat from materials where id = p_material_id for update; -- 행 잠금
  if not found then raise exception '자재 없음'; end if;

  -- 안전 차단
  if v_mat.inspection_status in ('no_use','damaged') then
    raise exception '대여 불가 자재(점검상태: %)', v_mat.inspection_status;
  end if;
  if v_mat.expires_at is not null and v_mat.expires_at < current_date then
    raise exception '사용기한 경과 자재';
  end if;
  if v_mat.status <> 'active' then raise exception '비공개 자재'; end if;
  if p_qty <= 0 then raise exception '수량 오류'; end if;
  if v_mat.qty_available < p_qty then
    raise exception '가용 수량 부족(가용 %, 신청 %)', v_mat.qty_available, p_qty;
  end if;

  select org_id into v_borrower_org from app_users where id = auth.uid();
  if v_borrower_org = v_mat.org_id then
    raise exception '자기 조직 자재는 신청 불가';
  end if;

  insert into loans(material_id, lender_org_id, borrower_org_id, borrower_user_id,
                    qty, due_date, purpose, pickup_date)
  values (p_material_id, v_mat.org_id, v_borrower_org, auth.uid(),
          p_qty, p_due, p_purpose, p_pickup)
  returning id into v_loan;

  -- 신청 시 예약 차감(중복 신청 방지)
  update materials set qty_available = qty_available - p_qty where id = p_material_id;

  insert into loan_events(loan_id, event_type, actor_user_id, payload)
  values (v_loan, 'request', auth.uid(), jsonb_build_object('qty', p_qty, 'due', p_due));

  perform _notify_lender(v_loan, 'loan_requested',
    format('신규 대여 신청: %s %s개', v_mat.name, p_qty));
  return v_loan;
end $$;

-- ------------------------------------------------------------
-- ② 승인  (Lender)
-- ------------------------------------------------------------
create or replace function approve_loan(p_loan_id uuid)
returns void language plpgsql security definer as $$
declare v_loan loans%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception '대여 건 없음'; end if;
  if v_loan.lender_org_id <> current_org_id() and not is_admin() then
    raise exception '승인 권한 없음(보유자만)';
  end if;
  if v_loan.status <> 'REQUESTED' then raise exception '신청대기 상태에서만 승인 가능'; end if;

  update loans set status = 'APPROVED', approved_at = now() where id = p_loan_id;
  insert into loan_events(loan_id, event_type, actor_user_id)
  values (p_loan_id, 'approve', auth.uid());
  perform _notify(v_loan.borrower_user_id, 'loan_approved', p_loan_id, '대여 신청이 승인되었습니다.');
end $$;

-- ------------------------------------------------------------
-- ②' 거절  (Lender) — 예약 수량 복원
-- ------------------------------------------------------------
create or replace function reject_loan(p_loan_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare v_loan loans%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception '대여 건 없음'; end if;
  if v_loan.lender_org_id <> current_org_id() and not is_admin() then
    raise exception '거절 권한 없음';
  end if;
  if v_loan.status <> 'REQUESTED' then raise exception '신청대기 상태에서만 거절 가능'; end if;

  update loans set status = 'REJECTED', reject_reason = p_reason where id = p_loan_id;
  update materials set qty_available = qty_available + v_loan.qty where id = v_loan.material_id;
  insert into loan_events(loan_id, event_type, actor_user_id, payload)
  values (p_loan_id, 'reject', auth.uid(), jsonb_build_object('reason', p_reason));
  perform _notify(v_loan.borrower_user_id, 'loan_rejected', p_loan_id,
    format('대여 신청이 거절되었습니다: %s', coalesce(p_reason,'')));
end $$;

-- ------------------------------------------------------------
-- ③ 수령확인  (Borrower) — 사진 + 서명 필수
-- ------------------------------------------------------------
create or replace function pickup_loan(
  p_loan_id uuid, p_photos jsonb, p_sign_url text
) returns void language plpgsql security definer as $$
declare v_loan loans%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception '대여 건 없음'; end if;
  if v_loan.borrower_user_id <> auth.uid() and not is_admin() then
    raise exception '수령확인 권한 없음(신청자만)';
  end if;
  if v_loan.status <> 'APPROVED' then raise exception '승인 상태에서만 수령확인 가능'; end if;
  if coalesce(jsonb_array_length(p_photos),0) < 1 or p_sign_url is null then
    raise exception '수령 사진·서명 증빙 필수';
  end if;

  update loans set status = 'ON_LOAN', loaned_at = now(),
         pickup_photos = p_photos, pickup_sign_url = p_sign_url
  where id = p_loan_id;
  insert into loan_events(loan_id, event_type, actor_user_id)
  values (p_loan_id, 'pickup', auth.uid());
  perform _notify_lender(p_loan_id, 'loan_picked_up', '자재가 수령되었습니다.');
end $$;

-- ------------------------------------------------------------
-- ④ 반납요청  (Borrower) — 수량 미복원
-- ------------------------------------------------------------
create or replace function request_return(p_loan_id uuid)
returns void language plpgsql security definer as $$
declare v_loan loans%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception '대여 건 없음'; end if;
  if v_loan.borrower_user_id <> auth.uid() and not is_admin() then
    raise exception '반납요청 권한 없음(신청자만)';
  end if;
  if v_loan.status not in ('ON_LOAN','OVERDUE') then
    raise exception '대여중 상태에서만 반납요청 가능';
  end if;

  update loans set status = 'RETURN_PENDING', return_requested_at = now() where id = p_loan_id;
  insert into loan_events(loan_id, event_type, actor_user_id)
  values (p_loan_id, 'return_request', auth.uid());
  perform _notify_lender(p_loan_id, 'return_requested', '반납 요청이 접수되었습니다. 실물 확인 후 확정해 주세요.');
end $$;

-- ------------------------------------------------------------
-- ⑤ 반납 최종 확정  (Lender) — 사진+서명 필수, 실회수 수량만 복원
-- ------------------------------------------------------------
create or replace function return_loan(
  p_loan_id    uuid,
  p_return_qty int,
  p_photos     jsonb,
  p_sign_url   text,
  p_condition  inspection_status default 'good',
  p_note       text default null
) returns void language plpgsql security definer as $$
declare v_loan loans%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception '대여 건 없음'; end if;
  if v_loan.lender_org_id <> current_org_id() and not is_admin() then
    raise exception '반납 확정 권한 없음(보유자만)';
  end if;
  if v_loan.status <> 'RETURN_PENDING' then
    raise exception '반납요청(RETURN_PENDING) 상태에서만 확정 가능';
  end if;
  if coalesce(jsonb_array_length(p_photos),0) < 1 or p_sign_url is null then
    raise exception '반납 사진·서명 증빙 필수';
  end if;
  if p_return_qty < 0 or p_return_qty > v_loan.qty then
    raise exception '회수 수량 오류(0~%)', v_loan.qty;
  end if;

  update loans set
    status = 'RETURNED',
    return_qty = p_return_qty,
    unreturned_qty = v_loan.qty - p_return_qty,
    return_photos = p_photos, return_sign_url = p_sign_url,
    return_condition = p_condition, return_note = p_note,
    returned_at = now()
  where id = p_loan_id;

  -- 실제 회수분만 복원. 미반납분은 복원하지 않음.
  update materials
     set qty_available = qty_available + p_return_qty,
         inspection_status = coalesce(p_condition, inspection_status)
   where id = v_loan.material_id;

  insert into loan_events(loan_id, event_type, actor_user_id, payload)
  values (p_loan_id, 'return_confirm', auth.uid(),
          jsonb_build_object('return_qty', p_return_qty,
                             'unreturned', v_loan.qty - p_return_qty,
                             'condition', p_condition));
  perform _notify(v_loan.borrower_user_id, 'return_confirmed', p_loan_id,
    format('반납이 확정되었습니다(회수 %s개%s).', p_return_qty,
      case when v_loan.qty - p_return_qty > 0
           then format(', 미반납 %s개', v_loan.qty - p_return_qty) else '' end));
end $$;

-- ------------------------------------------------------------
-- 연체 처리 배치 — due 초과 & 미반납 건을 OVERDUE 로
-- pg_cron 또는 조회 시점 호출. 반환: 갱신 건수
-- ------------------------------------------------------------
create or replace function mark_overdue_loans()
returns int language plpgsql security definer as $$
declare v_cnt int;
begin
  with upd as (
    update loans set status = 'OVERDUE'
    where status = 'ON_LOAN' and due_date < current_date
    returning id, borrower_user_id
  )
  select count(*) into v_cnt from upd;

  insert into loan_events(loan_id, event_type, payload)
  select id, 'overdue', '{}'::jsonb from loans
  where status = 'OVERDUE'
    and not exists (select 1 from loan_events e
                    where e.loan_id = loans.id and e.event_type = 'overdue');
  return v_cnt;
end $$;

-- ------------------------------------------------------------
-- 권한 부여 — authenticated 롤이 RPC 실행 가능하도록
-- ------------------------------------------------------------
grant execute on function request_loan(uuid,int,date,text,date) to authenticated;
grant execute on function approve_loan(uuid)                    to authenticated;
grant execute on function reject_loan(uuid,text)                to authenticated;
grant execute on function pickup_loan(uuid,jsonb,text)          to authenticated;
grant execute on function request_return(uuid)                  to authenticated;
grant execute on function return_loan(uuid,int,jsonb,text,inspection_status,text) to authenticated;
grant execute on function mark_overdue_loans()                  to authenticated;
