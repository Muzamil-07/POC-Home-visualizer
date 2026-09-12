-- Public GLB bucket for the default house and editor uploads.
-- Service role creates signed upload URLs; visitors only read.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tour-models',
  'tour-models',
  true,
  536870912,
  array['model/gltf-binary', 'application/octet-stream']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read tour models" on storage.objects;
create policy "Public read tour models"
on storage.objects
for select
to public
using (bucket_id = 'tour-models');
