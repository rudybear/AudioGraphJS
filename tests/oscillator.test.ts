import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/runtime/buildGraph';

describe('Oscillator', () => {
  it('generates approximately the expected frequency', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr * 0.2, sr);

    const spec = {
      sampleRate: sr,
      nodes: [
        { id: 'osc', kind: 'oscillator', params: { type: 'sine', frequency: 440, startTime: 0 } },
      ],
      connections: [],
    } as any;

    const g = buildGraph(ctx, spec);
    const osc = g.nodes.get('osc')! as OscillatorNode;
    osc.connect(ctx.destination);

    const rendered = await ctx.startRendering();
    const out = rendered.getChannelData(0);
    // Estimate frequency via zero-crossing rate on the first 0.1s
    const N = Math.floor(0.1 * sr);
    let crossings = 0;
    for (let i = 1; i < N; i++) {
      if (out[i - 1] <= 0 && out[i] > 0) crossings++;
    }
    const freq = (crossings * sr) / N; // positive-going zero crossings per second
    expect(freq).toBeGreaterThan(400);
    expect(freq).toBeLessThan(480);
  });
});
