const SLUG_MAX = 48;

function slugifyTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.slice(0, 32) || "tour";
}

export function createTourSlug(title: string, uniqueness = "") {
  const suffix = uniqueness || Math.random().toString(36).slice(2, 6);
  const base = slugifyTitle(title);
  return `${base}-${suffix}`.slice(0, SLUG_MAX);
}
