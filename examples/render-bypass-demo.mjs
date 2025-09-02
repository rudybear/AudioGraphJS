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
  const dur = 1.5;
  const ctx = new OfflineAudioContext(1, Math.floor(sr * dur), sr);

  // Render twice: with filter active and with bypass true
  const makeSpec = (bypass) => ({
    sampleRate: sr,
    nodes: [
      { id: 'osc', kind: 'oscillator', params: { type: 'sawtooth', frequency: 440, startTime: 0 } },
      { id: 'lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 1000, Q: 0.7, bypass } },
      { id: 'amp', kind: 'gain', params: { gain: 0.3 } }
    ],
    connections: [
      { from: { node: 'osc' }, to: { node: 'lp' } },
      { from: { node: 'lp' }, to: { node: 'amp' } }
    ]
  });

  const specOn = makeSpec(false);
  const gOn = buildGraph(ctx, specOn);
  gOn.nodes.get('amp')?.connect(ctx.destination);
  const rOn = await ctx.startRendering();

  const outOn = rOn.getChannelData(0);
  const wavOn = writeWavPCM16LE({ samples: outOn, sampleRate: sr, numChannels: 1 });
  fs.writeFileSync(path.join(__dirname, 'output-bypass-on.wav'), wavOn);

  // New context for bypassed render
  const ctx2 = new OfflineAudioContext(1, Math.floor(sr * dur), sr);
  const specBy = makeSpec(true);
  const gBy = buildGraph(ctx2, specBy);
  gBy.nodes.get('amp')?.connect(ctx2.destination);
  const rBy = await ctx2.startRendering();
  const outBy = rBy.getChannelData(0);
  const wavBy = writeWavPCM16LE({ samples: outBy, sampleRate: sr, numChannels: 1 });
  fs.writeFileSync(path.join(__dirname, 'output-bypass-bypassed.wav'), wavBy);

  console.log('Wrote output-bypass-on.wav and output-bypass-bypassed.wav');
}

main().catch((e) => { console.error(e); process.exit(1); });

