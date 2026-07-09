import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_REGION_EFFECTS,
  EFFECTS,
  REGION_LABELS,
  createRegionEffectState,
  createRegionPickerModels,
  setRegionEffect
} from "../src/effect-selection.js";

const APPROVED_EFFECTS = Object.freeze([
  { id: "posterHeat", label: "热力海报" },
  { id: "noirInk", label: "黑白墨线" },
  { id: "mangaScreentone", label: "日漫网点" },
  { id: "animeCel", label: "赛璐璐动画" },
  { id: "americanPop", label: "美式波普" },
  { id: "webComic", label: "彩色漫画" },
  { id: "risoMisprint", label: "错版孔版印刷" },
  { id: "blueprintInk", label: "蓝图线稿" },
  { id: "newspaperHalftone", label: "报纸半调" },
  { id: "glitchPrint", label: "故障印刷" }
]);

test("starts with exactly three selected effects for the three regions", () => {
  const state = createRegionEffectState();

  assert.deepEqual(DEFAULT_REGION_EFFECTS, ["webComic", "mangaScreentone", "americanPop"]);
  assert.deepEqual(state, DEFAULT_REGION_EFFECTS);
  assert.equal(state.length, 3);
  assert.equal(new Set(state).size, 3);
  assert.deepEqual(EFFECTS, APPROVED_EFFECTS);
  assert.deepEqual(REGION_LABELS, ["Thumb to Index", "Index to Middle", "Middle to Pinky"]);
});

test("creates three picker models with labels, selected effects, and full option lists", () => {
  const state = ["posterHeat", "glitchPrint", "noirInk"];

  const models = createRegionPickerModels(state);

  assert.equal(models.length, 3);
  assert.deepEqual(
    models.map((model) => model.label),
    REGION_LABELS
  );
  assert.deepEqual(
    models.map((model) => model.selectedEffectId),
    state
  );
  assert.equal(models[0].options, EFFECTS);
});

test("changes only the selected region effect", () => {
  const state = createRegionEffectState();

  const next = setRegionEffect(state, 1, "glitchPrint");

  assert.deepEqual(next, [state[0], "glitchPrint", state[2]]);
});

test("swaps duplicate selections so three regions keep different effects", () => {
  const state = createRegionEffectState();

  const next = setRegionEffect(state, 1, state[0]);

  assert.deepEqual(next, [state[1], state[0], state[2]]);
  assert.equal(new Set(next).size, 3);
});

test("rejects unknown effects and invalid region indexes", () => {
  const state = createRegionEffectState();

  assert.throws(() => setRegionEffect(state, 3, EFFECTS[0].id), /region/i);
  assert.throws(() => setRegionEffect(state, 0, "plain-filter"), /effect/i);
  assert.throws(() => setRegionEffect(state, 0, "halftonePop"), /effect/i);
  assert.throws(() => setRegionEffect(state, 0, "chromaticPunch"), /effect/i);
  assert.throws(() => setRegionEffect(state, 0, "inkBurst"), /effect/i);
  assert.throws(() => setRegionEffect(state, 0, "speedLines"), /effect/i);
});
