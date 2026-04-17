-- BazaarPlusPlus mock 分析表（测试）

create table if not exists public.community_bpp_mock_run_finals (
  run_id text primary key references public.community_bpp_runs(run_id) on delete cascade,
  final_day integer not null,
  board_slots integer not null,
  cards jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_bpp_mock_run_lineups (
  run_id text not null references public.community_bpp_runs(run_id) on delete cascade,
  day integer not null,
  board_slots integer not null,
  cards jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, day)
);

create index if not exists idx_bpp_mock_lineups_day on public.community_bpp_mock_run_lineups(day);

create index if not exists idx_bpp_mock_runs_player on public.community_bpp_runs(player_name, ended_at_utc desc);

create index if not exists idx_bpp_mock_runs_hero on public.community_bpp_runs(hero, ended_at_utc desc);
