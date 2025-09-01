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
  const dur = 3.0; // seconds
  const ctx = new OfflineAudioContext(1, Math.floor(sr * dur), sr);

  // Bass: square PWM -> LPF -> gain
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'osc', kind: 'oscillator', params: { type: 'square', pulseWidth: 0.2, frequency: 55, startTime: 0 } },
      { id: 'lpf', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 400, Q: 0.8 } },
      { id: 'amp', kind: 'gain', params: { gain: 0.0 } }
    ],
    connections: [
      { from: { node: 'osc' }, to: { node: 'lpf' } },
      { from: { node: 'lpf' }, to: { node: 'amp' } }
    ]
  };

  const g = buildGraph(ctx, spec);
  g.nodes.get('amp')?.connect(ctx.destination);

  // ADSR-like envelope on amp and filter sweep (validates Gain & Biquad params)
  const t0 = 0;
  const amp = g.nodes.get('amp').gain;
  amp.setValueAtTime(0.0, t0);
  amp.linearRampToValueAtTime(0.8, t0 + 0.05); // attack 50ms
  amp.linearRampToValueAtTime(0.6, t0 + 0.2);  // decay to sustain
  amp.setValueAtTime(0.6, t0 + 0.2);
  amp.linearRampToValueAtTime(0.0, t0 + 2.8);  // release

  const lpf = g.nodes.get('lpf');
  lpf.frequency.setValueAtTime(400, t0);
  lpf.frequency.exponentialRampToValueAtTime ?
    lpf.frequency.exponentialRampToValueAtTime(120, t0 + 0.3) :
    lpf.frequency.linearRampToValueAtTime(120, t0 + 0.3);

  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  const wav = writeWavPCM16LE({ samples: out, sampleRate: sr, numChannels: 1 });
  const outPath = path.join(__dirname, 'output-bass.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

