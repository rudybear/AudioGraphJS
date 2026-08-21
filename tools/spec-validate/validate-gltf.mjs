#!/usr/bin/env node
// Validate KHR_audio_graph sections inside glTF files.
// Usage: node tools/spec-validate/validate-gltf.mjs <file1.gltf> [file2.gltf ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specRoot = path.resolve(__dirname, '../../spec-repo/extensions/2.0/Khronos/KHR_audio_graph/schema');

if (!fs.existsSync(specRoot)) {
  console.error(
    `spec-repo schemas not found at ${specRoot}\n` +
    `Fetch them with:\n` +
    `  git clone --depth 1 --branch KHR_audio_graph https://github.com/rudybear/glTF.git spec-repo`,
  );
  process.exit(1);
}

function loadSchemas(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.schema.json'));
  const schemas = {};
  for (const f of files) {
    const full = path.join(dir, f);
    const text = fs.readFileSync(full, 'utf-8').trim();
    if (!text) continue;
    try { schemas[f] = JSON.parse(text); } catch {}
  }
  return schemas;
}

function makeAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  const schemas = loadSchemas(specRoot);
  for (const [name, schema] of Object.entries(schemas)) ajv.addSchema(schema, name);
  if (!ajv.getSchema('glTFProperty.schema.json')) {
    ajv.addSchema({ "$id": "glTFProperty.schema.json", "type": "object", "additionalProperties": true }, 'glTFProperty.schema.json');
  }
  if (!ajv.getSchema('glTFid.schema.json')) {
    ajv.addSchema({ "$id": "glTFid.schema.json", "type": "integer", "minimum": 0 }, 'glTFid.schema.json');
  }
  return ajv;
}

function lintGraph(g) {
  const errors = [];
  const kinds = (g.nodes || []).map(n => n.kind);
  const indeg = new Map(); const outdeg = new Map();
  for (let i=0;i<kinds.length;i++) { indeg.set(i, 0); outdeg.set(i, 0); }
  for (const c of g.connections || []) { indeg.set(c.to.node, (indeg.get(c.to.node)||0)+1); outdeg.set(c.from.node, (outdeg.get(c.from.node)||0)+1); }
  let hasSink = Array.isArray(g.outputs) && g.outputs.length > 0;
  for (let i=0;i<kinds.length;i++) {
    if (kinds[i] === 'emitter') {
      hasSink = true;
      if ((indeg.get(i)||0) !== 1) errors.push(`emitter at index ${i} must have exactly 1 input`);
      if ((outdeg.get(i)||0) !== 0) errors.push(`emitter at index ${i} must have 0 outputs`);
    }
  }
  if (!hasSink) errors.push('graph must have at least one sink (emitter or outputs[])');
  // DAG check
  const adj = new Map(); for (let i=0;i<kinds.length;i++) adj.set(i, []);
  for (const c of g.connections || []) (adj.get(c.from.node)||[]).push(c.to.node);
  const temp = new Set(); const perm = new Set();
  function visit(v){ if (perm.has(v)) return false; if (temp.has(v)) return true; temp.add(v); for (const w of adj.get(v)||[]) { if (visit(w)) return true; } temp.delete(v); perm.add(v); return false; }
  // Rule 1 (r2): only delay-free cycles are invalid.
  const cycleWith = (excludeDelay) => {
    const adj2 = new Map();
    for (let i=0;i<kinds.length;i++) adj2.set(i, []);
    for (const c of g.connections || []) {
      if (excludeDelay && (kinds[c.from.node] === 'delay' || kinds[c.to.node] === 'delay')) continue;
      (adj2.get(c.from.node) || []).push(c.to.node);
    }
    const tmp = new Set(), done = new Set();
    const go = (v) => { if (done.has(v)) return false; if (tmp.has(v)) return true; tmp.add(v); for (const w of adj2.get(v)||[]) { if (go(w)) return true; } tmp.delete(v); done.add(v); return false; };
    for (let i=0;i<kinds.length;i++) { if (!done.has(i) && go(i)) return true; }
    return false;
  };
  if (cycleWith(true)) errors.push('graph contains a cycle with no delay node (rule 1)');
  // Basic arities
  const outputsSet = new Set(Array.isArray(g.outputs) ? g.outputs : []);
  for (let i=0;i<kinds.length;i++) {
    const inD = indeg.get(i)||0, outD = outdeg.get(i)||0;
    switch (kinds[i]) {
      case 'splitter': if (inD !== 1) errors.push(`splitter ${i} must have exactly 1 input`); if (outD < 1) errors.push(`splitter ${i} must have at least 1 output`); break;
      case 'channelmerger': if (inD < 1) errors.push(`channelmerger ${i} must have at least 1 input`); if (!outputsSet.has(i) && outD !== 1) errors.push(`channelmerger ${i} must have exactly 1 output`); break;
      case 'channelmixer':
      case 'audiomixer': if (inD < 1) errors.push(`${kinds[i]} ${i} must have at least 1 input`); if (!outputsSet.has(i) && outD !== 1) errors.push(`${kinds[i]} ${i} must have exactly 1 output`); break;
    }
  }
  return errors;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('Usage: node tools/spec-validate/validate-gltf.mjs <file1.gltf> [file2.gltf ...]');
    process.exit(1);
  }
  const ajv = makeAjv();
  const graphSchemaName = 'glTF.KHR_audio_graph.schema.json';
  const vGraph = ajv.getSchema(graphSchemaName) || (ajv.addSchema(JSON.parse(fs.readFileSync(path.join(specRoot, graphSchemaName), 'utf-8')), graphSchemaName), ajv.getSchema(graphSchemaName));
  let hadError = false;
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf-8');
      const gltf = JSON.parse(text);
      const ext = gltf.extensions && gltf.extensions.KHR_audio_graph;
      if (!ext) { console.warn(`SKIP ${f}: no extensions.KHR_audio_graph`); continue; }
      const okGraph = vGraph(ext);
      if (!okGraph) {
        hadError = true;
        console.error(`FAIL ${path.basename(f)}: schema validation errors:`);
        console.error(vGraph.errors);
      } else {
        console.log(`OK   ${path.basename(f)}: schema`);
      }
      // Lint each graph
      for (const [i, g] of (ext.graphs || []).entries()) {
        const errs = lintGraph(g);
        if (errs.length) {
          hadError = true;
          console.error(`LINT ${path.basename(f)} graph[${i}]:`);
          for (const e of errs) console.error(' - ' + e);
        } else {
          console.log(`OK   ${path.basename(f)} graph[${i}]: lint`);
        }
      }
    } catch (e) {
      hadError = true;
      console.error(`FAIL ${f}: ${e.message}`);
    }
  }
  if (hadError) process.exit(1);
}

main();

