import type { Environment, BuiltGraph, KHRAudioEmitterExtension } from '../types.js';
import type { TraceLogger } from './trace.js';

export async function applyEnvironment(
  context: BaseAudioContext,
  environment: Environment,
  builtGraph: BuiltGraph,
  audioEmitter?: KHRAudioEmitterExtension,
  loadBuffer?: (uri: string, ctx: BaseAudioContext) => Promise<AudioBuffer>,
  trace?: TraceLogger,
): Promise<AudioNode> {
  const reverb = environment.reverb;
  const ctx = context as any;

  if (!reverb) {
    trace?.log?.('applyEnvironment: no reverb configured');
    return ctx.destination;
  }

  const mix = reverb.mix ?? 0.5;
  trace?.log?.(`applyEnvironment type=${reverb.type ?? 'parametric'} mix=${mix}`);

  const input: GainNode = ctx.createGain();
  input.gain.value = 1.0;

  const dryGain: GainNode = ctx.createGain();
  dryGain.gain.value = 1.0 - mix;

  const wetGain: GainNode = ctx.createGain();
  wetGain.gain.value = mix;

  const outputMerge: GainNode = ctx.createGain();
  outputMerge.gain.value = 1.0;

  let reverbNode: AudioNode;

  input.connect(dryGain);
  dryGain.connect(outputMerge);

  if (reverb.type === 'impulseResponse' && typeof reverb.audio === 'number' && audioEmitter) {
    const convolver: ConvolverNode = ctx.createConvolver();
    const audioData = audioEmitter.audio[reverb.audio];
    if (audioData?.uri && loadBuffer) {
      convolver.buffer = await loadBuffer(audioData.uri, context);
      trace?.log?.(`environment: loaded IR from audio[${reverb.audio}]`);
    }
    input.connect(convolver);
    convolver.connect(wetGain);
    reverbNode = convolver;
    trace?.log?.('environment: IR reverb applied');
  } else {
    const decayTime = reverb.decayTime ?? 1.5;
    const reflectionDelay = reverb.reflectionDelay ?? 0.02;
    const reverbDelay = reverb.reverbDelay ?? 0.04;

    const delay: DelayNode = ctx.createDelay(Math.max(decayTime, 1.0));
    delay.delayTime.value = reflectionDelay + reverbDelay;

    const feedbackGain: GainNode = ctx.createGain();
    const loopTime = reflectionDelay + reverbDelay;
    feedbackGain.gain.value = loopTime > 0 ? Math.pow(0.001, loopTime / Math.max(decayTime, 0.01)) : 0;

    const earlyGain: GainNode = ctx.createGain();
    earlyGain.gain.value = reverb.earlyReflectionsGain ?? 1.0;

    input.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(earlyGain);
    earlyGain.connect(wetGain);

    reverbNode = delay;
    trace?.log?.(`environment: parametric reverb decayTime=${decayTime} reflectionDelay=${reflectionDelay}`);
  }

  wetGain.connect(outputMerge);
  outputMerge.connect(ctx.destination);

  builtGraph._environment = { input, dryGain, wetGain, reverbNode, outputMerge };
  return input;
}
