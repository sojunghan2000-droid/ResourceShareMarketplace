-- 14_public_readonly_feeds.sql
-- 전원(authenticated) 공개용 읽기전용 RPC.
--  · 원본 테이블 RLS(admin 한정)는 그대로 유지하고, SECURITY DEFINER 로 큐레이트된 컬럼만 노출.
--  · 전체 대여 이력은 신청자 "조직명"만 노출(개인 이름 제외).

-- 1) 협력사별 현황(집계) ----------------------------------------------------
create or replace function public_org_stats()
returns table(
  org_id uuid, org_name text,
  materials_count int, provided_count int, used_count int, overdue_count int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.name,
    (select count(*) from materials m
       where m.org_id = o.id and m.status = 'active')::int,
    (select count(*) from loans l
       where l.lender_org_id = o.id
         and l.status in ('REQUESTED','APPROVED','ON_LOAN','RETURN_PENDING','OVERDUE'))::int,
    (select count(*) from loans l
       where l.borrower_org_id = o.id
         and l.status in ('REQUESTED','APPROVED','ON_LOAN','RETURN_PENDING','OVERDUE'))::int,
    (select count(*) from loans l
       where l.lender_org_id = o.id and l.status = 'OVERDUE')::int
  from organizations o
  order by o.name;
$$;

-- 2) 전체 대여 피드(조직 단위, 개인명 제외) --------------------------------
create or replace function public_loan_feed(p_limit int default 30)
returns table(
  material_name text, qty int, unit text,
  lender_org text, borrower_org text,
  pickup_date date, due_date date, status text, requested_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select m.name, l.qty, m.unit,
         lo.name, bo.name,
         l.pickup_date, l.due_date, l.status, l.requested_at
  from loans l
  join materials m on m.id = l.material_id
  left join organizations lo on lo.id = l.lender_org_id
  left join organizations bo on bo.id = l.borrower_org_id
  order by l.requested_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- 3) 권한: 익명 차단, 로그인 사용자에만 허용 -------------------------------
revoke all on function public_org_stats() from public, anon;
revoke all on function public_loan_feed(int) from public, anon;
grant execute on function public_org_stats() to authenticated;
grant execute on function public_loan_feed(int) to authenticated;
