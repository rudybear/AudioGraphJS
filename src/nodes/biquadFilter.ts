import { GraphNodeSpec } from '../types.js';
import { applyChannelOptions } from './util.js';

export interface BiquadFilterParams {
  type?: BiquadFilterType;
  frequency?: number; // AudioParam
  detune?: number; // AudioParam
  Q?: number; // AudioParam
  gain?: number; // AudioParam
}

export function createBiquadFilter(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): BiquadFilterNode {
  const node = context.createBiquadFilter();
  const p = (spec.params || {}) as Partial<BiquadFilterParams>;

  if (p.type) { node.type = p.type; trace?.log?.(`Biquad[${spec.id}].type=${p.type}`); }
  if (typeof p.frequency === 'number') { node.frequency.setValueAtTime(p.frequency, context.currentTime); trace?.log?.(`Biquad[${spec.id}].frequency.setValueAtTime(${p.frequency}, ${context.currentTime})`); }
  if (typeof p.detune === 'number') { node.detune.setValueAtTime(p.detune, context.currentTime); trace?.log?.(`Biquad[${spec.id}].detune.setValueAtTime(${p.detune}, ${context.currentTime})`); }
  if (typeof p.Q === 'number') { node.Q.setValueAtTime(p.Q, context.currentTime); trace?.log?.(`Biquad[${spec.id}].Q.setValueAtTime(${p.Q}, ${context.currentTime})`); }
  if (typeof p.gain === 'number') { node.gain.setValueAtTime(p.gain, context.currentTime); trace?.log?.(`Biquad[${spec.id}].gain.setValueAtTime(${p.gain}, ${context.currentTime})`); }
  applyChannelOptions(node, p, trace);
  return node;
}
