"use client";

/* Three.js camera and renderer are mutated from useFrame and pointer events. */
/* eslint-disable react-hooks/immutability */

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Euler,
  MathUtils,
  Quaternion,
  Vector3,
  type PerspectiveCamera,
} from "three";
import { getGlbRoot } from "@/components/viewer/glb-root";
import type { ModelSize } from "@/components/viewer/editor-camera";
import { TOUR_PITCH_LIMIT } from "@/types/tour";
import type {
  ExplorationPhase,
  NavigationSettings,
  StartView,
} from "@/types/exploration";
import {
  computeIntroPose,
  INTRO_DURATION,
  introPathClear,
  lookRotation,
  movementDuration,
  pickModelFloor,
  ROTATE_DURATION,
  smootherstep,
  type ModelFloorPick,
} from "@/lib/exploration";
import { ensureModelBoundsTrees } from "@/lib/model-bvh";
import {
  currentCancelToken,
  currentReturnToken,
} from "@/lib/exploration-session";
import {
  explorationIdleHint,
  getExplorationUi,
  resetExplorationUi,
  setExplorationUi,
  type ExplorationHintKind,
} from "@/lib/exploration-ui";
import { isCaptureLocked } from "@/lib/capture-lock";
import {
  createMarkerView,
  DestinationMarker,
  type MarkerView,
} from "./DestinationMarker";

const LOOK_SENSITIVITY = 0.0045;
const CLICK_PX = 5;
const CLICK_MS = 300;
/** Keep the marker visible briefly across transient non-floor samples. */
const MARKER_HOLD_MS = 80;

type PointToMoveControllerProps = {
  startView: StartView;
  navigation: NavigationSettings;
  modelSize: ModelSize | null;
  modelReady: boolean;
};

function debugEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __EXPLORE_DEBUG?: boolean }).__EXPLORE_DEBUG)
  );
}

