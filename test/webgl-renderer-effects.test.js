import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rendererSource = readFileSync(new URL("../src/webgl-renderer.js", import.meta.url), "utf8");

const EXPECTED_SHADER_FUNCTIONS = Object.freeze([
  "posterHeat",
  "noirInk",
  "mangaScreentone",
  "animeCel",
  "americanPop",
  "webComic",
  "risoMisprint",
  "blueprintInk",
  "newspaperHalftone",
  "glitchPrint"
]);

test("renderer declares one shader function for each approved effect", () => {
  for (const effectName of EXPECTED_SHADER_FUNCTIONS) {
    assert.match(rendererSource, new RegExp(`vec3\\s+${effectName}\\s*\\(`));
  }
});

test("renderer maps approved effect indexes in effect-list order", () => {
  const modeBranches = [
    "u_mode == 0",
    "posterHeat(v_uv)",
    "u_mode == 1",
    "noirInk(v_uv)",
    "u_mode == 2",
    "mangaScreentone(v_uv)",
    "u_mode == 3",
    "animeCel(v_uv)",
    "u_mode == 4",
    "americanPop(v_uv)",
    "u_mode == 5",
    "webComic(v_uv)",
    "u_mode == 6",
    "risoMisprint(v_uv)",
    "u_mode == 7",
    "blueprintInk(v_uv)",
    "u_mode == 8",
    "newspaperHalftone(v_uv)",
    "glitchPrint(v_uv)"
  ];

  let previousIndex = -1;
  for (const branch of modeBranches) {
    const index = rendererSource.indexOf(branch);
    assert.notEqual(index, -1, `Missing renderer branch fragment: ${branch}`);
    assert.ok(index > previousIndex, `Renderer branch fragment out of order: ${branch}`);
    previousIndex = index;
  }
});

test("renderer no longer declares removed legacy shader functions", () => {
  for (const removedEffectName of ["halftonePop", "chromaticPunch", "inkBurst", "speedLines"]) {
    assert.doesNotMatch(rendererSource, new RegExp(`vec3\\s+${removedEffectName}\\s*\\(`));
  }
});
