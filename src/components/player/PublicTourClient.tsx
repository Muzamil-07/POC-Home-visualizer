"use client";

import dynamic from "next/dynamic";
import type { PublishedTourRecord } from "@/lib/tour-schema";

const PublicTourPlayer = dynamic(
  () => import("./PublicTourPlayer").then((module) => module.PublicTourPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh w-full items-center justify-center bg-[#141618] text-[#c8c4bc]">
        <p className="text-[12px] tracking-[0.18em] uppercase">Loading tour…</p>
      </div>
    ),
  },
);

export function PublicTourClient({ tour }: { tour: PublishedTourRecord }) {
  return <PublicTourPlayer tour={tour} />;
}
