import { GraphNodeSpec } from '../types.js';
import { applyChannelOptions } from './util.js';

export interface WaveShaperParams {
  amount?: number; // 0..1 -> generate tanh-like curve
  oversample?: OverSampleType; // 'none' | '2x' | '4x'
  curve?: number[]; // optional explicit curve
}

export function createWaveShaper(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): WaveShaperNode {
  const node = context.createWaveShaper();
  const p = (spec.params || {}) as Partial<WaveShaperParams>;
  if (p.curve && p.curve.length) {
    const arr = new Float32Array(p.curve.length);
    for (let i = 0; i < p.curve.length; i++) arr[i] = p.curve[i]!;
    // Cast to any to avoid TS lib generic variance issues
    (node as any).curve = arr;
    trace?.log?.(`WaveShaper[${spec.id}].curve=len(${p.curve.length})`);
  } else {
    const amt = Math.max(0, Math.min(1, p.amount ?? 0.5));
    (node as any).curve = generateTanhCurve(amt, 2048);
    trace?.log?.(`WaveShaper[${spec.id}].amount=${amt}`);
  }
  if (p.oversample) {
    node.oversample = p.oversample;
    trace?.log?.(`WaveShaper[${spec.id}].oversample=${p.oversample}`);
  }
  applyChannelOptions(node, p, trace);
  return node;
}

function generateTanhCurve(amount: number, samples: number): Float32Array {
  // Map amount to gain into tanh
  const k = 1 + amount * 19; // 1..20
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x);
  }
  return curve;
}
