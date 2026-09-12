// @ts-nocheck — paused walkable-route editor
import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from "three";
import {
  MAX_WALK_PITCH,
  MAXIMUM_PITCH_SPEED,
  MIN_TURN_SPEED,
  TIGHT_TURN_RADIANS,
  type UpcomingTurnInfo,
} from "@/types/tour-motion";
import {
  MAX_LOOKAHEAD,
  MIN_LOOKAHEAD,
  clampYawSpeedDeg,
} from "@/types/route";

const dummy = new Object3D();
const euler = new Euler(0, 0, 0, "YXZ");
const desiredEuler = new Euler(0, 0, 0, "YXZ");

export function lookAheadDistanceForSpeed(
  speed: number,
  override: number | undefined,
) {
  if (override && override > 0) {
    return MathUtils.clamp(override, MIN_LOOKAHEAD, MAX_LOOKAHEAD);
  }
  return MathUtils.clamp(speed * 1.2, MIN_LOOKAHEAD, MAX_LOOKAHEAD);
}

export function yawSpeedForRoute(maxYawSpeedDeg: number | undefined) {
  const deg = clampYawSpeedDeg(maxYawSpeedDeg);
  return (deg * Math.PI) / 180;
}

export function targetSpeedForTurn(
  baseSpeed: number,
  upcoming: UpcomingTurnInfo | null,
  remaining: number,
) {
  let target = baseSpeed;
  if (remaining < 1.25) {
    target = Math.min(target, MathUtils.lerp(0.22, baseSpeed, remaining / 1.25));
  }
  if (!upcoming) return Math.max(MIN_TURN_SPEED, target);
  const distance = Math.max(0, upcoming.distance);
  const influence = MathUtils.clamp(1 - distance / 2.4, 0, 1);
  const abs = Math.abs(upcoming.angle);
  let scale = 1;
  if (abs > TIGHT_TURN_RADIANS) scale = 0.22;
  else if (abs > (70 * Math.PI) / 180) scale = 0.38;
  else if (abs > (45 * Math.PI) / 180) scale = 0.58;
  else if (abs > (30 * Math.PI) / 180) scale = 0.82;
  const slowed = MathUtils.lerp(baseSpeed, baseSpeed * scale, influence);
  return Math.max(abs > TIGHT_TURN_RADIANS ? 0.12 : MIN_TURN_SPEED, Math.min(target, slowed));
}

export function lookRotationFromDirection(
  origin: Vector3,
  direction: Vector3,
  flattenPitch: boolean,
  out: Quaternion,
) {
  dummy.position.copy(origin);
  dummy.up.set(0, 1, 0);
  dummy.lookAt(origin.x + direction.x, origin.y + direction.y, origin.z + direction.z);
  dummy.updateMatrixWorld();
  out.copy(dummy.quaternion);
  euler.setFromQuaternion(out, "YXZ");
  euler.z = 0;
  if (flattenPitch) euler.x *= 0.28;
  euler.x = Math.max(-MAX_WALK_PITCH, Math.min(MAX_WALK_PITCH, euler.x));
  out.setFromEuler(euler);
  return out;
}

export function stepYawPitch(
  current: Quaternion,
  desired: Quaternion,
  dt: number,
  maxYaw: number,
  out: Quaternion,
) {
  euler.setFromQuaternion(current, "YXZ");
  desiredEuler.setFromQuaternion(desired, "YXZ");
  let yawDelta = desiredEuler.y - euler.y;
  while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  const yawStep = MathUtils.clamp(yawDelta, -maxYaw * dt, maxYaw * dt);
  const pitchDelta = desiredEuler.x - euler.x;
  const pitchStep = MathUtils.clamp(
    pitchDelta,
    -MAXIMUM_PITCH_SPEED * dt,
    MAXIMUM_PITCH_SPEED * dt,
  );
  euler.y += yawStep;
  euler.x += pitchStep;
  euler.z = 0;
  out.setFromEuler(euler);
  return { yawRate: dt > 1e-5 ? yawStep / dt : 0, yawError: yawDelta };
}

const fallbackForward = new Vector3(0, 0, -1);

export function averageFutureDirection(
  tangents: Vector3[],
  target: Vector3,
) {
  target.set(0, 0, 0);
  for (const tangent of tangents) target.add(tangent);
  if (target.lengthSq() < 1e-8) {
    target.copy(tangents[0] ?? fallbackForward);
  }
  return target.normalize();
}

export function signedPlanarTurn(current: Vector3, future: Vector3) {
  return Math.atan2(
    current.x * future.z - current.z * future.x,
    current.x * future.x + current.z * future.z,
  );
}

export function isTightUpcomingTurn(upcoming: UpcomingTurnInfo | null) {
  if (!upcoming) return false;
  return (
    upcoming.angle > TIGHT_TURN_RADIANS &&
    upcoming.distance < 0.55 &&
    upcoming.distance > -0.08
  );
}
