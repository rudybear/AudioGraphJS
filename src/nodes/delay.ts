import { GraphNodeSpec } from '../types.js';
import { applyChannelOptions } from './util.js';

export interface DelayParams {
  maxDelayTime?: number; // for node construction
  delayTime?: number; // AudioParam (seconds)
}

export function createDelay(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): DelayNode {
  const p = (spec.params || {}) as Partial<DelayParams>;
  const node = context.createDelay(p.maxDelayTime);
  if (typeof p.delayTime === 'number') { node.delayTime.setValueAtTime(p.delayTime, context.currentTime); trace?.log?.(`Delay[${spec.id}].delayTime.setValueAtTime(${p.delayTime}, ${context.currentTime})`); }
  applyChannelOptions(node, p, trace);
  return node;
}
