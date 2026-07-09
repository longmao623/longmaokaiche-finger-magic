import test from "node:test";
import assert from "node:assert/strict";

import {
  FINGERTIPS,
  buildActiveFingerPairs,
  buildActiveMagicRegions,
  buildLockedThumbIndexFilterFrame,
  buildFingerPairs,
  buildFingerQuads,
  buildMagicRegions,
  buildThumbIndexFilterFrame,
  hasThumbIndexClusterPose,
  hasThumbIndexOnlyPose,
  normalizeHandsForThumbIndexFrame,
  normalizeHands,
  smoothPoints
} from "../src/hand-geometry.js";

function makeHand(label, xOffset) {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: xOffset + index / 1000,
    y: 0.2 + index / 1000,
    z: 0
  }));

  landmarks[FINGERTIPS.thumb] = { x: xOffset + 0.01, y: 0.2, z: 0 };
  landmarks[FINGERTIPS.index] = { x: xOffset + 0.02, y: 0.3, z: 0 };
  landmarks[FINGERTIPS.middle] = { x: xOffset + 0.03, y: 0.4, z: 0 };
  landmarks[16] = { x: xOffset + 0.04, y: 0.5, z: 0 };
  landmarks[FINGERTIPS.pinky] = { x: xOffset + 0.05, y: 0.6, z: 0 };

  return { label, landmarks };
}

function makePoseHand(label, xOffset, curledNames = []) {
  const hand = makeHand(label, xOffset);
  const wrist = hand.landmarks[0];
  const joints = {
    thumb: { pip: 3, tip: FINGERTIPS.thumb },
    index: { pip: 6, tip: FINGERTIPS.index },
    middle: { pip: 10, tip: FINGERTIPS.middle },
    ring: { pip: 14, tip: 16 },
    pinky: { pip: 18, tip: FINGERTIPS.pinky }
  };

  Object.entries(joints).forEach(([name, joint]) => {
    const curled = curledNames.includes(name);
    hand.landmarks[joint.pip] = {
      x: wrist.x,
      y: wrist.y + (curled ? 0.2 : 0.08),
      z: 0
    };
    hand.landmarks[joint.tip] = {
      x: wrist.x,
      y: wrist.y + (curled ? 0.1 : 0.24),
      z: 0
    };
  });

  return hand;
}

function makeClusterPoseHands() {
  const left = makePoseHand("Left", 0.42, ["middle", "ring", "pinky"]);
  const right = makePoseHand("Right", 0.46, ["middle", "ring", "pinky"]);

  left.landmarks[FINGERTIPS.thumb] = { x: 0.45, y: 0.44, z: 0 };
  left.landmarks[FINGERTIPS.index] = { x: 0.48, y: 0.47, z: 0 };
  right.landmarks[FINGERTIPS.thumb] = { x: 0.49, y: 0.45, z: 0 };
  right.landmarks[FINGERTIPS.index] = { x: 0.51, y: 0.48, z: 0 };

  return { left, right };
}

function makePerHandPinchPoseHands() {
  const left = makePoseHand("Left", 0.2, ["middle", "ring", "pinky"]);
  const right = makePoseHand("Right", 0.7, ["middle", "ring", "pinky"]);

  left.landmarks[FINGERTIPS.thumb] = { x: 0.24, y: 0.44, z: 0 };
  left.landmarks[FINGERTIPS.index] = { x: 0.28, y: 0.47, z: 0 };
  right.landmarks[FINGERTIPS.thumb] = { x: 0.72, y: 0.43, z: 0 };
  right.landmarks[FINGERTIPS.index] = { x: 0.76, y: 0.46, z: 0 };

  return { left, right };
}

function makeLooseClusterPoseHands() {
  const left = makePoseHand("Left", 0.34, ["middle", "ring", "pinky"]);
  const right = makePoseHand("Right", 0.42, ["middle", "ring", "pinky"]);

  left.landmarks[FINGERTIPS.thumb] = { x: 0.38, y: 0.42, z: 0 };
  left.landmarks[FINGERTIPS.index] = { x: 0.45, y: 0.48, z: 0 };
  right.landmarks[FINGERTIPS.thumb] = { x: 0.5, y: 0.43, z: 0 };
  right.landmarks[FINGERTIPS.index] = { x: 0.55, y: 0.49, z: 0 };

  return { left, right };
}

