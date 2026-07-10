import {
  buildActiveMagicRegions,
  buildLockedThumbIndexFilterFrame,
  isThumbIndexPinched,
  normalizeHands,
  normalizeHandsForThumbIndexFrame,
  smoothPoints
} from "./hand-geometry.js";
import {
  EFFECTS,
  createRegionEffectState,
  createRegionPickerModels,
  getEffectIndex,
  setRegionEffect
} from "./effect-selection.js";
import { createFrameModeState, updateFrameModeState } from "./frame-mode-state.js";
import { FingerMagicRenderer } from "./webgl-renderer.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MEDIAPIPE_VERSION = "0.10.35";
const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const WASM_URL = `${MEDIAPIPE_BASE}/wasm`;

// DOM
const video = document.querySelector("#camera");
const topbar = document.querySelector("#topbar");
const controls = document.querySelector("#controls");
const canvas = document.querySelector("#output");
const debugCanvas = document.querySelector("#debug-canvas");
const effectPickers = document.querySelector("#effect-pickers");
const statusEl = document.querySelector("#status");
const debugToggle = document.querySelector("#debug-toggle");

// New UI elements
const dynamicIsland = document.querySelector("#dynamic-island");
const islandEffectName = document.querySelector("#island-effect-name");
const statusLabel = document.querySelector("#status-label");
const swipeIndicator = document.querySelector("#swipe-indicator");
const swipeProgressFill = document.querySelector("#swipe-progress-fill");
const menuOverlay = document.querySelector("#menu-overlay");
const menuCloseBtn = document.querySelector("#menu-close-btn");
const filterBlocksContainer = document.querySelector("#filter-blocks");
const menuCursorEl = document.querySelector("#menu-cursor");

// Onboarding DOM
const onboardingOverlay = document.querySelector("#onboarding-overlay");
const onboardingStepContent = document.querySelector("#onboarding-step-content");
const onboardingIcon = document.querySelector("#onboarding-icon");
const onboardingTitle = document.querySelector("#onboarding-title");
const onboardingDesc = document.querySelector("#onboarding-desc");
const onboardingDots = document.querySelector("#onboarding-dots");
const onboardingNextBtn = document.querySelector("#onboarding-next");
const onboardingSkipBtn = document.querySelector("#onboarding-skip");
const helpBtn = document.querySelector("#help-btn");

// Onboarding data
const ONBOARDING_STEPS = [
  {
    icon: "👋",
    title: "欢迎使用手指魔法",
    desc: "打开摄像头，用手势实时添加漫画风、赛博朋克等 11 种特效滤镜。"
  },
  {
    icon: "🙌",
    title: "双手张开启动",
    desc: "举起双手，五指自然张开。系统会自动识别你的双手，在指缝间生成三个特效区域。"
  },
  {
    icon: "👆",
    title: "拇指-食指框住焦点",
    desc: "用拇指和食指比出「L」形框住画面中的主体，该区域会被单独锁定为特效焦点。"
  },
  {
    icon: "✌️",
    title: "捏合切换 · 上滑选色",
    desc: "拇指和食指捏合可切换当前锁定框的滤镜；从画面底部向上滑，打开菜单选择其他滤镜。"
  },
  {
    icon: "🎉",
    title: "开始玩吧！",
    desc: "三个区域各自独立，锁定框跟随你的焦点。随时点右上角「?」可以再看一遍说明。"
  }
];
let onboardingStep = 0;

function showOnboardingStep(index) {
  onboardingStep = index;
  const step = ONBOARDING_STEPS[index];
  onboardingIcon.textContent = step.icon;
  onboardingTitle.textContent = step.title;
  onboardingDesc.textContent = step.desc;

  // Update dots
  const dots = onboardingDots.querySelectorAll("span");
  dots.forEach((d, i) => d.classList.toggle("active", i === index));

  // Button text
  onboardingNextBtn.textContent = index === ONBOARDING_STEPS.length - 1 ? "开始体验" : "下一步";
  onboardingSkipBtn.textContent = index === ONBOARDING_STEPS.length - 1 ? "" : "跳过";
  onboardingSkipBtn.style.visibility = index === ONBOARDING_STEPS.length - 1 ? "hidden" : "visible";
}

function nextOnboardingStep() {
  if (onboardingStep < ONBOARDING_STEPS.length - 1) {
    showOnboardingStep(onboardingStep + 1);
  } else {
    closeOnboarding();
  }
}

