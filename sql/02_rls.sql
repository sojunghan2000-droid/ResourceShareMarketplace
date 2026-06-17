-- ============================================================
-- 02_rls.sql : Row Level Security 정책
-- 원칙: 앱 레벨 + DB RLS 이중 방어. 상태 전이는 RPC(security definer)로만.
-- ============================================================

-- 헬퍼: 현재 로그인 사용자의 org_id / role / active 여부
create or replace function current_org_id() returns uuid
  language sql stable security definer as $$
  select org_id from app_users where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer as $$
  select exists(select 1 from app_users
                where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function is_active() returns boolean
  language sql stable security definer as $$
  select exists(select 1 from app_users
                where id = auth.uid() and status = 'active');
$$;

-- ------------------------------------------------------------
-- RLS 활성화
-- ------------------------------------------------------------
alter table organizations enable row level security;
alter table app_users     enable row level security;
alter table materials     enable row level security;
alter table loans         enable row level security;
alter table loan_events   enable row level security;
alter table notifications enable row level security;

-- ------------------------------------------------------------
-- organizations : 로그인 사용자는 조회 가능, 변경은 admin
-- ------------------------------------------------------------
drop policy if exists org_select on organizations;
create policy org_select on organizations
  for select using (auth.uid() is not null);

drop policy if exists org_admin_all on organizations;
create policy org_admin_all on organizations
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- app_users : 본인 행 조회/수정, admin은 전체
-- (가입 시 INSERT는 트리거/RPC로 처리 — 직접 INSERT 차단)
-- ------------------------------------------------------------
drop policy if exists users_self_select on app_users;
create policy users_self_select on app_users
  for select using (id = auth.uid() or is_admin());

drop policy if exists users_self_update on app_users;
create policy users_self_update on app_users
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_admin_all on app_users;
create policy users_admin_all on app_users
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- materials :
--   SELECT  - active 사용자 전체(검색 목적, 폐쇄망)
--   INSERT/UPDATE/DELETE - 본인 조직 자재만 (admin 예외)
-- ------------------------------------------------------------
drop policy if exists mat_select on materials;
create policy mat_select on materials
  for select using (is_active());

drop policy if exists mat_insert on materials;
create policy mat_insert on materials
  for insert with check (org_id = current_org_id() or is_admin());

drop policy if exists mat_update on materials;
create policy mat_update on materials
  for update using (org_id = current_org_id() or is_admin())
  with check (org_id = current_org_id() or is_admin());

drop policy if exists mat_delete on materials;
create policy mat_delete on materials
  for delete using (org_id = current_org_id() or is_admin());

-- ------------------------------------------------------------
-- loans :
--   SELECT - lender_org 또는 borrower_org 소속만 (admin 전체)
--   전이(INSERT/UPDATE) - 직접 금지. RPC(security definer)로만 수행.
-- ------------------------------------------------------------
drop policy if exists loans_select on loans;
create policy loans_select on loans
  for select using (
    lender_org_id = current_org_id()
    or borrower_org_id = current_org_id()
    or is_admin()
  );
-- INSERT/UPDATE/DELETE 정책 없음 → 일반 클라이언트 직접 변경 불가.
-- RPC는 security definer로 RLS를 우회하여 안전하게 처리.

-- ------------------------------------------------------------
-- loan_events : 관련 대여 건 당사자만 조회. 직접 쓰기 금지(RPC 전용).
-- ------------------------------------------------------------
drop policy if exists levents_select on loan_events;
create policy levents_select on loan_events
  for select using (
    exists (
      select 1 from loans l
      where l.id = loan_events.loan_id
        and (l.lender_org_id = current_org_id()
             or l.borrower_org_id = current_org_id()
             or is_admin())
    )
  );

-- ------------------------------------------------------------
-- notifications : 본인 것만
-- ------------------------------------------------------------
drop policy if exists notif_select on notifications;
create policy notif_select on notifications
  for select using (user_id = auth.uid());

drop policy if exists notif_update on notifications;   -- 읽음 처리
create policy notif_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
