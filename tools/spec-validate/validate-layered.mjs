#!/usr/bin/env node
// Validate layered KHR_audio_emitter / KHR_audio_graph / KHR_audio_environment glTF files.
// Usage: node tools/spec-validate/validate-layered.mjs <file1.json> [file2.json ...]

import fs from 'node:fs';
import path from 'node:path';

function expandInput(arg) {
  if (!arg.includes('*')) return [arg];
  const normalized = path.resolve(arg);
  const dir = path.dirname(normalized);
  const pattern = path.basename(normalized)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${pattern}$`);
  return fs.readdirSync(dir)
    .filter((entry) => regex.test(entry))
    .map((entry) => path.join(dir, entry));
}

function validateAudioEmitter(ext) {
  const errors = [];
  if (!Array.isArray(ext.audio)) errors.push('KHR_audio_emitter.audio must be an array');
  if (!Array.isArray(ext.sources)) errors.push('KHR_audio_emitter.sources must be an array');
  if (!Array.isArray(ext.emitters)) errors.push('KHR_audio_emitter.emitters must be an array');

  for (const [i, src] of (ext.sources || []).entries()) {
    if (typeof src.audio !== 'number' || src.audio < 0 || src.audio >= (ext.audio || []).length) {
      errors.push(`source[${i}].audio references invalid audio index ${src.audio}`);
    }
  }

  for (const [i, em] of (ext.emitters || []).entries()) {
    if (!['positional', 'global'].includes(em.type)) {
      errors.push(`emitter[${i}].type must be "positional" or "global", got "${em.type}"`);
    }
    if (Array.isArray(em.sources)) {
      for (const s of em.sources) {
        if (typeof s !== 'number' || s < 0 || s >= (ext.sources || []).length) {
          errors.push(`emitter[${i}].sources references invalid source index ${s}`);
        }
      }
    }
  }

  return errors;
}

const VALID_KINDS = new Set([
  'oscillator', 'gain', 'delay', 'waveshaper',
  'lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass',
  'splitter', 'channelmerger', 'channelmixer', 'audiomixer',
]);

function validateGraph(g, audioEmitter, graphIdx) {
  const errors = [];
  const nodeCount = (g.nodes || []).length;

  if (!Array.isArray(g.nodes) || g.nodes.length === 0) {
    errors.push(`graph[${graphIdx}]: nodes must be a non-empty array`);
  }

  for (const [i, n] of (g.nodes || []).entries()) {
    if (!VALID_KINDS.has(n.kind)) {
      errors.push(`graph[${graphIdx}].nodes[${i}]: unknown kind "${n.kind}"`);
    }
    if (n.kind === 'emitter') {
      errors.push(`graph[${graphIdx}].nodes[${i}]: "emitter" kind is not allowed in layered graphs`);
    }
  }

  for (const [i, c] of (g.connections || []).entries()) {
    if (c.from?.node < 0 || c.from?.node >= nodeCount) {
      errors.push(`graph[${graphIdx}].connections[${i}]: from.node ${c.from?.node} out of range`);
    }
    if (c.to?.node < 0 || c.to?.node >= nodeCount) {
      errors.push(`graph[${graphIdx}].connections[${i}]: to.node ${c.to?.node} out of range`);
    }
  }

  for (const [i, inp] of (g.inputs || []).entries()) {
    if (inp.source < 0 || inp.source >= (audioEmitter.sources || []).length) {
      errors.push(`graph[${graphIdx}].inputs[${i}]: source ${inp.source} out of range`);
    }
    if (inp.node < 0 || inp.node >= nodeCount) {
      errors.push(`graph[${graphIdx}].inputs[${i}]: node ${inp.node} out of range`);
    }
  }

  for (const [i, out] of (g.outputs || []).entries()) {
    if (out.emitter < 0 || out.emitter >= (audioEmitter.emitters || []).length) {
      errors.push(`graph[${graphIdx}].outputs[${i}]: emitter ${out.emitter} out of range`);
    }
    if (out.node < 0 || out.node >= nodeCount) {
      errors.push(`graph[${graphIdx}].outputs[${i}]: node ${out.node} out of range`);
    }
  }

  // DAG check
  const adj = new Map();
  for (let i = 0; i < nodeCount; i++) adj.set(i, []);
  for (const c of g.connections || []) {
    if (c.from?.node >= 0 && c.from?.node < nodeCount) {
      adj.get(c.from.node).push(c.to.node);
    }
  }
  const temp = new Set();
  const perm = new Set();
  function visit(v) {
    if (perm.has(v)) return false;
    if (temp.has(v)) return true;
    temp.add(v);
    for (const w of adj.get(v) || []) { if (visit(w)) return true; }
    temp.delete(v);
    perm.add(v);
    return false;
  }
  for (let i = 0; i < nodeCount; i++) {
    if (!perm.has(i) && visit(i)) { errors.push(`graph[${graphIdx}]: contains a cycle (must be DAG)`); break; }
  }

  return errors;
}

function validateEnvironment(ext) {
  const errors = [];
  if (ext.listeners && !Array.isArray(ext.listeners)) {
    errors.push('KHR_audio_environment.listeners must be an array');
  }
  if (ext.environments && !Array.isArray(ext.environments)) {
    errors.push('KHR_audio_environment.environments must be an array');
  }
  for (const [i, env] of (ext.environments || []).entries()) {
    if (env.reverb) {
      const r = env.reverb;
      if (r.type && !['parametric', 'impulseResponse'].includes(r.type)) {
        errors.push(`environment[${i}].reverb.type must be "parametric" or "impulseResponse", got "${r.type}"`);
      }
      if (typeof r.mix === 'number' && (r.mix < 0 || r.mix > 1)) {
        errors.push(`environment[${i}].reverb.mix must be in [0, 1]`);
      }
    }
  }
  return errors;
}

function main() {
  const files = process.argv.slice(2).flatMap(expandInput);
  if (files.length === 0) {
    console.log('Usage: node tools/spec-validate/validate-layered.mjs <file1.json> [file2.json ...]');
    process.exit(1);
  }

  let hadError = false;

  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf-8');
      const gltf = JSON.parse(text);
      const allErrors = [];

      const audioEmitter = gltf.extensions?.KHR_audio_emitter;
      if (!audioEmitter) {
        console.warn(`SKIP ${path.basename(f)}: no extensions.KHR_audio_emitter`);
        continue;
      }

      allErrors.push(...validateAudioEmitter(audioEmitter));

      const audioGraph = gltf.extensions?.KHR_audio_graph;
      if (audioGraph) {
        for (const [i, g] of (audioGraph.graphs || []).entries()) {
          allErrors.push(...validateGraph(g, audioEmitter, i));
        }
      }

      const audioEnv = gltf.extensions?.KHR_audio_environment;
      if (audioEnv) {
        allErrors.push(...validateEnvironment(audioEnv));
      }

      if (allErrors.length) {
        hadError = true;
        console.error(`FAIL ${path.basename(f)}:`);
        for (const e of allErrors) console.error('  - ' + e);
      } else {
        console.log(`OK   ${path.basename(f)}`);
      }
    } catch (e) {
      hadError = true;
      console.error(`FAIL ${f}: ${e.message}`);
    }
  }

  if (hadError) process.exit(1);
}

main();