function closeOnboarding() {
  onboardingOverlay.classList.add("hidden");
  helpBtn.classList.add("visible");
}

function openOnboarding() {
  onboardingOverlay.classList.remove("hidden");
  helpBtn.classList.remove("visible");
  showOnboardingStep(0);
}

function initOnboarding() {
  // Show help button after topbar fades (3s)
  setTimeout(() => helpBtn.classList.add("visible"), 3500);

  onboardingNextBtn.addEventListener("click", nextOnboardingStep);
  onboardingSkipBtn.addEventListener("click", closeOnboarding);
  helpBtn.addEventListener("click", openOnboarding);

  // Start at step 0
  showOnboardingStep(0);
}

// State
let renderer;
let handLandmarker;
let regionEffects = createRegionEffectState();
let showDebug = false;
let lastVideoTime = -1;
let latestQuads = [];
let previousRegionPoints = null;
let thumbIndexFrameLocked = false;
let frameModeState = createFrameModeState(regionEffects);

// Menu mode state
let isMenuMode = false;
let menuCursorPos = { x: 0.5, y: 0.9 };
let swipeState = { active: false, startTime: 0, startY: 0, startX: 0, inZone: false };
let lastHandsWereVisible = false;
let handsLeftTime = 0;

// Dwell selection state
let dwellState = { target: null, startTime: 0, confirmed: false, type: null };
const DWELL_DURATION = 3000; // ms

// Menu multi-select: pick up to 3 effects (region 0,1,2)
let menuSelections = []; // array of effectIds, max 3

// Island shake cooldown
let islandShakeCooldown = false;

function setStatus(message) {
  statusEl.textContent = message;
  showStatusLabel(message);
}

function showStatusLabel(msg) {
  statusLabel.textContent = msg;
  statusLabel.classList.add("visible");
  clearTimeout(statusLabel._hideTimer);
  statusLabel._hideTimer = setTimeout(() => {
    statusLabel.classList.remove("visible");
  }, 2000);
}

function getHandLabel(result, index) {
  const category = result.handedness?.[index]?.[0];
  return category?.categoryName ?? category?.displayName ?? "未知";
}

