import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wae from 'web-audio-engine';
import { buildGraph } from '../dist/index.js';

const { OfflineAudioContext } = wae;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function floatTo16BitPCM(float32) {
  const s = Math.max(-1, Math.min(1, float32));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}
function writeWavPCM16LE({ samples, sampleRate, numChannels }) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  let o = 0;
  buffer.write('RIFF', o); o += 4;
  buffer.writeUInt32LE(36 + dataSize, o); o += 4;
  buffer.write('WAVE', o); o += 4;
  buffer.write('fmt ', o); o += 4;
  buffer.writeUInt32LE(16, o); o += 4;
  buffer.writeUInt16LE(1, o); o += 2;
  buffer.writeUInt16LE(numChannels, o); o += 2;
  buffer.writeUInt32LE(sampleRate, o); o += 4;
  buffer.writeUInt32LE(byteRate, o); o += 4;
  buffer.writeUInt16LE(blockAlign, o); o += 2;
  buffer.writeUInt16LE(16, o); o += 2;
  buffer.write('data', o); o += 4;
  buffer.writeUInt32LE(dataSize, o); o += 4;
  for (let i = 0; i < samples.length; i++) {
    const v = floatTo16BitPCM(samples[i]);
    buffer.writeInt16LE(v, 44 + i * 2);
  }
  return buffer;
}

function makeIR(context, seconds = 0.5, decay = 2.5) {
  const sr = context.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = context.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // exponential decay noise
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

async function main() {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, sr * 3, sr);
  const ir = makeIR(ctx, 0.6, 3);
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'osc', kind: 'oscillator', params: { type: 'sine', frequency: 440, startTime: 0 } },
      { id: 'conv', kind: 'convolver', params: { buffer: ir, normalize: true } },
    ],
    connections: [ { from: { node: 'osc' }, to: { node: 'conv' } } ],
  };
  const g = buildGraph(ctx, spec);
  g.nodes.get('conv')?.connect(ctx.destination);
  const rendered = await ctx.startRendering();
  const channels = rendered.numberOfChannels;
  const length = rendered.length;
  const interleaved = new Float32Array(length * 2);
  const ch0 = rendered.getChannelData(0);
  const ch1 = channels > 1 ? rendered.getChannelData(1) : ch0;
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-convolver.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