test("normalizes two detected hands by handedness label", () => {
  const right = makeHand("Right", 0.7);
  const left = makeHand("Left", 0.2);

  const result = normalizeHands([right, left]);

  assert.equal(result.left, left);
  assert.equal(result.right, right);
  assert.equal(result.status, "ready");
});

test("falls back to x-position ordering when handedness labels are unclear", () => {
  const highX = makeHand("Unknown", 0.8);
  const lowX = makeHand("Unknown", 0.1);

  const result = normalizeHands([highX, lowX]);

  assert.equal(result.left, lowX);
  assert.equal(result.right, highX);
  assert.equal(result.status, "ready");
});

test("locked thumb-index frame hand ordering ignores other finger positions", () => {
  const leftThumbIndex = makeHand("Unknown", 0.2);
  const rightThumbIndex = makeHand("Unknown", 0.7);

  leftThumbIndex.landmarks.forEach((point, index) => {
    if (index !== FINGERTIPS.thumb && index !== FINGERTIPS.index) {
      point.x = 0.96;
    }
  });
  rightThumbIndex.landmarks.forEach((point, index) => {
    if (index !== FINGERTIPS.thumb && index !== FINGERTIPS.index) {
      point.x = 0.04;
    }
  });

  const normalOrdering = normalizeHands([leftThumbIndex, rightThumbIndex]);
  const lockedOrdering = normalizeHandsForThumbIndexFrame([leftThumbIndex, rightThumbIndex]);

  assert.equal(normalOrdering.left, rightThumbIndex);
  assert.equal(lockedOrdering.left, leftThumbIndex);
  assert.equal(lockedOrdering.right, rightThumbIndex);
});

test("builds four same-name cross-hand fingertip pairs and ignores ring fingers", () => {
  const left = makeHand("Left", 0.2);
  const right = makeHand("Right", 0.7);

  const pairs = buildFingerPairs(left, right);

  assert.deepEqual(
    pairs.map((pair) => pair.name),
    ["thumb", "index", "middle", "pinky"]
  );
  assert.ok(Math.abs(pairs[0].left.x - 0.21) < Number.EPSILON);
  assert.ok(Math.abs(pairs[0].right.x - 0.71) < Number.EPSILON);
  assert.equal(pairs.some((pair) => pair.name === "ring"), false);
});

test("detects thumb-index-only pose when both hands curl middle, ring, and pinky", () => {
  const left = makePoseHand("Left", 0.2, ["middle", "ring", "pinky"]);
  const right = makePoseHand("Right", 0.7, ["middle", "ring", "pinky"]);

  assert.equal(hasThumbIndexOnlyPose(left, right), true);
});

test("does not detect thumb-index-only pose when either hand keeps middle finger extended", () => {
  const left = makePoseHand("Left", 0.2, ["ring", "pinky"]);
  const right = makePoseHand("Right", 0.7, ["middle", "ring", "pinky"]);

  assert.equal(hasThumbIndexOnlyPose(left, right), false);
});

test("filters active finger pairs to thumb and index for the thumb-index-only pose", () => {
  const left = makePoseHand("Left", 0.2, ["middle", "ring", "pinky"]);
  const right = makePoseHand("Right", 0.7, ["middle", "ring", "pinky"]);

  const pairs = buildActiveFingerPairs(left, right);
  const quads = buildFingerQuads(pairs);

  assert.deepEqual(
    pairs.map((pair) => pair.name),
    ["thumb", "index"]
  );
  assert.deepEqual(
    quads.map((quad) => quad.name),
    ["thumb-index"]
  );
});

test("detects thumb-index cluster pose when four visible fingertips are tightly grouped", () => {
  const { left, right } = makeClusterPoseHands();

  assert.equal(hasThumbIndexClusterPose(left, right), true);
});

test("detects thumb-index cluster pose when each hand pinches thumb and index independently", () => {
  const { left, right } = makePerHandPinchPoseHands();

  assert.equal(hasThumbIndexClusterPose(left, right), true);
});

test("detects thumb-index cluster pose when the four visible fingertips are relatively close", () => {
  const { left, right } = makeLooseClusterPoseHands();

  assert.equal(hasThumbIndexClusterPose(left, right), true);
});

test("does not detect thumb-index cluster pose when one visible fingertip is far outside the loose cluster", () => {
  const { left, right } = makeClusterPoseHands();
  right.landmarks[FINGERTIPS.index] = { x: 0.76, y: 0.48, z: 0 };

  assert.equal(hasThumbIndexClusterPose(left, right), false);
});

