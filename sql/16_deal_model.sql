-- 16_deal_model.sql  (P2 거래모델)
-- 거래유형(give/loan) + 나눔 완료상태 + 탄소단위. RPC는 동일 파일 하단(Task 2)에 이어 작성.
-- 주의: 로컬 sql/는 P1에서 15까지(07→15 점프)이며 배포 소스는 safeshare-repo. 다음 번호 16.

-- 1) loan_status 에 COMPLETED 추가 (나눔 수령완료)
alter type loan_status add value if not exists 'COMPLETED';

-- 2) materials: 거래유형 + 나눔 마감기한
alter table materials add column if not exists deal_type text not null default 'loan';
alter table materials add column if not exists deadline   date;
alter table materials drop constraint if exists materials_deal_type_chk;
alter table materials add  constraint materials_deal_type_chk check (deal_type in ('give','loan'));

-- 3) loans: 거래유형(신청 시 자재에서 복사) + 나눔은 반납기한 없음
alter table loans add column if not exists deal_type text not null default 'loan';
alter table loans drop constraint if exists loans_deal_type_chk;
alter table loans add  constraint loans_deal_type_chk check (deal_type in ('give','loan'));
alter table loans alter column due_date drop not null;

-- 4) category_price: 탄소 원단위(kgCO2e/단위)
alter table category_price add column if not exists co2_per_unit numeric not null default 0;

-- ============================================================
-- Task 2: RPC 섹션 (나눔 완료 + 탄소집계 + 단가관리 + request_loan 재정의)
-- ============================================================

-- 5) request_loan 재정의: 자재 deal_type 복사 + 나눔은 due_date null 허용
create or replace function request_loan(
  p_material_id uuid, p_qty int, p_due date, p_purpose text default null, p_pickup date default null)
returns uuid
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_loan uuid; v_mat materials%rowtype; v_borrower_org uuid;
begin
  if not is_active() then raise exception '비활성 사용자'; end if;
  select * into v_mat from materials where id = p_material_id for update;
  if not found then raise exception '자재 없음'; end if;
  if v_mat.inspection_status in ('no_use','damaged') then
    raise exception '신청 불가 자재(점검상태: %)', v_mat.inspection_status; end if;
  if v_mat.expires_at is not null and v_mat.expires_at < current_date then
    raise exception '사용기한 경과 자재'; end if;
  if v_mat.status <> 'active' then raise exception '비공개 자재'; end if;
  if p_qty <= 0 then raise exception '수량 오류'; end if;
  if v_mat.qty_available < p_qty then
    raise exception '가용 수량 부족(가용 %, 신청 %)', v_mat.qty_available, p_qty; end if;
  select org_id into v_borrower_org from app_users where id = auth.uid();
  if v_borrower_org = v_mat.org_id then raise exception '자기 조직 자재는 신청 불가'; end if;
  if v_mat.deal_type = 'loan' and p_due is null then raise exception '대여는 반납예정일 필수'; end if;

  insert into loans(material_id, lender_org_id, borrower_org_id, borrower_user_id,
                    qty, due_date, purpose, pickup_date, deal_type)
  values (p_material_id, v_mat.org_id, v_borrower_org, auth.uid(),
          p_qty, case when v_mat.deal_type='give' then null else p_due end,
          p_purpose, p_pickup, v_mat.deal_type)
  returning id into v_loan;
  update materials set qty_available = qty_available - p_qty where id = p_material_id;
  insert into loan_events(loan_id, event_type, actor_user_id, payload)
  values (v_loan, 'request', auth.uid(), jsonb_build_object('qty', p_qty, 'deal_type', v_mat.deal_type));
  perform _notify_lender(v_loan,
    case when v_mat.deal_type='give' then 'give_requested' else 'loan_requested' end,
    format('%s 신청: %s %s개', case when v_mat.deal_type='give' then '나눔' else '대여' end, v_mat.name, p_qty));
  return v_loan;
end $$;

