import { describe, it, expect } from 'vitest';
import { buildGraph, setBypass } from '../src/index';

describe('Runtime bypass wrapper', () => {
  it('Lowpass bypass increases high-frequency energy', async () => {
    const sr = 48000;
    const freq = 8000; // high frequency
    async function render(bypass: boolean) {
      const ctx = new OfflineAudioContext(1, sr * 1, sr);
      const spec = {
        sampleRate: sr,
        nodes: [
          { id: 'osc', kind: 'oscillator', params: { type: 'sine', frequency: freq, startTime: 0 } },
          // Keep lp in graph; toggle bypass at runtime
          { id: 'lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 1000, Q: 0.707 } },
        ],
        connections: [ { from: { node: 'osc' }, to: { node: 'lp' } } ],
      } as any;
      const g = buildGraph(ctx, spec);
      setBypass(g, 'lp', bypass, 5);
      g.nodes.get('lp')!.connect(ctx.destination);
      const rendered = await ctx.startRendering();
      const out = rendered.getChannelData(0);
      let sum = 0; for (let i = 0; i < out.length; i++) sum += out[i] * out[i];
      return Math.sqrt(sum / out.length);
    }

    const rmsFiltered = await render(false);
    const rmsBypassed = await render(true);
    expect(rmsBypassed).toBeGreaterThan(rmsFiltered * 3);
  });
});