test("builds a thumb-index filter frame from each hand thumb-index midpoint", () => {
  const { left, right } = makeClusterPoseHands();

  const frame = buildThumbIndexFilterFrame(left, right);

  assert.equal(frame.name, "thumb-index-frame");
  assert.deepEqual(
    frame.points.map((point) => ({
      x: Number(point.x.toFixed(3)),
      y: Number(point.y.toFixed(3)),
      z: point.z
    })),
    [
      { x: 0.465, y: 0.455, z: 0 },
      { x: 0.5, y: 0.455, z: 0 },
      { x: 0.5, y: 0.465, z: 0 },
      { x: 0.465, y: 0.465, z: 0 }
    ]
  );
});

test("builds a locked thumb-index filter frame even after other fingers extend", () => {
  const left = makePoseHand("Left", 0.2, []);
  const right = makePoseHand("Right", 0.7, []);
  left.landmarks[FINGERTIPS.thumb] = { x: 0.22, y: 0.44, z: 0 };
  left.landmarks[FINGERTIPS.index] = { x: 0.3, y: 0.48, z: 0 };
  right.landmarks[FINGERTIPS.thumb] = { x: 0.68, y: 0.43, z: 0 };
  right.landmarks[FINGERTIPS.index] = { x: 0.74, y: 0.47, z: 0 };

  const frame = buildLockedThumbIndexFilterFrame(left, right);

  assert.equal(frame.name, "thumb-index-frame");
  assert.equal(frame.points.length, 4);
});

test("builds only the thumb-index filter frame for the cluster pose", () => {
  const { left, right } = makeClusterPoseHands();

  const regions = buildActiveMagicRegions(left, right);

  assert.equal(regions.length, 1);
  assert.equal(regions[0].name, "thumb-index-frame");
});

test("keeps the existing thumb-index space when thumb and index are extended but not pinched", () => {
  const left = makePoseHand("Left", 0.2, ["middle", "ring", "pinky"]);
  const right = makePoseHand("Right", 0.7, ["middle", "ring", "pinky"]);
  left.landmarks[FINGERTIPS.thumb] = { x: 0.2, y: 0.44, z: 0 };
  left.landmarks[FINGERTIPS.index] = { x: 0.32, y: 0.44, z: 0 };
  right.landmarks[FINGERTIPS.thumb] = { x: 0.7, y: 0.44, z: 0 };
  right.landmarks[FINGERTIPS.index] = { x: 0.82, y: 0.44, z: 0 };

  const regions = buildActiveMagicRegions(left, right);

  assert.deepEqual(
    regions.map((region) => region.name),
    ["thumb-index"]
  );
});

test("builds three adjacent quadrilateral regions from four finger pairs", () => {
  const pairs = buildFingerPairs(makeHand("Left", 0.2), makeHand("Right", 0.7));

  const quads = buildFingerQuads(pairs);

  assert.equal(quads.length, 3);
  assert.deepEqual(
    quads.map((quad) => quad.name),
    ["thumb-index", "index-middle", "middle-pinky"]
  );
  assert.deepEqual(quads[0].points, [
    pairs[0].left,
    pairs[0].right,
    pairs[1].right,
    pairs[1].left
  ]);
});

test("builds the three requested magic regions directly from two hands", () => {
  const left = makeHand("Left", 0.2);
  const right = makeHand("Right", 0.7);

  const regions = buildMagicRegions(left, right);

  assert.deepEqual(
    regions.map((region) => region.name),
    ["thumb-index", "index-middle", "middle-pinky"]
  );
  assert.equal(regions.every((region) => region.points.length === 4), true);
  assert.deepEqual(regions[2].points, [
    left.landmarks[FINGERTIPS.middle],
    right.landmarks[FINGERTIPS.middle],
    right.landmarks[FINGERTIPS.pinky],
    left.landmarks[FINGERTIPS.pinky]
  ]);
});

test("smooths matching points toward the latest frame", () => {
  const previous = {
    thumb: { x: 0, y: 0 },
    index: { x: 0.5, y: 0.5 }
  };
  const next = {
    thumb: { x: 1, y: 1 },
    index: { x: 1, y: 0 }
  };

  const smoothed = smoothPoints(previous, next, 0.25);

  assert.deepEqual(smoothed.thumb, { x: 0.25, y: 0.25 });
  assert.deepEqual(smoothed.index, { x: 0.625, y: 0.375 });
});
