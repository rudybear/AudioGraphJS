import type { BuiltGraph, GraphSpec, GraphNodeSpec } from '../types.js';
import type { TraceLogger } from './trace.js';

export interface ResolvedEmitterBinding {
  emitterNodeId: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

// Minimal quat->forward vector util (glTF convention: forward = [0,0,-1])
function rotateVecByQuat(v: [number, number, number], q: [number, number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  // quaternion * vector (as quaternion with w=0) * conjugate(quaternion)
  const vx = v[0], vy = v[1], vz = v[2];
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  // v' = v + w * t + cross(q.xyz, t)
  const vpx = vx + w * tx + (y * tz - z * ty);
  const vpy = vy + w * ty + (z * tx - x * tz);
  const vpz = vz + w * tz + (x * ty - y * tx);
  return [vpx, vpy, vpz];
}

export function applyEmitterInstances(
  built: BuiltGraph,
  spec: GraphSpec,
  bindings: ResolvedEmitterBinding[],
  trace?: TraceLogger
) {
  const ctx = built.context as any;
  const inputs = built._inputs!;

  for (const b of bindings) {
    const bus = inputs.get(b.emitterNodeId);
    if (!bus) { trace?.log?.(`warn: emitter bus not found for ${b.emitterNodeId}`); continue; }
    const specNode: GraphNodeSpec | undefined = spec.nodes.find(n => n.id === b.emitterNodeId);
    if (!specNode) { trace?.log?.(`warn: emitter spec not found for ${b.emitterNodeId}`); continue; }
    const p = (specNode.params || {}) as any;
    // Create per-instance nodes: panner (for spatial) + post-panner gain
    const postGain: GainNode = ctx.createGain();
    if (typeof p.gain === 'number') postGain.gain.value = p.gain;
    let instanceInput: AudioNode = postGain;
    // If spatial emitter, add panner before postGain
    if ((p.emitterType ?? 'global') === 'spatial') {
      const pan: PannerNode = ctx.createPanner();
      // Configure panner from emitter params
      const sp = p.spatialProperties || {};
      pan.panningModel = sp.spatializationModel === 'HRTF' ? 'HRTF' : 'equalpower';
      const att = sp.attenuation || {};
      if (att.distanceModel && att.distanceModel !== 'custom') (pan as any).distanceModel = att.distanceModel;
      if (typeof att.refDistance === 'number') pan.refDistance = att.refDistance;
      if (typeof att.maxDistance === 'number') pan.maxDistance = att.maxDistance;
      if (typeof att.rolloffFactor === 'number') pan.rolloffFactor = att.rolloffFactor;
      if (typeof att.coneInnerAngle === 'number') pan.coneInnerAngle = att.coneInnerAngle;
      if (typeof att.coneOuterAngle === 'number') pan.coneOuterAngle = att.coneOuterAngle;
      if (typeof att.coneOuterGain === 'number') pan.coneOuterGain = att.coneOuterGain;
      // Apply transform: position from translation; orientation from rotation
      if (b.translation && (pan as any).positionX) {
        (pan as any).positionX.setValueAtTime(b.translation[0], built.context.currentTime);
        (pan as any).positionY.setValueAtTime(b.translation[1], built.context.currentTime);
        (pan as any).positionZ.setValueAtTime(b.translation[2], built.context.currentTime);
      } else {
        // In environments without position AudioParams, skip (e.g., web-audio-engine not implementing setPosition)
      }
      if (b.rotation) {
        const fwd = rotateVecByQuat([0, 0, -1], b.rotation);
        if ((pan as any).orientationX) {
          (pan as any).orientationX.setValueAtTime(fwd[0], built.context.currentTime);
          (pan as any).orientationY.setValueAtTime(fwd[1], built.context.currentTime);
          (pan as any).orientationZ.setValueAtTime(fwd[2], built.context.currentTime);
        } else {
          // Skip if orientation params are unavailable
        }
      }
      // Connect: bus -> panner -> postGain -> destination
      bus.connect(pan);
      pan.connect(postGain);
      instanceInput = pan;
      trace?.log?.(`createEmitterInstance id=${b.emitterNodeId} -> panner+gain -> destination`);
    } else {
      // Global: bus -> postGain -> destination
      bus.connect(postGain);
      trace?.log?.(`createEmitterInstance id=${b.emitterNodeId} -> gain -> destination`);
    }
    postGain.connect(ctx.destination);
  }
}
