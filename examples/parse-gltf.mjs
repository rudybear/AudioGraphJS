// Parse a glTF with KHR_audio_graph and build/run it with our runtime, logging Web Audio calls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wae from 'web-audio-engine';
import { buildGraphAsync, createMemoryTrace } from '../dist/index.js';

const { OfflineAudioContext } = wae;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readJson(p) {
  const text = fs.readFileSync(p, 'utf-8');
  return JSON.parse(text);
}

function mapNodeKind(specKind, params) {
  switch (specKind) {
    case 'source':
      if (params?.data?.oscillator) return { kind: 'oscillator', params: { ...params.data.oscillator, ...mapSourcePlayback(params) } };
      if (typeof params?.data?.audioData === 'number') {
        // We'll pass through via uri if present on audioData at root; mapper will resolve later
        return { kind: 'audio-buffer-source', params: mapSourcePlayback(params) };
      }
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
    // No dedicated panner nodes in spec; spatialization via emitter + glTF transforms
    case 'emitter': return { kind: 'emitter', params };
    default: return { kind: specKind, params };
  }
}

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

function mapGraph(extRoot, graph) {
  const nodes = [];
  // Build nodes mapping spec kinds to runtime kinds
  for (const n of graph.nodes || []) {
    const mapped = mapNodeKind(n.kind || n.type || n.nodetype || n.name || 'unknown', n.params || n);
    // Generate string id as index
    nodes.push({ id: String(nodes.length), kind: mapped.kind, params: mapped.params });
  }
  const connections = [];
  for (const c of graph.connections || []) {
    connections.push({ from: { node: String(c.from.node), output: c.from.output }, to: { node: String(c.to.node), input: c.to.input } });
  }
  return { nodes, connections };
}

async function runOne(file) {
  const gltf = readJson(file);
  const ext = gltf.extensions && gltf.extensions.KHR_audio_graph;
  if (!ext) { console.warn(`No KHR_audio_graph in ${file}`); return; }
  const graphs = ext.graphs || [];
  if (graphs.length === 0) { console.warn(`No graphs in ${file}`); return; }

  const sr = 48000;
  const ctx = new OfflineAudioContext(2, sr * 2, sr);
  const trace = createMemoryTrace();
  const spec = mapGraph(ext, graphs[0]);
  const built = await buildGraphAsync(ctx, { nodes: spec.nodes, connections: spec.connections, sampleRate: sr }, trace);
  // Connect outputs to destination if provided
  if (Array.isArray(graphs[0].outputs)) {
    for (const idx of graphs[0].outputs) {
      const node = built.nodes.get(String(idx));
      if (node) node.connect(ctx.destination);
    }
  }
  // Always try to render; main goal is traces
  await ctx.startRendering();
  const outTracePath = path.join(__dirname, `gltf-trace-${path.basename(file).replace(/\W+/g,'_')}.txt`);
  fs.writeFileSync(outTracePath, trace.getLines().join('\n'));
  console.log(`Wrote trace: ${outTracePath}`);
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('Usage: node examples/parse-gltf.mjs <file1.gltf> [file2.gltf ...]');
    process.exit(1);
  }
  for (const f of files) {
    try { await runOne(path.resolve(f)); } catch (e) { console.error(`Failed ${f}:`, e); }
  }
}

main();
