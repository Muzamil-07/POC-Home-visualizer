-- Visitor-owned OpenAI keys. Encrypted at rest by Next.js; this table never
-- stores the plaintext key. Service-role only.

create table if not exists public.ai_visitor_openai_keys (
  visitor_session_id text primary key,
  encrypted_key text not null,
  key_last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_visitor_openai_keys_set_updated_at on public.ai_visitor_openai_keys;
create trigger ai_visitor_openai_keys_set_updated_at
  before update on public.ai_visitor_openai_keys
  for each row
  execute procedure public.set_updated_at();

alter table public.ai_visitor_openai_keys enable row level security;
alter table public.ai_visitor_openai_keys force row level security;

revoke all on table public.ai_visitor_openai_keys from public;
revoke all on table public.ai_visitor_openai_keys from anon;
revoke all on table public.ai_visitor_openai_keys from authenticated;
