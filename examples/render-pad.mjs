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
  const dur = 6.0;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * dur), sr);

  // Pad: 3 detuned saws -> lowpass -> convolver reverb wet/dry -> pan
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'o1', kind: 'oscillator', params: { type: 'sawtooth', frequency: 220, startTime: 0 } },
      { id: 'o2', kind: 'oscillator', params: { type: 'sawtooth', frequency: 223, startTime: 0 } },
      { id: 'o3', kind: 'oscillator', params: { type: 'sawtooth', frequency: 217, startTime: 0 } },
      { id: 'mix', kind: 'audio-mixer', params: {} },
      { id: 'lpf', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 1500, Q: 0.6 } },
      { id: 'dry', kind: 'gain', params: { gain: 0.6 } },
      { id: 'wet', kind: 'gain', params: { gain: 0.4 } },
      { id: 'conv', kind: 'convolver', params: { uri: null, normalize: true } },
      { id: 'pan', kind: 'stereo-panner', params: { pan: 0.0 } }
    ],
    connections: [
      { from: { node: 'o1' }, to: { node: 'mix' } },
      { from: { node: 'o2' }, to: { node: 'mix' } },
      { from: { node: 'o3' }, to: { node: 'mix' } },
      { from: { node: 'mix' }, to: { node: 'lpf' } },
      { from: { node: 'lpf' }, to: { node: 'dry' } },
      { from: { node: 'lpf' }, to: { node: 'conv' } },
      { from: { node: 'conv' }, to: { node: 'wet' } },
      { from: { node: 'dry' }, to: { node: 'pan' } },
      { from: { node: 'wet' }, to: { node: 'pan' } }
    ]
  };

  // Make a simple IR (decaying noise)
  const irLen = Math.floor(sr * 0.5);
  const ir = ctx.createBuffer(1, irLen, sr);
  const irData = ir.getChannelData(0);
  for (let i = 0; i < irLen; i++) { const t = i / irLen; irData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.5; }
  spec.nodes.find(n => n.id === 'conv').params.buffer = ir;

  const g = await buildGraphAsync(ctx, spec);
  g.nodes.get('pan')?.connect(ctx.destination);

  // Slow amp attack/release (validates Gain)
  const oAmp = ctx.createGain(); // Not used; automate lpf and panner instead
  const lpf = g.nodes.get('lpf');
  lpf.frequency.setValueAtTime(800, 0);
  lpf.frequency.linearRampToValueAtTime(2000, dur * 0.5);
  lpf.frequency.linearRampToValueAtTime(1000, dur);

  const pan = g.nodes.get('pan').pan;
  pan.setValueAtTime(-0.1, 0);
  pan.linearRampToValueAtTime(0.1, dur);

  const rendered = await ctx.startRendering();
  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.getChannelData(1);
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-pad.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

