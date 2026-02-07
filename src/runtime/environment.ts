import type { Environment, BuiltGraph, KHRAudioEmitterExtension } from '../types.js';
import type { TraceLogger } from './trace.js';

export async function applyEnvironment(
  context: BaseAudioContext,
  environment: Environment,
  builtGraph: BuiltGraph,
  audioEmitter?: KHRAudioEmitterExtension,
  loadBuffer?: (uri: string, ctx: BaseAudioContext) => Promise<AudioBuffer>,
  trace?: TraceLogger,
): Promise<void> {
  const reverb = environment.reverb;
  if (!reverb) {
    trace?.log?.(`applyEnvironment: no reverb configured`);
    return;
  }

  const mix = reverb.mix ?? 0.5;
  trace?.log?.(`applyEnvironment type=${reverb.type ?? 'parametric'} mix=${mix}`);

  // Find the final output node (last emitter or last node connected to destination)
  // We insert between graph output and destination using a wet/dry parallel path
  const ctx = context as any;

  // Create wet/dry mix nodes
  const dryGain: GainNode = ctx.createGain();
  dryGain.gain.value = 1.0 - mix;

  const wetGain: GainNode = ctx.createGain();
  wetGain.gain.value = mix;

  const outputMerge: GainNode = ctx.createGain();
  outputMerge.gain.value = 1.0;

  let reverbNode: AudioNode;

  if (reverb.type === 'impulseResponse' && typeof reverb.audio === 'number' && audioEmitter) {
    // IR-based reverb using ConvolverNode
    const convolver: ConvolverNode = ctx.createConvolver();
    const audioData = audioEmitter.audio[reverb.audio];
    if (audioData?.uri && loadBuffer) {
      convolver.buffer = await loadBuffer(audioData.uri, context);
      trace?.log?.(`environment: loaded IR from audio[${reverb.audio}]`);
    }
    reverbNode = convolver;
  } else {
    // Parametric reverb approximation using a simple delay + feedback chain
    const decayTime = reverb.decayTime ?? 1.5;
    const reflectionDelay = reverb.reflectionDelay ?? 0.02;
    const reverbDelay = reverb.reverbDelay ?? 0.04;

    const delay: DelayNode = ctx.createDelay(Math.max(decayTime, 1.0));
    delay.delayTime.value = reflectionDelay + reverbDelay;

    // Simple feedback approximation
    const feedbackGain: GainNode = ctx.createGain();
    // Convert decay time to feedback gain (approximate RT60)
    const loopTime = reflectionDelay + reverbDelay;
    feedbackGain.gain.value = loopTime > 0 ? Math.pow(0.001, loopTime / Math.max(decayTime, 0.01)) : 0;

    // Early reflections gain
    const earlyGain: GainNode = ctx.createGain();
    earlyGain.gain.value = reverb.earlyReflectionsGain ?? 1.0;

    // Simple chain: input → delay → feedback loop, delay → earlyGain → output
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(earlyGain);

    reverbNode = delay;
    // For parametric, the output comes from earlyGain
    earlyGain.connect(wetGain);
    // Wire dry + wet to output
    dryGain.connect(outputMerge);
    wetGain.connect(outputMerge);
    outputMerge.connect(ctx.destination);

    trace?.log?.(`environment: parametric reverb decayTime=${decayTime} reflectionDelay=${reflectionDelay}`);

    // Store the environment nodes on the built graph for reference
    (builtGraph as any)._environment = { dryGain, wetGain, reverbNode: delay, outputMerge };
    return;
  }

  // For IR-based reverb, wire: input → dry → outputMerge, input → reverb → wet → outputMerge
  reverbNode.connect(wetGain);
  dryGain.connect(outputMerge);
  wetGain.connect(outputMerge);
  outputMerge.connect(ctx.destination);

  trace?.log?.(`environment: IR reverb applied`);

  (builtGraph as any)._environment = { dryGain, wetGain, reverbNode, outputMerge };
}
