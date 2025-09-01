import { GraphNodeSpec } from '../types.js';

export interface AudioMixerParams {
  // Placeholder for future per-input gains
}

export function createAudioMixer(
  context: BaseAudioContext,
  _spec: GraphNodeSpec
): GainNode {
  // A GainNode works as a summing junction when multiple sources connect to it.
  const node = context.createGain();
  node.gain.value = 1;
  return node;
}

