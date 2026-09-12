export const DAY_ENVIRONMENT = "day" as const;

export type LightingMode = typeof DAY_ENVIRONMENT;

export type DayLightingConfig = {
  environmentIntensity: number;
  backgroundIntensity: number;
  exposure: number;
  sunColor: string;
  sunIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  ambientIntensity: number;
  shadowIntensity: number;
  horizonColor: string;
};

export const DAY_LIGHTING: DayLightingConfig = {
  environmentIntensity: 0.8,
  backgroundIntensity: 0.9,
  exposure: 0.9,
  sunColor: "#fff4df",
  sunIntensity: 1.8,
  hemisphereSky: "#cfe6ff",
  hemisphereGround: "#8d7a62",
  hemisphereIntensity: 0.45,
  ambientIntensity: 0.16,
  shadowIntensity: 0.42,
  horizonColor: "#c5d4e3",
};

export const DAY_HDR_FILE = "/environments/day.hdr";

export function isLightingMode(value: unknown): value is LightingMode {
  return value === DAY_ENVIRONMENT;
}

export function coerceEnvironment(value: unknown): LightingMode {
  void value;
  return DAY_ENVIRONMENT;
}
