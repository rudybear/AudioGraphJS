import { GraphNodeSpec } from '../types.js';

export interface ChannelMixerParams {
  outputChannels?: number; // target channel count
  channelInterpretation?: 'speakers' | 'discrete';
}

export function createChannelMixer(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): GainNode {
  // Implements mixing via Web Audio channel mixing rules by configuring input node properties.
  const node = context.createGain();
  const p = (spec.params || {}) as Partial<ChannelMixerParams>;
  if (typeof p.outputChannels === 'number') {
    try {
      (node as any).channelCountMode = 'explicit';
      (node as any).channelCount = p.outputChannels;
    } catch {
      // ignore if backend does not support
    }
  }
  if (p.channelInterpretation) {
    try {
      (node as any).channelInterpretation = p.channelInterpretation;
    } catch {}
  }
  return node;
}

