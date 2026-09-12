import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicTourClient } from "@/components/player/PublicTourClient";
import { getPublishedTourBySlug } from "@/lib/supabase/published-tour";
import { publicShareUrl } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TourPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: TourPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tour = await getPublishedTourBySlug(slug);
  if (!tour) {
    return {
      title: "Tour not found",
      description: "This architectural tour is unavailable.",
    };
  }
  const url = publicShareUrl(tour.slug, await headers());
  return {
    title: tour.title,
    description: `A published architectural walkthrough of ${tour.title}.`,
    alternates: { canonical: url },
    openGraph: {
      title: tour.title,
      description: `A published architectural walkthrough of ${tour.title}.`,
      url,
      type: "website",
    },
  };
}

export default async function PublicTourPage({
  params,
}: TourPageProps) {
  const { slug } = await params;
  const tour = await getPublishedTourBySlug(slug);
  if (!tour) notFound();

  return <PublicTourClient tour={tour} />;
}
