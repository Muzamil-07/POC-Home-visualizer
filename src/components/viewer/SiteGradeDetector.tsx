"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { getGlbRoot } from "./glb-root";
import { detectSiteGrade } from "@/lib/ground";

export function SiteGradeDetector({
  modelHeight,
  enabled,
  onDetected,
}: {
  modelHeight: number;
  enabled: boolean;
  onDetected: (siteGradeY: number) => void;
}) {
  const ran = useRef(false);

  useFrame(() => {
    if (!enabled || ran.current) return;
    const root = getGlbRoot();
    if (!root) return;
    ran.current = true;
    onDetected(detectSiteGrade(root, { height: modelHeight }));
  });

  return null;
}
