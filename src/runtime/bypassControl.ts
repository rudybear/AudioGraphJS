import { BuiltGraph, NodeId } from '../types.js';

export function setBypass(graph: BuiltGraph, id: NodeId, bypass: boolean, rampMs = 20) {
  const entry = graph._bypass?.get(id);
  if (!entry) throw new Error(`No bypass controls for node ${id}`);
  const { dry, wet } = entry;
  const now = graph.context.currentTime;
  const dt = Math.max(0, rampMs) / 1000;
  dry.gain.cancelScheduledValues(now);
  wet.gain.cancelScheduledValues(now);
  dry.gain.setValueAtTime(dry.gain.value, now);
  wet.gain.setValueAtTime(wet.gain.value, now);
  if (dt === 0) {
    dry.gain.setValueAtTime(bypass ? 1 : 0, now);
    wet.gain.setValueAtTime(bypass ? 0 : 1, now);
  } else {
    if (bypass) {
      dry.gain.linearRampToValueAtTime(1, now + dt);
      wet.gain.linearRampToValueAtTime(0, now + dt);
    } else {
      dry.gain.linearRampToValueAtTime(0, now + dt);
      wet.gain.linearRampToValueAtTime(1, now + dt);
    }
  }
}
