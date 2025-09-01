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
import { createWaveShaper } from '../nodes/waveShaper.js';
import type { TraceLogger } from './trace.js';

async function buildNodeAsync(context: BaseAudioContext, spec: GraphNodeSpec, trace?: TraceLogger): Promise<AudioNode> {
  if (spec.kind === 'audio-buffer-source' && spec.params && 'uri' in spec.params!) {
    trace?.log(`createBufferSource id=${spec.id} (uri)`);
    return await createAudioBufferSourceAsync(context, spec, trace);
  }
  switch (spec.kind) {
    case 'audio-buffer-source':
      trace?.log(`createBufferSource id=${spec.id}`);
      return createAudioBufferSource(context, spec, trace);
    case 'gain':
      trace?.log(`createGain id=${spec.id}`);
      return createGain(context, spec, trace);
    case 'oscillator':
      trace?.log(`createOscillator id=${spec.id}`);
      return createOscillator(context, spec, trace);
    case 'biquad-filter':
      trace?.log(`createBiquadFilter id=${spec.id}`);
      return createBiquadFilter(context, spec, trace);
    case 'delay':
      trace?.log(`createDelay id=${spec.id}`);
      return createDelay(context, spec, trace);
    case 'convolver':
      if (spec.params && 'uri' in spec.params!) {
        trace?.log(`createConvolver id=${spec.id} (uri)`);
        return await createConvolverAsync(context, spec, trace);
      }
      trace?.log(`createConvolver id=${spec.id}`);
      return createConvolver(context, spec, trace);
    case 'stereo-panner':
      trace?.log(`createStereoPanner id=${spec.id}`);
      return createStereoPanner(context, spec, trace);
    case 'panner':
      trace?.log(`createPanner id=${spec.id}`);
      return createPanner(context, spec, trace);
    case 'channel-splitter':
      trace?.log(`createChannelSplitter id=${spec.id}`);
      return createChannelSplitter(context, spec, trace);
    case 'channel-merger':
      trace?.log(`createChannelMerger id=${spec.id}`);
      return createChannelMerger(context, spec, trace);
    case 'channel-mixer':
      trace?.log(`createChannelMixer id=${spec.id}`);
      return createChannelMixer(context, spec, trace);
    case 'audio-mixer':
      trace?.log(`createAudioMixer id=${spec.id}`);
      return createAudioMixer(context, spec, trace);
    case 'wave-shaper':
      trace?.log(`createWaveShaper id=${spec.id}`);
      return createWaveShaper(context, spec, trace);
    default:
      throw new Error(`Unsupported node kind: ${spec.kind}`);
  }
}

export async function buildGraphAsync(
  context: BaseAudioContext,
  spec: GraphSpec,
  trace?: TraceLogger
): Promise<BuiltGraph> {
  const nodes = new Map<string, AudioNode>();
  for (const n of spec.nodes) {
    if (n.kind === 'emitter') {
      const chain = createEmitterChain(context, n);
      nodes.set(n.id, chain.input);
      trace?.log(`createEmitter id=${n.id} -> connect(emitter.output, destination)`);
      chain.output.connect((context as any).destination);
    } else {
      const node = await buildNodeAsync(context, n, trace);
      nodes.set(n.id, node);
    }
  }
  for (const c of spec.connections) {
    const from = nodes.get(c.from.node);
    const to = nodes.get(c.to.node);
    if (!from || !to) throw new Error(`Invalid connection: ${c.from.node} -> ${c.to.node}`);
    const outIndex = typeof c.from.output === 'number' ? c.from.output : undefined;
    const inIndex = typeof c.to.input === 'number' ? c.to.input : undefined;
    trace?.log(
      `connect ${c.from.node}${outIndex !== undefined ? `[out ${outIndex}]` : ''} -> ${c.to.node}${inIndex !== undefined ? `[in ${inIndex}]` : ''}`
    );
    if (outIndex !== undefined && inIndex !== undefined) from.connect(to, outIndex, inIndex);
    else if (outIndex !== undefined) from.connect(to, outIndex);
    else from.connect(to);
  }
  return { context, nodes };
}
