import { GraphNodeSpec } from '../types.js';

export interface ChannelSplitterParams {
  numberOfOutputs?: number; // defaults to input channel count
}

export function createChannelSplitter(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): ChannelSplitterNode {
  const p = (spec.params || {}) as Partial<ChannelSplitterParams>;
  const count = typeof p.numberOfOutputs === 'number' ? p.numberOfOutputs : undefined;
  // In Web Audio, numberOfOutputs must be provided at construction if desired
  const node = context.createChannelSplitter(count ?? 6); // defaulting to 6 to cover 5.1; engine will clamp
  return node;
}

