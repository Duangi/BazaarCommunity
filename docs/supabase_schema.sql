create extension if not exists pgcrypto;

create table if not exists public.community_lineups (
  uuid uuid primary key,
  name text not null,
  hero text not null,
  season int not null default 11,
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
  author_user_id text,
  author_bilibili_uid text,
  video_bv text,
  video_title text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.community_lineups add column if not exists season int;
update public.community_lineups set season = 11 where season is null;
alter table public.community_lineups alter column season set default 11;
alter table public.community_lineups alter column season set not null;
alter table public.community_lineups add column if not exists author_user_id text;
alter table public.community_lineups alter column author_user_id type text using author_user_id::text;

create table if not exists public.community_ratings (
  uuid uuid primary key,
  name text not null,
  season int not null default 11,
  rating_payload jsonb not null,
  likes_count int not null default 0,
  favorites_count int not null default 0,
  author_name text not null,
  author_user_id text,
  author_bilibili_uid text,
  created_at timestamptz not null default now()
);

alter table public.community_ratings add column if not exists season int;
update public.community_ratings set season = 11 where season is null;
alter table public.community_ratings alter column season set default 11;
alter table public.community_ratings alter column season set not null;
alter table public.community_ratings add column if not exists author_user_id text;
alter table public.community_ratings alter column author_user_id type text using author_user_id::text;

create table if not exists public.community_interactions (
  id uuid primary key default gen_random_uuid(),
  target_uuid uuid not null,
  target_type text not null check (target_type in ('lineup','rating')),
  interaction_type text not null check (interaction_type in ('like','favorite')),
  nickname text not null,
  created_at timestamptz not null default now(),
  unique(target_uuid, target_type, interaction_type, nickname)
);

create table if not exists public.user_profiles (
  user_id text primary key,
  nickname text not null,
  game_username text,
  use_bilibili boolean not null default false,
  bilibili_uid text,
  main_heroes text[] not null default array['Pygmalien']::text[],
  main_hero text not null default 'Pygmalien',
  last_login_issued_at bigint,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles drop constraint if exists user_profiles_user_id_fkey;
alter table public.user_profiles add column if not exists game_username text;
alter table public.user_profiles add column if not exists main_heroes text[];
alter table public.user_profiles add column if not exists main_hero text;
update public.user_profiles
set main_heroes = array[main_hero]::text[]
where main_heroes is null or array_length(main_heroes, 1) is null;
alter table public.user_profiles alter column main_heroes set default array['Pygmalien']::text[];
alter table public.user_profiles alter column main_heroes set not null;
update public.user_profiles set main_hero = 'Pygmalien' where main_hero is null or main_hero = '';
update public.user_profiles set main_hero = main_heroes[1] where main_hero is null or main_hero = '';
alter table public.user_profiles alter column main_hero set default 'Pygmalien';
alter table public.user_profiles alter column main_hero set not null;
alter table public.user_profiles add column if not exists last_login_issued_at bigint;
alter table public.user_profiles add column if not exists last_login_at timestamptz;

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id text not null,
  following_user_id text not null,
  created_at timestamptz not null default now(),
  unique(follower_user_id, following_user_id),
  check (follower_user_id <> following_user_id)
);

alter table public.user_follows drop constraint if exists user_follows_follower_user_id_fkey;
alter table public.user_follows drop constraint if exists user_follows_following_user_id_fkey;

create table if not exists public.community_game_records (
  id uuid primary key default gen_random_uuid(),
  author_user_id text not null,
  author_name text not null,
  played_on date not null,
  result text not null check (result in ('win','lose')),
  day_index int not null check (day_index >= 1 and day_index <= 30),
  screenshot_url text not null,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.community_game_records drop constraint if exists community_game_records_author_user_id_fkey;
alter table public.user_profiles alter column user_id type text using user_id::text;
alter table public.user_follows alter column follower_user_id type text using follower_user_id::text;
alter table public.user_follows alter column following_user_id type text using following_user_id::text;
alter table public.community_game_records alter column author_user_id type text using author_user_id::text;

create index if not exists idx_lineups_created_at on public.community_lineups (created_at desc);
create index if not exists idx_ratings_created_at on public.community_ratings (created_at desc);
create index if not exists idx_interactions_target on public.community_interactions (target_uuid, target_type, interaction_type);
create index if not exists idx_lineups_author_user on public.community_lineups (author_user_id);
create index if not exists idx_ratings_author_user on public.community_ratings (author_user_id);
create index if not exists idx_lineups_season on public.community_lineups (season);
create index if not exists idx_ratings_season on public.community_ratings (season);
create index if not exists idx_profiles_nickname on public.user_profiles (nickname);
create index if not exists idx_follows_follower on public.user_follows (follower_user_id, created_at desc);
create index if not exists idx_follows_following on public.user_follows (following_user_id, created_at desc);
create index if not exists idx_game_records_author_date on public.community_game_records (author_user_id, played_on desc, created_at desc);
create index if not exists idx_game_records_match_id on public.community_game_records (author_user_id, ((meta->>'match_id')), day_index);
create unique index if not exists uq_game_records_author_match_day_start_result
  on public.community_game_records (author_user_id, ((meta->>'match_id')), day_index, ((meta->>'battle_start_time')), result);

create or replace function public.touch_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.touch_user_profiles_updated_at();

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.community_lineups to anon, authenticated;
grant select, insert, update, delete on table public.community_ratings to anon, authenticated;
grant select, insert, update, delete on table public.community_interactions to anon, authenticated;
grant select, insert, update, delete on table public.user_profiles to anon, authenticated;
grant select, insert, update, delete on table public.user_follows to anon, authenticated;
grant select, insert on table public.community_game_records to anon, authenticated;

alter table public.community_lineups disable row level security;
alter table public.community_ratings disable row level security;
alter table public.community_interactions disable row level security;
alter table public.user_profiles disable row level security;
alter table public.user_follows disable row level security;
alter table public.community_game_records disable row level security;
