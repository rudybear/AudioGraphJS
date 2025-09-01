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
  const bpm = 100;
  const secPerBeat = 60 / bpm;
  const dur = 8 * secPerBeat; // 2 bars at 4/4
  const ctx = new OfflineAudioContext(2, Math.floor(sr * dur), sr);

  // Lead: detuned saws -> lowpass -> gain -> stereo
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'osc1', kind: 'oscillator', params: { type: 'sawtooth', frequency: 440, startTime: 0 } },
      { id: 'osc2', kind: 'oscillator', params: { type: 'sawtooth', frequency: 446, startTime: 0 } },
      { id: 'mix', kind: 'audio-mixer', params: {} },
      { id: 'lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 4000, Q: 0.7 } },
      { id: 'amp', kind: 'gain', params: { gain: 0.0 } },
      { id: 'pan', kind: 'stereo-panner', params: { pan: 0.0 } }
    ],
    connections: [
      { from: { node: 'osc1' }, to: { node: 'mix' } },
      { from: { node: 'osc2' }, to: { node: 'mix' } },
      { from: { node: 'mix' }, to: { node: 'lp' } },
      { from: { node: 'lp' }, to: { node: 'amp' } },
      { from: { node: 'amp' }, to: { node: 'pan' } }
    ]
  };

  const g = buildGraph(ctx, spec);
  g.nodes.get('pan')?.connect(ctx.destination);

  // Simple arpeggio: A minor (A4, C5, E5, A5)
  const notes = [440, 523.25, 659.25, 880];
  const step = secPerBeat / 2; // 8ths
  const osc1 = g.nodes.get('osc1');
  const osc2 = g.nodes.get('osc2');
  const amp = g.nodes.get('amp').gain;
  const lp = g.nodes.get('lp');

  for (let i = 0; i < 16; i++) {
    const t = i * step;
    const f = notes[i % notes.length];
    // Set frequency per step
    osc1.frequency.setValueAtTime(f, t);
    osc2.frequency.setValueAtTime(f * 1.013, t);
    // Amp envelope per note (validates Gain)
    amp.setValueAtTime(0.0, t);
    amp.linearRampToValueAtTime(0.7, t + 0.03);
    amp.linearRampToValueAtTime(0.0, t + step * 0.9);
    // Filter gentle sweep
    const f0 = 1500, f1 = 3500;
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.linearRampToValueAtTime(f1, t + step);
  }
  // Subtle pan motion
  const pan = g.nodes.get('pan').pan;
  pan.setValueAtTime(0.0, 0);
  pan.linearRampToValueAtTime(0.2, dur / 2);
  pan.linearRampToValueAtTime(0.0, dur);

  const rendered = await ctx.startRendering();
  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.getChannelData(1);
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-lead.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

