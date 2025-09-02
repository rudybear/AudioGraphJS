import { GraphNodeSpec } from '../types.js';
import { applyChannelOptions } from './util.js';

export interface StereoPannerParams {
  pan?: number; // AudioParam in [-1, 1]
}

export function createStereoPanner(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): StereoPannerNode {
  const node = (context as any).createStereoPanner
    ? (context as any).createStereoPanner()
    : new (window as any).StereoPannerNode(context);
  const p = (spec.params || {}) as Partial<StereoPannerParams>;
  if (typeof p.pan === 'number') { node.pan.setValueAtTime(p.pan, context.currentTime); trace?.log?.(`StereoPanner[${spec.id}].pan.setValueAtTime(${p.pan}, ${context.currentTime})`); }
  applyChannelOptions(node, p, trace);
  return node as StereoPannerNode;
}