export function PointToMoveController({
  startView,
  navigation,
  modelSize,
  modelReady,
}: PointToMoveControllerProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const phaseRef = useRef<ExplorationPhase>("loading");
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const lastReturn = useRef(currentReturnToken());
  const lastCancel = useRef(currentCancelToken());
  const touchRef = useRef(false);
  const pointerIds = useRef(new Set<number>());
  const lastPointer = useRef({ x: 0, y: 0 });
  const pointerInside = useRef(false);
  const lastHint = useRef<string | null>(null);
  const downRef = useRef<{
    x: number;
    y: number;
    time: number;
    dragging: boolean;
  } | null>(null);
  const navRef = useRef(navigation);
  const sizeRef = useRef(modelSize);
  const startRef = useRef(startView);

  // Marker is driven imperatively via a ref so pointer movement never triggers
  // a React rerender. The DestinationMarker reads this each frame.
  const markerViewRef = useRef<MarkerView>(createMarkerView());
  // Most recent floor pick under the pointer (used for click-to-move).
  const hoverPickRef = useRef<ModelFloorPick | null>(null);
  const lastFloorAt = useRef(0);
  // rAF coalescing so we run at most one pick per frame using latest coords.
  const hoverSched = useRef({ pending: false, x: 0, y: 0, raf: 0 });
  const debugLast = useRef<string>("");

  useLayoutEffect(() => {
    navRef.current = navigation;
    sizeRef.current = modelSize;
    startRef.current = startView;
  });

  const posePos = useRef(new Vector3());
  const poseQuat = useRef(new Quaternion());
  const animRef = useRef({
    elapsed: 0,
    duration: INTRO_DURATION,
    fromPos: new Vector3(),
    toPos: new Vector3(),
    fromQuat: new Quaternion(),
    toQuat: new Quaternion(),
  });
  const euler = useRef(new Euler(0, 0, 0, "YXZ"));

  function stampCamera() {
    camera.position.copy(posePos.current);
    camera.quaternion.copy(poseQuat.current);
    camera.up.set(0, 1, 0);
    camera.updateMatrixWorld();
    // CameraControls still runs an earlier useFrame and can clobber the pose
    // before R3F presents. Render the exploration camera explicitly.
    gl.render(scene, camera);
  }

  function applyStartLook(from: Vector3, to: Vector3) {
    posePos.current.copy(from);
    poseQuat.current.copy(lookRotation(from, to));
    stampCamera();
    euler.current.setFromQuaternion(poseQuat.current, "YXZ");
    yawRef.current = euler.current.y;
    pitchRef.current = euler.current.x;
  }

  function syncLookFromPose() {
    euler.current.setFromQuaternion(poseQuat.current, "YXZ");
    yawRef.current = euler.current.y;
    pitchRef.current = euler.current.x;
  }

  function setHint(hint: string | null, status: ExplorationHintKind) {
    if (lastHint.current === hint && getExplorationUi().status === status) return;
    lastHint.current = hint;
    setExplorationUi({ hint, status });
  }

  // ---- Marker helpers (imperative) ----------------------------------------

  function hideMarker() {
    markerViewRef.current.visible = false;
    hoverPickRef.current = null;
  }

  function showMarker(pick: ModelFloorPick, confirmed: boolean) {
    const view = markerViewRef.current;
    view.visible = true;
    view.point = pick.point;
    view.normal = pick.normal;
    view.kind = pick.markerKind;
    view.confirmed = confirmed;
  }

  function pickFloor(clientX: number, clientY: number): ModelFloorPick | null {
    const root = getGlbRoot();
    if (!root) return null;
    return pickModelFloor(
      camera,
      root,
      clientX,
      clientY,
      gl.domElement,
      navRef.current,
      sizeRef.current,
    );
  }

  function recordDebug(pick: ModelFloorPick | null) {
    if (!debugEnabled()) return;
    const win = window as unknown as { __exploreFloor?: unknown };
    win.__exploreFloor = pick;
    if (!pick) return;
    const key = `${pick.status}:${pick.reach}:${pick.rejection ?? ""}:${pick.objectName}`;
    if (key === debugLast.current) return;
    debugLast.current = key;
    console.debug("[explore] floor pick", {
      status: pick.status,
      object: pick.objectName,
      point: pick.point,
      normal: pick.normal,
      horizontalScore: Number(pick.horizontalScore.toFixed(3)),
      reach: pick.reach,
      marker: pick.markerKind,
      rejection: pick.rejection,
    });
  }

  function hintForPick(pick: ModelFloorPick) {
    const arrivedOnce = getExplorationUi().arrivedOnce;
    const helpOpen = getExplorationUi().helpOpen;
    if (pick.status === "floor" && pick.reach !== "reachable" && pick.message) {
      setHint(pick.message, pick.markerKind as ExplorationHintKind);
    } else if (!arrivedOnce || helpOpen) {
      setHint(explorationIdleHint(touchRef.current), "idle");
    } else {
      setHint(null, null);
    }
  }

  function runHover(clientX: number, clientY: number) {
    if (isCaptureLocked()) return;
    if (phaseRef.current !== "idle") return;
    if (downRef.current?.dragging) return;
    const pick = pickFloor(clientX, clientY);
    recordDebug(pick);
    const now = performance.now();

    if (pick && pick.status === "floor") {
      lastFloorAt.current = now;
      hoverPickRef.current = pick;
      showMarker(pick, false);
      hintForPick(pick);
      return;
    }

    // No floor under the pointer. Keep a recently-shown marker briefly to ride
    // out transient gaps between triangles, then hide it.
    hoverPickRef.current = null;
    if (
      !markerViewRef.current.confirmed &&
      now - lastFloorAt.current > MARKER_HOLD_MS
    ) {
      markerViewRef.current.visible = false;
      if (getExplorationUi().arrivedOnce && !getExplorationUi().helpOpen) {
        setHint(null, null);
      } else {
        setHint(explorationIdleHint(touchRef.current), "idle");
      }
    }
  }

  function scheduleHover(clientX: number, clientY: number) {
    const sched = hoverSched.current;
    sched.x = clientX;
    sched.y = clientY;
    if (sched.pending) return;
    sched.pending = true;
    sched.raf = window.requestAnimationFrame(() => {
      sched.pending = false;
      runHover(sched.x, sched.y);
    });
  }

  function goIdle(fromMove: boolean) {
    phaseRef.current = "idle";
    hideMarker();
    syncLookFromPose();
    const showHint = !fromMove || !getExplorationUi().arrivedOnce;
    setExplorationUi({
      fade: 0,
      status: showHint ? "idle" : null,
      hint: showHint ? explorationIdleHint(touchRef.current) : null,
      arrivedOnce: fromMove || getExplorationUi().arrivedOnce,
    });
    lastHint.current = showHint ? explorationIdleHint(touchRef.current) : null;
    // Re-evaluate the surface under the (stationary) pointer so the marker
    // reappears immediately after arriving, rotating, or a rejected click.
    if (pointerInside.current && !downRef.current) {
      scheduleHover(lastPointer.current.x, lastPointer.current.y);
    }
  }

  function beginIntro() {
    const start = startRef.current;
    const pose = computeIntroPose(start, sizeRef.current);
    camera.fov = start.fov;
    camera.updateProjectionMatrix();
    const root = getGlbRoot();
    if (root) ensureModelBoundsTrees(root);
    const canFly =
      Boolean(root) &&
      introPathClear(root!, pose.introPosition, pose.startPosition, navRef.current);
    if (!canFly) {
      setExplorationUi({ fade: 1, hint: null, status: null });
      applyStartLook(pose.startPosition, pose.startTarget);
      window.setTimeout(() => {
        setExplorationUi({ fade: 0 });
        goIdle(false);
      }, 240);
      return;
    }
    applyStartLook(pose.introPosition, pose.introTarget);
    animRef.current = {
      elapsed: 0,
      duration: INTRO_DURATION,
      fromPos: pose.introPosition.clone(),
      toPos: pose.startPosition.clone(),
      fromQuat: poseQuat.current.clone(),
      toQuat: lookRotation(pose.startPosition, pose.startTarget),
    };
    phaseRef.current = "intro";
    setExplorationUi({ fade: 0, hint: null, status: null });
  }

  function beginReturn() {
    phaseRef.current = "exiting";
    hideMarker();
    setExplorationUi({ fade: 1, hint: null, status: null });
    window.setTimeout(() => {
      const start = startRef.current;
      const pose = computeIntroPose(start, sizeRef.current);
      applyStartLook(pose.startPosition, pose.startTarget);
      camera.fov = start.fov;
      camera.updateProjectionMatrix();
      phaseRef.current = "idle";
      window.setTimeout(() => goIdle(true), 180);
    }, 220);
  }

  function beginMove(pick: ModelFloorPick) {
    phaseRef.current = "rotating";
    showMarker(pick, true);
    const to = new Vector3(...pick.destination);
    const from = posePos.current.clone();
    const travel = to.clone().sub(from);
    travel.y = 0;
    const lookTarget =
      travel.lengthSq() < 1e-6
        ? from.clone().add(new Vector3(0, 0, -1))
        : from.clone().add(travel);
    lookTarget.y = from.y;
    animRef.current = {
      elapsed: 0,
      duration: ROTATE_DURATION,
      fromPos: from,
      toPos: to,
      fromQuat: poseQuat.current.clone(),
      toQuat: lookRotation(from, lookTarget),
    };
    setHint(null, null);
  }

  useLayoutEffect(() => {
    if (!modelReady) return;
    phaseRef.current = "loading";
    resetExplorationUi(touchRef.current);
    setExplorationUi({ fade: 1, hint: null, status: null, arrivedOnce: false });
    const timeout = window.setTimeout(() => beginIntro(), 50);
    return () => window.clearTimeout(timeout);
    // Restart intro when the Start View changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelReady, startView.id]);

  useEffect(() => {
    return () => {
      phaseRef.current = "exiting";
    };
  }, []);

  // Dev-only diagnostics hook. Disabled unless window.__EXPLORE_DEBUG is set.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const win = window as unknown as {
      __explorePick?: (x: number, y: number) => ModelFloorPick | null;
    };
    win.__explorePick = (x: number, y: number) => pickFloor(x, y);
    return () => {
      delete win.__explorePick;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useEffect(() => {
    const element = gl.domElement;
    const sched = hoverSched.current;
    element.style.touchAction = "none";

    function onPointerDown(event: PointerEvent) {
      if (isCaptureLocked()) return;
      if (event.target !== element) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      touchRef.current = event.pointerType !== "mouse";
      pointerInside.current = true;
      pointerIds.current.add(event.pointerId);
      lastPointer.current = { x: event.clientX, y: event.clientY };
      if (pointerIds.current.size > 1) {
        downRef.current = null;
        return;
      }
      downRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        dragging: false,
      };
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail after a cancelled pointer.
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (isCaptureLocked()) return;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      const down = downRef.current;
      if (!down) return;
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      if (dx * dx + dy * dy > CLICK_PX * CLICK_PX) down.dragging = true;
      if (!down.dragging) return;
      const phase = phaseRef.current;
      if (phase !== "idle" && phase !== "looking") return;
      if (phase === "idle") hideMarker(); // hide hover marker while looking
      phaseRef.current = "looking";
      yawRef.current -= dx * LOOK_SENSITIVITY;
      pitchRef.current = MathUtils.clamp(
        pitchRef.current - dy * LOOK_SENSITIVITY,
        -TOUR_PITCH_LIMIT,
        TOUR_PITCH_LIMIT,
      );
      down.x = event.clientX;
      down.y = event.clientY;
      euler.current.set(pitchRef.current, yawRef.current, 0, "YXZ");
      poseQuat.current.setFromEuler(euler.current);
      stampCamera();
    }

    function onPointerUp(event: PointerEvent) {
      if (isCaptureLocked()) {
        downRef.current = null;
        pointerIds.current.clear();
        return;
      }
      pointerIds.current.delete(event.pointerId);
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      const down = downRef.current;
      downRef.current = null;
      if (phaseRef.current === "looking") {
        phaseRef.current = "idle";
        setExplorationUi({ hint: null, arrivedOnce: true });
        lastHint.current = null;
        // Restore the hover marker under the pointer after look-drag ends.
        if (pointerInside.current) {
          scheduleHover(event.clientX, event.clientY);
        }
        return;
      }
      if (!down || down.dragging) return;
      if (phaseRef.current !== "idle") return;
      if (performance.now() - down.time > CLICK_MS) return;

      // Recompute from the actual pointer-up coordinates (not stale hover).
      const pick = pickFloor(event.clientX, event.clientY);
      recordDebug(pick);
      if (!pick || pick.status !== "floor") {
        hideMarker();
        return;
      }
      if (pick.reach === "reachable") {
        beginMove(pick);
        return;
      }
      // Floor, but not reachable: keep the (red/amber) marker and explain.
      showMarker(pick, false);
      hoverPickRef.current = pick;
      lastFloorAt.current = performance.now();
      if (pick.message) setHint(pick.message, pick.markerKind as ExplorationHintKind);
    }

    function onPointerEnter() {
      pointerInside.current = true;
    }

    function onPointerLeave() {
      pointerInside.current = false;
      if (phaseRef.current === "idle" && !downRef.current) {
        hideMarker();
      }
    }

    function onHover(event: PointerEvent) {
      if (isCaptureLocked()) return;
      pointerInside.current = true;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      if (phaseRef.current !== "idle") return;
      if (downRef.current?.dragging) return;
      scheduleHover(event.clientX, event.clientY);
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
    }

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onHover);
    element.addEventListener("pointerenter", onPointerEnter);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onHover);
      element.removeEventListener("pointerenter", onPointerEnter);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.removeEventListener("wheel", onWheel);
      window.cancelAnimationFrame(sched.raf);
    };
    // Pointer handlers close over stable Three.js objects and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useFrame((_, delta) => {
    if (isCaptureLocked()) {
      hideMarker();
      stampCamera();
      return;
    }
    const dt = Math.min(delta, 0.05);
    if (currentReturnToken() !== lastReturn.current) {
      lastReturn.current = currentReturnToken();
      beginReturn();
    }
    if (currentCancelToken() !== lastCancel.current) {
      lastCancel.current = currentCancelToken();
      phaseRef.current = "exiting";
      hideMarker();
    }

    const phase = phaseRef.current;
    if (phase === "exiting" || phase === "loading") return;

    const anim = animRef.current;
    if (phase === "intro" || phase === "rotating" || phase === "moving") {
      anim.elapsed += dt;
      const t = smootherstep(anim.elapsed / Math.max(anim.duration, 0.001));
      if (phase === "rotating") {
        poseQuat.current.slerpQuaternions(anim.fromQuat, anim.toQuat, t);
        stampCamera();
        if (anim.elapsed >= anim.duration) {
          poseQuat.current.copy(anim.toQuat);
          const distance = anim.fromPos.distanceTo(anim.toPos);
          anim.elapsed = 0;
          anim.duration = movementDuration(distance, navRef.current.movementSpeed);
          anim.fromQuat.copy(poseQuat.current);
          anim.toQuat.copy(lookRotation(anim.fromPos, anim.toPos));
          phaseRef.current = "moving";
        }
      } else {
        posePos.current.lerpVectors(anim.fromPos, anim.toPos, t);
        poseQuat.current.slerpQuaternions(anim.fromQuat, anim.toQuat, t);
        stampCamera();
        if (anim.elapsed >= anim.duration) {
          posePos.current.copy(anim.toPos);
          poseQuat.current.copy(anim.toQuat);
          stampCamera();
          if (phase === "intro") {
            goIdle(false);
          } else {
            goIdle(true);
          }
        }
      }
      return;
    }

    stampCamera();
  }, 1);

  return <DestinationMarker viewRef={markerViewRef} />;
}
