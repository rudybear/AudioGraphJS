import { GraphNodeSpec } from '../types.js';

export interface EmitterParams {
  id?: number;
  emitterType?: 'global' | 'spatial';
  gain?: number;
  spatialProperties?: {
    spatializationModel?: 'equalpower' | 'HRTF' | 'Custom';
    attenuation?: {
      distanceModel?: 'linear' | 'inverse' | 'exponential' | 'custom';
      refDistance?: number;
      maxDistance?: number;
      rolloffFactor?: number;
      coneInnerAngle?: number;
      coneOuterAngle?: number;
      coneOuterGain?: number;
    };
  };
}

export function createEmitterChain(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): { input: AudioNode; output: AudioNode } {
  const p = (spec.params || {}) as Partial<EmitterParams>;
  const gain = context.createGain();
  if (typeof p.gain === 'number') gain.gain.value = p.gain;
  trace?.log?.(`Emitter[${spec.id}] gain=${p.gain ?? 1}`);

  const type = p.emitterType ?? 'global';
  if (type === 'spatial') {
    const panner = context.createPanner();
    if (p.spatialProperties?.spatializationModel === 'HRTF') panner.panningModel = 'HRTF';
    else panner.panningModel = 'equalpower';
    trace?.log?.(`Emitter[${spec.id}].panner.panningModel=${panner.panningModel}`);
    const att = p.spatialProperties?.attenuation;
    if (att) {
      if (att.distanceModel && att.distanceModel !== 'custom') panner.distanceModel = att.distanceModel as DistanceModelType;
      if (typeof att.refDistance === 'number') panner.refDistance = att.refDistance;
      if (typeof att.maxDistance === 'number') panner.maxDistance = att.maxDistance;
      if (typeof att.rolloffFactor === 'number') panner.rolloffFactor = att.rolloffFactor;
      if (typeof att.coneInnerAngle === 'number') panner.coneInnerAngle = att.coneInnerAngle;
      if (typeof att.coneOuterAngle === 'number') panner.coneOuterAngle = att.coneOuterAngle;
      if (typeof att.coneOuterGain === 'number') panner.coneOuterGain = att.coneOuterGain;
    }
    // chain: input -> panner -> gain -> destination
    panner.connect(gain);
    return { input: panner, output: gain };
  }
  // global: input -> gain -> destination
  return { input: gain, output: gain };
}
