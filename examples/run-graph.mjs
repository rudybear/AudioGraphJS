// Run a runtime GraphSpec or a KHR_audio_graph container and render WAV + trace
// Usage: node examples/run-graph.mjs <path/to/graph.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import wae from 'web-audio-engine';
import { buildGraphAsync, createMemoryTrace, lintGraph } from '../dist/index.js';

const { OfflineAudioContext } = wae;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function mapSourcePlayback(p) {
  const out = {};
  if (typeof p?.when === 'number') out.startTime = (p.when || 0) / 1000;
  if (typeof p?.offset === 'number') out.offset = (p.offset || 0) / 1000;
  if (typeof p?.duration === 'number') out.duration = (p.duration || 0) / 1000;
  if (typeof p?.playbackSpeed === 'number') out.playbackRate = p.playbackSpeed;
  if (typeof p?.loop === 'boolean') out.loop = p.loop;
  if (typeof p?.loopStart === 'number') out.loopStart = (p.loopStart || 0) / 1000;
  if (typeof p?.loopEnd === 'number') out.loopEnd = (p.loopEnd || 0) / 1000;
  return out;
}

function mapFilterParams(kind, p) {
  const base = {};
  switch (kind) {
    case 'lowpass': base.type = 'lowpass'; break;
    case 'highpass': base.type = 'highpass'; break;
    case 'bandpass': base.type = 'bandpass'; break;
    case 'lowshelf': base.type = 'lowshelf'; break;
    case 'highshelf': base.type = 'highshelf'; break;
    case 'peaking': base.type = 'peaking'; break;
    case 'notch': base.type = 'notch'; break;
    case 'allpass': base.type = 'allpass'; break;
  }
  if (typeof p?.frequency === 'number') base.frequency = p.frequency;
  if (typeof p?.qualityFactor === 'number') base.Q = p.qualityFactor;
  if (typeof p?.gain === 'number') base.gain = p.gain;
  if (typeof p?.bypass === 'boolean') base.bypass = p.bypass;
  return base;
}

function mapOscType(t) {
  if (typeof t === 'string') return t;
  switch (t) {
    case 0: return 'sine';
    case 1: return 'square';
    case 2: return 'sawtooth';
    case 3: return 'triangle';
    default: return 'sine';
  }
}

function mapNodeKind(specKind, params) {
  switch (specKind) {
    case 'source':
      if (params?.data?.oscillator) {
        const osc = { ...params.data.oscillator };
        if (osc.type !== undefined) osc.type = mapOscType(osc.type);
        return { kind: 'oscillator', params: { ...osc, ...mapSourcePlayback(params) } };
      }
      if (typeof params?.data?.audioData === 'number') return { kind: 'audio-buffer-source', params: mapSourcePlayback(params) };
      return { kind: 'audio-buffer-source', params: mapSourcePlayback(params) };
    case 'gain': return { kind: 'gain', params };
    case 'delay': return { kind: 'delay', params: { delayTime: (params?.delayTime ?? 0) / 1000, bypass: params?.bypass } };
    case 'lowpass':
    case 'highpass':
    case 'bandpass':
    case 'lowshelf':
    case 'highshelf':
    case 'peaking':
    case 'notch':
    case 'allpass':
      return { kind: 'biquad-filter', params: mapFilterParams(specKind, params) };
    case 'reverb': return { kind: 'convolver', params: { normalize: params?.normalize !== false } };
    case 'waveshaper': return { kind: 'wave-shaper', params };
    case 'splitter': return { kind: 'channel-splitter', params };
    case 'channelmerger': return { kind: 'channel-merger', params };
    case 'channelmixer': return { kind: 'channel-mixer', params };
    case 'audiomixer': return { kind: 'audio-mixer', params };
    case 'emitter': return { kind: 'emitter', params };
    default: return { kind: specKind, params };
  }
}

