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
  const bpm = 110;
  const bars = 4;
  const sr = 48000;
  const secPerBeat = 60 / bpm;
  const barDur = 4 * secPerBeat;
  const dur = bars * barDur;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * dur), sr);

  // Make reusable noise buffers
  const makeNoise = (seconds, amp) => {
    const len = Math.max(1, Math.floor(seconds * sr));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * amp;
    return buf;
  };
  const snareNoise = makeNoise(0.4, 0.7);
  const hatNoise = makeNoise(0.2, 0.5);

  // Build graph spec
  const spec = { sampleRate: sr, nodes: [], connections: [] };

  // Master bus
  spec.nodes.push({ id: 'master', kind: 'gain', params: { gain: 0.9 } });

  // Track buses
  const tracks = ['kick', 'snare', 'hat', 'bass', 'lead', 'pad'];
  for (const t of tracks) {
    spec.nodes.push({ id: `${t}_bus`, kind: 'gain', params: { gain: 1.0 } });
    spec.connections.push({ from: { node: `${t}_bus` }, to: { node: 'master' } });
  }

  // Drum pattern (kick on 1/3, snare on 2/4, hat 8ths)
  const kickHits = [];
  const snareHits = [];
  const hatHits = [];
  for (let bar = 0; bar < bars; bar++) {
    const tBar = bar * barDur;
    const beats = [0, 1, 2, 3].map(b => tBar + b * secPerBeat);
    // Kick
    [beats[0], beats[2]].forEach((t, i) => {
      const id = `kick_${bar}_${i}`; const gid = `${id}_g`;
      spec.nodes.push({ id, kind: 'oscillator', params: { type: 'sine', frequency: 150, startTime: t, stopTime: t + 0.6 } });
      spec.nodes.push({ id: gid, kind: 'gain', params: { gain: 1.0 } });
      spec.connections.push({ from: { node: id }, to: { node: gid } });
      spec.connections.push({ from: { node: gid }, to: { node: 'kick_bus' } });
      kickHits.push({ id, gid, t });
    });
    // Snare
    [beats[1], beats[3]].forEach((t, i) => {
      const id = `sn_${bar}_${i}`; const hpf = `${id}_hp`; const bpf = `${id}_bp`; const gid = `${id}_g`;
      spec.nodes.push({ id, kind: 'audio-buffer-source', params: { buffer: snareNoise, startTime: t, stopTime: t + 0.35 } });
      spec.nodes.push({ id: hpf, kind: 'biquad-filter', params: { type: 'highpass', frequency: 800 } });
      spec.nodes.push({ id: bpf, kind: 'biquad-filter', params: { type: 'bandpass', frequency: 1800, Q: 0.8 } });
      spec.nodes.push({ id: gid, kind: 'gain', params: { gain: 1.0 } });
      spec.connections.push({ from: { node: id }, to: { node: hpf } });
      spec.connections.push({ from: { node: hpf }, to: { node: bpf } });
      spec.connections.push({ from: { node: bpf }, to: { node: gid } });
      spec.connections.push({ from: { node: gid }, to: { node: 'snare_bus' } });
      snareHits.push({ gid, t });
    });
    // Hat 8ths
    for (let s = 0; s < 8; s++) {
      const t = tBar + s * (secPerBeat / 2);
      const id = `hat_${bar}_${s}`; const hp = `${id}_hp`; const gid = `${id}_g`;
      spec.nodes.push({ id, kind: 'audio-buffer-source', params: { buffer: hatNoise, startTime: t, stopTime: t + 0.12 } });
      spec.nodes.push({ id: hp, kind: 'biquad-filter', params: { type: 'highpass', frequency: 8000, Q: 0.707 } });
      spec.nodes.push({ id: gid, kind: 'gain', params: { gain: 0.7 } });
      spec.connections.push({ from: { node: id }, to: { node: hp } });
      spec.connections.push({ from: { node: hp }, to: { node: gid } });
      spec.connections.push({ from: { node: gid }, to: { node: 'hat_bus' } });
      hatHits.push({ gid, t });
    }
  }

  // Bassline (A minor: A2, A2, C3, E3) quarter notes
  spec.nodes.push({ id: 'bass_osc', kind: 'oscillator', params: { type: 'square', pulseWidth: 0.2, frequency: 110, startTime: 0 } });
  spec.nodes.push({ id: 'bass_lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 400, Q: 0.8 } });
  spec.nodes.push({ id: 'bass_gain', kind: 'gain', params: { gain: 0.0 } });
  spec.connections.push({ from: { node: 'bass_osc' }, to: { node: 'bass_lp' } });
  spec.connections.push({ from: { node: 'bass_lp' }, to: { node: 'bass_gain' } });
  spec.connections.push({ from: { node: 'bass_gain' }, to: { node: 'bass_bus' } });

  // Lead (two saws) bus
  spec.nodes.push({ id: 'lead_osc1', kind: 'oscillator', params: { type: 'sawtooth', frequency: 440, startTime: 0 } });
  spec.nodes.push({ id: 'lead_osc2', kind: 'oscillator', params: { type: 'sawtooth', frequency: 446, startTime: 0 } });
  spec.nodes.push({ id: 'lead_mix', kind: 'audio-mixer', params: {} });
  spec.nodes.push({ id: 'lead_lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 3000, Q: 0.7 } });
  spec.nodes.push({ id: 'lead_gain', kind: 'gain', params: { gain: 0.0 } });
  spec.connections.push({ from: { node: 'lead_osc1' }, to: { node: 'lead_mix' } });
  spec.connections.push({ from: { node: 'lead_osc2' }, to: { node: 'lead_mix' } });
  spec.connections.push({ from: { node: 'lead_mix' }, to: { node: 'lead_lp' } });
  spec.connections.push({ from: { node: 'lead_lp' }, to: { node: 'lead_gain' } });
  spec.connections.push({ from: { node: 'lead_gain' }, to: { node: 'lead_bus' } });

  // Pad (3 saws) wet/dry to bus
  spec.nodes.push({ id: 'pad_o1', kind: 'oscillator', params: { type: 'sawtooth', frequency: 220, startTime: 0 } });
  spec.nodes.push({ id: 'pad_o2', kind: 'oscillator', params: { type: 'sawtooth', frequency: 277, startTime: 0 } }); // C# (as tension)
  spec.nodes.push({ id: 'pad_o3', kind: 'oscillator', params: { type: 'sawtooth', frequency: 329.63, startTime: 0 } }); // E
  spec.nodes.push({ id: 'pad_mix', kind: 'audio-mixer', params: {} });
  spec.nodes.push({ id: 'pad_lp', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 1500, Q: 0.6 } });
  spec.nodes.push({ id: 'pad_dry', kind: 'gain', params: { gain: 0.6 } });
  spec.nodes.push({ id: 'pad_wet', kind: 'gain', params: { gain: 0.4 } });
  spec.nodes.push({ id: 'pad_conv', kind: 'convolver', params: { normalize: true } });
  spec.connections.push({ from: { node: 'pad_o1' }, to: { node: 'pad_mix' } });
  spec.connections.push({ from: { node: 'pad_o2' }, to: { node: 'pad_mix' } });
  spec.connections.push({ from: { node: 'pad_o3' }, to: { node: 'pad_mix' } });
  spec.connections.push({ from: { node: 'pad_mix' }, to: { node: 'pad_lp' } });
  spec.connections.push({ from: { node: 'pad_lp' }, to: { node: 'pad_dry' } });
  spec.connections.push({ from: { node: 'pad_lp' }, to: { node: 'pad_conv' } });
  spec.connections.push({ from: { node: 'pad_conv' }, to: { node: 'pad_wet' } });
  spec.connections.push({ from: { node: 'pad_dry' }, to: { node: 'pad_bus' } });
  spec.connections.push({ from: { node: 'pad_wet' }, to: { node: 'pad_bus' } });

  // Connect master to destination
  const g = buildGraph(ctx, spec);
  g.nodes.get('master')?.connect(ctx.destination);

  // Create a simple IR for pad reverb
  const irLen = Math.floor(sr * 0.5);
  const ir = ctx.createBuffer(1, irLen, sr);
  const irData = ir.getChannelData(0);
  for (let i = 0; i < irLen; i++) { const t = i / irLen; irData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.5; }
  const padConv = g.nodes.get('pad_conv');
  padConv.buffer = ir;

  // Automations
  // Kicks
  for (const { id, gid, t } of kickHits) {
    const osc = g.nodes.get(id);
    const gg = g.nodes.get(gid).gain;
    osc.frequency.setValueAtTime(150, t);
    (osc.frequency.exponentialRampToValueAtTime || osc.frequency.linearRampToValueAtTime).call(osc.frequency, 50, t + 0.15);
    gg.setValueAtTime(1.0, t);
    (gg.exponentialRampToValueAtTime || gg.linearRampToValueAtTime).call(gg, 0.0001, t + 0.5);
  }
  // Snares
  for (const { gid, t } of snareHits) {
    const gg = g.nodes.get(gid).gain;
    gg.setValueAtTime(1.0, t);
    (gg.exponentialRampToValueAtTime || gg.linearRampToValueAtTime).call(gg, 0.0001, t + 0.25);
  }
  // Hats
  for (const { gid, t } of hatHits) {
    const gg = g.nodes.get(gid).gain;
    gg.setValueAtTime(0.7, t);
    (gg.exponentialRampToValueAtTime || gg.linearRampToValueAtTime).call(gg, 0.0001, t + 0.08);
  }

  // Bass notes (A2, A2, C3, E3 repeating)
  const bassNotes = [110, 110, 130.81, 164.81];
  const bassStep = secPerBeat; // quarters
  const bassOsc = g.nodes.get('bass_osc');
  const bassGain = g.nodes.get('bass_gain').gain;
  const bassLp = g.nodes.get('bass_lp');
  for (let i = 0; i < 16; i++) {
    const t = i * bassStep;
    const f = bassNotes[i % bassNotes.length];
    bassOsc.frequency.setValueAtTime(f, t);
    // ADSR-ish per note
    bassGain.setValueAtTime(0.0, t);
    bassGain.linearRampToValueAtTime(0.7, t + 0.03);
    bassGain.linearRampToValueAtTime(0.0, t + bassStep * 0.9);
    // slight filter movement
    bassLp.frequency.setValueAtTime(400, t);
    bassLp.frequency.linearRampToValueAtTime(200, t + 0.2);
  }

  // Lead arpeggio (A4, C5, E5, A5) 8ths
  const leadNotes = [440, 523.25, 659.25, 880];
  const leadStep = secPerBeat / 2;
  const lead1 = g.nodes.get('lead_osc1');
  const lead2 = g.nodes.get('lead_osc2');
  const leadGain = g.nodes.get('lead_gain').gain;
  const leadLp = g.nodes.get('lead_lp');
  for (let i = 0; i < 32; i++) {
    const t = i * leadStep;
    const f = leadNotes[i % leadNotes.length];
    lead1.frequency.setValueAtTime(f, t);
    lead2.frequency.setValueAtTime(f * 1.013, t);
    leadGain.setValueAtTime(0.0, t);
    leadGain.linearRampToValueAtTime(0.6, t + 0.03);
    leadGain.linearRampToValueAtTime(0.0, t + leadStep * 0.9);
    leadLp.frequency.setValueAtTime(1500, t);
    leadLp.frequency.linearRampToValueAtTime(3000, t + leadStep);
  }

  // Pad slow filter sweep
  const padLp = g.nodes.get('pad_lp');
  padLp.frequency.setValueAtTime(800, 0);
  padLp.frequency.linearRampToValueAtTime(1600, dur * 0.5);
  padLp.frequency.linearRampToValueAtTime(1000, dur);

  const rendered = await ctx.startRendering();
  const length = rendered.length;
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.getChannelData(1);
  const interleaved = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
  const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
  const outPath = path.join(__dirname, 'output-song.wav');
  fs.writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath} (BPM=${bpm}, bars=${bars})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

