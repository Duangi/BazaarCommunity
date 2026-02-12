create extension if not exists pgcrypto;

create table if not exists public.community_lineups (
  uuid uuid primary key,
  name text not null,
  hero text not null,
  day_from int not null default 1,
  day_to int not null default 13,
  day_plan_tag text,
  strength_tag text,
  difficulty_tag text,
  version text not null default 'web-v1',
  cards_data jsonb not null default '[]'::jsonb,
  special_slots jsonb not null default '[]'::jsonb,
  lineup_payload jsonb not null,
  likes_count int not null default 0,
  favorites_count int not null default 0,
  rating_score numeric(4,2) not null default 0,
  author_name text not null,
  author_bilibili_uid text,
  video_bv text,
  video_title text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.community_ratings (
  uuid uuid primary key,
  name text not null,
  rating_payload jsonb not null,
  likes_count int not null default 0,
  favorites_count int not null default 0,
  author_name text not null,
  author_bilibili_uid text,
  created_at timestamptz not null default now()
);

create table if not exists public.community_interactions (
  id uuid primary key default gen_random_uuid(),
  target_uuid uuid not null,
  target_type text not null check (target_type in ('lineup','rating')),
  interaction_type text not null check (interaction_type in ('like','favorite')),
  nickname text not null,
  created_at timestamptz not null default now(),
  unique(target_uuid, target_type, interaction_type, nickname)
);

create index if not exists idx_lineups_created_at on public.community_lineups (created_at desc);
create index if not exists idx_ratings_created_at on public.community_ratings (created_at desc);
create index if not exists idx_interactions_target on public.community_interactions (target_uuid, target_type, interaction_type);

-- 为前端匿名访问开放最小必需权限（当前前端会直接读写这些表）
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.community_lineups to anon, authenticated;
grant select, insert, update, delete on table public.community_ratings to anon, authenticated;
grant select, insert, update, delete on table public.community_interactions to anon, authenticated;

-- 当前方案采用前端直连，为避免被 RLS 拦截，先显式关闭这三张表的 RLS
alter table public.community_lineups disable row level security;
alter table public.community_ratings disable row level security;
alter table public.community_interactions disable row level security;