function mapKHRToRuntime(extRoot, graph) {
  const nodes = [];
  const idByIndex = [];
  for (const n of graph.nodes || []) {
    const mapped = mapNodeKind(n.kind || n.type || n.nodetype || n.name || 'unknown', n.params || n);
    const id = (n.label && typeof n.label === 'string') ? n.label : String(nodes.length);
    // If KHR source references audioData, map to runtime buffer uri
    if (n.kind === 'source' && n.params && typeof n.params.data?.audioData === 'number' && Array.isArray(extRoot.audioData)) {
      const entry = extRoot.audioData[n.params.data.audioData];
      if (entry && typeof entry.uri === 'string') {
        mapped.params = { ...(mapped.params || {}), uri: entry.uri };
      }
    }
    // If KHR reverb provides an impulse reference, map to convolver uri; else synthesize a small IR
    if ((n.kind === 'reverb' || n.kind === 'convolver') && mapped.kind === 'convolver') {
      const p = mapped.params || {};
      if (n.params && typeof n.params.impulse === 'number' && Array.isArray(extRoot.audioData)) {
        const entry = extRoot.audioData[n.params.impulse];
        if (entry && typeof entry.uri === 'string') p.uri = entry.uri;
      }
      if (!p.uri) p.uri = makeIRDataUri({ seconds: 0.4 });
      mapped.params = p;
    }
    idByIndex.push(id);
    nodes.push({ id, kind: mapped.kind, params: mapped.params });
  }
  const connections = [];
  for (const c of graph.connections || []) {
    connections.push({ from: { node: idByIndex[c.from.node], output: c.from.output }, to: { node: idByIndex[c.to.node], input: c.to.input } });
  }
  const outputs = Array.isArray(graph.outputs) ? graph.outputs.map((i) => idByIndex[i]) : undefined;
  return { nodes, connections, outputs };
}

function asRuntimeSpec(obj) {
  if (Array.isArray(obj?.nodes) && Array.isArray(obj?.connections)) return obj;
  const ext = obj?.extensions?.KHR_audio_graph;
  if (ext && Array.isArray(ext.graphs) && ext.graphs.length > 0) return mapKHRToRuntime(ext, ext.graphs[0]);
  throw new Error('Unsupported input JSON: expected runtime GraphSpec or glTF with extensions.KHR_audio_graph');
}

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
function makeNoiseDataUri({ seconds = 0.35, sampleRate = 48000, amp = 0.7 }) {
  const length = Math.floor(sampleRate * seconds);
  const numChannels = 1;
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * amp;
  const wav = writeWavPCM16LE({ samples, sampleRate, numChannels });
  return `data:audio/wav;base64,${Buffer.from(wav).toString('base64')}`;
}
function makeIRDataUri({ seconds = 0.4, sampleRate = 48000, decay = 3 }) {
  const length = Math.floor(sampleRate * seconds);
  const numChannels = 1;
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = Math.pow(1 - t, decay);
    samples[i] = (Math.random() * 2 - 1) * env * 0.6;
  }
  const wav = writeWavPCM16LE({ samples, sampleRate, numChannels });
  return `data:audio/wav;base64,${Buffer.from(wav).toString('base64')}`;
}

