import { BuiltGraph, GraphSpec, GraphNodeSpec } from '../types.js';
import { createAudioBufferSource, createAudioBufferSourceAsync } from '../nodes/audioBufferSource.js';
import { createGain } from '../nodes/gain.js';
import { createOscillator } from '../nodes/oscillator.js';
import { createBiquadFilter } from '../nodes/biquadFilter.js';
import { createDelay } from '../nodes/delay.js';
import { createConvolver, createConvolverAsync } from '../nodes/convolver.js';
import { createStereoPanner } from '../nodes/stereoPanner.js';
import { createPanner } from '../nodes/panner.js';
import { createChannelSplitter } from '../nodes/channelSplitter.js';
import { createChannelMerger } from '../nodes/channelMerger.js';
import { createChannelMixer } from '../nodes/channelMixer.js';
import { createAudioMixer } from '../nodes/audioMixer.js';
import { createEmitterChain } from '../nodes/emitter.js';

async function buildNodeAsync(context: BaseAudioContext, spec: GraphNodeSpec): Promise<AudioNode> {
  if (spec.kind === 'audio-buffer-source' && spec.params && 'uri' in spec.params!) {
    return await createAudioBufferSourceAsync(context, spec);
  }
  switch (spec.kind) {
    case 'audio-buffer-source':
      return createAudioBufferSource(context, spec);
    case 'gain':
      return createGain(context, spec);
    case 'oscillator':
      return createOscillator(context, spec);
    case 'biquad-filter':
      return createBiquadFilter(context, spec);
    case 'delay':
      return createDelay(context, spec);
    case 'convolver':
      if (spec.params && 'uri' in spec.params!) return await createConvolverAsync(context, spec);
      return createConvolver(context, spec);
    case 'stereo-panner':
      return createStereoPanner(context, spec);
    case 'panner':
      return createPanner(context, spec);
    case 'channel-splitter':
      return createChannelSplitter(context, spec);
    case 'channel-merger':
      return createChannelMerger(context, spec);
    case 'channel-mixer':
      return createChannelMixer(context, spec);
    case 'audio-mixer':
      return createAudioMixer(context, spec);
    default:
      throw new Error(`Unsupported node kind: ${spec.kind}`);
  }
}

export async function buildGraphAsync(
  context: BaseAudioContext,
  spec: GraphSpec
): Promise<BuiltGraph> {
  const nodes = new Map<string, AudioNode>();
  for (const n of spec.nodes) {
    if (n.kind === 'emitter') {
      const chain = createEmitterChain(context, n);
      nodes.set(n.id, chain.input);
      chain.output.connect((context as any).destination);
    } else {
      const node = await buildNodeAsync(context, n);
      nodes.set(n.id, node);
    }
  }
  for (const c of spec.connections) {
    const from = nodes.get(c.from.node);
    const to = nodes.get(c.to.node);
    if (!from || !to) throw new Error(`Invalid connection: ${c.from.node} -> ${c.to.node}`);
    const outIndex = typeof c.from.output === 'number' ? c.from.output : undefined;
    const inIndex = typeof c.to.input === 'number' ? c.to.input : undefined;
    if (outIndex !== undefined && inIndex !== undefined) from.connect(to, outIndex, inIndex);
    else if (outIndex !== undefined) from.connect(to, outIndex);
    else from.connect(to);
  }
  return { context, nodes };
}
