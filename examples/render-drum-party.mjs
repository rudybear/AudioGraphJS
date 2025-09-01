import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wae from 'web-audio-engine';
import { buildGraph } from '../dist/index.js';

const { OfflineAudioContext } = wae;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function floatTo16BitPCM(float32) { const s = Math.max(-1, Math.min(1, float32)); return s < 0 ? s * 0x8000 : s * 0x7fff; }
function writeWavPCM16LE({ samples, sampleRate, numChannels }) {
  const bytesPerSample = 2, blockAlign = numChannels * bytesPerSample, byteRate = sampleRate * blockAlign, dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize); let o = 0;
  buffer.write('RIFF', o); o += 4; buffer.writeUInt32LE(36 + dataSize, o); o += 4; buffer.write('WAVE', o); o += 4; buffer.write('fmt ', o); o += 4;
  buffer.writeUInt32LE(16, o); o += 4; buffer.writeUInt16LE(1, o); o += 2; buffer.writeUInt16LE(numChannels, o); o += 2; buffer.writeUInt32LE(sampleRate, o); o += 4;
  buffer.writeUInt32LE(byteRate, o); o += 4; buffer.writeUInt16LE(blockAlign, o); o += 2; buffer.writeUInt16LE(16, o); o += 2; buffer.write('data', o); o += 4; buffer.writeUInt32LE(dataSize, o); o += 4;
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(floatTo16BitPCM(samples[i]), 44 + i * 2);
  return buffer;
}

async function main() {
  const bpm = 120;
  const bars = 4;
  const sr = 48000;
  const secPerBeat = 60 / bpm; // quarter note
  const barDur = 4 * secPerBeat; // 4/4
  const totalDur = bars * barDur;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * totalDur), sr);

  // Prebuild noise buffers for snare/hat
  function makeNoise(seconds, amp = 1.0) {
    const len = Math.max(1, Math.floor(seconds * sr));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * amp;
    return buf;
  }
  const snareNoise = makeNoise(0.4, 0.7);
  const hatNoise = makeNoise(0.2, 0.5);

  const spec = { sampleRate: sr, nodes: [], connections: [] };
  // Master mix node
  spec.nodes.push({ id: 'mix', kind: 'audio-mixer', params: {} });

  const kickHits = [];
  const snareHits = [];
  const hatHits = [];

  // Pattern: Kick on 1/3, Snare on 2/4, Hat on 8ths
  for (let bar = 0; bar < bars; bar++) {
    const barT = bar * barDur;
    // beats 1,2,3,4 within a bar
    const b1 = barT + 0 * secPerBeat;
    const b2 = barT + 1 * secPerBeat;
    const b3 = barT + 2 * secPerBeat;
    const b4 = barT + 3 * secPerBeat;
    // Kicks
    [b1, b3].forEach((t, i) => {
      const id = `kick_${bar}_${i}`;
      const gid = `${id}_gain`;
      spec.nodes.push({ id, kind: 'oscillator', params: { type: 'sine', frequency: 150, startTime: t, stopTime: t + 0.6 } });
      spec.nodes.push({ id: gid, kind: 'gain', params: { gain: 1.0 } });
      spec.connections.push({ from: { node: id }, to: { node: gid } });
      spec.connections.push({ from: { node: gid }, to: { node: 'mix' } });
      kickHits.push({ id, gid, t });
    });
    // Snares
    [b2, b4].forEach((t, i) => {
      const id = `snare_${bar}_${i}`;
      const hpf = `${id}_hpf`;
      const bpf = `${id}_bpf`;
      const gid = `${id}_gain`;
      spec.nodes.push({ id, kind: 'audio-buffer-source', params: { buffer: snareNoise, startTime: t, stopTime: t + 0.35 } });
      spec.nodes.push({ id: hpf, kind: 'biquad-filter', params: { type: 'highpass', frequency: 800 } });
      spec.nodes.push({ id: bpf, kind: 'biquad-filter', params: { type: 'bandpass', frequency: 1800, Q: 0.8 } });
      spec.nodes.push({ id: gid, kind: 'gain', params: { gain: 1.0 } });
      spec.connections.push({ from: { node: id }, to: { node: hpf } });
      spec.connections.push({ from: { node: hpf }, to: { node: bpf } });
      spec.connections.push({ from: { node: bpf }, to: { node: gid } });
      spec.connections.push({ from: { node: gid }, to: { node: 'mix' } });
      snareHits.push({ gid, t });
    });
    // Hats on 8ths
    for (let s = 0; s < 8; s++) {
      const t = barT + s * (secPerBeat / 2);
      const id = `hat_${bar}_${s}`;
      const hp = `${id}_hp`;
      const gid = `${id}_gain`;
      spec.nodes.push({ id, kind: 'audio-buffer-source', params: { buffer: hatNoise, startTime: t, stopTime: t + 0.12 } });
      spec.nodes.push({ id: hp, kind: 'biquad-filter', params: { type: 'highpass', frequency: 8000, Q: 0.707 } });
      spec.nodes.push({ id: gid, kind: 'gain', params: { gain: 0.7 } });
      spec.connections.push({ from: { node: id }, to: { node: hp } });
      spec.connections.push({ from: { node: hp }, to: { node: gid } });
      spec.connections.push({ from: { node: gid }, to: { node: 'mix' } });
      hatHits.push({ gid, t });
    }
  }

  const g = buildGraph(ctx, spec);
  g.nodes.get('mix')?.connect(ctx.destination);

  // Envelopes after build
  // Kick envelopes
  for (const { id, gid, t } of kickHits) {
    const osc = g.nodes.get(id);
    const gn = g.nodes.get(gid);
    if (osc && gn) {
      const f = osc.frequency; const gg = gn.gain;
      f.setValueAtTime(150, t);
      if (f.exponentialRampToValueAtTime) f.exponentialRampToValueAtTime(50, t + 0.15); else f.linearRampToValueAtTime(50, t + 0.15);
      gg.setValueAtTime(1.0, t);
      if (gg.exponentialRampToValueAtTime) gg.exponentialRampToValueAtTime(0.0001, t + 0.5); else gg.linearRampToValueAtTime(0, t + 0.5);
    }
  }
  // Snare noise amp envelopes
  for (const { gid, t } of snareHits) {
    const gg = g.nodes.get(gid)?.gain;
    if (gg) {
      gg.setValueAtTime(1.0, t);
      if (gg.exponentialRampToValueAtTime) gg.exponentialRampToValueAtTime(0.0001, t + 0.25); else gg.linearRampToValueAtTime(0, t + 0.25);
    }
  }
  // Hats quick decay
  for (const { gid, t } of hatHits) {
    const gg = g.nodes.get(gid)?.gain;
    if (gg) {
      gg.setValueAtTime(0.7, t);
      if (gg.exponentialRampToValueAtTime) gg.exponentialRampToValueAtTime(0.0001, t + 0.08); else gg.linearRampToValueAtTime(0, t + 0.08);
    }
  }

  const rendered = await ctx.startRendering();
  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-drum-party.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath} (BPM=${bpm}, bars=${bars})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

