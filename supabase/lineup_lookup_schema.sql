create schema if not exists analytics;

create table if not exists analytics.lineup_snapshots (
  snapshot_id bigserial primary key,
  battle_id text not null,
  run_id text not null,
  side text not null check (side in ('player', 'opponent')),
  hero text,
  day int,
  player_rating int,
  rating_bucket text,
  result text,
  cards_json jsonb not null,
  skills_json jsonb,
  combo_signature text not null,
  layout_signature text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_lineup_snapshots_battle_side
  on analytics.lineup_snapshots (battle_id, side);

create index if not exists idx_lineup_snapshots_filters
  on analytics.lineup_snapshots (hero, day, rating_bucket, player_rating);

create index if not exists idx_lineup_snapshots_layout
  on analytics.lineup_snapshots (layout_signature);

create table if not exists analytics.lineup_card_index (
  template_id text not null,
  tier int,
  snapshot_id bigint not null references analytics.lineup_snapshots(snapshot_id) on delete cascade,
  combo_signature text not null,
  layout_signature text not null,
  hero text,
  day int,
  rating_bucket text,
  player_rating int,
  created_at timestamptz not null default now(),
  primary key (template_id, snapshot_id)
);

create index if not exists idx_lineup_card_index_card_filters
  on analytics.lineup_card_index (template_id, hero, day, rating_bucket, player_rating);

create index if not exists idx_lineup_card_index_layout
  on analytics.lineup_card_index (layout_signature);

create table if not exists analytics.lineup_variant_agg (
  combo_signature text not null,
  layout_signature text not null,
  hero text,
  day int,
  rating_bucket text,
  matches int not null,
  wins int not null,
  losses int not null,
  win_rate numeric(6,3) not null,
  top_cards_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (combo_signature, layout_signature, hero, day, rating_bucket)
);

create index if not exists idx_lineup_variant_agg_filters
  on analytics.lineup_variant_agg (hero, day, rating_bucket, win_rate desc, matches desc);

