import "server-only";
import { createAnonSupabase } from "@/lib/supabase/server";
import {
  parsePublishedTourData,
  type PublishedTourRecord,
} from "@/lib/tour-schema";
import { DAY_ENVIRONMENT } from "@/lib/lighting";

export async function getPublishedTourBySlug(
  slug: string,
): Promise<PublishedTourRecord | null> {
  const supabase = createAnonSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tours")
    .select(
      "id, slug, title, model_url, tour_data, default_environment, allow_environment_switch, is_published, schema_version, created_at, updated_at",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) return null;
  try {
    const tourData = parsePublishedTourData(data.tour_data);
    return {
      id: data.id,
      slug: data.slug,
      title: data.title,
      modelUrl: data.model_url,
      defaultEnvironment: DAY_ENVIRONMENT,
      allowEnvironmentSwitch: false,
      isPublished: data.is_published,
      schemaVersion: data.schema_version,
      tourData,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}
