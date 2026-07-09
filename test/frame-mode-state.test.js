import test from "node:test";
import assert from "node:assert/strict";

import { createFrameModeState, updateFrameModeState } from "../src/frame-mode-state.js";

const effects = ["webComic", "mangaScreentone", "americanPop", "posterHeat", "glitchPrint"];
const regionEffects = ["webComic", "mangaScreentone", "americanPop"];

function frame(name = "live-frame") {
  return {
    name,
    points: [
      { x: 0.1, y: 0.1, z: 0 },
      { x: 0.4, y: 0.1, z: 0 },
      { x: 0.4, y: 0.4, z: 0 },
      { x: 0.1, y: 0.4, z: 0 }
    ]
  };
}

test("starts with the thumb-index effect for the live frame", () => {
  const state = createFrameModeState(regionEffects);

  assert.equal(state.liveEffectId, "webComic");
  assert.deepEqual(state.frozenFrames, []);
});

test("copies the live frame once when both hands first pinch in locked frame mode", () => {
  let state = createFrameModeState(regionEffects);

  state = updateFrameModeState(state, {
    liveFrame: frame(),
    bothHandsPinched: true,
    regionEffects,
    allEffectIds: effects
  });

  assert.equal(state.frozenFrames.length, 1);
  assert.equal(state.frozenFrames[0].effectId, "webComic");
  assert.equal(state.liveEffectId, "mangaScreentone");

  state = updateFrameModeState(state, {
    liveFrame: frame("still-pinched"),
    bothHandsPinched: true,
    regionEffects,
    allEffectIds: effects
  });

  assert.equal(state.frozenFrames.length, 1);
});

test("copies again after pinch release and advances through region effects", () => {
  let state = createFrameModeState(regionEffects);

  state = updateFrameModeState(state, {
    liveFrame: frame("first"),
    bothHandsPinched: true,
    regionEffects,
    allEffectIds: effects
  });
  state = updateFrameModeState(state, {
    liveFrame: frame("released"),
    bothHandsPinched: false,
    regionEffects,
    allEffectIds: effects
  });
  state = updateFrameModeState(state, {
    liveFrame: frame("second"),
    bothHandsPinched: true,
    regionEffects,
    allEffectIds: effects
  });

  assert.deepEqual(
    state.frozenFrames.map((item) => item.effectId),
    ["webComic", "mangaScreentone"]
  );
  assert.equal(state.liveEffectId, "americanPop");
});

test("after region effects are used, live frame switches to the first unused selectable effect", () => {
  let state = createFrameModeState(regionEffects);

  for (const name of ["first", "second", "third"]) {
    state = updateFrameModeState(state, {
      liveFrame: frame(name),
      bothHandsPinched: true,
      regionEffects,
      allEffectIds: effects
    });
    state = updateFrameModeState(state, {
      liveFrame: frame(`${name}-released`),
      bothHandsPinched: false,
      regionEffects,
      allEffectIds: effects
    });
  }

  assert.deepEqual(
    state.frozenFrames.map((item) => item.effectId),
    ["webComic", "mangaScreentone", "americanPop"]
  );
  assert.equal(state.liveEffectId, "posterHeat");
});

test("copied frames have no limit and live effect cycles through all selectable effects", () => {
  let state = createFrameModeState(regionEffects);
  const copyCount = effects.length * 2 + 3;

  for (let index = 0; index < copyCount; index += 1) {
    state = updateFrameModeState(state, {
      liveFrame: frame(`copy-${index + 1}`),
      bothHandsPinched: true,
      regionEffects,
      allEffectIds: effects
    });
    state = updateFrameModeState(state, {
      liveFrame: frame(`release-${index + 1}`),
      bothHandsPinched: false,
      regionEffects,
      allEffectIds: effects
    });
  }

  assert.equal(state.frozenFrames.length, copyCount);
  assert.deepEqual(
    state.frozenFrames.map((item) => item.effectId),
    Array.from({ length: copyCount }, (_, index) => effects[index % effects.length])
  );
  assert.equal(state.liveEffectId, effects[copyCount % effects.length]);
});
