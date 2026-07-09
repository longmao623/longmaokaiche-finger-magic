export const FINGERTIPS = Object.freeze({
  thumb: 4,
  index: 8,
  middle: 12,
  pinky: 20
});

export const FINGER_NAMES = Object.freeze(Object.keys(FINGERTIPS));
const THUMB_INDEX_ONLY_NAMES = Object.freeze(["thumb", "index"]);
const THUMB_INDEX_PINCH_THRESHOLD = 0.075;
const THUMB_INDEX_LOOSE_CLUSTER_SPAN = 0.2;
const EXTENSION_JOINTS = Object.freeze({
  thumb: { pip: 3, tip: 4 },
  index: { pip: 6, tip: 8 },
  middle: { pip: 10, tip: 12 },
  ring: { pip: 14, tip: 16 },
  pinky: { pip: 18, tip: 20 }
});

export const REGION_NAMES = Object.freeze([
  "thumb-index",
  "index-middle",
  "middle-pinky"
]);

function centerX(hand) {
  if (!hand?.landmarks?.length) return 0;
  return hand.landmarks.reduce((sum, point) => sum + point.x, 0) / hand.landmarks.length;
}

function thumbIndexCenterX(hand) {
  const thumb = hand?.landmarks?.[FINGERTIPS.thumb];
  const index = hand?.landmarks?.[FINGERTIPS.index];
  if (!thumb || !index) return centerX(hand);
  return (thumb.x + index.x) / 2;
}

function normalizeLabel(hand) {
  return String(hand?.label ?? "").toLowerCase();
}

function normalizeHandsByCenter(hands, getCenterX) {
  if (!Array.isArray(hands) || hands.length < 2) {
    return {
      left: null,
      right: null,
      status: hands?.length === 1 ? "one-hand" : "no-hands"
    };
  }

  const candidates = hands.slice(0, 2);
  const labeledLeft = candidates.find((hand) => normalizeLabel(hand) === "left");
  const labeledRight = candidates.find((hand) => normalizeLabel(hand) === "right");

  if (labeledLeft && labeledRight && labeledLeft !== labeledRight) {
    return { left: labeledLeft, right: labeledRight, status: "ready" };
  }

  const sorted = candidates.slice().sort((a, b) => getCenterX(a) - getCenterX(b));
  return { left: sorted[0], right: sorted[1], status: "ready" };
}

export function normalizeHands(hands) {
  return normalizeHandsByCenter(hands, centerX);
}

export function normalizeHandsForThumbIndexFrame(hands) {
  if (!Array.isArray(hands) || hands.length < 2) {
    return normalizeHandsByCenter(hands, thumbIndexCenterX);
  }

  const candidates = hands.slice(0, 2);
  const labeledLeft = candidates.find((hand) => normalizeLabel(hand) === "left");
  const labeledRight = candidates.find((hand) => normalizeLabel(hand) === "right");

  if (labeledLeft && labeledRight && labeledLeft !== labeledRight) {
    return { left: labeledLeft, right: labeledRight, status: "ready" };
  }

  const sorted = candidates.slice().sort((a, b) => thumbIndexCenterX(a) - thumbIndexCenterX(b));
  return { left: sorted[0], right: sorted[1], status: "ready" };
}

export function buildFingerPairs(leftHand, rightHand) {
  if (!leftHand?.landmarks || !rightHand?.landmarks) return [];

  return FINGER_NAMES.flatMap((name) => {
    const index = FINGERTIPS[name];
    const left = leftHand.landmarks[index];
    const right = rightHand.landmarks[index];

    if (!left || !right) return [];
    return [{ name, left, right }];
  });
}

function distanceSquared(a, b) {
  if (!a || !b) return 0;
  const zDelta = (a.z ?? 0) - (b.z ?? 0);
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + zDelta ** 2;
}

