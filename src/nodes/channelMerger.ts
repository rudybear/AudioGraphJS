import { GraphNodeSpec } from '../types.js';

export interface ChannelMergerParams {
  numberOfInputs?: number; // required to define output channels
}

export function createChannelMerger(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  _trace?: { log: (s: string) => void }
): ChannelMergerNode {
  const p = (spec.params || {}) as Partial<ChannelMergerParams>;
  const count = typeof p.numberOfInputs === 'number' ? p.numberOfInputs : 2;
  const node = context.createChannelMerger(count);
  return node;
}
