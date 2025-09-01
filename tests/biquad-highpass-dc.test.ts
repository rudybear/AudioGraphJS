import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/runtime/buildGraph';

describe('BiquadFilter highpass on DC', () => {
  it('attenuates DC significantly', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr * 0.2, sr);
    const buffer = ctx.createBuffer(1, sr * 0.2, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = 1.0;

    const spec = {
      sampleRate: sr,
      nodes: [
        { id: 'src', kind: 'audio-buffer-source', params: { buffer, startTime: 0 } },
        { id: 'hp', kind: 'biquad-filter', params: { type: 'highpass', frequency: 20 } },
      ],
      connections: [
        { from: { node: 'src' }, to: { node: 'hp' } },
      ],
    } as any;

    const g = buildGraph(ctx, spec);
    g.nodes.get('hp')!.connect(ctx.destination);

    const rendered = await ctx.startRendering();
    const out = rendered.getChannelData(0);
    const rms = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / out.length);
    expect(rms).toBeLessThan(0.2); // allow generous tolerance for engine variance
  });
});