function distance2d(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerExtended(hand, name) {
  const joints = EXTENSION_JOINTS[name];
  const wrist = hand?.landmarks?.[0];
  const pip = hand?.landmarks?.[joints?.pip];
  const tip = hand?.landmarks?.[joints?.tip];

  return distanceSquared(wrist, tip) > distanceSquared(wrist, pip);
}

function hasThumbIndexOnlyPoseForHand(hand) {
  return (
    isFingerExtended(hand, "thumb") &&
    isFingerExtended(hand, "index") &&
    !isFingerExtended(hand, "middle") &&
    !isFingerExtended(hand, "ring") &&
    !isFingerExtended(hand, "pinky")
  );
}

export function hasThumbIndexOnlyPose(leftHand, rightHand) {
  return hasThumbIndexOnlyPoseForHand(leftHand) && hasThumbIndexOnlyPoseForHand(rightHand);
}

export function isThumbIndexPinched(hand, threshold = THUMB_INDEX_PINCH_THRESHOLD) {
  const thumb = hand?.landmarks?.[FINGERTIPS.thumb];
  const index = hand?.landmarks?.[FINGERTIPS.index];
  return distance2d(thumb, index) <= threshold;
}

function thumbIndexTips(leftHand, rightHand) {
  return [
    leftHand?.landmarks?.[FINGERTIPS.thumb],
    leftHand?.landmarks?.[FINGERTIPS.index],
    rightHand?.landmarks?.[FINGERTIPS.thumb],
    rightHand?.landmarks?.[FINGERTIPS.index]
  ];
}

function areTipsRelativelyClose(points, maxSpan = THUMB_INDEX_LOOSE_CLUSTER_SPAN) {
  if (points.some((point) => !point)) return false;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return Math.max(...xs) - Math.min(...xs) <= maxSpan && Math.max(...ys) - Math.min(...ys) <= maxSpan;
}

export function hasThumbIndexClusterPose(leftHand, rightHand) {
  if (!hasThumbIndexOnlyPose(leftHand, rightHand)) return false;

  return (
    (isThumbIndexPinched(leftHand) && isThumbIndexPinched(rightHand)) ||
    areTipsRelativelyClose(thumbIndexTips(leftHand, rightHand))
  );
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2
  };
}

export function buildThumbIndexFilterFrame(leftHand, rightHand) {
  const leftThumb = leftHand?.landmarks?.[FINGERTIPS.thumb];
  const leftIndex = leftHand?.landmarks?.[FINGERTIPS.index];
  const rightThumb = rightHand?.landmarks?.[FINGERTIPS.thumb];
  const rightIndex = rightHand?.landmarks?.[FINGERTIPS.index];

  if (!leftThumb || !leftIndex || !rightThumb || !rightIndex) return null;

  const leftMidpoint = midpoint(leftThumb, leftIndex);
  const rightMidpoint = midpoint(rightThumb, rightIndex);

  return {
    name: "thumb-index-frame",
    points: [
      leftMidpoint,
      { x: rightMidpoint.x, y: leftMidpoint.y, z: (leftMidpoint.z + rightMidpoint.z) / 2 },
      rightMidpoint,
      { x: leftMidpoint.x, y: rightMidpoint.y, z: (leftMidpoint.z + rightMidpoint.z) / 2 }
    ]
  };
}

export function buildLockedThumbIndexFilterFrame(leftHand, rightHand) {
  return buildThumbIndexFilterFrame(leftHand, rightHand);
}

export function buildActiveFingerPairs(leftHand, rightHand) {
  const pairs = buildFingerPairs(leftHand, rightHand);
  if (!hasThumbIndexOnlyPose(leftHand, rightHand)) return pairs;

  return pairs.filter((pair) => THUMB_INDEX_ONLY_NAMES.includes(pair.name));
}

export function buildActiveMagicRegions(leftHand, rightHand) {
  if (hasThumbIndexClusterPose(leftHand, rightHand)) {
    return [buildThumbIndexFilterFrame(leftHand, rightHand)].filter(Boolean);
  }

  return buildFingerQuads(buildActiveFingerPairs(leftHand, rightHand));
}

export function buildFingerQuads(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) return [];

  return pairs.slice(0, -1).map((startPair, index) => {
    const endPair = pairs[index + 1];

    return {
      name: `${startPair.name}-${endPair.name}`,
      points: [
        startPair.left,
        startPair.right,
        endPair.right,
        endPair.left
      ]
    };
  });
}

export function buildMagicRegions(leftHand, rightHand) {
  return buildFingerQuads(buildFingerPairs(leftHand, rightHand));
}

export function smoothPoints(previous, next, amount = 0.35) {
  if (!previous) return next;

  return Object.fromEntries(
    Object.entries(next).map(([key, point]) => {
      const oldPoint = previous[key];
      if (!oldPoint) return [key, point];

      const smoothedPoint = {
        ...point,
        x: oldPoint.x + (point.x - oldPoint.x) * amount,
        y: oldPoint.y + (point.y - oldPoint.y) * amount
      };

      if (typeof oldPoint.z === "number" && typeof point.z === "number") {
        smoothedPoint.z = oldPoint.z + (point.z - oldPoint.z) * amount;
      }

      return [key, smoothedPoint];
    })
  );
}

export function flattenPairs(pairs) {
  return Object.fromEntries(
    pairs.flatMap((pair) => [
      [`${pair.name}Left`, pair.left],
      [`${pair.name}Right`, pair.right]
    ])
  );
}

export function unflattenPairs(pairs, points) {
  return pairs.map((pair) => ({
    name: pair.name,
    left: points[`${pair.name}Left`] ?? pair.left,
    right: points[`${pair.name}Right`] ?? pair.right
  }));
}
