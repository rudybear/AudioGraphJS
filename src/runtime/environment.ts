import type { Environment, BuiltGraph, KHRAudioEmitterExtension } from '../types.js';
import type { TraceLogger } from './trace.js';
import { resolveReverbParams } from './spatial.js';

export interface ReverbBus {
  input: AudioNode;
  output: AudioNode;
}

/**
 * Per-emitter routing into the environment (spec 3.1). `node` is the emitter's
 * output endpoint; it gets rewired as: node → directGain → destination and
 * node → sendGain → reverb bus.
 */
export interface EmitterSendSpec {
  node: AudioNode;
  directLevel: number;
  reverbLevel: number;
  label?: string;
}

export interface ApplyEnvironmentOptions {
  sends?: EmitterSendSpec[];
  /** Final mix target; defaults to context.destination (or the listener bus). */
  destination?: AudioNode;
}

/**
 * Synthesize a stereo impulse response from resolved parametric reverb values:
 * sparse early-reflection taps after reflectionsDelay, then an exponentially
 * decaying noise tail (RT60 = decayTime) low-passed per decayHFRatio.
 */
export function generateReverbImpulse(
  context: BaseAudioContext,
  params: {
    decayTime: number;
    decayHFRatio: number;
    reflectionsGain: number;
    reflectionsDelay: number;
    reverbGain: number;
    reverbDelay: number;
    diffusion: number;
    density: number;
  },
): AudioBuffer {
  const rate = (context as { sampleRate?: number }).sampleRate ?? 48000;
  const tailStart = params.reflectionsDelay + params.reverbDelay;
  const length = Math.max(Math.floor(rate * 0.05), Math.floor(rate * (tailStart + params.decayTime)));
  const buffer: AudioBuffer = (context as any).createBuffer(2, length, rate);
  const decayRate = 6.908 / Math.max(params.decayTime, 0.05); // -60 dB over decayTime
  const cutoff = Math.min(Math.max(20000 * params.decayHFRatio, 200), rate * 0.45);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
  const occupancy = 0.3 + 0.7 * params.density;

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const tapCount = 6;
    for (let k = 0; k < tapCount; k += 1) {
      const at = Math.floor(rate * (params.reflectionsDelay + k * 0.0063 * (1 + channel * 0.17)));
      if (at < length) {
        const polarity = (k + channel) % 2 === 0 ? 1 : -1;
        data[at] += polarity * params.reflectionsGain * 0.7 * (1 - k / tapCount);
      }
    }
    let lowpassState = 0;
    const start = Math.floor(rate * tailStart);
    for (let i = start; i < length; i += 1) {
      const t = (i - start) / rate;
      if (Math.random() > occupancy) continue;
      const white = Math.random() * 2 - 1;
      lowpassState += alpha * (white - lowpassState);
      data[i] += lowpassState * Math.exp(-t * decayRate) * params.reverbGain;
    }
  }
  return buffer;
}

/**
 * Build one shared reverb bus for an environment (spec 2.4).
 * Parametric mode synthesizes an impulse response from the I3DL2-aligned
 * parameters and renders it through a ConvolverNode — the spec's sanctioned
 * realization, unconditionally stable (no feedback topology).
 */
export async function createReverbBus(
  context: BaseAudioContext,
  environment: Environment,
  audioEmitter?: KHRAudioEmitterExtension,
  loadBuffer?: (uri: string, ctx: BaseAudioContext) => Promise<AudioBuffer>,
  trace?: TraceLogger,
): Promise<ReverbBus> {
  const ctx = context as any;
  const reverb = environment.reverb;
  const params = resolveReverbParams(reverb);
  const input: GainNode = ctx.createGain();
  const output: GainNode = ctx.createGain();

  if (reverb?.type === 'impulseResponse' && typeof reverb.audio === 'number' && audioEmitter) {
    const convolver: ConvolverNode = ctx.createConvolver();
    if (typeof reverb.normalize === 'boolean') convolver.normalize = reverb.normalize;
    const audioData = audioEmitter.audio[reverb.audio];
    if (audioData?.uri && loadBuffer) {
      convolver.buffer = await loadBuffer(audioData.uri, context);
      trace?.log?.(`reverbBus: loaded IR from audio[${reverb.audio}]`);
    }
    input.connect(convolver);
    convolver.connect(output);
    trace?.log?.(`reverbBus: impulseResponse normalize=${convolver.normalize ?? true}`);
    return { input, output };
  }

  // Parametric: generated IR + convolution.
  const convolver: ConvolverNode = ctx.createConvolver();
  convolver.buffer = generateReverbImpulse(context, params);
  input.connect(convolver);
  convolver.connect(output);

  trace?.log?.(
    `reverbBus: parametric preset=${reverb?.preset ?? 'none'} decayTime=${params.decayTime} ` +
    `decayHFRatio=${params.decayHFRatio} reflectionsDelay=${params.reflectionsDelay} reverbDelay=${params.reverbDelay} (generated IR)`,
  );
  return { input, output };
}

/**
 * Apply an environment to a built graph.
 *
 * With `options.sends` (spec 3.1 model): each emitter output is rewired into a
 * direct path (directLevel) plus a send into the shared reverb bus
 * (reverbLevel); the bus returns at the environment's `mix` level.
 *
 * Without sends (legacy fallback): the bus and mix gains are created and
 * stashed on the built graph for callers that wire manually.
 */
export async function applyEnvironment(
  context: BaseAudioContext,
  environment: Environment,
  builtGraph: BuiltGraph,
  audioEmitter?: KHRAudioEmitterExtension,
  loadBuffer?: (uri: string, ctx: BaseAudioContext) => Promise<AudioBuffer>,
  trace?: TraceLogger,
  options?: ApplyEnvironmentOptions,
): Promise<void> {
  const reverb = environment.reverb;
  if (!reverb) {
    trace?.log?.(`applyEnvironment: no reverb configured`);
    return;
  }

  const ctx = context as any;
  const params = resolveReverbParams(reverb);
  const destination: AudioNode = options?.destination ?? ctx.destination;
  trace?.log?.(`applyEnvironment type=${reverb.type ?? 'parametric'} mix=${params.mix}`);

  const bus = await createReverbBus(context, environment, audioEmitter, loadBuffer, trace);
  const mixGain: GainNode = ctx.createGain();
  mixGain.gain.value = params.mix;
  bus.output.connect(mixGain);
  mixGain.connect(destination);

  const sendNodes: { direct: GainNode; send: GainNode }[] = [];
  if (options?.sends && options.sends.length > 0) {
    for (const send of options.sends) {
      try { (send.node as any).disconnect?.(); } catch { /* not connected yet */ }
      const direct: GainNode = ctx.createGain();
      direct.gain.value = send.directLevel;
      const sendGain: GainNode = ctx.createGain();
      sendGain.gain.value = send.reverbLevel;
      send.node.connect(direct);
      direct.connect(destination);
      send.node.connect(sendGain);
      sendGain.connect(bus.input);
      sendNodes.push({ direct, send: sendGain });
      trace?.log?.(
        `environment send${send.label ? ` [${send.label}]` : ''}: direct=${send.directLevel} reverb=${send.reverbLevel}`,
      );
    }
  }

  (builtGraph as any)._environment = {
    bus,
    mixGain,
    destination,
    sends: sendNodes,
    params,
  };
  trace?.log?.(`environment: applied (${sendNodes.length} emitter sends)`);
}
