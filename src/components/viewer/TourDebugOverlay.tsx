"use client";

import { useEffect, useState } from "react";
import { TOUR_MOTION_DEBUG } from "@/types/tour-motion";
import {
  getTourMotionDebug,
  subscribeTourMotionDebug,
} from "./tour-motion-debug";

export function TourDebugOverlay() {
  const [debug, setDebug] = useState(getTourMotionDebug);
  useEffect(() => subscribeTourMotionDebug(() => setDebug(getTourMotionDebug())), []);

  if (!TOUR_MOTION_DEBUG || !debug) return null;

  return (
    <div className="pointer-events-none absolute top-14 left-3 z-[60] max-w-[16rem] rounded border border-white/10 bg-[#16181c]/88 px-2.5 py-2 font-mono text-[10px] leading-4 text-[#c8c4bc] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
      <p>Phase: {debug.phase}</p>
      <p>From: {debug.fromName}</p>
      <p>To: {debug.toName}</p>
      <p>Route: {debug.routeId}</p>
      <p>Length: {debug.length.toFixed(1)} m</p>
      <p>Speed: {debug.speed.toFixed(1)} m/s</p>
      <p>
        Distance: {debug.distance.toFixed(1)} / {debug.length.toFixed(1)} m
      </p>
      <p>Expected duration: {debug.expectedDuration.toFixed(1)} s</p>
      <p>Look-ahead: {debug.lookAhead.toFixed(2)} m</p>
      <p>Upcoming turn: {debug.turnAngleDeg.toFixed(0)}°</p>
      <p>Distance to turn: {debug.distanceToTurn.toFixed(2)} m</p>
      <p>Yaw rate: {debug.yawRateDeg.toFixed(0)} °/s</p>
      <p>
        Camera: {debug.cameraX.toFixed(2)}, {debug.cameraY.toFixed(2)},{" "}
        {debug.cameraZ.toFixed(2)}
      </p>
    </div>
  );
}
