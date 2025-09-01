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

function makeIRDataUri({ seconds = 0.35, sampleRate = 48000, decay = 3 }) {
  const length = Math.floor(sampleRate * seconds);
  const numChannels = 1; // mono IR
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = Math.pow(1 - t, decay);
    samples[i] = (Math.random() * 2 - 1) * env * 0.6;
  }
  const wav = writeWavPCM16LE({ samples, sampleRate, numChannels });
  const b64 = Buffer.from(wav).toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

async function main() {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, sr * 3, sr);

  const irUri = makeIRDataUri({ seconds: 0.4, sampleRate: sr, decay: 3 });
  const mix = 0.4; // 0=dry, 1=wet

  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'osc', kind: 'oscillator', params: { type: 'sine', frequency: 330, startTime: 0 } },
      { id: 'wetconv', kind: 'convolver', params: { uri: irUri, normalize: true } },
      { id: 'dryGain', kind: 'gain', params: { gain: 1 - mix } },
      { id: 'wetGain', kind: 'gain', params: { gain: mix } }
    ],
    connections: [
      { from: { node: 'osc' }, to: { node: 'dryGain' } },
      { from: { node: 'osc' }, to: { node: 'wetconv' } },
      { from: { node: 'wetconv' }, to: { node: 'wetGain' } }
    ]
  };

  const g = await buildGraphAsync(ctx, spec);
  // Sum to destination
  g.nodes.get('dryGain')?.connect(ctx.destination);
  g.nodes.get('wetGain')?.connect(ctx.destination);

  const rendered = await ctx.startRendering();
  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.getChannelData(1);
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-convolver-mix.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

