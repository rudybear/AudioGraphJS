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
 * Build one shared reverb bus for an environment (spec 2.4).
 * Parametric mode approximates I3DL2-style parameters with a pre-delayed
 * feedback loop whose in-loop low-pass models decayHFRatio.
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

  // Parametric approximation.
  const { decayTime, decayHFRatio, reflectionsGain, reflectionsDelay, reverbGain, reverbDelay, diffusion } = params;

  // Early reflections: pre-delay + gain.
  const earlyDelay: DelayNode = ctx.createDelay(Math.max(reflectionsDelay, 1.0));
  earlyDelay.delayTime.value = reflectionsDelay;
  const earlyGain: GainNode = ctx.createGain();
  earlyGain.gain.value = reflectionsGain;

  // Late tail: additional onset delay + feedback loop with in-loop low-pass.
  const lateDelay: DelayNode = ctx.createDelay(Math.max(reverbDelay + 0.1, 1.0));
  const loopTime = Math.max(reverbDelay, 0.01);
  lateDelay.delayTime.value = loopTime;
  const feedbackGain: GainNode = ctx.createGain();
  feedbackGain.gain.value = Math.min(Math.pow(0.001, loopTime / Math.max(decayTime, 0.01)), 0.98);
  const lateGain: GainNode = ctx.createGain();
  lateGain.gain.value = reverbGain;

  // decayHFRatio < 1 → highs decay faster → darker loop filter.
  let loopEnd: AudioNode = feedbackGain;
  if (typeof ctx.createBiquadFilter === 'function') {
    const loopFilter: BiquadFilterNode = ctx.createBiquadFilter();
    loopFilter.type = 'lowpass';
    loopFilter.frequency.value = Math.min(Math.max(20000 * decayHFRatio, 200), 20000);
    // diffusion < 1 → slightly resonant, sparser-sounding loop.
    loopFilter.Q.value = 0.5 + 0.5 * (1 - diffusion);
    feedbackGain.connect(loopFilter);
    loopEnd = loopFilter;
  }

  input.connect(earlyDelay);
  earlyDelay.connect(earlyGain);
  earlyGain.connect(output);
  earlyDelay.connect(lateDelay);
  lateDelay.connect(feedbackGain);
  loopEnd.connect(lateDelay);
  lateDelay.connect(lateGain);
  lateGain.connect(output);

  trace?.log?.(
    `reverbBus: parametric preset=${reverb?.preset ?? 'none'} decayTime=${decayTime} ` +
    `decayHFRatio=${decayHFRatio} reflectionsDelay=${reflectionsDelay} reverbDelay=${reverbDelay}`,
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
