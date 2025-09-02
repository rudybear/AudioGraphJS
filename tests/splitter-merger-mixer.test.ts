import { describe, it, expect } from 'vitest';

describe('Splitter/Merger/Mixer', () => {
  it('ChannelSplitter selects right channel correctly', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr * 1, sr);
    const buffer = ctx.createBuffer(2, sr, sr);
    buffer.getChannelData(0).fill(1.0); // left
    buffer.getChannelData(1).fill(0.25); // right
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const split = ctx.createChannelSplitter(2);
    src.connect(split);
    split.connect(ctx.destination, 1, 0); // right to output
    src.start();
    const rendered = await ctx.startRendering();
    const out = rendered.getChannelData(0);
    const rms = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / out.length);
    expect(rms).toBeGreaterThan(0.24);
    expect(rms).toBeLessThan(0.26);
  });

  it('ChannelMerger merges two mono sources to stereo', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, sr * 1, sr);
    const left = ctx.createBuffer(1, sr, sr);
    left.getChannelData(0).fill(0.5);
    const right = ctx.createBuffer(1, sr, sr);
    right.getChannelData(0).fill(0.25);
    const sL = ctx.createBufferSource(); sL.buffer = left;
    const sR = ctx.createBufferSource(); sR.buffer = right;
    const merge = ctx.createChannelMerger(2);
    sL.connect(merge, 0, 0);
    sR.connect(merge, 0, 1);
    merge.connect(ctx.destination);
    sL.start(); sR.start();
    const rendered = await ctx.startRendering();
    const L = rendered.getChannelData(0);
    const R = rendered.getChannelData(1);
    const rmsL = Math.hypot(...L) / Math.sqrt(L.length);
    const rmsR = Math.hypot(...R) / Math.sqrt(R.length);
    expect(rmsL).toBeGreaterThan(0.49);
    expect(rmsR).toBeGreaterThan(0.24);
  });

  it('ChannelMixer up-mixes mono to stereo via channelCount', async () => {
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, sr * 1, sr);
    const buf = ctx.createBuffer(1, sr, sr);
    buf.getChannelData(0).fill(0.6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const mix = ctx.createGain();
    try { (mix as any).channelCountMode = 'explicit'; (mix as any).channelCount = 2; } catch {}
    src.connect(mix);
    mix.connect(ctx.destination);
    src.start();
    const rendered = await ctx.startRendering();
    const L = rendered.getChannelData(0);
    const R = rendered.getChannelData(1);
    const rmsL = Math.hypot(...L) / Math.sqrt(L.length);
    const rmsR = Math.hypot(...R) / Math.sqrt(R.length);
    expect(rmsL).toBeGreaterThan(0.59);
    expect(rmsR).toBeGreaterThan(0.59);
  });
});
