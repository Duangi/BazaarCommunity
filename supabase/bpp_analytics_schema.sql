-- BazaarPlusPlus 上传解析与聚合（v1）

create table if not exists public.community_bpp_ingest_files (
  id bigserial primary key,
  r2_key text not null,
  uploader_segment text null,
  status text not null default 'pending',
  processed_at timestamptz null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_community_bpp_ingest_files_r2_key
  on public.community_bpp_ingest_files (r2_key);

create table if not exists public.community_bpp_runs (
  run_id text primary key,
  player_account_id text null,
  player_name text null,
  hero text null,
  game_mode text null,
  started_at_utc timestamptz null,
  ended_at_utc timestamptz null,
  final_day integer null,
  final_hour integer null,
  victories integer null,
  losses integer null,
  status text null,
  reason text null,
  source_r2_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_bpp_runs_player
  on public.community_bpp_runs (player_account_id, ended_at_utc desc);

create index if not exists idx_community_bpp_runs_hero
  on public.community_bpp_runs (hero);

create table if not exists public.community_bpp_hero_agg (
  hero text primary key,
  total_runs integer not null default 0,
  total_10w integer not null default 0,
  avg_victories numeric(6,3) not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at_community_bpp_ingest_files on public.community_bpp_ingest_files;
create trigger trg_set_updated_at_community_bpp_ingest_files
before update on public.community_bpp_ingest_files
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_community_bpp_runs on public.community_bpp_runs;
create trigger trg_set_updated_at_community_bpp_runs
before update on public.community_bpp_runs
for each row execute function public.set_updated_at();

