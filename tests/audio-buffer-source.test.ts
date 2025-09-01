import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/runtime/buildGraph';

describe('AudioBufferSource single-shot', () => {
  it('plays a short buffer once at t=0', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr * 1, sr);

    const buffer = ctx.createBuffer(1, 4800, sr); // 0.1s
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * i) / 50);

    const spec = {
      sampleRate: sr,
      nodes: [
        { id: 'src', kind: 'audio-buffer-source', params: { buffer, startTime: 0 } },
      ],
      connections: [],
    } as any;

    const g = buildGraph(ctx, spec);
    const src = g.nodes.get('src')! as AudioBufferSourceNode;
    src.connect(ctx.destination);

    const rendered = await ctx.startRendering();
    const out = rendered.getChannelData(0);
    // Expect non-zero region roughly for 0.1s, then near-silence
    const head = out.slice(0, 4800);
    const tail = out.slice(4800);
    const headRMS = Math.sqrt(head.reduce((s, v) => s + v * v, 0) / head.length);
    const tailRMS = Math.sqrt(tail.reduce((s, v) => s + v * v, 0) / tail.length);
    expect(headRMS).toBeGreaterThan(0.1);
    expect(tailRMS).toBeLessThan(headRMS * 0.2);
  });
});
