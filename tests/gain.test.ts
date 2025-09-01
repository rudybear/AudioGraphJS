import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/runtime/buildGraph';

// Uses Web Audio API types; in Node, install standardized-audio-context to run.

describe('Gain node', () => {
  it('applies static gain to mono tone', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr * 1, sr);

    const spec = {
      sampleRate: sr,
      nodes: [
        { id: 'osc', kind: 'audio-buffer-source', params: {} },
        { id: 'g', kind: 'gain', params: { gain: 0.5 } },
      ],
      connections: [
        { from: { node: 'osc' }, to: { node: 'g' } },
      ],
    } as any;

    // Build a buffer source with a constant value as a test tone
    const buffer = ctx.createBuffer(1, sr, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = 1.0; // DC 1.0
    spec.nodes[0].params = { buffer, startTime: 0 };

    const g = buildGraph(ctx, spec);
    // connect last node to destination
    const gainNode = g.nodes.get('g')!;
    gainNode.connect(ctx.destination);

    const rendered = await ctx.startRendering();
    const out = rendered.getChannelData(0);
    // RMS should be ~0.5 for constant 1.0 scaled by 0.5
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += out[i] * out[i];
    const rms = Math.sqrt(sum / out.length);
    expect(rms).toBeGreaterThan(0.49);
    expect(rms).toBeLessThan(0.51);
  });
});