function normalizeTrace(lines) {
  return lines.map((l) => l.replace(/(\d+\.\d{1,})/g, (m) => Number.parseFloat(m).toFixed(3)));
}

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('Usage: node examples/run-graph.mjs <graph.json>');
    process.exit(1);
  }
  for (const p of files) {
    const abs = path.resolve(p);
    const base = path.basename(abs).replace(/\W+/g, '_').replace(/_json$/, '');
    const outWav = path.join(__dirname, `output-${base}.wav`);
    const outTrace = path.join(__dirname, `trace-${base}.txt`);
    const json = readJson(abs);
    let spec = asRuntimeSpec(json);
    // For runtime GraphSpec without IR on convolver, synthesize an IR so traces align with KHR mapping
    if (Array.isArray(spec.nodes)) {
      for (const n of spec.nodes) {
        if (n.kind === 'convolver') {
          const p = (n.params ||= {});
          if (!('uri' in p)) p.uri = makeIRDataUri({ seconds: 0.4 });
        }
        // For musical presets, synthesize noise for audio-buffer-source nodes to align with KHR mapping
        if (n.kind === 'audio-buffer-source') {
          const p = (n.params ||= {});
          if (!('buffer' in p) && !('uri' in p)) {
            const key = path.basename(abs).toLowerCase();
            if (key.includes('snare')) { p.uri = makeNoiseDataUri({ seconds: 0.35, amp: 0.7 }); p.duration = 0.35; }
            if (key.includes('cymbal')) { p.uri = makeNoiseDataUri({ seconds: 2.0, amp: 0.5 }); p.duration = 2.0; }
          }
        }
      }
    }
    const { errors } = lintGraph(spec);
    if (errors.length) { console.error(`LINT FAIL ${p}:\n` + errors.join('\n')); process.exitCode = 1; continue; }
    const sr = spec.sampleRate || 48000;
    const ctx = new OfflineAudioContext(2, sr * 2, sr);
    const trace = createMemoryTrace();
    const built = await buildGraphAsync(ctx, spec, trace);
    // Apply preset automation for musical samples
    {
      const nameKey = path.basename(abs).toLowerCase();
      if (nameKey.includes('drum')) {
        const bodyOsc = built.nodes.get('bodyOsc');
        const clickOsc = built.nodes.get('clickOsc');
        const bodyGain = built.nodes.get('bodyGain');
        const clickGain = built.nodes.get('clickGain');
        const t0 = 0;
        bodyOsc?.frequency.setValueAtTime?.(150, t0);
        (bodyOsc?.frequency.exponentialRampToValueAtTime ? bodyOsc.frequency.exponentialRampToValueAtTime.bind(bodyOsc.frequency) : bodyOsc?.frequency.linearRampToValueAtTime?.bind(bodyOsc.frequency))?.(50, t0 + 0.15);
        bodyGain?.gain.setValueAtTime?.(1.0, t0);
        (bodyGain?.gain.exponentialRampToValueAtTime ? bodyGain.gain.exponentialRampToValueAtTime.bind(bodyGain.gain) : bodyGain?.gain.linearRampToValueAtTime?.bind(bodyGain.gain))?.(bodyGain?.gain.exponentialRampToValueAtTime ? 0.0001 : 0, t0 + 0.5);
        clickOsc?.frequency.setValueAtTime?.(2000, t0);
        (clickOsc?.frequency.exponentialRampToValueAtTime ? clickOsc.frequency.exponentialRampToValueAtTime.bind(clickOsc.frequency) : clickOsc?.frequency.linearRampToValueAtTime?.bind(clickOsc.frequency))?.(800, t0 + 0.02);
        clickGain?.gain.setValueAtTime?.(0.5, t0);
        (clickGain?.gain.exponentialRampToValueAtTime ? clickGain.gain.exponentialRampToValueAtTime.bind(clickGain.gain) : clickGain?.gain.linearRampToValueAtTime?.bind(clickGain.gain))?.(clickGain?.gain.exponentialRampToValueAtTime ? 0.0001 : 0, t0 + 0.02);
      } else if (nameKey.includes('snare')) {
        const tone = built.nodes.get('tone');
        const toneGain = built.nodes.get('toneGain');
        const noiseGain = built.nodes.get('noiseGain');
        const t0 = 0;
        tone?.frequency.setValueAtTime?.(220, t0);
        (tone?.frequency.exponentialRampToValueAtTime ? tone.frequency.exponentialRampToValueAtTime.bind(tone.frequency) : tone?.frequency.linearRampToValueAtTime?.bind(tone.frequency))?.(140, t0 + 0.12);
        toneGain?.gain.setValueAtTime?.(0.6, t0);
        (toneGain?.gain.exponentialRampToValueAtTime ? toneGain.gain.exponentialRampToValueAtTime.bind(toneGain.gain) : toneGain?.gain.linearRampToValueAtTime?.bind(toneGain.gain))?.(toneGain?.gain.exponentialRampToValueAtTime ? 0.0001 : 0, t0 + 0.2);
        noiseGain?.gain.setValueAtTime?.(1.0, t0);
        (noiseGain?.gain.exponentialRampToValueAtTime ? noiseGain.gain.exponentialRampToValueAtTime.bind(noiseGain.gain) : noiseGain?.gain.linearRampToValueAtTime?.bind(noiseGain.gain))?.(noiseGain?.gain.exponentialRampToValueAtTime ? 0.0001 : 0, t0 + 0.25);
      } else if (nameKey.includes('cymbal')) {
        const env = built.nodes.get('gainEnv');
        const t0 = 0;
        env?.gain.setValueAtTime?.(1.0, t0);
        (env?.gain.exponentialRampToValueAtTime ? env.gain.exponentialRampToValueAtTime.bind(env.gain) : env?.gain.linearRampToValueAtTime?.bind(env.gain))?.(env?.gain.exponentialRampToValueAtTime ? 0.0001 : 0, t0 + 1.8);
      } else if (nameKey.includes('bass')) {
        const amp = built.nodes.get('amp')?.gain;
        const lpf = undefined; // wrapped filter params not accessible; skip filter envelope in automation
        const t0 = 0;
        amp?.setValueAtTime?.(0.0, t0);
        amp?.linearRampToValueAtTime?.(0.8, t0 + 0.05);
        amp?.linearRampToValueAtTime?.(0.6, t0 + 0.2);
        amp?.linearRampToValueAtTime?.(0.0, t0 + 2.8);
        // skip lpf parameter automation to avoid wrapper indirection
      } else if (nameKey.includes('seven-nation-army')) {
        const A4 = 440;
        function noteFreq(name) {
          const semis = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
          const m = name.match(/^([A-G]#?)(\d)$/);
          const n = m[1], oct = parseInt(m[2]);
          const a4Index = 4 * 12 + 9;
          const idx = oct * 12 + (9 + semis[n]);
          const semitoneDiff = idx - a4Index;
          return A4 * Math.pow(2, semitoneDiff / 12);
        }
        const bpm = 124;
        const secPerBeat = 60 / bpm;
        const step = secPerBeat / 2;
        const barDur = 4 * secPerBeat;
        const bars = 2;
        const riff1 = ['E2','E2','G2','E2','D2','C2','B1', null];
        const riff2 = ['E2','E2','G2','E2','D2','C2','D2','C2'];
        const pattern = riff1.concat(riff2);
        const osc = built.nodes.get('osc');
        const amp = built.nodes.get('amp')?.gain;
        const lpfPre = undefined; const lpfPost = undefined; // skip filter parameter automation
        for (let bar = 0; bar < bars; bar += 2) {
          const baseT = bar * barDur;
          for (let i = 0; i < pattern.length; i++) {
            const t = baseT + i * step;
            const note = pattern[i];
            if (note) {
              const f = noteFreq(note);
              osc?.frequency.setValueAtTime?.(f, t);
              amp?.setValueAtTime?.(0.0, t);
              amp?.linearRampToValueAtTime?.(0.9, t + 0.01);
              amp?.linearRampToValueAtTime?.(0.4, t + 0.1);
              amp?.linearRampToValueAtTime?.(0.0, t + step * 0.95);
            // skip lpf pre/post parameter automation to avoid wrapper indirection
            } else {
              amp?.setValueAtTime?.(0.0, t);
            }
          }
        }
      }
    }
    const rendered = await ctx.startRendering();
    // write wav
    const length = rendered.length;
    const ch0 = rendered.getChannelData(0);
    const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
    const interleaved = new Float32Array(length * 2);
    for (let i = 0; i < length; i++) { interleaved[i * 2] = ch0[i]; interleaved[i * 2 + 1] = ch1[i]; }
    const wav = writeWavPCM16LE({ samples: interleaved, sampleRate: sr, numChannels: 2 });
    fs.writeFileSync(outWav, wav);
    const sum = md5(wav);
    // write trace
    fs.writeFileSync(outTrace, normalizeTrace(trace.getLines()).join('\n'));
    console.log(`OK   ${p} -> wav=${path.basename(outWav)} md5=${sum} trace=${path.basename(outTrace)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
