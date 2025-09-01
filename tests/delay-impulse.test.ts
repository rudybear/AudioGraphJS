import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/runtime/buildGraph';

describe('Delay', () => {
  it('delays an impulse by configured time', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr * 0.2, sr);

    const buffer = ctx.createBuffer(1, 10, sr);
    const data = buffer.getChannelData(0);
    data[0] = 1.0; // impulse at t=0

    const delaySec = 0.05; // 50 ms

    const spec = {
      sampleRate: sr,
      nodes: [
        { id: 'src', kind: 'audio-buffer-source', params: { buffer, startTime: 0 } },
        { id: 'dly', kind: 'delay', params: { maxDelayTime: 1, delayTime: delaySec } },
      ],
      connections: [
        { from: { node: 'src' }, to: { node: 'dly' } },
      ],
    } as any;

    const g = buildGraph(ctx, spec);
    g.nodes.get('dly')!.connect(ctx.destination);

    const rendered = await ctx.startRendering();
    const out = rendered.getChannelData(0);
    // Find peak index
    let maxVal = -Infinity;
    let maxIdx = -1;
    for (let i = 0; i < out.length; i++) {
      const v = Math.abs(out[i]);
      if (v > maxVal) { maxVal = v; maxIdx = i; }
    }
    const expectedIdx = Math.round(delaySec * sr);
    expect(Math.abs(maxIdx - expectedIdx)).toBeLessThan(5);
    expect(maxVal).toBeGreaterThan(1e-5);
  });
});
