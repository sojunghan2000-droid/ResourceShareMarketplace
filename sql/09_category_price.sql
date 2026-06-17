-- ============================================================
-- 09_category_price.sql : 카테고리별 표준 임차단가(원/EA·일) — 절감액 산정 기준
-- ============================================================
create table if not exists category_price (
  code        text primary key references categories(code),
  unit_price  numeric not null default 0,   -- 원 / EA / 일
  updated_at  timestamptz not null default now()
);

alter table category_price enable row level security;

drop policy if exists cp_select on category_price;
create policy cp_select on category_price for select to authenticated using (true);

drop policy if exists cp_admin on category_price;
create policy cp_admin on category_price for all to authenticated
  using (is_admin()) with check (is_admin());

-- 표준단가 seed (일일 임차 기준, 데모 표준값)
insert into category_price(code, unit_price) values
  ('fall', 1000), ('scaffold', 700), ('barrier', 400), ('ppe', 300),
  ('fire', 2000), ('elec', 1500), ('etc', 600)
on conflict (code) do update set unit_price = excluded.unit_price, updated_at = now();
