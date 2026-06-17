-- ============================================================
-- 04_seed.sql : 표준 카테고리 사전 + 데모 조직 (개발/파일럿용)
-- 운영 데이터에는 카테고리만 적용하고 데모 조직은 생략 가능.
-- ============================================================

-- ------------------------------------------------------------
-- 표준 카테고리 사전 (플랜트/제조 안전자재)
-- ------------------------------------------------------------
create table if not exists categories (
  code      text primary key,     -- 'fall','scaffold',...
  major     text not null,        -- 대분류 표시명
  examples  text not null,        -- 예시 품목(참고용)
  sort      int  not null default 0
);

insert into categories(code, major, examples, sort) values
  ('fall',     '추락방지',  '안전난간, 안전대(벨트/죔줄), 추락방지망, 개구부덮개, 안전블록', 10),
  ('scaffold', '가설구조',  '단관비계, 시스템비계, 작업발판, 사다리, 이동식틀비계',          20),
  ('barrier',  '통행·구획', '안전펜스, 라바콘, 바리케이드, 체인, 안전표지판',               30),
  ('ppe',      '보호구',    '안전모, 안전화, 보안경, 방진/방독마스크, 귀마개, 보호장갑',      40),
  ('fire',     '화기·밀폐', '소화기, 방화포, 가스감지기, 송풍기, 산소농도측정기',           50),
  ('elec',     '전기안전',  '누전차단기, 접지선, 임시분전반, 절연매트',                     60),
  ('etc',      '기타',      '직접 입력',                                                  90)
on conflict (code) do update
  set major = excluded.major, examples = excluded.examples, sort = excluded.sort;

-- categories : 모두 읽기 가능
alter table categories enable row level security;
drop policy if exists cat_select on categories;
create policy cat_select on categories for select using (true);

-- ------------------------------------------------------------
-- 데모 조직 (파일럿 온보딩 시작점) — 필요 시만 실행
-- ------------------------------------------------------------
insert into organizations(name, type) values
  ('원청-안전관리팀', 'owner'),
  ('A협력사',          'partner'),
  ('B협력사',          'partner'),
  ('C협력사',          'partner')
on conflict do nothing;

-- 참고: app_users 는 Supabase Auth 가입 후 auth.users.id 를 받아
-- 별도 INSERT/RPC 로 연결한다(직접 seed 불가). 04 이후 온보딩 절차 참조.
