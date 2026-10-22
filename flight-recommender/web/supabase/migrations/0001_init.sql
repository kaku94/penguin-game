-- 항공권 추천 스키마. Supabase SQL Editor에 붙여 실행하거나 `supabase db push` 로 적용한다.
-- 모든 테이블은 RLS를 켜고 정책을 두지 않는다 → 서버(service role 키)만 접근 가능.

create table if not exists invite_codes (
  code        text primary key,
  name        text not null,
  daily_limit int  not null default 20,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists user_profiles (
  invite_code        text primary key references invite_codes(code) on delete cascade,
  home_airports      text[] not null default '{ICN,GMP}',
  carrier_preference text not null default 'ANY' check (carrier_preference in ('ANY', 'LCC', 'FSC')),
  updated_at         timestamptz not null default now()
);

-- (국가, 목적) → 후보 도시. PRD §12: 테이블 우선, 없으면 LLM 폴백
create table if not exists city_mappings (
  id            bigint generated always as identity primary key,
  region        text not null,
  purpose       text not null,
  city          text not null,
  airport_codes text[] not null,
  reason        text not null
);
create index if not exists city_mappings_region_purpose on city_mappings (region, purpose);

create table if not exists search_cache (
  cache_key  text primary key,
  offers     jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists search_logs (
  id            bigint generated always as identity primary key,
  invite_code   text not null references invite_codes(code) on delete cascade,
  question      text not null,
  created_at    timestamptz not null default now(),
  latency_ms    int,
  input_tokens  bigint,
  output_tokens bigint,
  web_searches  int,
  cost_usd      numeric(10, 4),
  result_count  int,
  error         text
);
create index if not exists search_logs_invite_created on search_logs (invite_code, created_at);
create index if not exists search_logs_created on search_logs (created_at);

alter table invite_codes  enable row level security;
alter table user_profiles enable row level security;
alter table city_mappings enable row level security;
alter table search_cache  enable row level security;
alter table search_logs   enable row level security;

insert into city_mappings (region, purpose, city, airport_codes, reason)
select * from (values
  ('일본',   '맛집', '오사카',   '{KIX}'::text[],     '''구이다오레(먹다 망하는)''의 도시, 도톤보리·쿠로몬 시장'),
  ('일본',   '맛집', '후쿠오카', '{FUK}'::text[],     '비행 1시간대, 라멘·모츠나베·야타이'),
  ('일본',   '맛집', '도쿄',     '{NRT,HND}'::text[], '스시·이자카야 선택지가 가장 많음'),
  ('일본',   '온천', '후쿠오카', '{FUK}'::text[],     '유후인·벳푸 접근이 쉬움'),
  ('일본',   '온천', '삿포로',   '{CTS}'::text[],     '조잔케이·노보리베츠 온천'),
  ('일본',   '온천', '오사카',   '{KIX}'::text[],     '아리마 온천 당일치기'),
  ('일본',   '쇼핑', '도쿄',     '{NRT,HND}'::text[], '긴자·시부야·하라주쿠'),
  ('일본',   '쇼핑', '오사카',   '{KIX}'::text[],     '신사이바시·난바'),
  ('일본',   '휴양', '오키나와', '{OKA}'::text[],     '바다·리조트'),
  ('동남아', '휴양', '다낭',     '{DAD}'::text[],     '해변 리조트, 물가 저렴'),
  ('동남아', '휴양', '세부',     '{CEB}'::text[],     '다이빙·리조트'),
  ('동남아', '맛집', '방콕',     '{BKK}'::text[],     '길거리 음식·미쉐린 빕구르망'),
  ('동남아', '맛집', '타이베이', '{TPE}'::text[],     '야시장·우육면·딤섬')
) as seed(region, purpose, city, airport_codes, reason)
where not exists (select 1 from city_mappings);

-- 초대코드는 직접 만든다. 예:
-- insert into invite_codes (code, name, daily_limit) values ('원하는-코드', '나', 20);
