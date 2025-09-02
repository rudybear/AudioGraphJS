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
    const spec = asRuntimeSpec(json);
    const { errors } = lintGraph(spec);
    if (errors.length) { console.error(`LINT FAIL ${p}:\n` + errors.join('\n')); process.exitCode = 1; continue; }
    const sr = spec.sampleRate || 48000;
    const ctx = new OfflineAudioContext(2, sr * 2, sr);
    const trace = createMemoryTrace();
    const built = await buildGraphAsync(ctx, spec, trace);
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
