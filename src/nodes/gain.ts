import { GraphNodeSpec } from '../types.js';
import { applyChannelOptions } from './util.js';

export interface GainParams {
  gain?: number; // AudioParam
  interpolation?: 'linear' | 'custom';
  duration?: number; // ms
}

export function createGain(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): GainNode {
  const node = context.createGain();
  const p = (spec.params || {}) as Partial<GainParams>;
  if (p.gain !== undefined) {
    const now = context.currentTime;
    const durSec = (p.duration ?? 0) / 1000;
    if (durSec > 0) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      if (!p.interpolation || p.interpolation === 'linear') {
        node.gain.linearRampToValueAtTime(p.gain, now + durSec);
        trace?.log?.(`Gain[${spec.id}].gain.linearRampToValueAtTime(${p.gain}, ${now + durSec})`);
      } else {
        // custom -> approximate with setTargetAtTime timeConstant
        const timeConstant = Math.max(0.001, durSec / 4);
        node.gain.setTargetAtTime(p.gain, now, timeConstant);
        trace?.log?.(`Gain[${spec.id}].gain.setTargetAtTime(${p.gain}, ${now}, tc=${timeConstant})`);
      }
    } else {
      node.gain.setValueAtTime(p.gain, now);
      trace?.log?.(`Gain[${spec.id}].gain.setValueAtTime(${p.gain}, ${now})`);
    }
  }
  applyChannelOptions(node, p, trace);
  return node;
}
