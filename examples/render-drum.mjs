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
  const dur = 1.0; // seconds
  const ctx = new OfflineAudioContext(1, Math.floor(sr * dur), sr);

  // Graph: body osc -> bodyGain -> mix; click osc -> clickGain -> mix; mix -> dest
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'bodyOsc', kind: 'oscillator', params: { type: 'sine', frequency: 150, startTime: 0 } },
      { id: 'bodyGain', kind: 'gain', params: { gain: 1.0 } },
      { id: 'clickOsc', kind: 'oscillator', params: { type: 'sine', frequency: 2000, startTime: 0 } },
      { id: 'clickGain', kind: 'gain', params: { gain: 0.5 } },
      { id: 'mix', kind: 'audio-mixer', params: {} }
    ],
    connections: [
      { from: { node: 'bodyOsc' }, to: { node: 'bodyGain' } },
      { from: { node: 'bodyGain' }, to: { node: 'mix' } },
      { from: { node: 'clickOsc' }, to: { node: 'clickGain' } },
      { from: { node: 'clickGain' }, to: { node: 'mix' } }
    ]
  };

  const g = buildGraph(ctx, spec);
  const bodyOsc = g.nodes.get('bodyOsc');
  const clickOsc = g.nodes.get('clickOsc');
  const bodyGain = g.nodes.get('bodyGain');
  const clickGain = g.nodes.get('clickGain');
  const mix = g.nodes.get('mix');
  mix.connect(ctx.destination);

  // Kick drum envelopes
  const t0 = 0;
  // Body: frequency sweep 150 -> 50 Hz in 150ms, amplitude decays over 500ms
  bodyOsc.frequency.setValueAtTime(150, t0);
  if (bodyOsc.frequency.exponentialRampToValueAtTime) {
    bodyOsc.frequency.exponentialRampToValueAtTime(50, t0 + 0.15);
  } else {
    bodyOsc.frequency.linearRampToValueAtTime(50, t0 + 0.15);
  }
  bodyGain.gain.setValueAtTime(1.0, t0);
  // Avoid zero in exponential ramp: ramp to tiny value
  if (bodyGain.gain.exponentialRampToValueAtTime) {
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  } else {
    bodyGain.gain.linearRampToValueAtTime(0, t0 + 0.5);
  }

  // Click: short high freq burst 2k -> 800 Hz in 20ms, amplitude very fast decay
  clickOsc.frequency.setValueAtTime(2000, t0);
  if (clickOsc.frequency.exponentialRampToValueAtTime) {
    clickOsc.frequency.exponentialRampToValueAtTime(800, t0 + 0.02);
  } else {
    clickOsc.frequency.linearRampToValueAtTime(800, t0 + 0.02);
  }
  clickGain.gain.setValueAtTime(0.5, t0);
  if (clickGain.gain.exponentialRampToValueAtTime) {
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);
  } else {
    clickGain.gain.linearRampToValueAtTime(0, t0 + 0.02);
  }

  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  const wav = writeWavPCM16LE({ samples: out, sampleRate: sr, numChannels: 1 });
  const outPath = path.join(__dirname, 'output-drum.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

