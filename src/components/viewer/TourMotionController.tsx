// @ts-nocheck — paused walkable-route editor
"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import { CURATED_TOUR_DWELL_MS } from "@/lib/house-model";
import {
  compileWalkablePath,
  getPointAtDistance,
  getTangentAtDistance,
  getUpcomingTurn,
} from "@/lib/compile-walkable-path";
import {
  compileAdjacentRoute,
  missingAdjacentRoutes,
  sequentialRouteError,
} from "@/lib/tour-coverage";
import { areStopsAdjacent } from "@/lib/curated-tour";
import {
  averageFutureDirection,
  isTightUpcomingTurn,
  lookAheadDistanceForSpeed,
  lookRotationFromDirection,
  stepYawPitch,
  targetSpeedForTurn,
  yawSpeedForRoute,
} from "@/lib/tour-steering";
import {
  selectCurrentRoutes,
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";
import type { WalkableRoute } from "@/types/route";
import type { TourViewpoint } from "@/types/tour";
import type { TourNavigationKind } from "@/types/curated-tour";
import {
  ALIGN_MAX_SECONDS,
  ALIGN_MIN_SECONDS,
  ALIGN_YAW_RADIANS,
  MAXIMUM_YAW_SPEED,
  SPEED_DAMPING,
  TOUR_MOTION_DEBUG,
  WALK_ARRIVE_METERS,
  clampPlaybackSpeed,
  isTourMotionBusy,
  type CompiledWalkablePath,
  type TourMotionDebug,
  type TourMotionPhase,
} from "@/types/tour-motion";
import {
  getEditorCamera,
  isCameraControls,
  previewClipping,
  resolveViewpointLookAt,
  sleep,
  syncControlsFromCamera,
  type ModelSize,
} from "./editor-camera";
import {
  beginEstablishing,
  registerTourMotion,
  TourMotionCancelled,
  waitEstablishing,
} from "./tour-motion";
import { setTourMotionDebug } from "./tour-motion-debug";

type TourMotionControllerProps = {
  modelSize: ModelSize | null;
};

type BusyPhase = Extract<
  TourMotionPhase,
  | "aligning"
  | "accelerating"
  | "walking"
  | "slowing-for-turn"
  | "turning-in-place"
  | "arriving"
>;

type WalkJob = {
  token: number;
  path: CompiledWalkablePath;
  baseSpeed: number;
  currentSpeed: number;
  maxYaw: number;
  lookAheadOverride: number;
  source: TourViewpoint;
  destination: TourViewpoint;
  routeId: string;
  phase: BusyPhase;
  travelled: number;
  alignElapsed: number;
  alignStartedAt: number;
  arriveElapsed: number;
  destQuat: Quaternion;
  destPosition: Vector3;
  destFov: number;
  startFov: number;
  lastYawRate: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const dummy = new Object3D();
const samplePos = new Vector3();
const pathTangent = new Vector3();
const tangentNow = new Vector3();
const tangentA = new Vector3();
const tangentB = new Vector3();
const tangentC = new Vector3();
const futureDir = new Vector3();
const desiredQuat = new Quaternion();
const walkDesired = new Quaternion();
let lastDebugAt = 0;

function viewpointQuaternion(viewpoint: TourViewpoint, size: ModelSize | null) {
  const look = resolveViewpointLookAt(viewpoint, size);
  dummy.position.copy(look.position);
  dummy.up.set(0, 1, 0);
  dummy.lookAt(look.target);
  dummy.updateMatrixWorld();
  return {
    quat: dummy.quaternion.clone(),
    position: look.position.clone(),
  };
}

function setPhase(job: WalkJob, phase: BusyPhase) {
  if (job.phase === phase) return;
  job.phase = phase;
  const store = useTourStore.getState();
  if (store.tourMotionPhase !== phase) store.setTourMotionPhase(phase);
}

function publishDebug(
  job: WalkJob,
  camera: PerspectiveCamera,
  extras: { lookAhead: number; turnAngleDeg: number; distanceToTurn: number },
  force = false,
) {
  if (!TOUR_MOTION_DEBUG) return;
  const now = performance.now();
  if (!force && now - lastDebugAt < 80) return;
  lastDebugAt = now;
  const snapshot: TourMotionDebug = {
    phase: job.phase,
    fromName: job.source.name,
    toName: job.destination.name,
    routeId: job.routeId,
    length: job.path.totalLength,
    speed: job.currentSpeed,
    distance: job.travelled,
    expectedDuration: job.path.totalLength / Math.max(0.2, job.baseSpeed),
    cameraX: camera.position.x,
    cameraY: camera.position.y,
    cameraZ: camera.position.z,
    lookAhead: extras.lookAhead,
    turnAngleDeg: extras.turnAngleDeg,
    distanceToTurn: extras.distanceToTurn,
    yawRateDeg: (job.lastYawRate * 180) / Math.PI,
  };
  setTourMotionDebug(snapshot);
}

function finishArrival(
  job: WalkJob,
  camera: PerspectiveCamera,
  cameraControls: CameraControlsImpl | null,
) {
  camera.position.copy(job.destPosition);
  camera.fov = job.destFov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  if (cameraControls) {
    cameraControls.enabled = false;
    syncControlsFromCamera(cameraControls, camera);
    cameraControls.enabled = false;
  }
  const store = useTourStore.getState();
  store.setEditorFov(job.destFov);
  store.setActiveTourViewpoint(job.destination.id);
  store.setTourTransitioning(false);
  store.setTourMotionPhase("idle");
  if (TOUR_MOTION_DEBUG) setTourMotionDebug(null);
  job.resolve();
}

export function TourMotionController({ modelSize }: TourMotionControllerProps) {
  const getThree = useThree((state) => state.get);
  const sizeRef = useRef(modelSize);
  const tokenRef = useRef(0);
  const jobRef = useRef<WalkJob | null>(null);
  const pausedPhaseRef = useRef<BusyPhase | null>(null);
  const autoplayAbortRef = useRef<AbortController | null>(null);
  const autoplayTokenRef = useRef(0);

  useLayoutEffect(() => {
    sizeRef.current = modelSize;
  }, [modelSize]);

  useFrame((_, delta) => {
    const job = jobRef.current;
    if (!job) return;

    const store = useTourStore.getState();
    if (store.isExitingTour) return;

    const { camera, controls, invalidate } = getThree();
    const active = camera as PerspectiveCamera;
    const dt = Math.min(0.05, Math.max(0, delta));
    const cameraControls = isCameraControls(controls) ? controls : null;
    if (cameraControls) cameraControls.enabled = false;

    if (store.tourPlayback === "paused" && isTourMotionBusy(job.phase)) {
      if (store.tourMotionPhase !== "paused") {
        pausedPhaseRef.current = job.phase;
        store.setTourMotionPhase("paused");
      }
      return;
    }

    invalidate();
    const clip = previewClipping(sizeRef.current);
    active.near = clip.near;
    active.far = clip.far;

    const remaining = job.path.totalLength - job.travelled;
    const upcoming = getUpcomingTurn(job.path, job.travelled);
    const lookAhead = lookAheadDistanceForSpeed(
      Math.max(job.currentSpeed, 0.35),
      job.lookAheadOverride,
    );

    getTangentAtDistance(job.path, job.travelled, tangentNow);
    getTangentAtDistance(job.path, job.travelled + 0.5, tangentA);
    getTangentAtDistance(job.path, job.travelled + 1.0, tangentB);
    getTangentAtDistance(job.path, job.travelled + 1.5, tangentC);
    getTangentAtDistance(
      job.path,
      job.travelled + lookAhead,
      pathTangent,
    );
    averageFutureDirection(
      [tangentNow, tangentA, tangentB, tangentC, pathTangent],
      futureDir,
    );

    const flatten = Math.abs(futureDir.y) < 0.22;
    getPointAtDistance(job.path, job.travelled, samplePos);
    lookRotationFromDirection(samplePos, futureDir, flatten, walkDesired);

    if (job.phase === "arriving" || remaining <= WALK_ARRIVE_METERS) {
      const blend = MathUtils.clamp(
        1 - remaining / WALK_ARRIVE_METERS,
        0,
        1,
      );
      desiredQuat.copy(walkDesired).slerp(job.destQuat, blend * blend * (3 - 2 * blend));
    } else {
      desiredQuat.copy(walkDesired);
    }

    const maxYaw =
      upcoming && Math.abs(upcoming.angle) > Math.PI / 4
        ? Math.min(job.maxYaw, MAXIMUM_YAW_SPEED)
        : job.maxYaw;

    if (job.phase === "aligning") {
      active.position.copy(job.path.samples[0]!);
      const stepped = stepYawPitch(
        active.quaternion,
        desiredQuat,
        dt,
        maxYaw,
        active.quaternion,
      );
      job.lastYawRate = stepped.yawRate;
      job.alignElapsed += dt;
      const aligned =
        Math.abs(stepped.yawError) < ALIGN_YAW_RADIANS &&
        job.alignElapsed >= ALIGN_MIN_SECONDS;
      const timedOut =
        job.alignElapsed >= ALIGN_MAX_SECONDS ||
        performance.now() - job.alignStartedAt >= ALIGN_MAX_SECONDS * 1000;
      setPhase(job, "aligning");
      publishDebug(job, active, {
        lookAhead,
        turnAngleDeg: ((upcoming?.angle ?? 0) * 180) / Math.PI,
        distanceToTurn: upcoming?.distance ?? remaining,
      });
      if (aligned || timedOut) {
        job.currentSpeed = 0;
        setPhase(job, "accelerating");
      }
    } else if (job.phase === "turning-in-place") {
      const outgoingDistance = upcoming
        ? upcoming.pathDistance + 0.4
        : job.travelled + 0.4;
      getTangentAtDistance(job.path, outgoingDistance, futureDir);
      lookRotationFromDirection(samplePos, futureDir, flatten, desiredQuat);
      const stepped = stepYawPitch(
        active.quaternion,
        desiredQuat,
        dt,
        MAXIMUM_YAW_SPEED,
        active.quaternion,
      );
      job.lastYawRate = stepped.yawRate;
      job.currentSpeed = MathUtils.damp(job.currentSpeed, 0.05, SPEED_DAMPING, dt);
      active.position.copy(samplePos);
      setPhase(job, "turning-in-place");
      publishDebug(job, active, {
        lookAhead,
        turnAngleDeg: ((upcoming?.angle ?? 0) * 180) / Math.PI,
        distanceToTurn: upcoming?.distance ?? 0,
      });
      if (Math.abs(stepped.yawError) < ALIGN_YAW_RADIANS) {
        if (upcoming) {
          job.travelled = Math.max(job.travelled, upcoming.pathDistance + 0.1);
        }
        setPhase(job, "accelerating");
      }
      } else if (
        isTightUpcomingTurn(upcoming) &&
        job.currentSpeed < 0.28 &&
        (upcoming?.distance ?? 1) < 0.32
      ) {
        setPhase(job, "turning-in-place");
        job.currentSpeed = MathUtils.damp(job.currentSpeed, 0.08, SPEED_DAMPING, dt);
        active.position.copy(samplePos);
        publishDebug(job, active, {
          lookAhead,
          turnAngleDeg: ((upcoming?.angle ?? 0) * 180) / Math.PI,
          distanceToTurn: upcoming?.distance ?? 0,
        });
      } else {
      const arriving = remaining <= WALK_ARRIVE_METERS;
      if (arriving) setPhase(job, "arriving");
      else if (upcoming && upcoming.angle > Math.PI / 6 && upcoming.distance < 2.2) {
        setPhase(job, "slowing-for-turn");
      } else if (job.currentSpeed < job.baseSpeed * 0.72 && job.travelled < 1.2) {
        setPhase(job, "accelerating");
      } else {
        setPhase(job, "walking");
      }

      const targetSpeed =
        job.phase === "arriving"
          ? MathUtils.lerp(
              0,
              Math.min(0.45, job.baseSpeed),
              MathUtils.clamp(remaining / WALK_ARRIVE_METERS, 0, 1),
            )
          : targetSpeedForTurn(job.baseSpeed, upcoming, remaining);
      job.currentSpeed = MathUtils.damp(
        job.currentSpeed,
        targetSpeed,
        SPEED_DAMPING,
        dt,
      );

      job.travelled = Math.min(
        job.path.totalLength,
        job.travelled + job.currentSpeed * dt,
      );
      getPointAtDistance(job.path, job.travelled, samplePos);
      if (job.phase === "arriving") {
        const blend = MathUtils.clamp(
          1 - (job.path.totalLength - job.travelled) / WALK_ARRIVE_METERS,
          0,
          1,
        );
        samplePos.lerp(job.destPosition, blend * blend);
      }
      active.position.copy(samplePos);

      const stepped = stepYawPitch(
        active.quaternion,
        desiredQuat,
        dt,
        maxYaw,
        active.quaternion,
      );
      job.lastYawRate = stepped.yawRate;

      if (job.phase === "arriving") {
        job.arriveElapsed += dt;
        const arriveBlend = MathUtils.clamp(
          1 - (job.path.totalLength - job.travelled) / WALK_ARRIVE_METERS,
          0,
          1,
        );
        active.fov = MathUtils.lerp(job.startFov, job.destFov, arriveBlend);
        active.updateProjectionMatrix();
      }

      publishDebug(job, active, {
        lookAhead,
        turnAngleDeg: ((upcoming?.angle ?? 0) * 180) / Math.PI,
        distanceToTurn: upcoming?.distance ?? remaining,
      });

      const yawSettled = Math.abs(stepped.yawError) < ALIGN_YAW_RADIANS;
      if (
        job.phase === "arriving" &&
        job.travelled >= job.path.totalLength - 1e-3 &&
        (yawSettled || job.currentSpeed < 0.12 || job.arriveElapsed > 2.2)
      ) {
        finishArrival(job, active, cameraControls);
      }
    }

    active.updateMatrixWorld();
  });

  useLayoutEffect(() => {
    function disableControls() {
      const cameraControls = isCameraControls(getThree().controls)
        ? (getThree().controls as CameraControlsImpl)
        : null;
      if (!cameraControls) return null;
      try {
        cameraControls.cancel();
      } catch {
        // Nothing to cancel.
      }
      cameraControls.enabled = false;
      return cameraControls;
    }

    function cancelMotion() {
      autoplayAbortRef.current?.abort();
      autoplayAbortRef.current = null;
      autoplayTokenRef.current += 1;
      tokenRef.current += 1;
      pausedPhaseRef.current = null;
      const job = jobRef.current;
      jobRef.current = null;
      const store = useTourStore.getState();
      if (store.tourMotionPhase !== "idle" && store.tourMotionPhase !== "error") {
        store.setTourMotionPhase("idle");
      }
      store.setTourTransitioning(false);
      if (TOUR_MOTION_DEBUG) setTourMotionDebug(null);
      if (job) job.reject(new TourMotionCancelled());
    }

    function pauseMotion() {
      const job = jobRef.current;
      if (job && isTourMotionBusy(job.phase)) {
        pausedPhaseRef.current = job.phase;
        useTourStore.getState().setTourMotionPhase("paused");
      }
    }

    function resumeMotion() {
      const job = jobRef.current;
      const restored = pausedPhaseRef.current;
      pausedPhaseRef.current = null;
      if (job && restored) {
        job.phase = restored;
        useTourStore.getState().setTourMotionPhase(restored);
        getThree().invalidate();
      }
    }

    async function walkRoute(
      route: WalkableRoute,
      direction: "forward" | "reverse",
    ) {
      const store = useTourStore.getState();
      const viewpoints = selectCurrentViewpoints(store);
      const sourceId =
        direction === "forward" ? route.fromViewpointId : route.toViewpointId;
      const destId =
        direction === "forward" ? route.toViewpointId : route.fromViewpointId;
      const source = viewpoints.find((item) => item.id === sourceId);
      const destination = viewpoints.find((item) => item.id === destId);
      if (!source || !destination) {
        store.setTourMotionPhase("error");
        store.setTourNavError(sequentialRouteError("this stop", "the next stop"));
        throw new Error("Missing viewpoints for route");
      }

      const compiled = compileWalkablePath({
        route,
        sourceViewpoint: source,
        destinationViewpoint: destination,
        direction,
        modelSize: sizeRef.current,
      });
      if (!compiled || compiled.samples.length < 2) {
        store.setTourPlayback("paused");
        store.setTourMotionPhase("error");
        store.setTourNavError(sequentialRouteError(source.name, destination.name));
        store.setTourTransitioning(false);
        throw new Error("Unusable walking path");
      }
      if (compiled.samples.some((point) => !Number.isFinite(point.x))) {
        store.setTourPlayback("paused");
        store.setTourMotionPhase("error");
        store.setTourNavError(sequentialRouteError(source.name, destination.name));
        throw new Error("Invalid walking samples");
      }

      tokenRef.current += 1;
      const token = tokenRef.current;
      const previous = jobRef.current;
      jobRef.current = null;
      previous?.reject(new TourMotionCancelled());

      const active = getThree().camera as PerspectiveCamera;
      const framed = viewpointQuaternion(destination, sizeRef.current);

      store.setTourNavError(null);
      store.setTourTransitioning(true);
      store.setTourMotionPhase("aligning");
      disableControls();
      getThree().invalidate();

      return new Promise<void>((resolve, reject) => {
        const job: WalkJob = {
          token,
          path: compiled,
          baseSpeed: clampPlaybackSpeed(route.walkingSpeed),
          currentSpeed: 0,
          maxYaw: yawSpeedForRoute(route.maxYawSpeedDeg),
          lookAheadOverride: route.lookAheadDistance,
          source,
          destination,
          routeId: route.id,
          phase: "aligning",
          travelled: 0,
          alignElapsed: 0,
          alignStartedAt: performance.now(),
          arriveElapsed: 0,
          destQuat: framed.quat,
          destPosition: framed.position,
          destFov: destination.fov,
          startFov: active.fov,
          lastYawRate: 0,
          resolve: () => {
            if (jobRef.current?.token === token) jobRef.current = null;
            resolve();
          },
          reject: (error) => {
            if (jobRef.current?.token === token) jobRef.current = null;
            reject(error);
          },
        };
        if (tokenRef.current !== token) {
          reject(new TourMotionCancelled());
          return;
        }
        jobRef.current = job;
        active.position.copy(compiled.samples[0]!);
        publishDebug(job, active, {
          lookAhead: lookAheadDistanceForSpeed(0.35, route.lookAheadDistance),
          turnAngleDeg: 0,
          distanceToTurn: compiled.totalLength,
        }, true);
      });
    }

    async function walkBetween(from: TourViewpoint, to: TourViewpoint) {
      const store = useTourStore.getState();
      const matched = compileAdjacentRoute(
        selectCurrentRoutes(store),
        from,
        to,
        sizeRef.current,
      );
      if (!matched) {
        store.setTourPlayback("paused");
        store.setTourMotionPhase("error");
        store.setTourNavError(sequentialRouteError(from.name, to.name));
        store.setTourTransitioning(false);
        throw new Error("Missing sequential route");
      }
      await walkRoute(
        matched.route,
        matched.reversed ? "reverse" : "forward",
      );
    }

    async function goToViewpoint(
      viewpointId: string,
      options?: { kind?: TourNavigationKind; fromPlayback?: boolean },
    ) {
      const store = useTourStore.getState();
      const list = selectCurrentViewpoints(store);
      const viewpoint = list.find((item) => item.id === viewpointId);
      if (!viewpoint) return;

      const fromId = store.activeTourViewpointId;
      if (fromId === viewpointId && options?.kind !== "enter") return;

      const kind: TourNavigationKind =
        options?.kind ??
        (!fromId
          ? "enter"
          : areStopsAdjacent(list, fromId, viewpointId)
            ? "adjacent"
            : "jump");

      if (kind !== "autoplay" && !options?.fromPlayback) {
        autoplayAbortRef.current?.abort();
        autoplayAbortRef.current = null;
        autoplayTokenRef.current += 1;
        store.setTourPlayback("idle");
      }

      if (kind === "enter" || kind === "jump") {
        cancelMotion();
        await getEditorCamera()?.goToTourViewpoint(viewpointId, {
          kind,
          fromPlayback: options?.fromPlayback,
        });
        return;
      }

      const from = fromId ? list.find((item) => item.id === fromId) : null;
      if (!from) {
        await getEditorCamera()?.goToTourViewpoint(viewpointId, {
          kind: "enter",
          fromPlayback: options?.fromPlayback,
        });
        return;
      }

      try {
        await walkBetween(from, viewpoint);
      } catch (error) {
        if (error instanceof TourMotionCancelled) return;
      }
    }

    async function waitDwell(signal: AbortSignal) {
      useTourStore.getState().setTourMotionPhase("dwelling");
      let remaining = CURATED_TOUR_DWELL_MS;
      let last = performance.now();
      while (remaining > 0) {
        if (signal.aborted || useTourStore.getState().isExitingTour) return;
        if (useTourStore.getState().tourPlayback === "paused") {
          last = performance.now();
          await sleep(40);
          continue;
        }
        if (useTourStore.getState().tourMotionPhase !== "dwelling") {
          useTourStore.getState().setTourMotionPhase("dwelling");
        }
        const now = performance.now();
        remaining -= now - last;
        last = now;
        await sleep(40);
      }
    }

    async function startAutoplay() {
      const store = useTourStore.getState();
      if (store.tourPlayback === "paused" && autoplayAbortRef.current) {
        store.setTourPlayback("playing");
        resumeMotion();
        return;
      }

      const viewpoints = selectCurrentViewpoints(store);
      const routes = selectCurrentRoutes(store);
      if (viewpoints.length === 0) return;

      const gaps = missingAdjacentRoutes(viewpoints, routes, sizeRef.current);
      if (gaps.length > 0) {
        store.setTourCoverageErrors(gaps);
        store.setTourPlayback("idle");
        return;
      }

      store.setTourCoverageErrors(null);
      store.setTourNavError(null);
      store.setTourPlayback("playing");

      if (store.appMode !== "tour") {
        const first = viewpoints[0]!;
        await getEditorCamera()?.enterTour(first.id, { fromPlayback: true });
      }

      const live = useTourStore.getState();
      if (live.tourPlayback !== "playing" || live.isExitingTour) return;

      autoplayAbortRef.current?.abort();
      const abort = new AbortController();
      autoplayAbortRef.current = abort;
      const token = ++autoplayTokenRef.current;
      const list = selectCurrentViewpoints(live);
      let index = Math.max(
        0,
        list.findIndex((item) => item.id === live.activeTourViewpointId),
      );
      if (index < 0) index = 0;

      try {
        let firstLeg = true;
        for (let stop = index; stop < list.length - 1; stop += 1) {
          if (abort.signal.aborted || autoplayTokenRef.current !== token) break;
          if (useTourStore.getState().tourPlayback !== "playing") {
            while (
              useTourStore.getState().tourPlayback === "paused" &&
              !abort.signal.aborted &&
              autoplayTokenRef.current === token
            ) {
              await sleep(40);
            }
            if (useTourStore.getState().tourPlayback !== "playing") break;
          }
          if (firstLeg && useTourStore.getState().tourMotionPhase === "establishing") {
            await waitEstablishing(abort.signal);
          } else {
            await waitDwell(abort.signal);
          }
          firstLeg = false;
          if (abort.signal.aborted || autoplayTokenRef.current !== token) break;
          const from = list[stop];
          const to = list[stop + 1];
          if (!from || !to) break;
          await walkBetween(from, to);
        }
      } catch (error) {
        if (!(error instanceof TourMotionCancelled)) {
          useTourStore.getState().setTourPlayback("paused");
        }
      } finally {
        if (autoplayTokenRef.current === token) {
          const next = useTourStore.getState();
          if (next.tourPlayback === "playing") next.setTourPlayback("idle");
          if (next.tourMotionPhase === "dwelling") next.setTourMotionPhase("idle");
          autoplayAbortRef.current = null;
        }
      }
    }

    async function restartAutoplay() {
      cancelMotion();
      const store = useTourStore.getState();
      const first = selectCurrentViewpoints(store)[0];
      if (!first) return;
      const gaps = missingAdjacentRoutes(
        selectCurrentViewpoints(store),
        selectCurrentRoutes(store),
        sizeRef.current,
      );
      if (gaps.length > 0) {
        store.setTourCoverageErrors(gaps);
        store.setTourPlayback("idle");
        return;
      }
      store.setTourPlayback("playing");
      if (store.appMode !== "tour") {
        await getEditorCamera()?.enterTour(first.id, { fromPlayback: true });
      } else {
        await getEditorCamera()?.goToTourViewpoint(first.id, {
          kind: "jump",
          fromPlayback: true,
        });
      }
      beginEstablishing();
      if (useTourStore.getState().tourPlayback !== "playing") return;
      await startAutoplay();
    }

    async function testRoute(
      routeId: string,
      direction: "forward" | "reverse" = "forward",
    ) {
      const store = useTourStore.getState();
      const route = selectCurrentRoutes(store).find((item) => item.id === routeId);
      if (!route) return;
      autoplayAbortRef.current?.abort();
      autoplayTokenRef.current += 1;
      store.setTourPlayback("idle");
      const fromId =
        direction === "forward" ? route.fromViewpointId : route.toViewpointId;
      if (store.appMode !== "tour") {
        await getEditorCamera()?.enterTour(fromId, { fromPlayback: true });
      } else if (store.activeTourViewpointId !== fromId) {
        await getEditorCamera()?.goToTourViewpoint(fromId, { kind: "jump" });
      }
      try {
        await walkRoute(route, direction);
      } catch (error) {
        if (error instanceof TourMotionCancelled) return;
      }
    }

    registerTourMotion({
      walkRoute,
      goToViewpoint,
      startAutoplay,
      restartAutoplay,
      testRoute,
      cancelMotion,
      pauseMotion,
      resumeMotion,
    });

    return () => {
      cancelMotion();
      registerTourMotion(null);
    };
  }, [getThree]);

  return null;
}
