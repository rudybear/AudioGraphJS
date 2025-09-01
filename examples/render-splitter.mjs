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
  const ctx = new OfflineAudioContext(1, sr * 2, sr);
  // Make a stereo buffer: left=440Hz, right=880Hz
  const stereo = ctx.createBuffer(2, sr * 2, sr);
  const l = stereo.getChannelData(0);
  const r = stereo.getChannelData(1);
  for (let i = 0; i < l.length; i++) {
    l[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.4;
    r[i] = Math.sin((2 * Math.PI * 880 * i) / sr) * 0.4;
  }
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'src', kind: 'audio-buffer-source', params: { buffer: stereo, startTime: 0 } },
      { id: 'split', kind: 'channel-splitter', params: { numberOfOutputs: 2 } },
    ],
    connections: [
      { from: { node: 'src' }, to: { node: 'split' } },
      // Connect only left channel (output 0) of splitter to destination
    ],
  };
  const g = buildGraph(ctx, spec);
  g.nodes.get('split')?.connect(ctx.destination, 0, 0);
  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  const wav = writeWavPCM16LE({ samples: out, sampleRate: sr, numChannels: 1 });
  const outPath = path.join(__dirname, 'output-splitter-left.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

