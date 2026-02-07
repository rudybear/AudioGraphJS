import { buildGraph, applyEmitterInstances, parseLayeredExtensions, applyEmitterInstancesFromExtension } from '../../src/index.js';

// ── Example registry ────────────────────────────────────────────────────────

const EXAMPLES = [
  { cat: 'Oscillators', name: 'Sine 440 Hz', path: '../graphs/osc.json' },
  { cat: 'Oscillators', name: 'Square PWM', path: '../graphs/osc-pwm.json' },
  { cat: 'Oscillators', name: 'With Emitter', path: '../graphs/with-emitter.json' },

  { cat: 'Effects', name: 'Gain', path: '../graphs/gain.json' },
  { cat: 'Effects', name: 'Biquad Filter', path: '../graphs/biquad.json' },
  { cat: 'Effects', name: 'Delay', path: '../graphs/delay.json' },
  { cat: 'Effects', name: 'Convolver (reverb)', path: '../graphs/convolver.json' },
  { cat: 'Effects', name: 'Convolver Mix', path: '../graphs/convolver-mix.json' },
  { cat: 'Effects', name: 'Stereo Panner', path: '../graphs/stereo-panner.json' },
  { cat: 'Effects', name: 'Wave Shaper', path: '../graphs/seven-nation-army.json', label: '7 Nation Army' },
  { cat: 'Effects', name: 'Bypass ON', path: '../graphs/bypass-on.json' },
  { cat: 'Effects', name: 'Bypass (bypassed)', path: '../graphs/bypass-bypassed.json' },

  { cat: 'Routing', name: 'Channel Splitter', path: '../graphs/splitter.json' },
  { cat: 'Routing', name: 'Split/Merge/Mix', path: '../graphs/split-merge-mix.json' },
  { cat: 'Routing', name: 'Channel Mixer', path: '../graphs/channel-mixer.json' },
  { cat: 'Routing', name: 'Audio Mixer', path: '../graphs/audio-mixer.json' },
  { cat: 'Routing', name: 'Simple Outputs', path: '../graphs/simple-outputs.json' },

  { cat: 'Instruments', name: 'Kick Drum', path: '../graphs/drum.json' },
  { cat: 'Instruments', name: 'Snare', path: '../graphs/snare.json' },
  { cat: 'Instruments', name: 'Cymbal', path: '../graphs/cymbal.json' },
  { cat: 'Instruments', name: 'Drum Party', path: '../graphs/drum-party.json' },
  { cat: 'Instruments', name: 'Bass Synth', path: '../graphs/bass.json' },
  { cat: 'Instruments', name: 'Lead Synth', path: '../graphs/lead.json' },
  { cat: 'Instruments', name: 'Pad', path: '../graphs/pad.json' },
  { cat: 'Instruments', name: 'Song', path: '../graphs/song.json' },

  { cat: 'Complex', name: 'Complex Graph', path: '../graphs/complex.json' },
  { cat: 'Complex', name: 'Buffer Source', path: '../graphs/buffer.json' },
  { cat: 'Complex', name: 'Spatial Emitter', path: '../graphs/spatial-emitter.json' },
  { cat: 'Complex', name: 'Spatial Instanced', path: '../graphs/spatial-emitter-instanced.json' },

  { cat: 'Layered (KHR_audio_emitter)', name: 'Emitter Only', path: '../graphs-layered/simple-emitter-only.json', layered: true },
  { cat: 'Layered (KHR_audio_emitter)', name: 'Graph Processing', path: '../graphs-layered/graph-processing.json', layered: true },
  { cat: 'Layered (KHR_audio_emitter)', name: 'Oscillator Graph', path: '../graphs-layered/oscillator-graph.json', layered: true },
  { cat: 'Layered (KHR_audio_emitter)', name: 'Spatial + Environment', path: '../graphs-layered/spatial-with-environment.json', layered: true },
];

// ── State ───────────────────────────────────────────────────────────────────

let ctx = null;
let currentBtn = null;
let stopTimer = null;

const stopBtn = document.getElementById('stopBtn');
const nowPlaying = document.getElementById('nowPlaying');
const logEl = document.getElementById('log');

function log(msg) {
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Audio helpers ───────────────────────────────────────────────────────────

function generateNoiseBuffer(ctx, seconds = 0.5, amp = 0.7) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * amp;
  return buf;
}

function generateIRBuffer(ctx, seconds = 0.4, decay = 3) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.6;
  }
  return buf;
}