async function loadHandTracker() {
  const loadingTimeout = window.setTimeout(() => {
    setStatus("手势追踪器加载中，请确认服务器正在运行后刷新页面。");
  }, 8000);
  try {
    const vision = await import(`${MEDIAPIPE_BASE}/vision_bundle.mjs`);
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    const baseOptions = { modelAssetPath: MODEL_URL };
    const options = {
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55
    };

    try {
      return await vision.HandLandmarker.createFromOptions(filesetResolver, {
        ...options,
        baseOptions: { ...baseOptions, delegate: "GPU" }
      });
    } catch (error) {
      console.warn("GPU 手势追踪失败，回退到 CPU。", error);
      return await vision.HandLandmarker.createFromOptions(filesetResolver, {
        ...options,
        baseOptions: { ...baseOptions, delegate: "CPU" }
      });
    }
  } finally {
    window.clearTimeout(loadingTimeout);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("此浏览器不支持摄像头访问。");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  syncStageToCamera();
  window.addEventListener("resize", syncStageToCamera);
}

function syncStageToCamera() {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  debugCanvas.width = w;
  debugCanvas.height = h;
}

// ============================================================
// Menu Mode
// ============================================================

function buildFilterBlocks() {
  filterBlocksContainer.innerHTML = "";
  EFFECTS.forEach((effect, index) => {
    const block = document.createElement("div");
    block.className = "filter-block";
    block.dataset.effectId = effect.id;
    block.dataset.index = index;

    const preview = document.createElement("div");
    preview.className = "block-preview";
    preview.style.background = getEffectColor(effect.id);

    const name = document.createElement("div");
    name.className = "block-name";
    name.textContent = effect.label;

    block.append(preview, name);
    filterBlocksContainer.append(block);
  });
}

function getEffectColor(id) {
  const colors = {
    posterHeat: "linear-gradient(135deg, #ff1e1e, #00e07a)",
    noirInk: "linear-gradient(135deg, #1a1a1a, #f5f0dc)",
    mangaScreentone: "linear-gradient(135deg, #e8e4dc, #555555)",
    animeCel: "linear-gradient(135deg, #ffb6c1, #87ceeb)",
    americanPop: "linear-gradient(135deg, #ff0505, #0538ff, #ffe005)",
    webComic: "linear-gradient(135deg, #140038, #00c7ff, #ff1432)",
    risoMisprint: "linear-gradient(135deg, #ff481c, #009ead, #f5e6c4)",
    blueprintInk: "linear-gradient(135deg, #051e6b, #b8f0ff)",
    newspaperHalftone: "linear-gradient(135deg, #5c4a2e, #ebe0c8)",
    glitchPrint: "linear-gradient(135deg, #ff00ff, #00ffff, #ffff00)",
    punkAesthetic: "linear-gradient(135deg, #1a0505, #8b0000, #ffd700)"
  };
  return colors[id] || "#333";
}

function enterMenuMode() {
  if (isMenuMode) return;
  isMenuMode = true;
  menuSelections = [];
  buildFilterBlocks();
  menuOverlay.classList.add("active");
  menuCursorEl.classList.remove("hidden");
  swipeIndicator.classList.remove("visible");
  dwellState = { target: null, startTime: 0, confirmed: false, type: null };
  showStatusLabel(`菜单模式 — 悬浮 3 秒选中（0/3），叉号悬浮 3 秒关闭`);
}

function exitMenuMode() {
  if (!isMenuMode) return;
  isMenuMode = false;
  menuOverlay.classList.remove("active");
  menuCursorEl.classList.add("hidden");
  // Reset states
  swipeState = { active: false, startTime: 0, startY: 0, startX: 0, inZone: false };
  dwellState = { target: null, startTime: 0, confirmed: false, type: null };
  swipeIndicator.classList.remove("visible");
  swipeProgressFill.style.width = "0%";
}

function updateMenuCursor(hand) {
  if (!hand) return;
  const indexTip = hand.landmarks[8];
  const targetX = (1 - indexTip.x) * window.innerWidth;
  const targetY = indexTip.y * window.innerHeight;

  // Smooth lerp
  menuCursorPos.x += (targetX - menuCursorPos.x) * 0.3;
  menuCursorPos.y += (targetY - menuCursorPos.y) * 0.3;

  menuCursorEl.style.left = `${menuCursorPos.x - 8}px`;
  menuCursorEl.style.top = `${menuCursorPos.y - 8}px`;

  // Detect hover on filter blocks
  const blocks = filterBlocksContainer.querySelectorAll(".filter-block");
  let hoveredBlock = null;
  blocks.forEach(block => {
    const rect = block.getBoundingClientRect();
    const hovered = (
      menuCursorPos.x >= rect.left &&
      menuCursorPos.x <= rect.right &&
      menuCursorPos.y >= rect.top &&
      menuCursorPos.y <= rect.bottom
    );
    // Don't mark hovered if already selected (we want selected to keep its style)
    const isSelected = menuSelections.includes(block.dataset.effectId);
    block.classList.toggle("hovered", hovered && !isSelected);
    if (hovered && !isSelected) hoveredBlock = block;
  });

  // Detect hover on close button
  let hoveredClose = false;
  if (menuCloseBtn) {
    const closeRect = menuCloseBtn.getBoundingClientRect();
    hoveredClose = (
      menuCursorPos.x >= closeRect.left &&
      menuCursorPos.x <= closeRect.right &&
      menuCursorPos.y >= closeRect.top &&
      menuCursorPos.y <= closeRect.bottom
    );
    menuCloseBtn.classList.toggle("hovered", hoveredClose);
  }

  // Update dwell progress (either on filter block or close button)
  if (hoveredBlock) {
    updateDwellProgress(hoveredBlock, "filter");
  } else if (hoveredClose) {
    updateDwellProgress(menuCloseBtn, "close");
  } else {
    resetDwellProgress();
  }
}

function resetDwellProgress() {
  if (dwellState.target) {
    dwellState.target.style.setProperty("--dwell-progress", "0");
  }
  dwellState = { target: null, startTime: 0, confirmed: false, type: null };
}

function updateDwellProgress(target, type) {
  const now = performance.now();

  // Reset if different target
  if (dwellState.target && dwellState.target !== target) {
    dwellState.target.style.setProperty("--dwell-progress", "0");
    dwellState = { target, startTime: now, confirmed: false, type };
    target.style.setProperty("--dwell-progress", "0");
    return;
  }

  // New target
  if (!dwellState.target) {
    dwellState = { target, startTime: now, confirmed: false, type };
    target.style.setProperty("--dwell-progress", "0");
    return;
  }

  // Same target — update progress
  const elapsed = now - dwellState.startTime;
  const progress = Math.min(1, elapsed / DWELL_DURATION);
  dwellState.target.style.setProperty("--dwell-progress", String(progress * 100));

  // Dwell complete
  if (elapsed >= DWELL_DURATION && !dwellState.confirmed) {
    dwellState.confirmed = true;

    if (dwellState.type === "close") {
      exitMenuMode();
      return;
    }

    if (dwellState.type === "filter") {
      const effectId = dwellState.target.dataset.effectId;
      if (!effectId) return;

      // Skip if already selected
      if (menuSelections.includes(effectId)) return;

      // Add to selections
      menuSelections.push(effectId);

      // Apply to the next region
      const regionIndex = menuSelections.length - 1;
      regionEffects = setRegionEffect(regionEffects, regionIndex, effectId);

      // Visual feedback — keep selected state
      dwellState.target.classList.add("selected");
      dwellState.target.style.setProperty("--dwell-progress", "0");

      // Update selection count display
      const effectLabels = menuSelections.map(id => EFFECTS.find(e => e.id === id)?.label);
      showStatusLabel(`已选择 ${menuSelections.length}/3：${effectLabels.join("、")}`);

      // Auto-exit when 3 selected
      if (menuSelections.length >= 3) {
        updateExistingQuadEffects();
        setTimeout(() => exitMenuMode(), 600);
      }
    }
  }
}

function applyEffectById(effectId) {
  if (thumbIndexFrameLocked) {
    frameModeState = { ...frameModeState, liveEffectId: effectId };
    updateIsland();
  } else {
    regionEffects = setRegionEffect(regionEffects, 0, effectId);
    updateExistingQuadEffects();
  }

  // Visual feedback
  const blocks = filterBlocksContainer.querySelectorAll(".filter-block");
  blocks.forEach(b => b.classList.remove("selected"));
  const selected = filterBlocksContainer.querySelector(`[data-effect-id="${effectId}"]`);
  if (selected) selected.classList.add("selected");
}

function selectHoveredEffect() {
  const effectId = getHoveredEffectId();
  if (!effectId) return;
  applyEffectById(effectId);
  showStatusLabel(`已选择：${EFFECTS.find(e => e.id === effectId)?.label}`);
}

function getHoveredEffectId() {
  const blocks = filterBlocksContainer.querySelectorAll(".filter-block");
  for (const block of blocks) {
    if (block.classList.contains("hovered")) {
      return block.dataset.effectId;
    }
  }
  return null;
}

// ============================================================
// Swipe Detection
// ============================================================

function detectSwipeUp(hands) {
  if (isMenuMode) return;

  // Need exactly one hand
  if (!hands || hands.length !== 1) {
    swipeState = { active: false, startTime: 0, startY: 0, startX: 0, inZone: false };
    swipeIndicator.classList.remove("visible");
    return;
  }

  const hand = hands[0];
  const indexTip = hand.landmarks[8];
  const x = 1 - indexTip.x; // Mirror
  const y = indexTip.y;
  const now = performance.now();

  // Check if in bottom zone
  const inZone = y > 0.85;

  if (!swipeState.active) {
    if (inZone) {
      // Start tracking
      if (!swipeState.inZone) {
        swipeState.inZone = true;
        swipeState.zoneEnterTime = now;
      }
      // Require 200ms dwell before swipe starts
      if (now - swipeState.zoneEnterTime > 200) {
        swipeState.active = true;
        swipeState.startTime = now;
        swipeState.startY = y;
        swipeState.startX = x;
        swipeIndicator.classList.add("visible");
      }
    } else {
      swipeState.inZone = false;
      swipeIndicator.classList.remove("visible");
    }
    return;
  }

  // Swipe is active, track progress
  const elapsed = now - swipeState.startTime;
  const dy = swipeState.startY - y; // Positive = moved up
  const dx = Math.abs(x - swipeState.startX);

  // Progress based on vertical distance and time
  const distanceProgress = Math.min(1, dy / 0.35); // Need to move up 0.35
  const timeProgress = Math.min(1, elapsed / 400); // Need 400ms
  const progress = Math.min(distanceProgress, timeProgress);

  swipeProgressFill.style.width = `${progress * 100}%`;

  // Check if swipe completed
  if (dy > 0.35 && elapsed > 400 && dx < 0.1) {
    enterMenuMode();
    return;
  }

  // Check if swipe failed
  if (dx > 0.1 || y > swipeState.startY + 0.05 || elapsed > 2000) {
    swipeState = { active: false, startTime: 0, startY: 0, startX: 0, inZone: false };
    swipeIndicator.classList.remove("visible");
    swipeProgressFill.style.width = "0%";
  }
}

function detectMenuGestures(hands) {
  if (!isMenuMode || !hands || hands.length < 1) return;
  updateMenuCursor(hands[0]);
}

// ============================================================
// Island
// ============================================================

function updateIsland() {
  const name = EFFECTS.find(e => e.id === frameModeState.liveEffectId)?.label ?? "—";
  islandEffectName.textContent = name;
  dynamicIsland.classList.remove("hidden");

  // Shake animation with cooldown
  if (!islandShakeCooldown) {
    islandShakeCooldown = true;
    dynamicIsland.classList.remove("shaking");
    void dynamicIsland.offsetWidth;
    dynamicIsland.classList.add("shaking");
    setTimeout(() => {
      dynamicIsland.classList.remove("shaking");
      islandShakeCooldown = false;
    }, 300);
  }
}

function hideIsland() {
  dynamicIsland.classList.add("hidden");
}

// ============================================================
// Hand Detection & Quads
// ============================================================

function buildDetectedHands(result) {
  return result.landmarks.map((landmarks, index) => ({
    label: getHandLabel(result, index),
    landmarks
  }));
}

function clearTracking(message) {
  latestQuads = [];
  previousRegionPoints = null;
  thumbIndexFrameLocked = false;
  frameModeState = createFrameModeState(regionEffects);
  hideIsland();
  setStatus(message);
}

function flattenRegions(regions) {
  return Object.fromEntries(
    regions.flatMap((region) =>
      region.points.map((point, index) => [`${region.name}-${index}`, point])
    )
  );
}

function unflattenRegions(regions, points) {
  return regions.map((region) => ({
    ...region,
    points: region.points.map((point, index) => points[`${region.name}-${index}`] ?? point)
  }));
}

function updateQuads(result) {
  const hands = buildDetectedHands(result);

  // Detect hands leaving (for clearing)
  const handsVisible = hands.length >= 2;
  if (handsVisible) {
    lastHandsWereVisible = true;
    handsLeftTime = 0;
  } else if (lastHandsWereVisible && hands.length === 0) {
    // Hands just left
    handsLeftTime = performance.now();
    lastHandsWereVisible = false;
  }
  // Clear after 1s of no hands
  if (handsLeftTime > 0 && performance.now() - handsLeftTime > 1000) {
    clearTracking("双手离开，已清除效果");
    handsLeftTime = 0;
    return;
  }

  // Menu mode: skip normal tracking
  if (isMenuMode) {
    detectMenuGestures(hands);
    return;
  }

  // Swipe detection
  detectSwipeUp(hands);

  const normalized = thumbIndexFrameLocked
    ? normalizeHandsForThumbIndexFrame(hands)
    : normalizeHands(hands);

  if (normalized.status === "no-hands") {
    if (!handsLeftTime) setStatus("请伸出双手开始。");
    return;
  }

  if (normalized.status === "one-hand") {
    setStatus("检测到一只手，请伸出另一只手。");
    return;
  }

  let regions = thumbIndexFrameLocked
    ? [buildLockedThumbIndexFilterFrame(normalized.left, normalized.right)].filter(Boolean)
    : buildActiveMagicRegions(normalized.left, normalized.right);

  if (regions.length < 1) {
    setStatus("请保持拇指、食指、中指和小指指尖可见。");
    return;
  }

  if (regions[0]?.name === "thumb-index-frame") {
    thumbIndexFrameLocked = true;
  }

  const currentPoints = flattenRegions(regions);
  const smoothedPoints = smoothPoints(previousRegionPoints, currentPoints, 0.38);
  previousRegionPoints = smoothedPoints;

  const smoothedRegions = unflattenRegions(regions, smoothedPoints);
  const liveFrame = smoothedRegions.find((quad) => quad.name === "thumb-index-frame");

  if (thumbIndexFrameLocked) {
    const wasLiveEffect = frameModeState.liveEffectId;
    frameModeState = updateFrameModeState(frameModeState, {
      liveFrame,
      bothHandsPinched: isThumbIndexPinched(normalized.left) && isThumbIndexPinched(normalized.right),
      regionEffects,
      allEffectIds: EFFECTS.map((effect) => effect.id)
    });
    // Update island if effect changed
    if (wasLiveEffect !== frameModeState.liveEffectId) {
      updateIsland();
    }
  }

  const frozenQuads = frameModeState.frozenFrames.map((quad) => ({
    ...quad,
    effectIndex: getEffectIndex(quad.effectId)
  }));

  latestQuads = [
    ...frozenQuads,
    ...smoothedRegions.map((quad, index) => {
      const effectId = quad.name === "thumb-index-frame" ? frameModeState.liveEffectId : regionEffects[index];
      return {
        ...quad,
        effectId,
        effectIndex: getEffectIndex(effectId)
      };
    })
  ];

  // Update island if visible
  if (thumbIndexFrameLocked || frozenQuads.length > 0) {
    const name = EFFECTS.find(e => e.id === frameModeState.liveEffectId)?.label ?? "—";
    islandEffectName.textContent = name;
    dynamicIsland.classList.remove("hidden");
  }

  setStatus(
    liveFrame
      ? "拇指食指框已锁定，捏合切换滤镜，上滑打开菜单"
      : latestQuads.length === 1
      ? "拇指食指锁定，单区域特效生效"
      : "双手已锁定，三个 Magic 特效生效"
  );
}

function drawDebugOverlay() {
  const ctx = debugCanvas.getContext("2d");
  ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  if (!showDebug) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(39, 245, 185, 0.95)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";

  latestQuads.forEach((quad, index) => {
    const points = quad.points.map((point) => ({
      x: (1 - point.x) * debugCanvas.width,
      y: point.y * debugCanvas.height
    }));

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.stroke();

    const center = points.reduce(
      (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
      { x: 0, y: 0 }
    );

    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText(String(index + 1), center.x - 4, center.y + 5);

    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.restore();
}

function renderFrame() {
  if (video.currentTime !== lastVideoTime && handLandmarker) {
    lastVideoTime = video.currentTime;
    updateQuads(handLandmarker.detectForVideo(video, performance.now()));
  }

  renderer.render({ video, quads: latestQuads });
  drawDebugOverlay();
  requestAnimationFrame(renderFrame);
}

function updateExistingQuadEffects() {
  frameModeState = { ...frameModeState, liveEffectId: regionEffects[0] };
  latestQuads = latestQuads.map((quad, index) => {
    if (quad.name === "thumb-index-frame") {
      return {
        ...quad,
        effectId: frameModeState.liveEffectId,
        effectIndex: getEffectIndex(frameModeState.liveEffectId)
      };
    }
    if (quad.name?.startsWith("frozen-thumb-index-frame-")) return quad;
    return {
      ...quad,
      effectId: regionEffects[index],
      effectIndex: getEffectIndex(regionEffects[index])
    };
  });
}

function bindControls() {
  effectPickers.innerHTML = "";
  const selects = [];

  createRegionPickerModels(regionEffects).forEach((model) => {
    const wrapper = document.createElement("div");
    wrapper.className = "effect-picker";

    const label = document.createElement("label");
    label.htmlFor = model.id;
    label.textContent = model.label;

    const select = document.createElement("select");
    select.id = model.id;
    select.dataset.region = String(model.regionIndex);
    select.setAttribute("aria-label", `${model.label} 滤镜`);

    model.options.forEach((effect) => {
      const option = document.createElement("option");
      option.value = effect.id;
      option.textContent = effect.label;
      option.selected = effect.id === model.selectedEffectId;
      select.append(option);
    });

    select.addEventListener("change", () => {
      regionEffects = setRegionEffect(regionEffects, model.regionIndex, select.value);
      selects.forEach((item, index) => { item.value = regionEffects[index]; });
      updateExistingQuadEffects();
    });

    wrapper.append(label, select);
    effectPickers.append(wrapper);
    selects.push(select);
  });

  debugToggle.addEventListener("change", () => {
    showDebug = debugToggle.checked;
  });
}

async function main() {
  try {
    initOnboarding();
    bindControls();
    renderer = new FingerMagicRenderer(canvas);

    setStatus("正在加载 MediaPipe 手势追踪器...");
    handLandmarker = await loadHandTracker();

    setStatus("请允许摄像头权限以开始。");
    await startCamera();

    setStatus("伸出双手开始。");
    requestAnimationFrame(renderFrame);
  } catch (error) {
    console.error(error);
    latestQuads = [];

    if (String(error?.name).includes("NotAllowed")) {
      setStatus("摄像头权限被拒绝。请允许摄像头权限后刷新页面。");
      return;
    }

    setStatus(error?.message || "启动 Magic 时出错。");
  }
}

main();
