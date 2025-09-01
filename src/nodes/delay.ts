import { GraphNodeSpec } from '../types.js';

export interface DelayParams {
  maxDelayTime?: number; // for node construction
  delayTime?: number; // AudioParam (seconds)
}

export function createDelay(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): DelayNode {
  const p = (spec.params || {}) as Partial<DelayParams>;
  const node = context.createDelay(p.maxDelayTime);
  if (typeof p.delayTime === 'number') node.delayTime.setValueAtTime(p.delayTime, context.currentTime);
  return node;
}