/** Resolve GENERATE_NOISE URIs to data: URIs (for layered format) */
function resolveNoiseUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('GENERATE_NOISE')) return uri;
  const parts = uri.split(':');
  const seconds = parts[1] ? parseFloat(parts[1]) : 1.0;
  const amp = parts[2] ? parseFloat(parts[2]) : 0.7;
  // Return a marker we'll resolve to a buffer at build time
  return `__NOISE__:${seconds}:${amp}`;
}

/** Patch spec nodes: synthesize noise/IR buffers, connect emitters to destination */
function patchSpec(spec, ctx) {
  for (const n of spec.nodes) {
    // Convolver without buffer/uri: synthesize IR
    if (n.kind === 'convolver') {
      const p = (n.params ||= {});
      if (!p.buffer && !p.uri) {
        p.buffer = generateIRBuffer(ctx);
      }
    }
    // Audio-buffer-source without buffer/uri: synthesize noise
    if (n.kind === 'audio-buffer-source') {
      const p = (n.params ||= {});
      if (!p.buffer && !p.uri) {
        p.buffer = generateNoiseBuffer(ctx, 1.0, 0.6);
        p.startTime = 0;
      }
      // Handle __NOISE__ marker from layered format
      if (typeof p.uri === 'string' && p.uri.startsWith('__NOISE__')) {
        const parts = p.uri.split(':');
        const secs = parseFloat(parts[1]) || 1.0;
        const amp = parseFloat(parts[2]) || 0.7;
        p.buffer = generateNoiseBuffer(ctx, secs, amp);
        delete p.uri;
        p.startTime = 0;
      }
    }
  }
}

/** Connect all emitter buses to ctx.destination (for examples without __emitterInstances) */
function connectEmitters(built, spec, json) {
  // Handle __emitterInstances from the JSON
  if (Array.isArray(json?.__emitterInstances)) {
    const resolved = json.__emitterInstances.map(e => ({
      emitterNodeId: e.emitterNodeId,
      translation: e.translation,
      rotation: e.rotation,
      scale: e.scale,
    }));
    applyEmitterInstances(built, spec, resolved);
    return;
  }
  // Otherwise just connect emitter buses directly to destination
  for (const n of spec.nodes) {
    if (n.kind === 'emitter') {
      const bus = built._inputs.get(n.id);
      if (bus) bus.connect(ctx.destination);
    }
  }
}

// ── Musical automation presets ──────────────────────────────────────────────