-- 6) complete_give: 나눔 수령=완료(반납 없음). qty_total 영구 차감.
create or replace function complete_give(p_loan_id uuid, p_photos jsonb, p_sign_url text)
returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_loan loans%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception '거래 건 없음'; end if;
  if v_loan.deal_type <> 'give' then raise exception '나눔 건이 아님'; end if;
  if v_loan.borrower_user_id <> auth.uid() and not is_admin() then
    raise exception '수령확인 권한 없음(신청자만)'; end if;
  if v_loan.status <> 'APPROVED' then raise exception '승인 상태에서만 수령확인 가능'; end if;
  if coalesce(jsonb_array_length(p_photos),0) < 1 or p_sign_url is null then
    raise exception '수령 사진·서명 증빙 필수'; end if;
  update loans set status = 'COMPLETED', loaned_at = now(),
         pickup_photos = p_photos, pickup_sign_url = p_sign_url where id = p_loan_id;
  update materials set qty_total = greatest(qty_total - v_loan.qty, 0) where id = v_loan.material_id;
  insert into loan_events(loan_id, event_type, actor_user_id) values (p_loan_id, 'give_complete', auth.uid());
  perform _notify_lender(p_loan_id, 'give_completed', '나눔 자재가 수령 완료되었습니다.');
end $$;

-- 7) mark_overdue_loans: 대여(loan)만 연체 처리
create or replace function mark_overdue_loans()
returns integer
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_cnt int;
begin
  with upd as (
    update loans set status = 'OVERDUE'
    where status = 'ON_LOAN' and deal_type = 'loan'
      and due_date is not null and due_date < current_date
    returning id)
  select count(*) into v_cnt from upd;
  insert into loan_events(loan_id, event_type, payload)
  select id, 'overdue', '{}'::jsonb from loans
  where status = 'OVERDUE'
    and not exists (select 1 from loan_events e where e.loan_id = loans.id and e.event_type='overdue');
  return v_cnt;
end $$;

-- 8) impact_summary: 재사용(반납완료+나눔완료) 누적 절감·탄소
create or replace function impact_summary()
returns table(reuse_count int, saved_amount numeric, co2_avoided numeric)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select count(*)::int,
         coalesce(sum(l.qty * coalesce(cp.unit_price,0)),0),
         coalesce(sum(l.qty * coalesce(cp.co2_per_unit,0)),0)
  from loans l
  join materials m on m.id = l.material_id
  left join category_price cp on cp.code = m.category
  where l.status in ('RETURNED','COMPLETED');
$$;

-- 9) 카테고리 단가·탄소 read/write (RLS 우회: SECURITY DEFINER)
create or replace function list_category_price()
returns table(code text, major text, unit_price numeric, co2_per_unit numeric)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select c.code, c.major, coalesce(cp.unit_price,0), coalesce(cp.co2_per_unit,0)
  from categories c left join category_price cp on cp.code = c.code
  order by c.sort;
$$;

create or replace function set_category_price(p_code text, p_unit_price numeric, p_co2 numeric)
returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if not is_admin() then raise exception '관리자만 가능'; end if;
  insert into category_price(code, unit_price, co2_per_unit, updated_at)
  values (p_code, coalesce(p_unit_price,0), coalesce(p_co2,0), now())
  on conflict (code) do update
    set unit_price = excluded.unit_price, co2_per_unit = excluded.co2_per_unit, updated_at = now();
end $$;

-- 10) 권한
revoke all on function request_loan(uuid,int,date,text,date) from public;
grant execute on function request_loan(uuid,int,date,text,date) to authenticated;
revoke all on function complete_give(uuid,jsonb,text) from public, anon;
grant execute on function complete_give(uuid,jsonb,text) to authenticated;
revoke all on function impact_summary() from public, anon;
grant execute on function impact_summary() to authenticated;
revoke all on function list_category_price() from public, anon;
grant execute on function list_category_price() to authenticated;
revoke all on function set_category_price(text,numeric,numeric) from public, anon;
grant execute on function set_category_price(text,numeric,numeric) to authenticated;
