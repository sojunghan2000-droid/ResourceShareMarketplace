-- ============================================================
-- SafeShare — 협력사 간 잉여 안전자재 공유 플랫폼
-- 01_schema.sql  : 테이블 / 인덱스 / enum
-- 적용 순서: 01_schema → 02_rls → 03_rpc → 04_seed
-- 대상: Supabase (Postgres 15+)
-- ============================================================

-- 확장
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ------------------------------------------------------------
-- enum 정의
-- ------------------------------------------------------------
do $$ begin
  create type loan_status as enum (
    'REQUESTED','APPROVED','ON_LOAN','RETURN_PENDING','RETURNED','REJECTED','OVERDUE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type inspection_status as enum ('good','need_check','no_use','damaged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('member','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('pending','active','disabled');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 협력사(조직)
-- 단일 현장/원청 전제 — site_id 미도입 (PRD §12 확정)
-- ------------------------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'partner',   -- 'partner' | 'owner'
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 사용자 (Supabase auth.users 와 1:1)
-- ------------------------------------------------------------
create table if not exists app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id),
  name        text not null,
  phone       text,
  role        user_role   not null default 'member',
  status      user_status not null default 'pending',   -- 관리자 승인형 가입
  created_at  timestamptz not null default now()
);
create index if not exists idx_app_users_org on app_users(org_id);

-- ------------------------------------------------------------
-- 자재
-- ------------------------------------------------------------
create table if not exists materials (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  owner_user_id     uuid references app_users(id),
  category          text not null,
  name              text not null,
  spec              text,
  unit              text not null default 'EA',
  qty_total         int  not null check (qty_total >= 0),
  qty_available     int  not null check (qty_available >= 0),
  location          text,
  photos            jsonb not null default '[]',
  inspection_status inspection_status not null default 'good',
  inspected_at      date,
  expires_at        date,
  lendable_from     date,
  lendable_to       date,
  status            text not null default 'active',  -- 'active' | 'hidden'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chk_qty_available_le_total check (qty_available <= qty_total)
);
create index if not exists idx_materials_org      on materials(org_id);
create index if not exists idx_materials_category on materials(category);
create index if not exists idx_materials_status   on materials(status);

-- ------------------------------------------------------------
-- 대여 건
-- ------------------------------------------------------------
create table if not exists loans (
  id                  uuid primary key default gen_random_uuid(),
  material_id         uuid not null references materials(id),
  lender_org_id       uuid not null references organizations(id),
  borrower_org_id     uuid not null references organizations(id),
  borrower_user_id    uuid not null references app_users(id),
  qty                 int  not null check (qty > 0),
  purpose             text,
  pickup_date         date,
  due_date            date not null,
  status              loan_status not null default 'REQUESTED',
  reject_reason       text,
  -- 수령(③) 증빙
  pickup_photos       jsonb not null default '[]',
  pickup_sign_url     text,
  -- 반납(⑤) 증빙·정산
  return_qty          int,
  unreturned_qty      int not null default 0,
  return_photos       jsonb not null default '[]',
  return_sign_url     text,
  return_condition    inspection_status,
  return_note         text,
  -- 타임스탬프
  requested_at        timestamptz not null default now(),
  approved_at         timestamptz,
  loaned_at           timestamptz,
  return_requested_at timestamptz,
  returned_at         timestamptz
);
create index if not exists idx_loans_material on loans(material_id);
create index if not exists idx_loans_borrower on loans(borrower_user_id);
create index if not exists idx_loans_lender   on loans(lender_org_id);
create index if not exists idx_loans_status   on loans(status);
create index if not exists idx_loans_due      on loans(due_date);

-- ------------------------------------------------------------
-- 대여 이력 (불변 — INSERT only)
-- ------------------------------------------------------------
create table if not exists loan_events (
  id            bigserial primary key,
  loan_id       uuid not null references loans(id),
  event_type    text not null,  -- request|approve|reject|pickup|return_request|return_confirm|overdue
  actor_user_id uuid references app_users(id),
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_loan_events_loan on loan_events(loan_id);

-- ------------------------------------------------------------
-- 알림
-- ------------------------------------------------------------
create table if not exists notifications (
  id          bigserial primary key,
  user_id     uuid not null references app_users(id),
  type        text not null,
  ref_loan_id uuid references loans(id),
  message     text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, read_at);

-- ------------------------------------------------------------
-- [P3 선택] 대여 건별 댓글 스레드
-- 자유 채팅방이 아니라 '특정 대여 건'에만 종속 (PRD §2.1)
-- MVP 미사용. 도입 시 주석 해제.
-- ------------------------------------------------------------
-- create table if not exists loan_messages (
--   id          bigserial primary key,
--   loan_id     uuid not null references loans(id),
--   author_id   uuid not null references app_users(id),
--   body        text not null,
--   created_at  timestamptz not null default now()
-- );

-- ------------------------------------------------------------
-- updated_at 자동 갱신 트리거 (materials)
-- ------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_materials_updated on materials;
create trigger trg_materials_updated
  before update on materials
  for each row execute function set_updated_at();
