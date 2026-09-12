# Supabase setup for shareable Tours

The editor publishes Tour JSON to Postgres. House GLBs live in the public `tour-models` Storage bucket (not in git or Vercel). Published tours store that public URL in `model_url`.

**Supabase Pro is required for this house.** Free Storage allows 50 MB per file and 1 GB total. The default house is ~191 MB and the generated-normals house is ~218 MB.

## 1. Create a project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Create a project (or reuse an existing one).
3. Wait until the database is ready.

## 2. Run the migration

1. Open **SQL Editor**.
2. Paste the contents of `supabase/migrations/001_create_tours.sql`.
3. Run the script.

This creates `public.tours`, a unique slug index, an `updated_at` trigger, a JSON size check, and Row Level Security. Anonymous users can only `SELECT` rows where `is_published = true`. They cannot insert, update, or delete.

Then run `supabase/migrations/002_ai_visualizations.sql`. That adds private AI Visualization tables (`ai_visualization_threads`, `ai_visualization_messages`, `ai_generation_usage`) and the `tour-ai-visualizations` Storage bucket. Visitors never read these tables directly; Next.js uses the service-role key and returns short-lived signed image URLs.

Then run `supabase/migrations/003_ai_visitor_openai_keys.sql`. That stores encrypted visitor-owned OpenAI keys. The plaintext key never leaves the Next.js server after save, and the table is locked down with RLS.

Then run `supabase/migrations/004_model_storage.sql`. That creates the public `tour-models` bucket (512 MB file cap, public read, no public writes). Editor uploads go through a short-lived signed URL created by the Next.js service-role key.

After the bucket exists, open **Project Settings → Storage** (or Storage → Configuration) and set the **global file size limit** to at least **256 MB**. The bucket limit cannot exceed this project-wide cap.

Upload the two default houses (keep these exact object paths):

```
defaults/lucas-home-full-color.glb
defaults/house-with-generated-normals.glb
```

From this repo, with `.env.local` filled in:

```bash
npm run upload:models
```

Or use Storage → `tour-models` → Upload file and create the `defaults/` folder first.

If the browser cannot download or upload models, add a Storage CORS rule that allows your Vercel origin and `http://localhost:3000` for `GET`, `HEAD`, `PUT`, and `OPTIONS`.

## 3. Copy the Project URL

Project Settings → API → **Project URL**

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
```

## 4. Copy the publishable key

Project Settings → API → **Publishable key** (or the legacy `anon` key)

```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

This key is safe for the browser. RLS still blocks unpublished rows and all writes.

## 5. Copy the server-only service-role key

Project Settings → API → **service_role** secret

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

Never prefix this with `NEXT_PUBLIC_`. Never import the service-role client into Client Components. Editor create/update requests go through Next.js Route Handlers that hash the edit token and write with this key.

## 6. Populate `.env.local`

Copy `.env.example` to `.env.local` (gitignored) and fill in the four values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-6-astra
OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
```

`OPENAI_API_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`. Visitors can also paste their own paid OpenAI key in the tour drawer; that key is encrypted and saved against their visitor cookie, and generations on that key skip the hosted hourly limit.

## 7. Restart the development server

```bash
npm run dev
```

The app reads these variables at startup. Missing server keys produce a clear API error instead of a silent publish failure.
