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

function noteFreq(name) {
  // Simple mapping for needed notes around E minor
  const A4 = 440;
  const semis = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
  const m = name.match(/^([A-G]#?)(\d)$/);
  const n = m[1], oct = parseInt(m[2]);
  const a4Index = 4 * 12 + 9; // A4 index
  const idx = oct * 12 + (9 + semis[n]);
  const semitoneDiff = idx - a4Index;
  return A4 * Math.pow(2, semitoneDiff / 12);
}

async function main() {
  const bpm = 124;
  const bars = 4;
  const sr = 48000;
  const secPerBeat = 60 / bpm;
  const step = secPerBeat / 2; // 8ths for the riff
  const barDur = 4 * secPerBeat;
  const dur = bars * barDur;
  const ctx = new OfflineAudioContext(1, Math.floor(sr * dur), sr);

  // Bass chain: square PWM -> lowpass -> gain
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'osc', kind: 'oscillator', params: { type: 'square', pulseWidth: 0.25, frequency: noteFreq('E2'), startTime: 0 } },
      { id: 'lpf_pre', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 800, Q: 0.7 } },
      { id: 'dist', kind: 'wave-shaper', params: { amount: 0.7, oversample: '2x' } },
      { id: 'lpf_post', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 1200, Q: 0.7 } },
      { id: 'amp', kind: 'gain', params: { gain: 0.0 } },
      { id: 'slap', kind: 'delay', params: { maxDelayTime: 0.3, delayTime: 0.07 } },
      { id: 'slapGain', kind: 'gain', params: { gain: 0.15 } }
    ],
    connections: [
      { from: { node: 'osc' }, to: { node: 'lpf_pre' } },
      { from: { node: 'lpf_pre' }, to: { node: 'dist' } },
      { from: { node: 'dist' }, to: { node: 'lpf_post' } },
      { from: { node: 'lpf_post' }, to: { node: 'amp' } },
      // Slapback send
      { from: { node: 'amp' }, to: { node: 'slap' } },
      { from: { node: 'slap' }, to: { node: 'slapGain' } }
    ]
  };

  const g = buildGraph(ctx, spec);
  g.nodes.get('amp')?.connect(ctx.destination);

  // Seven Nation Army intro riff (E minor), one bar: E E G E D C B (8th notes), then E E G E D C D C
  const riff1 = ['E2','E2','G2','E2','D2','C2','B1', null];
  const riff2 = ['E2','E2','G2','E2','D2','C2','D2','C2'];
  const pattern = riff1.concat(riff2); // 16 steps = 2 bars

  const osc = g.nodes.get('osc');
  const amp = g.nodes.get('amp').gain;
  const lpfPre = g.nodes.get('lpf_pre');
  const lpfPost = g.nodes.get('lpf_post');

  for (let bar = 0; bar < bars; bar += 2) {
    const baseT = bar * barDur;
    const seq = pattern;
    for (let i = 0; i < seq.length; i++) {
      const t = baseT + i * step;
      const note = seq[i];
      if (note) {
        const f = noteFreq(note);
        osc.frequency.setValueAtTime(f, t);
        // per-note quick envelope
        amp.setValueAtTime(0.0, t);
        amp.linearRampToValueAtTime(0.9, t + 0.01);
        amp.linearRampToValueAtTime(0.4, t + 0.1);
        amp.linearRampToValueAtTime(0.0, t + step * 0.95);
        lpfPre.frequency.setValueAtTime(700, t);
        lpfPre.frequency.linearRampToValueAtTime(500, t + 0.12);
        lpfPost.frequency.setValueAtTime(1200, t);
        lpfPost.frequency.linearRampToValueAtTime(900, t + 0.12);
      } else {
        // Rest: ensure amplitude down
        amp.setValueAtTime(0.0, t);
      }
    }
  }

  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  // Mix dry and slapback by connecting to destination
  g.nodes.get('amp')?.connect(ctx.destination);
  g.nodes.get('slapGain')?.connect(ctx.destination);
  const wav = writeWavPCM16LE({ samples: out, sampleRate: sr, numChannels: 1 });
  const outPath = path.join(__dirname, 'output-seven-nation-army.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath} (BPM=${bpm})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
