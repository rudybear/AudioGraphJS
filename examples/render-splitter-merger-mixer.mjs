import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wae from 'web-audio-engine';
import { buildGraphAsync } from '../dist/index.js';

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
  const ctx = new OfflineAudioContext(2, sr * 2, sr);

  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'src', kind: 'oscillator', params: { type: 'sine', frequency: 220, startTime: 0 } },
      { id: 'split', kind: 'channel-splitter', params: { numberOfOutputs: 2 } },
      { id: 'lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 800 } },
      { id: 'hp', kind: 'biquad-filter', params: { type: 'highpass', frequency: 1200 } },
      { id: 'merge', kind: 'channel-merger', params: { numberOfInputs: 2 } },
      { id: 'mix', kind: 'audio-mixer', params: {} },
      { id: 'outGain', kind: 'gain', params: { gain: 0.8 } },
    ],
    connections: [
      { from: { node: 'src' }, to: { node: 'split' } },
      // Route left (out 0) through lp to merge in 0
      { from: { node: 'split', output: 0 }, to: { node: 'lp' } },
      { from: { node: 'lp' }, to: { node: 'merge', input: 0 } },
      // Route right (out 1) through hp to merge in 1
      { from: { node: 'split', output: 1 }, to: { node: 'hp' } },
      { from: { node: 'hp' }, to: { node: 'merge', input: 1 } },
      // Mixer stage
      { from: { node: 'merge' }, to: { node: 'mix' } },
      { from: { node: 'mix' }, to: { node: 'outGain' } },
    ],
    outputs: ['outGain']
  };

  const built = await buildGraphAsync(ctx, spec);
  const rendered = await ctx.startRendering();
  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-splitter-merger-mixer.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

