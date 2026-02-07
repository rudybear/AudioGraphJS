import type { Listener } from '../types.js';
import type { TraceLogger } from './trace.js';

export interface ListenerTransform {
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

// Minimal quat→forward vector util (glTF convention: forward = [0,0,-1])
function rotateVecByQuat(v: [number, number, number], q: [number, number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const vx = v[0], vy = v[1], vz = v[2];
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

export function applyListener(
  context: BaseAudioContext,
  listener: Listener,
  transform?: ListenerTransform,
  trace?: TraceLogger,
): string {
  const model = listener.spatializationModel ?? 'equalpower';
  trace?.log?.(`applyListener spatializationModel=${model}`);

  const audioListener = context.listener;
  if (transform?.translation) {
    const [px, py, pz] = transform.translation;
    if ((audioListener as any).positionX) {
      (audioListener as any).positionX.setValueAtTime(px, context.currentTime);
      (audioListener as any).positionY.setValueAtTime(py, context.currentTime);
      (audioListener as any).positionZ.setValueAtTime(pz, context.currentTime);
    }
    trace?.log?.(`listener position=[${px}, ${py}, ${pz}]`);
  }

  if (transform?.rotation) {
    const fwd = rotateVecByQuat([0, 0, -1], transform.rotation);
    const up = rotateVecByQuat([0, 1, 0], transform.rotation);
    if ((audioListener as any).forwardX) {
      (audioListener as any).forwardX.setValueAtTime(fwd[0], context.currentTime);
      (audioListener as any).forwardY.setValueAtTime(fwd[1], context.currentTime);
      (audioListener as any).forwardZ.setValueAtTime(fwd[2], context.currentTime);
      (audioListener as any).upX.setValueAtTime(up[0], context.currentTime);
      (audioListener as any).upY.setValueAtTime(up[1], context.currentTime);
      (audioListener as any).upZ.setValueAtTime(up[2], context.currentTime);
    }
    trace?.log?.(`listener forward=[${fwd[0].toFixed(3)}, ${fwd[1].toFixed(3)}, ${fwd[2].toFixed(3)}]`);
  }

  return model;
}
