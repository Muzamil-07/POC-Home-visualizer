"use client";

import dynamic from "next/dynamic";

const SceneCanvas = dynamic(
  () => import("./SceneCanvas").then((module) => module.SceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh w-full items-center justify-center bg-[#141618] text-[#c8c4bc]">
        <p className="text-[12px] tracking-[0.18em] uppercase">
          Loading editor…
        </p>
      </div>
    ),
  },
);

export function SceneCanvasClient() {
  return <SceneCanvas />;
}
