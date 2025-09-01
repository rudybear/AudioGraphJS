import { GraphNodeSpec } from '../types.js';

export interface BiquadFilterParams {
  type?: BiquadFilterType;
  frequency?: number; // AudioParam
  detune?: number; // AudioParam
  Q?: number; // AudioParam
  gain?: number; // AudioParam
}

export function createBiquadFilter(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): BiquadFilterNode {
  const node = context.createBiquadFilter();
  const p = (spec.params || {}) as Partial<BiquadFilterParams>;

  if (p.type) node.type = p.type;
  if (typeof p.frequency === 'number') node.frequency.setValueAtTime(p.frequency, context.currentTime);
  if (typeof p.detune === 'number') node.detune.setValueAtTime(p.detune, context.currentTime);
  if (typeof p.Q === 'number') node.Q.setValueAtTime(p.Q, context.currentTime);
  if (typeof p.gain === 'number') node.gain.setValueAtTime(p.gain, context.currentTime);
  return node;
}
