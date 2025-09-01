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
  const dur = 2.0; // seconds (cymbal tail)
  const ctx = new OfflineAudioContext(1, Math.floor(sr * dur), sr);

  // Bright noise with slight metallic peaks via peaking filters
  const noiseLen = Math.floor(sr * 2.0);
  const noiseBuf = ctx.createBuffer(1, noiseLen, sr);
  const n = noiseBuf.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = (Math.random() * 2 - 1) * 0.5;

  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'noise', kind: 'audio-buffer-source', params: { buffer: noiseBuf, startTime: 0 } },
      { id: 'hp', kind: 'biquad-filter', params: { type: 'highpass', frequency: 8000, Q: 0.707 } },
      { id: 'peak1', kind: 'biquad-filter', params: { type: 'peaking', frequency: 10000, Q: 5, gain: 6 } },
      { id: 'peak2', kind: 'biquad-filter', params: { type: 'peaking', frequency: 12000, Q: 6, gain: 4 } },
      { id: 'peak3', kind: 'biquad-filter', params: { type: 'peaking', frequency: 7000, Q: 3, gain: 3 } },
      { id: 'gainEnv', kind: 'gain', params: { gain: 1.0 } }
    ],
    connections: [
      { from: { node: 'noise' }, to: { node: 'hp' } },
      { from: { node: 'hp' }, to: { node: 'peak1' } },
      { from: { node: 'peak1' }, to: { node: 'peak2' } },
      { from: { node: 'peak2' }, to: { node: 'peak3' } },
      { from: { node: 'peak3' }, to: { node: 'gainEnv' } }
    ]
  };

  const g = buildGraph(ctx, spec);
  const env = g.nodes.get('gainEnv');
  env.connect(ctx.destination);

  // Envelope: fast attack, long decay to simulate cymbal tail
  const t0 = 0;
  env.gain.setValueAtTime(1.0, t0);
  if (env.gain.exponentialRampToValueAtTime) env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
  else env.gain.linearRampToValueAtTime(0, t0 + 1.8);

  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  const wav = writeWavPCM16LE({ samples: out, sampleRate: sr, numChannels: 1 });
  const outPath = path.join(__dirname, 'output-cymbal.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

