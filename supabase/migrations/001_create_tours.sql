create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  model_url text not null,
  model_fingerprint text,
  tour_data jsonb not null,
  default_environment text not null default 'day'
    check (
      default_environment in (
        'day',
        'evening',
        'night'
      )
    ),
  allow_environment_switch boolean not null default true,
  is_published boolean not null default false,
  edit_token_hash text not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tours_tour_data_size check (pg_column_size(tour_data) <= 750000)
);

create unique index if not exists tours_slug_key on public.tours (slug);

drop trigger if exists tours_set_updated_at on public.tours;
create trigger tours_set_updated_at
  before update on public.tours
  for each row
  execute procedure public.set_updated_at();

alter table public.tours enable row level security;
alter table public.tours force row level security;

revoke all on table public.tours from public;
revoke all on table public.tours from anon;
revoke all on table public.tours from authenticated;

grant select on table public.tours to anon, authenticated;

drop policy if exists "public can read published tours" on public.tours;
create policy "public can read published tours"
  on public.tours
  for select
  to anon, authenticated
  using (is_published = true);
