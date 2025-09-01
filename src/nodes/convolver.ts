import { GraphNodeSpec } from '../types.js';
import { loadAudioBuffer } from '../assets/loadAudioBuffer.js';

export interface ConvolverParams {
  buffer?: AudioBuffer | null;
  uri?: string; // optional IR URI (WAV)
  normalize?: boolean; // default true per Web Audio
}

export function createConvolver(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): ConvolverNode {
  const node = context.createConvolver();
  const p = (spec.params || {}) as Partial<ConvolverParams>;
  if (p.buffer !== undefined) node.buffer = p.buffer ?? null;
  if (p.buffer) trace?.log?.(`Convolver[${spec.id}].buffer=(len=${p.buffer.length}, sr=${p.buffer.sampleRate})`);
  if (p.normalize !== undefined) { node.normalize = !!p.normalize; trace?.log?.(`Convolver[${spec.id}].normalize=${node.normalize}`); }
  return node;
}

export async function createConvolverAsync(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): Promise<ConvolverNode> {
  const node = createConvolver(context, spec, trace);
  const p = (spec.params || {}) as Partial<ConvolverParams>;
  if (p.uri) {
    const buf = await loadAudioBuffer(context, p.uri);
    node.buffer = buf;
    trace?.log?.(`Convolver[${spec.id}].buffer <- uri(${p.uri.slice(0, 64)}${p.uri.length > 64 ? '…' : ''})`);
  }
  return node;
}
