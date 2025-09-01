import { GraphNodeSpec } from '../types.js';
import { loadAudioBuffer } from '../assets/loadAudioBuffer.js';

export interface ConvolverParams {
  buffer?: AudioBuffer | null;
  uri?: string; // optional IR URI (WAV)
  normalize?: boolean; // default true per Web Audio
}

export function createConvolver(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): ConvolverNode {
  const node = context.createConvolver();
  const p = (spec.params || {}) as Partial<ConvolverParams>;
  if (p.buffer !== undefined) node.buffer = p.buffer ?? null;
  if (p.normalize !== undefined) node.normalize = !!p.normalize;
  return node;
}

export async function createConvolverAsync(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): Promise<ConvolverNode> {
  const node = createConvolver(context, spec);
  const p = (spec.params || {}) as Partial<ConvolverParams>;
  if (p.uri) {
    const buf = await loadAudioBuffer(context, p.uri);
    node.buffer = buf;
  }
  return node;
}

