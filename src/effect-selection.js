export const EFFECTS = Object.freeze([
  { id: "posterHeat", label: "热力海报" },
  { id: "noirInk", label: "黑白墨线" },
  { id: "mangaScreentone", label: "日漫网点" },
  { id: "animeCel", label: "赛璐璐动画" },
  { id: "americanPop", label: "美式波普" },
  { id: "webComic", label: "彩色漫画" },
  { id: "risoMisprint", label: "错版孔版印刷" },
  { id: "blueprintInk", label: "蓝图线稿" },
  { id: "newspaperHalftone", label: "报纸半调" },
  { id: "glitchPrint", label: "故障印刷" },
  { id: "punkAesthetic", label: "朋克美学" }
]);

export const DEFAULT_REGION_EFFECTS = Object.freeze([
  "webComic",
  "mangaScreentone",
  "punkAesthetic"
]);

export const REGION_LABELS = Object.freeze([
  "拇指到食指",
  "食指到中指",
  "中指到小指"
]);

export function createRegionEffectState() {
  return [...DEFAULT_REGION_EFFECTS];
}

export function getEffectIndex(effectId) {
  const index = EFFECTS.findIndex((effect) => effect.id === effectId);
  if (index === -1) {
    throw new Error(`Unknown effect: ${effectId}`);
  }
  return index;
}

export function setRegionEffect(state, regionIndex, effectId) {
  if (!Number.isInteger(regionIndex) || regionIndex < 0 || regionIndex >= 3) {
    throw new Error(`Invalid region index: ${regionIndex}`);
  }

  getEffectIndex(effectId);
  const next = [...state];
  const duplicateIndex = next.findIndex(
    (selectedEffect, index) => selectedEffect === effectId && index !== regionIndex
  );

  if (duplicateIndex !== -1) {
    next[duplicateIndex] = next[regionIndex];
  }

  next[regionIndex] = effectId;
  return next;
}

export function createRegionPickerModels(state) {
  if (!Array.isArray(state) || state.length !== REGION_LABELS.length) {
    throw new Error("Region effect state must contain exactly three effects.");
  }

  return REGION_LABELS.map((label, index) => {
    getEffectIndex(state[index]);

    return {
      id: `region-effect-${index}`,
      label,
      regionIndex: index,
      selectedEffectId: state[index],
      options: EFFECTS
    };
  });
}
