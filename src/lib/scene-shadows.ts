export function shouldEnableShadows(stats: {
  meshCount: number;
  drawCallCount?: number;
} | null) {
  if (!stats) return true;
  const draws = stats.drawCallCount ?? stats.meshCount;
  return draws <= 250;
}
