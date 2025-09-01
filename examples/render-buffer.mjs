// Render a short clip from a URI-based audio buffer source to WAV.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wae from 'web-audio-engine';
import { buildGraphAsync } from '../dist/index.js';

const { OfflineAudioContext } = wae;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function floatTo16BitPCM(float32) {
  const s = Math.max(-1, Math.min(1, float32));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

function writeWavPCM16LE({ samples, sampleRate, numChannels }) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  let o = 0;
  buffer.write('RIFF', o); o += 4;
  buffer.writeUInt32LE(36 + dataSize, o); o += 4;
  buffer.write('WAVE', o); o += 4;
  buffer.write('fmt ', o); o += 4;
  buffer.writeUInt32LE(16, o); o += 4; // PCM chunk size
  buffer.writeUInt16LE(1, o); o += 2; // PCM format
  buffer.writeUInt16LE(numChannels, o); o += 2;
  buffer.writeUInt32LE(sampleRate, o); o += 4;
  buffer.writeUInt32LE(byteRate, o); o += 4;
  buffer.writeUInt16LE(blockAlign, o); o += 2;
  buffer.writeUInt16LE(16, o); o += 2; // bits per sample
  buffer.write('data', o); o += 4;
  buffer.writeUInt32LE(dataSize, o); o += 4;
  for (let i = 0; i < samples.length; i++) {
    const v = floatTo16BitPCM(samples[i]);
    buffer.writeInt16LE(v, 44 + i * 2);
  }
  return buffer;
}

function makeSineWavDataUri({ seconds = 1, sampleRate = 48000, freq = 440 }) {
  const length = Math.floor(sampleRate * seconds);
  const numChannels = 1;
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  const wav = writeWavPCM16LE({ samples, sampleRate, numChannels });
  const b64 = Buffer.from(wav).toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

async function main() {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, sr * 2, sr);

  const uri = makeSineWavDataUri({ seconds: 1.5, sampleRate: sr, freq: 330 });
  const spec = {
    sampleRate: sr,
    nodes: [
      { id: 'src', kind: 'audio-buffer-source', params: { uri, startTime: 0 } },
      { id: 'gain', kind: 'gain', params: { gain: 0.8 } },
    ],
    connections: [
      { from: { node: 'src' }, to: { node: 'gain' } },
    ],
  };

  const g = await buildGraphAsync(ctx, spec);
  g.nodes.get('gain')?.connect(ctx.destination);
  const rendered = await ctx.startRendering();

  const channels = rendered.numberOfChannels;
  const length = rendered.length;
  const interleaved = new Float32Array(length * Math.min(2, channels));
  if (channels === 1) {
    const ch0 = rendered.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const v = ch0[i];
      interleaved[i * 2] = v;
      interleaved[i * 2 + 1] = v;
    }
  } else {
    const ch0 = rendered.getChannelData(0);
    const ch1 = rendered.getChannelData(1);
    for (let i = 0; i < length; i++) {
      interleaved[i * 2] = ch0[i];
      interleaved[i * 2 + 1] = ch1[i];
    }
  }

  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-uri.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