function applyAutomation(name, built) {
  const key = name.toLowerCase();
  const t0 = ctx.currentTime;
  const ramp = (param, target, time) => {
    if (param?.exponentialRampToValueAtTime && target > 0) {
      param.exponentialRampToValueAtTime(Math.max(target, 0.0001), time);
    } else {
      param?.linearRampToValueAtTime?.(target, time);
    }
  };

  if (key.includes('drum') && !key.includes('party')) {
    const bodyOsc = built.nodes.get('bodyOsc');
    const clickOsc = built.nodes.get('clickOsc');
    const bodyGain = built.nodes.get('bodyGain');
    const clickGain = built.nodes.get('clickGain');
    bodyOsc?.frequency.setValueAtTime?.(150, t0);
    ramp(bodyOsc?.frequency, 50, t0 + 0.15);
    bodyGain?.gain.setValueAtTime?.(1.0, t0);
    ramp(bodyGain?.gain, 0.0001, t0 + 0.5);
    clickOsc?.frequency.setValueAtTime?.(2000, t0);
    ramp(clickOsc?.frequency, 800, t0 + 0.02);
    clickGain?.gain.setValueAtTime?.(0.5, t0);
    ramp(clickGain?.gain, 0.0001, t0 + 0.02);
    return 0.6;
  }

  if (key.includes('drum-party') || key.includes('drum_party')) {
    const kickOsc = built.nodes.get('kick');
    const kickGain = built.nodes.get('kickGain');
    const snareGain = built.nodes.get('snareGain');
    const bpm = 120, step = 60 / bpm;
    // 8-beat pattern: kick on 1,3,5,7 — snare on 3,7
    const beats = 8;
    for (let i = 0; i < beats; i++) {
      const t = t0 + i * step;
      const isKick = i % 2 === 0;
      const isSnare = i % 4 === 2;
      if (isKick) {
        kickOsc?.frequency.setValueAtTime?.(150, t);
        ramp(kickOsc?.frequency, 50, t + 0.15);
        kickGain?.gain.setValueAtTime?.(0.9, t);
        ramp(kickGain?.gain, 0.0001, t + 0.4);
      }
      if (isSnare) {
        snareGain?.gain.setValueAtTime?.(0.8, t);
        ramp(snareGain?.gain, 0.0001, t + 0.2);
      }
    }
    return beats * step + 0.3;
  }

  if (key.includes('snare')) {
    const tone = built.nodes.get('tone');
    const toneGain = built.nodes.get('toneGain');
    const noiseGain = built.nodes.get('noiseGain');
    tone?.frequency.setValueAtTime?.(220, t0);
    ramp(tone?.frequency, 140, t0 + 0.12);
    toneGain?.gain.setValueAtTime?.(0.6, t0);
    ramp(toneGain?.gain, 0.0001, t0 + 0.2);
    noiseGain?.gain.setValueAtTime?.(1.0, t0);
    ramp(noiseGain?.gain, 0.0001, t0 + 0.25);
    return 0.4;
  }

  if (key.includes('cymbal')) {
    const env = built.nodes.get('gainEnv');
    env?.gain.setValueAtTime?.(1.0, t0);
    ramp(env?.gain, 0.0001, t0 + 1.8);
    return 2.0;
  }

  if (key.includes('bass')) {
    const amp = built.nodes.get('amp')?.gain;
    amp?.setValueAtTime?.(0.0, t0);
    amp?.linearRampToValueAtTime?.(0.8, t0 + 0.05);
    amp?.linearRampToValueAtTime?.(0.6, t0 + 0.2);
    amp?.linearRampToValueAtTime?.(0.0, t0 + 2.8);
    return 3.0;
  }

  if (key.includes('lead')) {
    const amp = built.nodes.get('amp')?.gain;
    amp?.setValueAtTime?.(0.0, t0);
    amp?.linearRampToValueAtTime?.(0.7, t0 + 0.02);
    amp?.linearRampToValueAtTime?.(0.5, t0 + 0.1);
    amp?.linearRampToValueAtTime?.(0.0, t0 + 2.0);
    return 2.2;
  }

  if (key.includes('pad') && !key.includes('pad')) {
    // pad-specific if different from generic
  }
  if (key.includes('pad')) {
    const amp = built.nodes.get('amp')?.gain;
    amp?.setValueAtTime?.(0.0, t0);
    amp?.linearRampToValueAtTime?.(0.6, t0 + 0.3);
    amp?.linearRampToValueAtTime?.(0.4, t0 + 1.0);
    amp?.linearRampToValueAtTime?.(0.0, t0 + 3.0);
    return 3.2;
  }

  if (key.includes('song')) {
    // Song has padAmp and leadAmp
    const padAmp = built.nodes.get('padAmp')?.gain;
    const leadAmp = built.nodes.get('leadAmp')?.gain;
    padAmp?.setValueAtTime?.(0.0, t0);
    padAmp?.linearRampToValueAtTime?.(0.4, t0 + 0.5);
    padAmp?.linearRampToValueAtTime?.(0.3, t0 + 2.0);
    padAmp?.linearRampToValueAtTime?.(0.0, t0 + 4.0);
    leadAmp?.setValueAtTime?.(0.0, t0 + 0.5);
    leadAmp?.linearRampToValueAtTime?.(0.5, t0 + 0.7);
    leadAmp?.linearRampToValueAtTime?.(0.0, t0 + 3.5);
    return 4.2;
  }

  if (key.includes('seven-nation') || key.includes('seven_nation')) {
    const A4 = 440;
    const semis = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
    function noteFreq(n) {
      const m = n.match(/^([A-G]#?)(\d)$/);
      const note = m[1], oct = parseInt(m[2]);
      const a4Index = 4 * 12 + 9;
      const idx = oct * 12 + (9 + semis[note]);
      return A4 * Math.pow(2, (idx - a4Index) / 12);
    }
    const bpm = 124, step = 60 / bpm / 2;
    const pattern = ['E2','E2','G2','E2','D2','C2','B1',null,'E2','E2','G2','E2','D2','C2','D2','C2'];
    const osc = built.nodes.get('osc');
    const amp = built.nodes.get('amp')?.gain;
    for (let i = 0; i < pattern.length; i++) {
      const t = t0 + i * step;
      const note = pattern[i];
      if (note) {
        osc?.frequency.setValueAtTime?.(noteFreq(note), t);
        amp?.setValueAtTime?.(0.0, t);
        amp?.linearRampToValueAtTime?.(0.9, t + 0.01);
        amp?.linearRampToValueAtTime?.(0.4, t + 0.1);
        amp?.linearRampToValueAtTime?.(0.0, t + step * 0.95);
      } else {
        amp?.setValueAtTime?.(0.0, t);
      }
    }
    return pattern.length * step + 0.2;
  }

  return null; // no special automation; play indefinitely
}

// ── Play / Stop ─────────────────────────────────────────────────────────────

async function stop() {
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  if (ctx) {
    await ctx.close().catch(() => {});
    ctx = null;
  }
  if (currentBtn) { currentBtn.classList.remove('playing'); currentBtn = null; }
  stopBtn.disabled = true;
  nowPlaying.textContent = '';
}

async function play(example, btn) {
  await stop();
  logEl.textContent = '';

  ctx = new AudioContext();
  await ctx.resume();
  log(`AudioContext: sampleRate=${ctx.sampleRate}`);

  const resp = await fetch(example.path);
  const json = await resp.json();
  log(`Loaded: ${example.path}`);

  let spec;
  let layeredResult = null;

  // Format detection
  if (json?.extensions?.KHR_audio_emitter) {
    // Layered format
    layeredResult = parseLayeredExtensions(json);
    spec = layeredResult.graphs[0];
    // Resolve GENERATE_NOISE URIs
    for (const n of spec.nodes) {
      if (n.kind === 'audio-buffer-source' && n.params?.uri) {
        n.params.uri = resolveNoiseUri(n.params.uri);
      }
    }
    log('Format: Layered (KHR_audio_emitter)');
  } else if (Array.isArray(json?.nodes) && Array.isArray(json?.connections)) {
    spec = json;
    log('Format: Runtime GraphSpec');
  } else {
    log('ERROR: Unsupported format');
    return;
  }

  // Patch: synthesize noise/IR buffers in browser
  patchSpec(spec, ctx);

  // Build the graph
  const built = buildGraph(ctx, spec);
  log(`Built: ${spec.nodes.length} nodes, ${spec.connections.length} connections`);

  // Connect to output
  if (layeredResult) {
    // Layered: connect emitter buses to destination, apply instances
    if (layeredResult.emitterBindings.length > 0) {
      const audioEmitter = layeredResult.audioEmitter;
      const resolved = layeredResult.emitterBindings.map(b => ({
        emitterNodeId: `emitter_${b.emitterId}`,
        emitter: audioEmitter.emitters[b.emitterId],
        translation: b.translation,
        rotation: b.rotation,
        scale: b.scale,
      })).filter(b => !!b.emitter);
      const spatModel = layeredResult.listener?.listener?.spatializationModel;
      applyEmitterInstancesFromExtension(built, resolved, spatModel);
      log(`Emitter instances: ${resolved.length} (layered)`);
    }
    // Also connect any emitter buses not covered by instances
    for (const n of spec.nodes) {
      if (n.kind === 'emitter') {
        const bus = built._inputs.get(n.id);
        if (bus) bus.connect(ctx.destination);
      }
    }
  } else {
    connectEmitters(built, spec, json);
  }

  // Apply musical automation (returns duration or null for continuous)
  const dur = applyAutomation(example.name + ' ' + example.path, built);

  currentBtn = btn;
  btn.classList.add('playing');
  stopBtn.disabled = false;
  nowPlaying.textContent = `Playing: ${example.name}`;

  if (dur) {
    log(`One-shot: auto-stop in ${dur.toFixed(1)}s`);
    stopTimer = setTimeout(() => stop(), dur * 1000);
  } else {
    log('Continuous playback (click Stop to end)');
  }
}

// ── Build UI ────────────────────────────────────────────────────────────────

const catContainer = document.getElementById('categories');
const categories = new Map();

for (const ex of EXAMPLES) {
  if (!categories.has(ex.cat)) categories.set(ex.cat, []);
  categories.get(ex.cat).push(ex);
}

for (const [catName, items] of categories) {
  const div = document.createElement('div');
  div.className = 'category';
  const h2 = document.createElement('h2');
  h2.textContent = catName;
  div.appendChild(h2);
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const ex of items) {
    const btn = document.createElement('button');
    btn.textContent = ex.label || ex.name;
    if (ex.layered) btn.classList.add('layered');
    btn.addEventListener('click', () => play(ex, btn));
    grid.appendChild(btn);
  }
  div.appendChild(grid);
  catContainer.appendChild(div);
}

stopBtn.addEventListener('click', () => stop());
