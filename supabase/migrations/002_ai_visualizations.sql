-- Additive AI Visualization tables and private storage. Does not alter public.tours.

create table if not exists public.ai_visualization_threads (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  visitor_session_id text not null,
  latest_openai_response_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_visualization_threads_visitor_idx
  on public.ai_visualization_threads (tour_id, visitor_session_id, updated_at desc);

drop trigger if exists ai_visualization_threads_set_updated_at on public.ai_visualization_threads;
create trigger ai_visualization_threads_set_updated_at
  before update on public.ai_visualization_threads
  for each row
  execute procedure public.set_updated_at();

create table if not exists public.ai_visualization_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_visualization_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  message_type text not null check (
    message_type in ('capture', 'instruction', 'image', 'text', 'error')
  ),
  text_content text,
  original_capture_path text,
  generated_image_path text,
  camera_metadata jsonb,
  openai_response_id text,
  status text not null default 'completed' check (
    status in ('pending', 'completed', 'failed')
  ),
  created_at timestamptz not null default now()
);

create index if not exists ai_visualization_messages_thread_idx
  on public.ai_visualization_messages (thread_id, created_at);

create table if not exists public.ai_generation_usage (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  visitor_session_id text not null,
  ip_hash text,
  kind text not null check (kind in ('initial', 'followup')),
  thread_id uuid references public.ai_visualization_threads(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint ai_generation_usage_idempotent unique (visitor_session_id, idempotency_key)
);

create index if not exists ai_generation_usage_rate_idx
  on public.ai_generation_usage (tour_id, visitor_session_id, kind, created_at);

create index if not exists ai_generation_usage_ip_idx
  on public.ai_generation_usage (tour_id, ip_hash, kind, created_at);

alter table public.ai_visualization_threads enable row level security;
alter table public.ai_visualization_threads force row level security;
alter table public.ai_visualization_messages enable row level security;
alter table public.ai_visualization_messages force row level security;
alter table public.ai_generation_usage enable row level security;
alter table public.ai_generation_usage force row level security;

revoke all on table public.ai_visualization_threads from public;
revoke all on table public.ai_visualization_threads from anon;
revoke all on table public.ai_visualization_threads from authenticated;
revoke all on table public.ai_visualization_messages from public;
revoke all on table public.ai_visualization_messages from anon;
revoke all on table public.ai_visualization_messages from authenticated;
revoke all on table public.ai_generation_usage from public;
revoke all on table public.ai_generation_usage from anon;
revoke all on table public.ai_generation_usage from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tour-ai-visualizations',
  'tour-ai-visualizations',
  false,
  8000000,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
