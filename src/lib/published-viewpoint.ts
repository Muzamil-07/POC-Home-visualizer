import type { PublishedViewpoint } from "@/lib/tour-schema";
import type { TourViewpoint } from "@/types/tour";

export function publishedViewpointAsTour(
  viewpoint: PublishedViewpoint,
): TourViewpoint {
  return {
    id: viewpoint.id,
    name: viewpoint.name,
    description: viewpoint.description,
    position: viewpoint.position,
    quaternion: viewpoint.quaternion,
    target: viewpoint.target,
    fov: viewpoint.fov,
    order: viewpoint.order,
    createdAt: "",
    updatedAt: "",
  };
}
