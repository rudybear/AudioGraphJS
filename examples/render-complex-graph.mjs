import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wae from 'web-audio-engine';
import { buildGraphAsync, createMemoryTrace } from '../dist/index.js';

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

function makeSineWavDataUri({ seconds = 1.2, sampleRate = 48000, freq = 220, amp = 0.4 }) {
  const length = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp;
  const wav = writeWavPCM16LE({ samples, sampleRate, numChannels: 1 });
  const b64 = Buffer.from(wav).toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

function makeIRDataUri({ seconds = 0.5, sampleRate = 48000, decay = 3 }) {
  const length = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.6;
  }
  const wav = writeWavPCM16LE({ samples, sampleRate, numChannels: 1 });
  const b64 = Buffer.from(wav).toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

async function main() {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, sr * 4, sr);

  const uriA = makeSineWavDataUri({ seconds: 2.0, sampleRate: sr, freq: 220, amp: 0.35 });
  const irUri = makeIRDataUri({ seconds: 0.4, sampleRate: sr, decay: 3 });

  const spec = {
    sampleRate: sr,
    nodes: [
      // Two sources: buffer and oscillator PWM
      { id: 'srcA', kind: 'audio-buffer-source', params: { uri: uriA, startTime: 0 } },
      { id: 'srcB', kind: 'oscillator', params: { type: 'square', pulseWidth: 0.3, frequency: 440, startTime: 0 } },

      // Mix sources
      { id: 'mix', kind: 'audio-mixer', params: {} },

      // Tone shaping
      { id: 'postGain', kind: 'gain', params: { gain: 0.6 } },
      { id: 'lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 3000, Q: 0.707 } },
      { id: 'delay', kind: 'delay', params: { maxDelayTime: 1, delayTime: 0.12 } },

      // Reverb path
      { id: 'conv', kind: 'convolver', params: { uri: irUri, normalize: true } },
      { id: 'dry', kind: 'gain', params: { gain: 0.7 } },
      { id: 'wet', kind: 'gain', params: { gain: 0.3 } },

      // Stereo stage then emitter (global)
      { id: 'pan', kind: 'stereo-panner', params: { pan: -0.2 } },
      { id: 'emit', kind: 'emitter', params: { emitterType: 'global', gain: 0.9 } },
    ],
    connections: [
      { from: { node: 'srcA' }, to: { node: 'mix' } },
      { from: { node: 'srcB' }, to: { node: 'mix' } },

      { from: { node: 'mix' }, to: { node: 'postGain' } },
      { from: { node: 'postGain' }, to: { node: 'lp' } },
      { from: { node: 'lp' }, to: { node: 'delay' } },

      // Split to dry/wet
      { from: { node: 'delay' }, to: { node: 'dry' } },
      { from: { node: 'delay' }, to: { node: 'conv' } },
      { from: { node: 'conv' }, to: { node: 'wet' } },

      // Sum to stereo panner
      { from: { node: 'dry' }, to: { node: 'pan' } },
      { from: { node: 'wet' }, to: { node: 'pan' } },

      // Final to emitter (auto to destination)
      { from: { node: 'pan' }, to: { node: 'emit' } }
    ]
  };

  const trace = createMemoryTrace();
  const g = await buildGraphAsync(ctx, spec, trace);
  // emitter auto-connects to destination
  const rendered = await ctx.startRendering();

  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-complex.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);

  const tracePath = path.join(__dirname, 'output-complex-trace.txt');
  fs.writeFileSync(tracePath, trace.getLines().join('\n'));
  console.log(`Trace written to ${tracePath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
