function cloneFrame(frame) {
  return {
    ...frame,
    points: frame.points.map((point) => ({ ...point }))
  };
}

function createEffectCycle(regionEffects, allEffectIds) {
  return [...regionEffects, ...allEffectIds].filter((value, index, values) => values.indexOf(value) === index);
}

function chooseNextEffect({ frozenFrameCount, regionEffects, allEffectIds, fallbackEffectId }) {
  const cycle = createEffectCycle(regionEffects, allEffectIds);
  if (cycle.length === 0) return fallbackEffectId;
  return cycle[frozenFrameCount % cycle.length];
}

export function createFrameModeState(regionEffects) {
  return {
    frozenFrames: [],
    liveEffectId: regionEffects[0],
    wasPinched: false
  };
}

export function updateFrameModeState(state, { liveFrame, bothHandsPinched, regionEffects, allEffectIds }) {
  const next = {
    frozenFrames: state.frozenFrames,
    liveEffectId: state.liveEffectId,
    wasPinched: bothHandsPinched
  };

  if (!liveFrame || !bothHandsPinched || state.wasPinched) {
    return next;
  }

  const frozenFrames = [
    ...state.frozenFrames,
    {
      ...cloneFrame(liveFrame),
      name: `frozen-thumb-index-frame-${state.frozenFrames.length + 1}`,
      effectId: state.liveEffectId
    }
  ];

  return {
    frozenFrames,
    liveEffectId: chooseNextEffect({
      frozenFrameCount: frozenFrames.length,
      regionEffects,
      allEffectIds,
      fallbackEffectId: state.liveEffectId
    }),
    wasPinched: bothHandsPinched
  };
}
