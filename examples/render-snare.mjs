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
  const sr = 48000;
  const dur = 0.8; // seconds
  const ctx = new OfflineAudioContext(1, Math.floor(sr * dur), sr);

  // White noise burst buffer
  const noiseLen = Math.floor(sr * 0.35);
  const noiseBuf = ctx.createBuffer(1, noiseLen, sr);
  const n = noiseBuf.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = (Math.random() * 2 - 1) * 0.7;

  // Graph: noise -> HPF -> BPF -> noiseGain -> mix; tone osc -> toneGain -> mix
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'noise', kind: 'audio-buffer-source', params: { buffer: noiseBuf, startTime: 0 } },
      { id: 'hpf', kind: 'biquad-filter', params: { type: 'highpass', frequency: 800 } },
      { id: 'bpf', kind: 'biquad-filter', params: { type: 'bandpass', frequency: 1800, Q: 0.8 } },
      { id: 'noiseGain', kind: 'gain', params: { gain: 1.0 } },

      { id: 'tone', kind: 'oscillator', params: { type: 'sine', frequency: 220, startTime: 0 } },
      { id: 'toneGain', kind: 'gain', params: { gain: 0.8 } },

      { id: 'mix', kind: 'audio-mixer', params: {} },
    ],
    connections: [
      { from: { node: 'noise' }, to: { node: 'hpf' } },
      { from: { node: 'hpf' }, to: { node: 'bpf' } },
      { from: { node: 'bpf' }, to: { node: 'noiseGain' } },
      { from: { node: 'noiseGain' }, to: { node: 'mix' } },

      { from: { node: 'tone' }, to: { node: 'toneGain' } },
      { from: { node: 'toneGain' }, to: { node: 'mix' } },
    ]
  };

  const g = buildGraph(ctx, spec);
  const tone = g.nodes.get('tone');
  const toneGain = g.nodes.get('toneGain');
  const noiseGain = g.nodes.get('noiseGain');
  const mix = g.nodes.get('mix');
  mix.connect(ctx.destination);

  // Envelopes
  const t0 = 0;
  // Snare body tone: quick downward pitch & amp decay (0.2s)
  tone.frequency.setValueAtTime(220, t0);
  if (tone.frequency.exponentialRampToValueAtTime) tone.frequency.exponentialRampToValueAtTime(140, t0 + 0.12);
  else tone.frequency.linearRampToValueAtTime(140, t0 + 0.12);
  toneGain.gain.setValueAtTime(0.6, t0);
  if (toneGain.gain.exponentialRampToValueAtTime) toneGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  else toneGain.gain.linearRampToValueAtTime(0, t0 + 0.2);

  // Noise burst: very fast attack, decay ~0.25s
  noiseGain.gain.setValueAtTime(1.0, t0);
  if (noiseGain.gain.exponentialRampToValueAtTime) noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
  else noiseGain.gain.linearRampToValueAtTime(0, t0 + 0.25);

  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  const wav = writeWavPCM16LE({ samples: out, sampleRate: sr, numChannels: 1 });
  const outPath = path.join(__dirname, 'output-snare.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

