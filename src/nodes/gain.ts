import { GraphNodeSpec } from '../types.js';

export interface GainParams {
  gain?: number; // AudioParam
}

export function createGain(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): GainNode {
  const node = context.createGain();
  const p = (spec.params || {}) as Partial<GainParams>;
  if (p.gain !== undefined) {
    node.gain.setValueAtTime(p.gain, context.currentTime);
    trace?.log?.(`Gain[${spec.id}].gain.setValueAtTime(${p.gain}, ${context.currentTime})`);
  }
  return node;
}
