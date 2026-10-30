import {
  COLOR_PRESETS,
  upsertColorOverride,
  type ModelColorOverride,
  type ModelColorTarget,
} from "@/lib/model-colors";

export const MAX_CONFIGURABLES = 24;
export const MAX_CONFIGURABLE_PARTS = 60;
export const MAX_CONFIGURABLE_COLORS = 12;

export type ConfigurablePart = {
  target: ModelColorTarget;
  key: string;
};

/**
 * Something visitors can recolor on the public tour, such as a sofa. It is
 * one or more parts of the model plus the colors visitors may choose from.
 * The anchor is in glb-root local space, where the marker is drawn.
 */
export type ConfigurableItem = {
  id: string;
  name: string;
  anchor: [number, number, number];
  parts: ConfigurablePart[];
  colors: string[];
};

export const DEFAULT_CONFIGURABLE_COLORS = COLOR_PRESETS.map(
  (preset) => preset.color,
);

export function createConfigurableId() {
  return `cfg_${Math.random().toString(36).slice(2, 10)}`;
}

export function nextConfigurableName(items: readonly ConfigurableItem[]) {
  return `Item ${items.length + 1}`;
}

export function addConfigurablePart(
  item: ConfigurableItem,
  part: ConfigurablePart,
): ConfigurableItem {
  if (item.parts.some((p) => p.target === part.target && p.key === part.key)) {
    return item;
  }
  return {
    ...item,
    parts: [...item.parts, part].slice(0, MAX_CONFIGURABLE_PARTS),
  };
}

/**
 * Published colors with each visitor choice layered on top. A missing choice
 * keeps whatever the editor published for those parts.
 */
export function mergeConfiguratorChoices(
  base: readonly ModelColorOverride[] | undefined,
  items: readonly ConfigurableItem[] | undefined,
  choices: Readonly<Record<string, string>>,
): readonly ModelColorOverride[] {
  let merged: readonly ModelColorOverride[] = base ?? [];
  for (const item of items ?? []) {
    const color = choices[item.id];
    if (!color) continue;
    for (const part of item.parts) {
      merged = upsertColorOverride(merged, { ...part, color });
    }
  }
  return merged;
}
